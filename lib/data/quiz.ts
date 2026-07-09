import { prisma } from "@/lib/prisma"

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
 * Agrège les résultats aux QCM d'un apprenant pour une formation :
 * une entrée par évaluation (Exercise), avec meilleur/dernier score, nb de tentatives,
 * et la note globale = moyenne des meilleurs scores des évaluations tentées.
 * Réutilisé par la page apprenant « Mes résultats » et le suivi admin.
 */
export async function getFormationQuizResults(userId: string, formationId: string): Promise<FormationQuizResults> {
  const exercises = await prisma.exercise.findMany({
    where: { chapter: { formationId, isPublished: true } },
    select: { id: true, title: true, order: true, chapterId: true, chapter: { select: { title: true, order: true } } },
  })
  exercises.sort((a, b) => (a.chapter.order - b.chapter.order) || (a.order - b.order))

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
