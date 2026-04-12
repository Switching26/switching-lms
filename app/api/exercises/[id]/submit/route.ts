import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = session.user.id
  const { answers, preview } = await req.json() as {
    answers: { questionId: string; selectedChoiceId?: string; responseText?: string }[]
    preview?: boolean
  }

  // Load exercise with questions and choices
  const exercise = await prisma.exercise.findUnique({
    where: { id: params.id },
    include: {
      questions: {
        include: { choices: true },
        orderBy: { order: "asc" },
      },
    },
  })

  if (!exercise) return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 })

  // Calculate corrections
  const corrections = exercise.questions.map((q) => {
    const answer = answers.find((a) => a.questionId === q.id)
    if (q.type === "REDACTION") {
      return { questionId: q.id, isCorrect: null, responseText: answer?.responseText || "" }
    }
    const correctChoice = q.choices.find((c) => c.isCorrect)
    const isCorrect = answer?.selectedChoiceId === correctChoice?.id
    return {
      questionId: q.id,
      isCorrect,
      selectedChoiceId: answer?.selectedChoiceId || null,
      correctChoiceId: correctChoice?.id || null,
    }
  })

  // Calculate score (only for auto-correctable questions)
  const gradable = corrections.filter((c) => c.isCorrect !== null)
  const correct = gradable.filter((c) => c.isCorrect).length
  const score = gradable.length > 0 ? correct / gradable.length : null

  // In preview mode, don't save to database
  if (preview) {
    return NextResponse.json({ corrections, score, correct, total: gradable.length })
  }

  // Save responses
  const exerciseResponse = await prisma.exerciseResponse.create({
    data: {
      userId,
      exerciseId: params.id,
      score,
      questionResponses: {
        create: answers.map((a) => {
          const correction = corrections.find((c) => c.questionId === a.questionId)
          return {
            userId,
            questionId: a.questionId,
            selectedChoiceId: a.selectedChoiceId || null,
            responseText: a.responseText || null,
            isCorrect: correction?.isCorrect ?? null,
          }
        }),
      },
    },
  })

  return NextResponse.json({
    exerciseResponseId: exerciseResponse.id,
    corrections,
    score,
    correct,
    total: gradable.length,
  })
}
