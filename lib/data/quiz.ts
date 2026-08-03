import { prisma } from "@/lib/prisma"
import { resumeJournal } from "@/lib/simulation/journal"

export interface QuizEvaluation {
  exerciseId: string
  chapterId: string
  title: string
  chapterTitle: string
  attempts: number
  bestScore: number | null // 0..1
  lastScore: number | null // 0..1
  lastAt: Date | null
}

export interface FormationQuizResults {
  evaluations: QuizEvaluation[]
  globalBest: number | null // moyenne des meilleurs scores des évals tentées (0..1)
  doneCount: number
  totalCount: number
}

/**
 * Une évaluation, quel que soit le moteur qui la porte.
 *
 * Le LMS en a DEUX, volontairement séparés (voir la note d'architecture des
 * évaluations) : les QCM de chapitre vivent dans `Exercise`/`ExerciseResponse`,
 * les ateliers bureautique dans `Simulation`/`SimulationAttempt`. La page
 * « Mes résultats » ne lisait que le premier : sur une formation entièrement
 * bâtie sur des simulations — la formation Excel, 246 simulations et zéro
 * exercice — elle affichait « Aucune évaluation pour le moment » alors que les
 * scores étaient bel et bien enregistrés en base.
 */
export interface EvaluationResult {
  /** Identifiant d'affichage : celui de l'exercice ou de la simulation. */
  key: string
  kind: "QUIZ" | "SIMULATION"
  chapterId: string
  title: string
  /** Nombre de passages. Les QCM comptent leurs réponses, les ateliers `attemptCount`. */
  attempts: number
  bestScore: number | null // 0..1
  lastScore: number | null // 0..1
  lastAt: Date | null
  /** Seconde ligne facultative sous le titre : erreurs, aides, avancement. */
  detail: string | null
}

export interface FormationEvaluationResults {
  evaluations: EvaluationResult[]
  globalBest: number | null
  doneCount: number
  totalCount: number
}

/**
 * Résultats des ateliers de simulation notés d'une formation.
 *
 * Seul le mode EVALUATION porte un score : une leçon et un exercice tracent la
 * progression mais ne notent pas, les faire figurer ici laisserait croire à un
 * échec là où rien n'est noté.
 */
export async function getFormationSimulationResults(
  userId: string,
  formationId: string,
): Promise<EvaluationResult[]> {
  const simulations = await prisma.simulation.findMany({
    where: { mode: "EVALUATION", chapter: { formationId, isPublished: true } },
    select: {
      id: true,
      stepCount: true,
      chapter: {
        select: { id: true, title: true, order: true, section: { select: { order: true } } },
      },
      attempts: {
        where: { userId },
        select: {
          score: true,
          bestScore: true,
          attemptCount: true,
          errorCount: true,
          hintCount: true,
          maxStepSeen: true,
          completedAt: true,
          updatedAt: true,
          stepLog: true,
        },
      },
    },
  })

  // Même ordre que le sommaire de l'apprenant : section, puis chapitre.
  simulations.sort((a, b) => {
    const sa = a.chapter.section?.order ?? 9999
    const sb = b.chapter.section?.order ?? 9999
    return sa - sb || a.chapter.order - b.chapter.order
  })

  return simulations.map((sim) => {
    const attempt = sim.attempts[0] ?? null
    const tente = attempt != null && (attempt.bestScore != null || attempt.completedAt != null)

    let detail: string | null = null
    if (attempt) {
      const morceaux: string[] = []
      // Détail par étape : disponible seulement si la tentative a été jouée
      // depuis que le journal est enregistré. Les tentatives antérieures ont un
      // `stepLog` vide — on n'affiche alors rien plutôt que de reconstituer un
      // détail qui n'a jamais été mesuré.
      //
      // Le résumé est EN POINTS, comme le barème : compter les étapes
      // afficherait un détail en contradiction avec le score juste à côté.
      const resume = resumeJournal(attempt.stepLog)
      if (resume) {
        // Formulation courte : sur mobile la colonne fait ~180 px, une phrase
        // longue s'y fait tronquer au milieu et perd son sens.
        morceaux.push(`${resume.pointsReussis}/${resume.pointsTotal} points au premier essai`)
      }
      if (!attempt.completedAt && sim.stepCount > 0) {
        morceaux.push(`en cours — étape ${Math.min(attempt.maxStepSeen + 1, sim.stepCount)} sur ${sim.stepCount}`)
      }
      // `errorCount` et `hintCount` sont volontairement ABSENTS ici : ce sont
      // des compteurs cumulés sur toute la vie de la tentative — sessions et
      // reprises confondues, jamais remis à zéro — alors que le score affiché
      // à côté décrit un seul passage. Les montrer laisserait croire que les
      // deux chiffres parlent de la même chose. Ils restent disponibles pour le
      // suivi formateur, où le cumul est justement ce qu'on veut voir.
      detail = morceaux.length ? morceaux.join(" · ") : null
    }

    return {
      key: sim.id,
      kind: "SIMULATION" as const,
      chapterId: sim.chapter.id,
      title: sim.chapter.title,
      attempts: attempt?.attemptCount ?? 0,
      bestScore: tente ? attempt!.bestScore : null,
      lastScore: tente ? attempt!.score : null,
      lastAt: attempt ? attempt.completedAt ?? attempt.updatedAt : null,
      detail,
    }
  })
}

/**
 * Toutes les évaluations d'une formation, les deux moteurs réunis.
 *
 * La note globale est la moyenne des meilleurs scores des évaluations réellement
 * tentées — une évaluation jamais ouverte ne compte pas comme un zéro.
 */
export async function getFormationEvaluationResults(
  userId: string,
  formationId: string,
): Promise<FormationEvaluationResults> {
  const [quiz, simulations] = await Promise.all([
    getFormationQuizResults(userId, formationId),
    getFormationSimulationResults(userId, formationId),
  ])

  const depuisQuiz: EvaluationResult[] = quiz.evaluations.map((e) => ({
    key: e.exerciseId,
    kind: "QUIZ" as const,
    chapterId: e.chapterId,
    title: e.title,
    attempts: e.attempts,
    bestScore: e.bestScore,
    lastScore: e.lastScore,
    lastAt: e.lastAt,
    detail: null,
  }))

  const evaluations = [...depuisQuiz, ...simulations]
  const done = evaluations.filter((e) => e.bestScore != null)
  const globalBest = done.length
    ? done.reduce((s, e) => s + (e.bestScore as number), 0) / done.length
    : null

  return { evaluations, globalBest, doneCount: done.length, totalCount: evaluations.length }
}

/**
 * Agrège les résultats aux QCM d'un apprenant pour une formation :
 * une entrée par évaluation (Exercise), avec meilleur/dernier score, nb de tentatives,
 * et la note globale = moyenne des meilleurs scores des évaluations tentées.
 * Réutilisé par la page apprenant « Mes résultats » et le suivi admin.
 */
export async function getFormationQuizResults(userId: string, formationId: string): Promise<FormationQuizResults> {
  const exercises = await prisma.exercise.findMany({
    where: { chapter: { formationId, isPublished: true } },
    select: { id: true, title: true, order: true, chapterId: true, chapter: { select: { title: true, order: true, section: { select: { order: true } } } } },
  })
  // Ordre d'affichage = ordre de la section, puis du chapitre, puis de l'exercice
  exercises.sort((a, b) => {
    const sa = a.chapter.section?.order ?? 9999
    const sb = b.chapter.section?.order ?? 9999
    return (sa - sb) || (a.chapter.order - b.chapter.order) || (a.order - b.order)
  })

  const responses = await prisma.exerciseResponse.findMany({
    where: { userId, exercise: { chapter: { formationId } } },
    orderBy: { completedAt: "desc" },
    select: { exerciseId: true, score: true, completedAt: true },
  })

  const byExercise = new Map<string, { score: number | null; completedAt: Date }[]>()
  for (const r of responses) {
    const arr = byExercise.get(r.exerciseId) || []
    arr.push({ score: r.score, completedAt: r.completedAt })
    byExercise.set(r.exerciseId, arr)
  }

  const evaluations: QuizEvaluation[] = exercises.map((ex) => {
    const rs = byExercise.get(ex.id) || [] // trié du plus récent au plus ancien
    const scored = rs.map((r) => r.score).filter((s): s is number => s != null)
    const bestScore = scored.length ? Math.max(...scored) : null
    const lastScore = rs.length ? (rs[0].score ?? null) : null
    return {
      exerciseId: ex.id,
      chapterId: ex.chapterId,
      title: ex.title,
      chapterTitle: ex.chapter.title,
      attempts: rs.length,
      bestScore,
      lastScore,
      lastAt: rs.length ? rs[0].completedAt : null,
    }
  })

  const done = evaluations.filter((e) => e.attempts > 0 && e.bestScore != null)
  const globalBest = done.length
    ? done.reduce((s, e) => s + (e.bestScore as number), 0) / done.length
    : null

  return { evaluations, globalBest, doneCount: done.length, totalCount: evaluations.length }
}
