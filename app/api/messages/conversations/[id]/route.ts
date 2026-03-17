import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// GET — messages for a conversation (with optional ?after= for polling)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const user = session.user as any
  const conversation = await prisma.conversation.findUnique({ where: { id: params.id } })
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 })

  // Verify access
  if (conversation.learnerId !== user.id && conversation.adminId !== user.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const afterId = req.nextUrl.searchParams.get("after")
  let afterDate: Date | undefined
  if (afterId) {
    const afterMsg = await prisma.message.findUnique({ where: { id: afterId }, select: { createdAt: true } })
    if (afterMsg) afterDate = afterMsg.createdAt
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      ...(afterDate ? { createdAt: { gt: afterDate } } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  })

  return NextResponse.json(messages)
}
