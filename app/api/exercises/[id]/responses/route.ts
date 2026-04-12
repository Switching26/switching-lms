import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = session.user.id

  const response = await prisma.exerciseResponse.findFirst({
    where: { exerciseId: params.id, userId },
    orderBy: { completedAt: "desc" },
    include: {
      questionResponses: true,
    },
  })

  return NextResponse.json(response)
}
