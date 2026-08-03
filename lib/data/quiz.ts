import { prisma } from "@/lib/prisma"
import { resumeJournal } from "@/lib/simulation/journal"
import { bilanPublie, lireJournalStocke, type BilanPublie } from "@/lib/simulation/bilan"
import { planDeRevision, type ChapitreDuParcours } from "@/lib/simulation/remediation"

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
  /**
   * Bilan par compétence du MEILLEUR passage, quand il est disponible.
   *
   * `doitRemplacerJournal` n'écrit le journal que si le score atteint ou dépasse
   * le meilleur : le journal stocké décrit donc toujours la tentative dont on
   * affiche la note ici. C'est la différence avec l'écran de fin d'atelier, qui
   * décrit le passage qu'on vient de jouer — et les deux écrans le disent.
   *
   * `null` couvre les tentatives antérieures à l'enregistrement du journal, les
   * évaluations non annotées et les journaux invérifiables : dans les trois cas
   * la note reste, le bilan disparaît.
   */
  bilan: BilanPublie | null
}

/*
 * PAS DE DATE SUR LE BILAN, ET C'EST DÉLIBÉRÉ.
 *
 * On aimerait écrire « bilan de votre meilleur passage, le 3 mars ». La base ne
 * le permet pas : `SimulationAttempt.completedAt` est la date de PREMIÈRE
 * complétion et n'est jamais réécrite — c'est ce qui en fait une preuve de
 * parcours — et `updatedAt` bouge à chaque envoi de progression, donc aussi
 * après un passage MOINS bon qui n'a pas remplacé le journal. Aucune des deux
 * ne date le passage que le bilan décrit.
 *
 * Afficher l'une ou l'autre serait une date fausse un jour sur deux. Tant qu'un
 * champ dédié n'existe pas — ce serait une migration, hors du périmètre de ce
 * chantier — l'écran dit « meilleur passage » sans prétendre savoir quand.
 */

export interface FormationEvaluationResults {
  evaluations: EvaluationResult[]
  globalBest: number | null
  doneCount: number
  totalCount: number
  /**
   * « À revoir en priorité sur cette formation » : au plus trois lignes, tirées
   * des bilans des évaluations déjà passées.
   *
   * SÉLECTION, jamais agrégation. Un identifiant de compétence n'a de sens que
   * dans SON évaluation : `synthetiser` du module 10 et `synthetiser` du module
   * 16 sont deux notions différentes, et additionner leurs points perdus
   * inventerait une compétence transversale que personne n'a déclarée. Chaque
   * ligne reste donc rattachée à son module d'origine.
   */
  planDeRevision: Array<{
    cle: string
    titre: string
    enonce?: string
    pointsPerdus: number
    /** Chapitre de l'ÉVALUATION d'où vient la priorité. */
    chapterId: string
    titreEvaluation: string
    revoir: Array<{ chapterId: string; titre: string }>
  }>
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
  // Deux requêtes : les évaluations avec leur tentative, et TOUS les chapitres
  // de la formation — ces derniers servent à traduire « m10-l05 » en chapitre
  // réel. « Mes résultats » chargeait déjà les chapitres de chaque évaluation ;
  // celle-ci les prend une fois pour toutes.
  const [simulations, chapitresBruts] = await Promise.all([
    prisma.simulation.findMany({
    where: { mode: "EVALUATION", chapter: { formationId, isPublished: true } },
    select: {
      id: true,
      stepCount: true,
      scenario: true,
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
  }),
    prisma.chapter.findMany({
      where: { formationId },
      select: { id: true, title: true, order: true, isPublished: true, section: { select: { order: true } } },
    }),
  ])

  const chapitres: ChapitreDuParcours[] = chapitresBruts.map((c) => ({
    chapterId: c.id,
    titre: c.title,
    sectionOrder: c.section?.order ?? 0,
    chapterOrder: c.order,
    publie: c.isPublished,
  }))

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

    /* BILAN DU MEILLEUR PASSAGE.
     *
     * Le journal stocké suit toujours `bestScore` — `doitRemplacerJournal` ne
     * l'écrit que si le score courant l'atteint ou le dépasse. Le bilan décrit
     * donc bien la tentative dont la note s'affiche à côté, et non la dernière.
     *
     * Il n'est calculé que pour une tentative TERMINÉE : un passage en cours a
     * un journal partiel, que le moteur refuserait de toute façon. */
    const journal = attempt?.completedAt ? lireJournalStocke(attempt.stepLog) : null
    const bilan = journal ? bilanPublie({ scenario: sim.scenario, journal, chapitres }) : null

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
      // Un bilan fermé (non annoté, incomplet, invérifiable) ne remonte pas :
      // l'interface n'a alors rien à afficher, et surtout rien à deviner.
      bilan: bilan?.exploitable ? bilan : null,
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
    // Les QCM n'ont pas de bilan par compétence : ils vivent dans l'autre moteur
    // d'évaluation, et rien n'y déclare de compétence.
    bilan: null,
  }))

  const evaluations = [...depuisQuiz, ...simulations]
  const done = evaluations.filter((e) => e.bestScore != null)
  const globalBest = done.length
    ? done.reduce((s, e) => s + (e.bestScore as number), 0) / done.length
    : null

  /* PLAN DE RÉVISION DE FORMATION.
   *
   * `planDeRevision` SÉLECTIONNE les priorités les plus coûteuses parmi les
   * bilans, sans jamais les fusionner : deux évaluations qui portent le même
   * identifiant de compétence restent deux lignes, rattachées à leur module.
   * Les bilans fermés n'apportent rien — leurs priorités sont déjà vides. */
  const plan = planDeRevision(
    evaluations
      .filter((e) => e.bilan)
      .map((e) => ({
        chapterId: e.chapterId,
        titreEvaluation: e.title,
        bilan: {
          // `planDeRevision` ne lit que `priorites` ; le reste du bilan est
          // rempli à vide plutôt que recalculé, pour ne pas refaire le travail.
          pointsObtenus: 0, pointsTotal: 0, score: 0, competences: [],
          priorites: e.bilan!.priorites.map((p) => ({
            id: p.id, titre: p.titre, ...(p.enonce ? { enonce: p.enonce } : {}),
            pointsObtenus: p.pointsObtenus, pointsTotal: p.pointsTotal,
            etapesRatees: p.etapesRatees, etapesNonTraitees: p.etapesNonTraitees,
            // Les renvois sont DÉJÀ résolus : on repasse leurs codes, qui
            // servent seulement à départager deux priorités à égalité.
            revoir: p.revoir.map((r) => r.code),
            statut: p.statut,
          })),
          couverture: "complete" as const, etapesSansCompetence: 0, perime: false,
        },
      })),
  )

  const planDeRevisionPublie = plan.map((entree) => {
    const source = evaluations.find((e) => e.chapterId === entree.chapterId)
    const ligne = source?.bilan?.priorites.find((p) => p.id === entree.competence.id)
    return {
      cle: entree.cle,
      titre: entree.competence.titre,
      ...(entree.competence.enonce ? { enonce: entree.competence.enonce } : {}),
      pointsPerdus: entree.pointsPerdus,
      chapterId: entree.chapterId,
      titreEvaluation: entree.titreEvaluation,
      revoir: ligne?.revoir.map((r) => ({ chapterId: r.chapterId, titre: r.titre })) ?? [],
    }
  })

  return {
    evaluations,
    globalBest,
    doneCount: done.length,
    totalCount: evaluations.length,
    planDeRevision: planDeRevisionPublie,
  }
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
