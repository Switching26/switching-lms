import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { text, type, choices } = await req.json()

  const exercise = await prisma.exercise.findUnique({ where: { id: params.id } })
  if (!exercise) return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 })

  const lastQuestion = await prisma.question.findFirst({
    where: { exerciseId: params.id },
    orderBy: { order: "desc" },
  })

  const question = await prisma.question.create({
    data: {
      exerciseId: params.id,
      text: text || "Nouvelle question",
      type: type || exercise.type,
      order: (lastQuestion?.order ?? 0) + 1,
      choices: choices?.length
        ? {
            create: choices.map((c: { text: string; isCorrect: boolean }) => ({
              text: c.text,
              isCorrect: c.isCorrect || false,
            })),
          }
        : undefined,
    },
    include: { choices: true },
  })

  return NextResponse.json(question, { status: 201 })
}
