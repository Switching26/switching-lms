import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = session.user.id
  const { answers, preview } = await req.json() as {
    answers: { questionId: string; selectedChoiceIds?: string[]; selectedChoiceId?: string; responseText?: string }[]
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

  // Calculate corrections (supporte le multi-réponses : tout-ou-rien)
  const corrections = exercise.questions.map((q) => {
    const answer = answers.find((a) => a.questionId === q.id)
    if (q.type === "REDACTION") {
      return {
        questionId: q.id,
        isCorrect: null as boolean | null,
        selectedChoiceIds: [] as string[],
        correctChoiceIds: [] as string[],
        responseText: (answer?.responseText ?? "") as string | null,
      }
    }
    const correctChoiceIds = q.choices.filter((c) => c.isCorrect).map((c) => c.id)
    // Normaliser la sélection (compat ancien champ unique `selectedChoiceId`)
    const selectedChoiceIds = (answer?.selectedChoiceIds && answer.selectedChoiceIds.length > 0)
      ? answer.selectedChoiceIds
      : (answer?.selectedChoiceId ? [answer.selectedChoiceId] : [])
    // Tout-ou-rien : juste seulement si l'ensemble coché == ensemble des bonnes réponses
    const isCorrect =
      selectedChoiceIds.length === correctChoiceIds.length &&
      correctChoiceIds.every((id) => selectedChoiceIds.includes(id))
    return {
      questionId: q.id,
      isCorrect: isCorrect as boolean | null,
      selectedChoiceIds,
      correctChoiceIds,
      responseText: null as string | null,
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

  // Save responses (1 QuestionResponse par question ; détail multi conservé en JSON
  // dans responseText, 1er choix dans selectedChoiceId pour compat — sans migration DB)
  const exerciseResponse = await prisma.exerciseResponse.create({
    data: {
      userId,
      exerciseId: params.id,
      score,
      questionResponses: {
        create: corrections.map((c) => ({
          userId,
          questionId: c.questionId,
          selectedChoiceId: c.selectedChoiceIds[0] || null,
          responseText: c.responseText != null ? c.responseText : JSON.stringify(c.selectedChoiceIds),
          isCorrect: c.isCorrect,
        })),
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
