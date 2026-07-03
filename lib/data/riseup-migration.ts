import { prisma } from "@/lib/prisma"

export interface RiseUpMigrationFormation {
  id: string
  title: string
  startedAt: string
  expiresAt: string | null
  totalChapters: number
  completedChapters: number
  progressPercent: number
}

export interface RiseUpMigrationLearner {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  reference: string | null
  partnerName: string
  isActive: boolean
  archivedAt: string | null
  createdAt: string
  lastLoginAt: string | null
  formations: RiseUpMigrationFormation[]
  enrollmentCount: number
  totalChapters: number
  completedChapters: number
  progressPercent: number
  timeSpentSeconds: number
  emailCount: number
  lastEmailAt: string | null
  tokenCount: number
  activeTokenCount: number
  silentStatus: "silent" | "notified" | "active"
}

export interface RiseUpMigrationFormationStat {
  id: string
  title: string
  learnerCount: number
  averageProgress: number
}

export interface RiseUpMigrationOverview {
  learners: RiseUpMigrationLearner[]
  formationStats: RiseUpMigrationFormationStat[]
  stats: {
    learners: number
    inactiveLearners: number
    activeLearners: number
    enrollments: number
    formations: number
    completedChapters: number
    totalChapters: number
    averageProgress: number
    learnersWithProgress: number
    emailsSent: number
    tokensCreated: number
    activeTokens: number
    silentReady: number
  }
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function percent(completed: number, total: number) {
  if (total <= 0) return 0
  return Math.round((completed / total) * 100)
}

export async function getRiseUpMigrationOverview(): Promise<RiseUpMigrationOverview> {
  const users = await prisma.user.findMany({
    where: {
      role: "LEARNER",
      reference: { startsWith: "RISEUP-" },
    },
    include: {
      partner: { select: { id: true, name: true } },
      enrollments: {
        orderBy: { startedAt: "asc" },
        include: {
          formation: {
            select: {
              id: true,
              title: true,
              chapters: { select: { id: true } },
            },
          },
        },
      },
      progress: {
        select: {
          chapterId: true,
          completedAt: true,
          timeSpentSeconds: true,
        },
      },
      emailLogs: {
        orderBy: { sentAt: "desc" },
        select: {
          id: true,
          sentAt: true,
          success: true,
          type: true,
        },
      },
      passwordResetTokens: {
        select: {
          id: true,
          expiresAt: true,
          usedAt: true,
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  const formationAccumulator = new Map<string, { title: string; learnerCount: number; progressSum: number }>()

  const learners = users.map<RiseUpMigrationLearner>((user) => {
    const progressByChapter = new Map(user.progress.map((progress) => [progress.chapterId, progress]))
    const enrolledChapterIds = new Set<string>()

    const formations = user.enrollments.map<RiseUpMigrationFormation>((enrollment) => {
      const chapterIds = enrollment.formation.chapters.map((chapter) => chapter.id)
      chapterIds.forEach((id) => enrolledChapterIds.add(id))
      const totalChapters = chapterIds.length
      const completedChapters = chapterIds.filter((id) => !!progressByChapter.get(id)?.completedAt).length
      const progressPercent = percent(completedChapters, totalChapters)

      const current = formationAccumulator.get(enrollment.formation.id) || {
        title: enrollment.formation.title,
        learnerCount: 0,
        progressSum: 0,
      }
      formationAccumulator.set(enrollment.formation.id, {
        title: current.title,
        learnerCount: current.learnerCount + 1,
        progressSum: current.progressSum + progressPercent,
      })

      return {
        id: enrollment.formation.id,
        title: enrollment.formation.title,
        startedAt: enrollment.startedAt.toISOString(),
        expiresAt: toIso(enrollment.expiresAt),
        totalChapters,
        completedChapters,
        progressPercent,
      }
    })

    const relevantProgress = user.progress.filter((progress) => enrolledChapterIds.has(progress.chapterId))
    const totalChapters = formations.reduce((sum, formation) => sum + formation.totalChapters, 0)
    const completedChapters = formations.reduce((sum, formation) => sum + formation.completedChapters, 0)
    const emailCount = user.emailLogs.length
    const tokenCount = user.passwordResetTokens.length
    const activeTokenCount = user.passwordResetTokens.filter(
      (token) => !token.usedAt && token.expiresAt.getTime() > Date.now(),
    ).length
    const silentStatus = emailCount > 0 || tokenCount > 0 ? "notified" : user.isActive ? "active" : "silent"

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      reference: user.reference,
      partnerName: user.partner?.name || "Aucun partenaire",
      isActive: user.isActive,
      archivedAt: toIso(user.archivedAt),
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: toIso(user.lastLoginAt),
      formations,
      enrollmentCount: formations.length,
      totalChapters,
      completedChapters,
      progressPercent: percent(completedChapters, totalChapters),
      timeSpentSeconds: relevantProgress.reduce((sum, progress) => sum + progress.timeSpentSeconds, 0),
      emailCount,
      lastEmailAt: toIso(user.emailLogs[0]?.sentAt),
      tokenCount,
      activeTokenCount,
      silentStatus,
    }
  })

  const formationStats = Array.from(formationAccumulator.entries())
    .map(([id, stat]) => ({
      id,
      title: stat.title,
      learnerCount: stat.learnerCount,
      averageProgress: stat.learnerCount > 0 ? Math.round(stat.progressSum / stat.learnerCount) : 0,
    }))
    .sort((a, b) => b.learnerCount - a.learnerCount || a.title.localeCompare(b.title, "fr"))

  const learnersWithProgress = learners.filter((learner) => learner.completedChapters > 0).length
  const totalChapters = learners.reduce((sum, learner) => sum + learner.totalChapters, 0)
  const completedChapters = learners.reduce((sum, learner) => sum + learner.completedChapters, 0)

  return {
    learners,
    formationStats,
    stats: {
      learners: learners.length,
      inactiveLearners: learners.filter((learner) => !learner.isActive && !learner.archivedAt).length,
      activeLearners: learners.filter((learner) => learner.isActive && !learner.archivedAt).length,
      enrollments: learners.reduce((sum, learner) => sum + learner.enrollmentCount, 0),
      formations: formationStats.length,
      completedChapters,
      totalChapters,
      averageProgress: percent(completedChapters, totalChapters),
      learnersWithProgress,
      emailsSent: learners.reduce((sum, learner) => sum + learner.emailCount, 0),
      tokensCreated: learners.reduce((sum, learner) => sum + learner.tokenCount, 0),
      activeTokens: learners.reduce((sum, learner) => sum + learner.activeTokenCount, 0),
      silentReady: learners.filter((learner) => learner.silentStatus === "silent").length,
    },
  }
}
