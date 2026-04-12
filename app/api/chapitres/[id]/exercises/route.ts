import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const exercises = await prisma.exercise.findMany({
    where: { chapterId: params.id },
    orderBy: { order: "asc" },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { choices: true },
      },
    },
  })

  return NextResponse.json(exercises)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { type, title, instructions } = await req.json()

  const lastExercise = await prisma.exercise.findFirst({
    where: { chapterId: params.id },
    orderBy: { order: "desc" },
  })

  const exercise = await prisma.exercise.create({
    data: {
      chapterId: params.id,
      type: type || "QCM",
      title: title || "Nouvel exercice",
      instructions: instructions || null,
      order: (lastExercise?.order ?? 0) + 1,
    },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { choices: true },
      },
    },
  })

  return NextResponse.json(exercise, { status: 201 })
}
