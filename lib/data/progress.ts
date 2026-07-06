import { prisma } from "@/lib/prisma"

export async function updateProgress(userId: string, chapterId: string, data: {
  timeSpentSeconds?: number
  lastPosition?: number
  completedAt?: Date | null
}) {
  return prisma.progress.upsert({
    where: { userId_chapterId: { userId, chapterId } },
    update: {
      ...data,
      sessionCount: { increment: 1 },
    },
    create: {
      userId,
      chapterId,
      ...data,
      sessionCount: 1,
    },
  })
}

export async function getCompletionRate(partnerId?: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: partnerId ? { user: { partnerId } } : {},
    include: {
      // Même dénominateur que côté apprenant : chapitres publiés uniquement.
      formation: { include: { chapters: { where: { isPublished: true } } } },
      user: { include: { progress: true } },
    },
  })

  if (enrollments.length === 0) return 0

  let completed = 0
  for (const e of enrollments) {
    const totalChapters = e.formation.chapters.length
    if (totalChapters === 0) continue
    const completedChapters = e.user.progress.filter(
      (p) => p.completedAt && e.formation.chapters.some((c) => c.id === p.chapterId)
    ).length
    if (completedChapters >= totalChapters) completed++
  }

  return Math.round((completed / enrollments.length) * 100)
}
