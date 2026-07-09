import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sortChaptersByLearningOrder } from "@/lib/data/chapter-order"
import { getFormationQuizResults } from "@/lib/data/quiz"

export const dynamic = "force-dynamic"

// Entrées LoginLog importées de Rise Up : userAgent = "riseup-import|<device>|<timeSpent>s"
function parseLoginLog(l: { loginAt: Date; userAgent: string | null }) {
  if (l.userAgent?.startsWith("riseup-import|")) {
    const [, device, secs] = l.userAgent.split("|")
    return { date: l.loginAt, source: "riseup", device: device || null, durationSeconds: parseInt(secs) || null }
  }
  return { date: l.loginAt, source: "lms", device: null, durationSeconds: null }
}

export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = session.user.role
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, partnerId: true } })
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  if (role === "PARTNER_ADMIN" && user.partnerId !== session.user.partnerId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Inscriptions + structure complète des formations (chapitres publiés, ordonnés)
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: params.userId },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          chapters: { where: { isPublished: true }, orderBy: { order: "asc" }, include: { section: true } },
        },
      },
    },
    orderBy: { startedAt: "asc" },
  })

  const progressRows = await prisma.progress.findMany({ where: { userId: params.userId } })
  const progressByChapter = new Map(progressRows.map((p) => [p.chapterId, p]))

  // Historique de connexions complet (LMS + import Rise Up), du plus récent au plus ancien
  const loginLogs = await prisma.loginLog.findMany({
    where: { userId: params.userId },
    orderBy: { loginAt: "desc" },
    take: 500,
  })
  const loginHistory = loginLogs.map(parseLoginLog)

  const formations = await Promise.all(enrollments.map(async (e) => {
    const orderedChapters = sortChaptersByLearningOrder(e.formation.chapters, e.formation.sections)
    const chapters = orderedChapters.map((c) => {
      const p = progressByChapter.get(c.id)
      return {
        id: c.id,
        title: c.title,
        expectedDuration: c.videoDuration || 0,
        status: p?.completedAt ? "done" : p ? "in_progress" : "not_started",
        timeSpent: p?.timeSpentSeconds || 0,
        sessionCount: p?.sessionCount || 0,
        completedAt: p?.completedAt || null,
      }
    })
    const completedChapters = chapters.filter((c) => c.status === "done").length
    const timeSpent = chapters.reduce((s, c) => s + c.timeSpent, 0)
    const expectedDuration = chapters.reduce((s, c) => s + c.expectedDuration, 0)
    return {
      id: e.formation.id,
      title: e.formation.title,
      startedAt: e.startedAt,
      expiresAt: e.expiresAt,
      completedChapters,
      totalChapters: chapters.length,
      percent: chapters.length > 0 ? Math.round((completedChapters / chapters.length) * 100) : 0,
      timeSpent,
      expectedDuration,
      chapters,
      quiz: await getFormationQuizResults(params.userId, e.formation.id),
    }
  }))

  const totalTime = progressRows.reduce((s, p) => s + p.timeSpentSeconds, 0)
  const totalExpected = formations.reduce((s, f) => s + f.expectedDuration, 0)

  // Exercise scores
  const exerciseResponses = await prisma.exerciseResponse.findMany({
    where: { userId: params.userId },
    include: { exercise: { include: { chapter: { select: { title: true } } } } },
    orderBy: { completedAt: "desc" },
  })
  const exercises = exerciseResponses.map((er) => ({
    id: er.id,
    exerciseTitle: er.exercise.title,
    exerciseType: er.exercise.type,
    chapterTitle: er.exercise.chapter.title,
    score: er.score,
    completedAt: er.completedAt,
  }))

  return NextResponse.json({
    totalTime,
    totalExpected,
    lastLogin: loginLogs[0]?.loginAt || null,
    connectionCount: loginLogs.length,
    loginHistory,
    formations,
    exercises,
  })
}
