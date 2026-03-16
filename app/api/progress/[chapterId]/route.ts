import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { chapterCompletedEmail, formationCompletedEmail } from "@/lib/email-templates"

export async function PUT(req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = (session.user as any).id
  const { timeSpentSeconds, lastPosition, completedAt } = await req.json()

  const chapter = await prisma.chapter.findUnique({
    where: { id: params.chapterId },
    include: { formation: { include: { chapters: { orderBy: { order: "asc" } } } } },
  })
  if (!chapter) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 })

  const progress = await prisma.progress.upsert({
    where: { userId_chapterId: { userId, chapterId: params.chapterId } },
    update: {
      ...(timeSpentSeconds !== undefined && { timeSpentSeconds }),
      ...(lastPosition !== undefined && { lastPosition }),
      ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
      sessionCount: { increment: 1 },
    },
    create: {
      userId,
      chapterId: params.chapterId,
      timeSpentSeconds: timeSpentSeconds || 0,
      lastPosition: lastPosition || 0,
      completedAt: completedAt ? new Date(completedAt) : null,
      sessionCount: 1,
    },
  })

  // Email triggers on chapter completion
  if (completedAt) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { partner: true },
      })
      if (!user) return NextResponse.json(progress)

      const formation = chapter.formation
      const allChapters = formation.chapters
      const allProgress = await prisma.progress.findMany({
        where: { userId, chapterId: { in: allChapters.map((c) => c.id) } },
      })
      const completedChapters = allProgress.filter((p) => p.completedAt)
      const progressPercent = allChapters.length > 0
        ? Math.round((completedChapters.length / allChapters.length) * 100)
        : 0

      const chapterIndex = allChapters.findIndex((c) => c.id === params.chapterId)
      const nextChapter = chapterIndex >= 0 && chapterIndex < allChapters.length - 1
        ? allChapters[chapterIndex + 1]
        : null

      const partner = user.partner

      // Send CHAPTER_COMPLETED email
      const chapterEmail = chapterCompletedEmail(
        user.firstName,
        chapter.title,
        chapter.order,
        progressPercent,
        nextChapter?.title || null,
        partner
      )
      sendEmail(user.email, chapterEmail.subject, chapterEmail.html, userId, "CHAPTER_COMPLETED", partner)

      // Check if ALL chapters are completed → FORMATION_COMPLETED
      if (completedChapters.length >= allChapters.length) {
        // Mark enrollment as completed
        await prisma.enrollment.updateMany({
          where: { userId, formationId: formation.id, completedAt: null },
          data: { completedAt: new Date() },
        })

        const enrollment = await prisma.enrollment.findFirst({
          where: { userId, formationId: formation.id },
        })

        if (enrollment) {
          const completionEmail = formationCompletedEmail(
            user.firstName,
            formation.title,
            enrollment.id,
            partner
          )
          sendEmail(user.email, completionEmail.subject, completionEmail.html, userId, "FORMATION_COMPLETED", partner)
        }
      }
    } catch (err) {
      console.error("[PROGRESS] Email trigger error:", err)
    }
  }

  return NextResponse.json(progress)
}
