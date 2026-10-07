import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

import { checkedConversation } from "../../../_access"
import { TrainerAccessError } from "@/lib/trainer/access"

export const dynamic = "force-dynamic"

// PUT — mark conversation as read
export async function PUT(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const user = session.user
  let conversation
  try { conversation = await checkedConversation(user, params.id) }
  catch (e) {
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const isLearner = conversation.learnerId === user.id

  // Serialize reading with sends so the notification window cannot be reopened
  // by a partially applied read.
  await prisma.$transaction(async tx => {
    await tx.conversation.update({ where: { id: params.id },
      data: isLearner ? { isReadLearner: true } : { isReadAdmin: true } })
    await tx.message.updateMany({
      where: { conversationId: params.id, senderId: { not: user.id }, isRead: false },
      data: { isRead: true },
    })
  })

  return NextResponse.json({ ok: true })
}
