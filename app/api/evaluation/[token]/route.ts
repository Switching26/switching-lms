import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  gradeAnswers,
  getAssessmentForCandidate,
  invitationState,
  scorePercent,
  type SubmittedAnswer,
} from "@/lib/assessments"

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

  return NextResponse.json({
    state: "submitted",
    result: await buildResult(inv.id, inv.assessment),
  })
}
