import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { title, instructions, type, order } = await req.json()

  const exercise = await prisma.exercise.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(instructions !== undefined && { instructions: instructions || null }),
      ...(type !== undefined && { type }),
      ...(order !== undefined && { order }),
    },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { choices: true },
      },
    },
  })

  return NextResponse.json(exercise)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  await prisma.exercise.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
