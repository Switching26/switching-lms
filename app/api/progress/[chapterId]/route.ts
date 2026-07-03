import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { chapterCompletedEmail, formationCompletedEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"
import { getBaseUrl } from "@/lib/get-base-url"
import { sortChaptersByLearningOrder } from "@/lib/data/chapter-order"

export async function PUT(req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = session.user.id
  const { timeSpentSeconds, lastPosition, completedAt } = await req.json()

  const chapter = await prisma.chapter.findUnique({
    where: { id: params.chapterId },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          chapters: { orderBy: { order: "asc" }, include: { section: true } },
        },
      },
    },
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
      const allChapters = sortChaptersByLearningOrder(formation.chapters, formation.sections)
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
      const baseUrl = getBaseUrl()
      const loginUrl = partner?.slug ? `${baseUrl}/login?partner=${partner.slug}` : `${baseUrl}/login`

      const brandingVars = {
        couleur_principale: partner?.primaryColor || "#111111",
        couleur_secondaire: partner?.secondaryColor || "#F5F5F7",
        logo_url: partner?.logoUrl ? (partner.logoUrl.startsWith("http") ? partner.logoUrl : `${baseUrl}${partner.logoUrl.startsWith("/") ? "" : "/"}${partner.logoUrl}`) : "",
      }

      // Send CHAPTER_COMPLETED email
      const chapterDynamic = await resolveTemplate("CHAPTER_COMPLETED", user.partnerId)
      if (chapterDynamic) {
        const vars = {
          prenom: user.firstName,
          nom: user.lastName,
          email: user.email,
          formation_titre: formation.title,
          chapitre_titre: chapter.title,
          chapitre_numero: String(chapter.order),
          prochain_chapitre: nextChapter?.title || "",
          progression: String(progressPercent),
          lien_connexion: loginUrl,
          plateforme_nom: partner?.name || "Switching Formation",
          plateforme_url: loginUrl,
          partenaire_nom: partner?.name || "",
          ...brandingVars,
        }
        sendEmail(user.email, replaceVariables(chapterDynamic.subject, vars), replaceVariables(chapterDynamic.htmlContent, vars), userId, "CHAPTER_COMPLETED", partner)
      } else {
        const chapterEmail = chapterCompletedEmail(user.firstName, chapter.title, chapter.order, progressPercent, nextChapter?.title || null, partner)
        sendEmail(user.email, chapterEmail.subject, chapterEmail.html, userId, "CHAPTER_COMPLETED", partner)
      }

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
          const formDynamic = await resolveTemplate("FORMATION_COMPLETED", user.partnerId)
          if (formDynamic) {
            const vars = {
              prenom: user.firstName,
              nom: user.lastName,
              email: user.email,
              formation_titre: formation.title,
              lien_connexion: loginUrl,
              plateforme_nom: partner?.name || "Switching Formation",
              plateforme_url: loginUrl,
              partenaire_nom: partner?.name || "",
              ...brandingVars,
            }
            sendEmail(user.email, replaceVariables(formDynamic.subject, vars), replaceVariables(formDynamic.htmlContent, vars), userId, "FORMATION_COMPLETED", partner)
          } else {
            const completionEmail = formationCompletedEmail(user.firstName, formation.title, enrollment.id, partner)
            sendEmail(user.email, completionEmail.subject, completionEmail.html, userId, "FORMATION_COMPLETED", partner)
          }
        }
      }
    } catch (err) {
      console.error("[PROGRESS] Email trigger error:", err)
    }
  }

  return NextResponse.json(progress)
}
