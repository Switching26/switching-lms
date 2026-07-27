import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Garde commune : session admin + périmètre organisme.
 * Un admin partenaire ne touche que les évaluations de son organisme.
 */
async function guard(id: string) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  const assessment = await prisma.assessment.findFirst({ where: { id, deletedAt: null } })
  if (!assessment) {
    return { error: NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 }) }
  }
  if (role === "PARTNER_ADMIN" && assessment.partnerId !== session.user.partnerId) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  return { session, role, assessment }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ("error" in g) return g.error

  const assessment = await prisma.assessment.findUnique({
    where: { id: params.id },
    include: {
      partner: { select: { id: true, name: true, slug: true } },
      questions: {
        orderBy: { order: "asc" },
        include: { choices: { orderBy: { order: "asc" } } },
      },
      invitations: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, candidateEmail: true, candidateFirstName: true, candidateLastName: true,
          token: true, sentAt: true, openedAt: true, submittedAt: true, expiresAt: true,
          score: true, maxScore: true, needsManualReview: true,
        },
      },
    },
  })
  return NextResponse.json(assessment)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ("error" in g) return g.error

  const body = await req.json().catch(() => ({}))

  const data: any = {}
  if (body.title !== undefined) data.title = String(body.title).trim()
  if (body.description !== undefined) data.description = body.description ? String(body.description) : null
  if (body.type !== undefined) data.type = body.type === "EVALUATION" ? "EVALUATION" : "POSITIONNEMENT"
  if (body.isPublished !== undefined) data.isPublished = Boolean(body.isPublished)
  if (body.showScore !== undefined) data.showScore = Boolean(body.showScore)
  if (body.showCorrectAnswers !== undefined) data.showCorrectAnswers = Boolean(body.showCorrectAnswers)
  if (body.passingScore !== undefined) data.passingScore = body.passingScore != null ? Number(body.passingScore) : null
  if (body.timeLimitMinutes !== undefined) data.timeLimitMinutes = body.timeLimitMinutes != null ? Number(body.timeLimitMinutes) : null
  if (body.validityDays !== undefined) data.validityDays = Number(body.validityDays) || 30

  // Les questions sont remplacées en bloc : l'éditeur envoie l'état complet.
  // On refuse de le faire si des candidats ont déjà répondu, sinon leurs
  // réponses pointeraient vers des questions supprimées (cascade) et les
  // scores déjà calculés deviendraient inexplicables.
  if (Array.isArray(body.questions)) {
    const answered = await prisma.assessmentInvitation.count({
      where: { assessmentId: params.id, submittedAt: { not: null } },
    })
    if (answered > 0) {
      return NextResponse.json(
        { error: `Impossible de modifier les questions : ${answered} candidat(s) ont déjà répondu. Dupliquez l'évaluation pour la faire évoluer.` },
        { status: 409 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.assessmentQuestion.deleteMany({ where: { assessmentId: params.id } })
      for (const [i, q] of body.questions.entries()) {
        const created = await tx.assessmentQuestion.create({
          data: {
            assessmentId: params.id,
            text: String(q.text || "").trim(),
            helpText: q.helpText ? String(q.helpText) : null,
            type: ["QCM_SINGLE", "QCM_MULTI", "TEXTE", "ECHELLE"].includes(q.type) ? q.type : "QCM_SINGLE",
            order: i,
            points: Number(q.points) > 0 ? Number(q.points) : 1,
            scaleMin: q.scaleMin != null ? Number(q.scaleMin) : null,
            scaleMax: q.scaleMax != null ? Number(q.scaleMax) : null,
            scaleMinLabel: q.scaleMinLabel ? String(q.scaleMinLabel) : null,
            scaleMaxLabel: q.scaleMaxLabel ? String(q.scaleMaxLabel) : null,
          },
        })
        if (Array.isArray(q.choices) && (q.type === "QCM_SINGLE" || q.type === "QCM_MULTI")) {
          await tx.assessmentChoice.createMany({
            data: q.choices
              .filter((c: any) => String(c.text || "").trim())
              .map((c: any, ci: number) => ({
                questionId: created.id,
                text: String(c.text).trim(),
                isCorrect: Boolean(c.isCorrect),
                order: ci,
              })),
          })
        }
      }
    })
  }

  if (Object.keys(data).length > 0) {
    await prisma.assessment.update({ where: { id: params.id }, data })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ("error" in g) return g.error

  // Suppression logique : les résultats déjà passés restent consultables.
  await prisma.assessment.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isPublished: false },
  })
  return NextResponse.json({ success: true })
}
