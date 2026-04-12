import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { text, order, choices } = await req.json()

  // Update question
  const question = await prisma.question.update({
    where: { id: params.id },
    data: {
      ...(text !== undefined && { text }),
      ...(order !== undefined && { order }),
    },
  })

  // If choices provided, replace them all
  if (choices !== undefined) {
    await prisma.choice.deleteMany({ where: { questionId: params.id } })
    if (choices.length > 0) {
      await prisma.choice.createMany({
        data: choices.map((c: { text: string; isCorrect: boolean }) => ({
          questionId: params.id,
          text: c.text,
          isCorrect: c.isCorrect || false,
        })),
      })
    }
  }

  const updated = await prisma.question.findUnique({
    where: { id: params.id },
    include: { choices: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  await prisma.question.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
