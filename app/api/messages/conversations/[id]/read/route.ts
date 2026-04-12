import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// PUT — mark conversation as read
export async function PUT(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const user = session.user
  const conversation = await prisma.conversation.findUnique({ where: { id: params.id } })
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 })

  if (conversation.learnerId !== user.id && conversation.adminId !== user.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const isLearner = conversation.learnerId === user.id

  // Mark messages as read + update conversation flag
  await prisma.message.updateMany({
    where: { conversationId: params.id, senderId: { not: user.id }, isRead: false },
    data: { isRead: true },
  })

  await prisma.conversation.update({
    where: { id: params.id },
    data: isLearner ? { isReadLearner: true } : { isReadAdmin: true },
  })

  return NextResponse.json({ ok: true })
}
