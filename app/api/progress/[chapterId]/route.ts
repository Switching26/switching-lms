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
  const { timeSpentSeconds, timeDeltaSeconds, lastPosition, completedAt } = await req.json()

  const chapter = await prisma.chapter.findUnique({
    where: { id: params.chapterId },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          // Seuls les chapitres publiés comptent dans la progression et les emails.
          chapters: { where: { isPublished: true }, orderBy: { order: "asc" }, include: { section: true } },
        },
      },
    },
  })
  if (!chapter) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 })
  if (!chapter.isPublished) {
    return NextResponse.json({ error: "Chapitre non publié" }, { status: 403 })
  }

  // L'apprenant doit être inscrit à la formation du chapitre, et l'accès valide.
  const enrollmentAccess = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId, formationId: chapter.formationId } },
  })
  if (!enrollmentAccess) {
    return NextResponse.json({ error: "Non inscrit à cette formation" }, { status: 403 })
  }
  const now = new Date()
  if (enrollmentAccess.expiresAt && enrollmentAccess.expiresAt < now) {
    return NextResponse.json({ error: "Accès expiré" }, { status: 403 })
  }
  if (enrollmentAccess.startedAt && enrollmentAccess.startedAt > now) {
    return NextResponse.json({ error: "Accès pas encore ouvert" }, { status: 403 })
  }

  // Bornage des compteurs envoyés par le client (jamais négatifs ni délirants).
  const clamp = (v: unknown, max: number): number | undefined => {
    if (v === undefined || v === null) return undefined
    const n = Number(v)
    if (!Number.isFinite(n)) return undefined
    return Math.min(Math.max(Math.round(n), 0), max)
  }
  const safeTime = clamp(timeSpentSeconds, 3_600_000) // ~1000 h
  // Delta de temps réel passé sur le chapitre (heartbeat du player) : cumulé
  // côté serveur, borné à 15 min par appel (flush client toutes les ~60 s).
  const safeDelta = clamp(timeDeltaSeconds, 900)
  const safePosition = clamp(lastPosition, 1_000_000)
  // Un heartbeat pur ne doit pas gonfler sessionCount ni toucher completedAt.
  const heartbeatOnly =
    safeDelta !== undefined && safeTime === undefined &&
    safePosition === undefined && completedAt === undefined

  // Détecter une VRAIE transition non-terminé → terminé (pour ne pas re-notifier).
  const existingProgress = await prisma.progress.findUnique({
    where: { userId_chapterId: { userId, chapterId: params.chapterId } },
  })
  const wasCompleted = !!existingProgress?.completedAt
  // completedAt est piloté serveur : truthy → maintenant, null explicite → réinitialise.
  const completeNow = completedAt !== undefined ? !!completedAt : undefined
  const isCompletionTransition = completeNow === true && !wasCompleted

  const progress = await prisma.progress.upsert({
    where: { userId_chapterId: { userId, chapterId: params.chapterId } },
    update: {
      // Le delta (increment) prime sur l'ancien set absolu, conservé pour compat.
      ...(safeDelta !== undefined
        ? { timeSpentSeconds: { increment: safeDelta } }
        : safeTime !== undefined && { timeSpentSeconds: safeTime }),
      ...(safePosition !== undefined && { lastPosition: safePosition }),
      ...(completeNow !== undefined && { completedAt: completeNow ? now : null }),
      sessionCount: { increment: heartbeatOnly ? 0 : 1 },
    },
    create: {
      userId,
      chapterId: params.chapterId,
      timeSpentSeconds: safeDelta ?? safeTime ?? 0,
      lastPosition: safePosition || 0,
      completedAt: completeNow ? now : null,
      sessionCount: 1,
    },
  })

  // Emails uniquement lors de la transition non-terminé → terminé.
  if (isCompletionTransition) {
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
      const displayChapterNumber = chapterIndex >= 0 ? chapterIndex + 1 : chapter.order
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
          chapitre_numero: String(displayChapterNumber),
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
        const chapterEmail = chapterCompletedEmail(user.firstName, chapter.title, displayChapterNumber, progressPercent, nextChapter?.title || null, partner)
        sendEmail(user.email, chapterEmail.subject, chapterEmail.html, userId, "CHAPTER_COMPLETED", partner)
      }

      // Check if ALL chapters are completed → FORMATION_COMPLETED
      if (completedChapters.length >= allChapters.length && allChapters.length > 0) {
        // Mark enrollment as completed — updateMany ne touche QUE les inscriptions
        // pas encore terminées : count > 0 == vraie transition (évite de re-notifier).
        const marked = await prisma.enrollment.updateMany({
          where: { userId, formationId: formation.id, completedAt: null },
          data: { completedAt: new Date() },
        })

        const enrollment = await prisma.enrollment.findFirst({
          where: { userId, formationId: formation.id },
        })

        if (enrollment && marked.count > 0) {
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
