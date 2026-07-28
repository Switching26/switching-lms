import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Simulation bureautique d'un chapitre.
 *
 * GET  → le scénario à jouer + l'état de reprise de l'apprenant.
 * PUT  → progression dans la simulation (étape, erreurs, aides) et complétion.
 *
 * Deux règles de sécurité portent ce fichier :
 *
 *  1. Mêmes gardes que /api/progress/[chapterId] : chapitre publié, apprenant
 *     inscrit, accès ni expiré ni pas encore ouvert. Un chapitre de simulation
 *     n'est pas plus public qu'une vidéo.
 *
 *  2. En mode EVALUATION, le scénario servi est EXPURGÉ des réponses attendues.
 *     En leçon et en exercice la consigne dit déjà quoi faire, donc la cible
 *     attendue ne révèle rien et la validation peut rester côté client (retour
 *     instantané). En évaluation notée, envoyer les cibles au navigateur rendrait
 *     le score sans valeur : la correction se fait alors pas à pas côté serveur.
 *     Même principe que getAssessmentForCandidate pour les tests de positionnement.
 */

/** Clés d'une étape qui ne doivent jamais partir au client en mode noté. */
const GRADED_SECRET_KEYS = ["attendu", "expected", "solution", "aide", "hint"] as const

type ScenarioStep = Record<string, unknown>
type Scenario = { steps?: ScenarioStep[] } & Record<string, unknown>

/** Retire les cibles/aides de chaque étape, sans muter l'objet d'origine. */
function stripGradedSecrets(scenario: Scenario): Scenario {
  const steps = Array.isArray(scenario.steps) ? scenario.steps : []
  return {
    ...scenario,
    steps: steps.map((step) => {
      const safe: ScenarioStep = { ...step }
      for (const key of GRADED_SECRET_KEYS) delete safe[key]
      return safe
    }),
  }
}

/**
 * Gardes communes. Renvoie soit une réponse d'erreur à retourner tel quel,
 * soit le chapitre et sa simulation.
 */
async function loadContext(chapterId: string, userId: string, superAdmin = false) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { simulation: true },
  })
  if (!chapter) {
    return { error: NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 }) }
  }
  // Un super-admin doit pouvoir RELIRE son propre contenu avant publication :
  // sans cette exception, l'aperçu de l'espace admin échouait deux fois — le
  // chapitre n'étant pas publié et l'admin n'étant pas inscrit. Impossible de
  // relire 78 ateliers avant de les publier.
  if (!chapter.isPublished && !superAdmin) {
    return { error: NextResponse.json({ error: "Chapitre non publié" }, { status: 403 }) }
  }
  if (!chapter.simulation) {
    return { error: NextResponse.json({ error: "Ce chapitre ne porte pas de simulation" }, { status: 404 }) }
  }

  // L'aperçu admin s'arrête ici : pas d'inscription à vérifier, et aucune
  // progression ne sera écrite puisque seul le GET accepte ce contournement.
  if (superAdmin) return { chapter, simulation: chapter.simulation }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId, formationId: chapter.formationId } },
  })
  if (!enrollment) {
    return { error: NextResponse.json({ error: "Non inscrit à cette formation" }, { status: 403 }) }
  }
  const now = new Date()
  if (enrollment.expiresAt && enrollment.expiresAt < now) {
    return { error: NextResponse.json({ error: "Accès expiré" }, { status: 403 }) }
  }
  if (enrollment.startedAt && enrollment.startedAt > now) {
    return { error: NextResponse.json({ error: "Accès pas encore ouvert" }, { status: 403 }) }
  }

  return { chapter, simulation: chapter.simulation }
}

export async function GET(_req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const userId = session.user.id
  // Le contournement de relecture ne vaut QUE pour le GET : le PUT reste soumis
  // à publication et inscription, donc aucune progression parasite.
  const superAdmin = session.user.role === "SUPER_ADMIN"

  const ctx = await loadContext(params.chapterId, userId, superAdmin)
  if ("error" in ctx) return ctx.error
  const { simulation } = ctx

  const attempt = await prisma.simulationAttempt.findUnique({
    where: { simulationId_userId: { simulationId: simulation.id, userId } },
    select: {
      currentStep: true,
      maxStepSeen: true,
      errorCount: true,
      hintCount: true,
      bestScore: true,
      attemptCount: true,
      completedAt: true,
    },
  })

  const raw = (simulation.scenario ?? {}) as Scenario
  const graded = simulation.mode === "EVALUATION"

  return NextResponse.json(
    {
      id: simulation.id,
      app: simulation.app,
      mode: simulation.mode,
      stepCount: simulation.stepCount,
      version: simulation.version,
      // Le client corrige lui-même en leçon/exercice, jamais en évaluation.
      clientValidation: !graded,
      scenario: graded ? stripGradedSecrets(raw) : raw,
      attempt: attempt ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PUT(req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const userId = session.user.id

  const ctx = await loadContext(params.chapterId, userId)
  if ("error" in ctx) return ctx.error
  const { chapter, simulation } = ctx

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const { currentStep, errorDelta, hintDelta, timeDeltaSeconds, stepLog, finish, score } = body as {
    currentStep?: unknown
    errorDelta?: unknown
    hintDelta?: unknown
    timeDeltaSeconds?: unknown
    stepLog?: unknown
    finish?: unknown
    score?: unknown
  }

  // Bornage systématique de tout ce qui vient du navigateur.
  const clampInt = (v: unknown, max: number): number | undefined => {
    if (v === undefined || v === null) return undefined
    const n = Number(v)
    if (!Number.isFinite(n)) return undefined
    return Math.min(Math.max(Math.round(n), 0), max)
  }
  const lastStepIndex = Math.max(simulation.stepCount - 1, 0)
  const safeStep = clampInt(currentStep, lastStepIndex)
  // Un envoi ne peut pas déclarer plus d'une poignée d'erreurs ou d'aides :
  // le client flush à chaque étape, pas en fin de parcours.
  const safeErrors = clampInt(errorDelta, 50) ?? 0
  const safeHints = clampInt(hintDelta, 50) ?? 0
  const safeTime = clampInt(timeDeltaSeconds, 900) ?? 0
  // Le score client n'est retenu qu'en évaluation, et toujours dans [0,1].
  const rawScore = Number(score)
  const safeScore =
    simulation.mode === "EVALUATION" && Number.isFinite(rawScore)
      ? Math.min(Math.max(rawScore, 0), 1)
      : undefined

  const existing = await prisma.simulationAttempt.findUnique({
    where: { simulationId_userId: { simulationId: simulation.id, userId } },
  })

  const nextStep = safeStep ?? existing?.currentStep ?? 0
  // maxStepSeen ne recule jamais : la navigation est libre, revenir en arrière
  // ne doit pas faire perdre la progression réellement atteinte.
  const nextMax = Math.max(nextStep, existing?.maxStepSeen ?? 0)
  const done = finish === true
  const nowDate = new Date()

  const attempt = await prisma.simulationAttempt.upsert({
    where: { simulationId_userId: { simulationId: simulation.id, userId } },
    create: {
      simulationId: simulation.id,
      userId,
      currentStep: nextStep,
      maxStepSeen: nextMax,
      errorCount: safeErrors,
      hintCount: safeHints,
      score: safeScore,
      bestScore: safeScore,
      stepLog: (stepLog ?? undefined) as never,
      completedAt: done ? nowDate : null,
    },
    update: {
      currentStep: nextStep,
      maxStepSeen: nextMax,
      errorCount: { increment: safeErrors },
      hintCount: { increment: safeHints },
      ...(safeScore !== undefined
        ? {
            score: safeScore,
            // bestScore survit à une reprise moins réussie.
            bestScore:
              existing?.bestScore != null ? Math.max(existing.bestScore, safeScore) : safeScore,
          }
        : {}),
      ...(stepLog !== undefined ? { stepLog: stepLog as never } : {}),
      // On ne réécrit pas completedAt d'une simulation déjà terminée : la date
      // de première réussite est ce qui compte pour les preuves de parcours.
      ...(done && !existing?.completedAt ? { completedAt: nowDate } : {}),
    },
  })

  // Complétion du CHAPITRE : une simulation est terminée quand toutes ses étapes
  // ont été franchies. Contrairement à la vidéo, il n'y a pas de seuil à 25/50 % —
  // franchir une étape suppose d'avoir réellement effectué la bonne action.
  const allStepsDone = simulation.stepCount > 0 && attempt.maxStepSeen >= simulation.stepCount - 1
  const chapterCompleted = done && allStepsDone

  await prisma.progress.upsert({
    where: { userId_chapterId: { userId, chapterId: chapter.id } },
    create: {
      userId,
      chapterId: chapter.id,
      timeSpentSeconds: safeTime,
      lastPosition: nextStep,
      sessionCount: 1,
      completedAt: chapterCompleted ? nowDate : null,
    },
    update: {
      timeSpentSeconds: { increment: safeTime },
      lastPosition: nextStep,
      ...(chapterCompleted ? { completedAt: nowDate } : {}),
    },
  })

  return NextResponse.json({
    ok: true,
    currentStep: attempt.currentStep,
    maxStepSeen: attempt.maxStepSeen,
    errorCount: attempt.errorCount,
    hintCount: attempt.hintCount,
    bestScore: attempt.bestScore,
    completed: chapterCompleted,
  })
}
