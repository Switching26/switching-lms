import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { assessmentCompletedEmail } from "@/lib/email-templates"
import { getBaseUrl } from "@/lib/get-base-url"
import {
  gradeAnswers,
  getAssessmentForCandidate,
  invitationState,
  scorePercent,
  type SubmittedAnswer,
} from "@/lib/assessments"

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Passage d'une évaluation par un candidat NON connecté.
 *
 * Le token du lien est la seule authentification : toutes les données sont donc
 * dérivées de lui, jamais d'un identifiant fourni dans le corps de la requête.
 * Les bonnes réponses ne sortent jamais avant la soumission.
 */

async function loadInvitation(token: string) {
  return prisma.assessmentInvitation.findUnique({
    where: { token },
    include: {
      assessment: {
        select: { id: true, isPublished: true, deletedAt: true, showScore: true, showCorrectAnswers: true, passingScore: true },
      },
    },
  })
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const inv = await loadInvitation(params.token)
  // Message volontairement identique pour un token inconnu et une évaluation
  // dépubliée : ne pas révéler l'existence d'un lien.
  if (!inv || !inv.assessment.isPublished || inv.assessment.deletedAt) {
    return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 404 })
  }

  const state = invitationState(inv)

  if (state === "expired") {
    return NextResponse.json({ state, candidateFirstName: inv.candidateFirstName }, { status: 200 })
  }

  if (state === "submitted") {
    return NextResponse.json({
      state,
      candidateFirstName: inv.candidateFirstName,
      result: await buildResult(inv.id, inv.assessment),
    })
  }

  const assessment = await getAssessmentForCandidate(inv.assessmentId)
  if (!assessment) {
    return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 404 })
  }

  // Première ouverture : trace la consultation sans démarrer le chrono.
  if (!inv.openedAt) {
    await prisma.assessmentInvitation.update({
      where: { id: inv.id },
      data: { openedAt: new Date() },
    })
  }

  return NextResponse.json({
    state: "ready",
    candidateFirstName: inv.candidateFirstName,
    candidateLastName: inv.candidateLastName,
    // Pré-remplissage du formulaire d'identité avec ce qui a été saisi à
    // l'invitation ; le candidat peut corriger.
    candidateEmail: inv.candidateEmail,
    expiresAt: inv.expiresAt,
    assessment,
  })
}

/** Restitution post-soumission, selon ce que l'évaluation autorise à montrer. */
async function buildResult(
  invitationId: string,
  assessment: { showScore: boolean; showCorrectAnswers: boolean; passingScore: number | null }
) {
  const inv = await prisma.assessmentInvitation.findUnique({
    where: { id: invitationId },
    select: {
      score: true,
      maxScore: true,
      submittedAt: true,
      needsManualReview: true,
      answers: {
        select: {
          questionId: true,
          selectedChoiceIds: true,
          responseText: true,
          scaleValue: true,
          isCorrect: true,
          pointsEarned: true,
        },
      },
    },
  })
  if (!inv) return null

  const percent = scorePercent(inv.score, inv.maxScore)
  const base = {
    submittedAt: inv.submittedAt,
    needsManualReview: inv.needsManualReview,
    showScore: assessment.showScore,
    showCorrectAnswers: assessment.showCorrectAnswers,
    ...(assessment.showScore
      ? {
          score: inv.score,
          maxScore: inv.maxScore,
          percent,
          passed: assessment.passingScore != null ? percent >= assessment.passingScore : null,
          passingScore: assessment.passingScore,
        }
      : {}),
  }

  if (!assessment.showCorrectAnswers) return base

  // Correction détaillée : les bonnes réponses ne sont chargées qu'ICI, une
  // fois le test soumis.
  const questions = await prisma.assessmentQuestion.findMany({
    where: { assessment: { invitations: { some: { id: invitationId } } } },
    orderBy: { order: "asc" },
    select: {
      id: true,
      text: true,
      type: true,
      points: true,
      choices: { orderBy: { order: "asc" }, select: { id: true, text: true, isCorrect: true } },
    },
  })

  const byQuestion = new Map(inv.answers.map((a) => [a.questionId, a]))
  return {
    ...base,
    corrections: questions.map((q) => ({
      ...q,
      answer: byQuestion.get(q.id) ?? null,
    })),
  }
}

/**
 * Identification du candidat, avant d'accéder aux questions.
 *
 * L'invitation porte déjà un email (celui saisi à l'envoi), mais un lien peut
 * être transféré : c'est la saisie du candidat qui fait foi pour savoir de
 * quel prospect il s'agit. Enregistrée dès le départ — et pas à la
 * soumission — pour identifier aussi ceux qui commencent sans terminer.
 */
export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const inv = await loadInvitation(params.token)
  if (!inv || !inv.assessment.isPublished || inv.assessment.deletedAt) {
    return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 404 })
  }
  if (invitationState(inv) !== "ready") {
    return NextResponse.json({ error: "Évaluation déjà validée ou expirée" }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const firstName = String(body?.firstName || "").trim()
  const lastName = String(body?.lastName || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "Nom et prénom requis" }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 })
  }

  await prisma.assessmentInvitation.update({
    where: { id: inv.id },
    data: {
      candidateFirstName: firstName,
      candidateLastName: lastName,
      candidateEmail: email,
      startedAt: inv.startedAt ?? new Date(),
    },
  })

  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const inv = await loadInvitation(params.token)
  if (!inv || !inv.assessment.isPublished || inv.assessment.deletedAt) {
    return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 404 })
  }

  const state = invitationState(inv)
  if (state === "submitted") {
    return NextResponse.json({ error: "Cette évaluation a déjà été validée" }, { status: 409 })
  }
  if (state === "expired") {
    return NextResponse.json({ error: "Ce lien a expiré" }, { status: 410 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 })
  }

  const submitted: SubmittedAnswer[] = Array.isArray(body?.answers) ? body.answers : []

  // Barème chargé depuis la base, jamais depuis le client.
  const questions = await prisma.assessmentQuestion.findMany({
    where: { assessmentId: inv.assessmentId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      type: true,
      points: true,
      choices: { select: { id: true, isCorrect: true } },
    },
  })

  const graded = gradeAnswers(questions, submitted)

  // Transaction : le verrou anti-double-soumission et l'enregistrement des
  // réponses doivent être indissociables.
  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.assessmentInvitation.updateMany({
        where: { id: inv.id, submittedAt: null },
        data: {
          submittedAt: new Date(),
          score: graded.score,
          maxScore: graded.maxScore,
          needsManualReview: graded.needsManualReview,
          startedAt: inv.startedAt ?? new Date(),
        },
      })
      // Une seconde soumission concurrente ne doit pas écraser la première.
      if (locked.count === 0) throw new Error("ALREADY_SUBMITTED")

      await tx.assessmentAnswer.deleteMany({ where: { invitationId: inv.id } })
      await tx.assessmentAnswer.createMany({
        data: graded.answers.map((a) => ({
          invitationId: inv.id,
          questionId: a.questionId,
          selectedChoiceIds: a.selectedChoiceIds,
          responseText: a.responseText,
          scaleValue: a.scaleValue,
          isCorrect: a.isCorrect,
          pointsEarned: a.pointsEarned,
        })),
      })
    })
  } catch (e: any) {
    if (e?.message === "ALREADY_SUBMITTED") {
      return NextResponse.json({ error: "Cette évaluation a déjà été validée" }, { status: 409 })
    }
    throw e
  }

  // Notification interne : sans elle, il faudrait surveiller la page pour
  // savoir qu'un candidat a répondu. Jamais bloquante pour le candidat, qui a
  // déjà validé : son test ne doit pas échouer parce qu'un email n'est pas parti.
  notifyCompletion(inv.id).catch(() => {})

  return NextResponse.json({
    state: "submitted",
    result: await buildResult(inv.id, inv.assessment),
  })
}

/** Prévient l'organisme qu'un candidat vient de terminer son évaluation. */
async function notifyCompletion(invitationId: string) {
  const inv = await prisma.assessmentInvitation.findUnique({
    where: { id: invitationId },
    include: {
      assessment: { include: { partner: true } },
    },
  })
  if (!inv) return

  // Destinataire : l'adresse configurée sur l'évaluation, sinon l'auteur de
  // l'invitation.
  let to = inv.assessment.notifyEmail?.trim() || ""
  let recipientUserId: string | null = null
  if (!to && inv.createdById) {
    const author = await prisma.user.findUnique({
      where: { id: inv.createdById },
      select: { id: true, email: true },
    })
    if (author) {
      to = author.email
      recipientUserId = author.id
    }
  } else if (to) {
    // Journalise l'envoi si l'adresse correspond à un compte du LMS.
    const known = await prisma.user.findUnique({ where: { email: to }, select: { id: true } })
    recipientUserId = known?.id ?? null
  }
  if (!to) return

  const percent = scorePercent(inv.score, inv.maxScore)
  const scoreLine = inv.maxScore && inv.maxScore > 0
    ? `${percent}% — ${inv.score} / ${inv.maxScore} points`
    : null

  const mail = assessmentCompletedEmail(
    inv.assessment.title,
    { firstName: inv.candidateFirstName, lastName: inv.candidateLastName, email: inv.candidateEmail },
    scoreLine,
    inv.needsManualReview,
    `${getBaseUrl()}/super-admin/evaluations/${inv.assessmentId}`,
    inv.assessment.partner
  )
  await sendEmail(to, mail.subject, mail.html, recipientUserId, "ASSESSMENT_COMPLETED", inv.assessment.partner)
}
