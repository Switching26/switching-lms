import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

import { checkedConversation } from "../../_access"
import { TrainerAccessError } from "@/lib/trainer/access"

export const dynamic = "force-dynamic"

// GET — messages for a conversation (with optional ?after= for polling)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const user = session.user
  let conversation
  try { conversation = await checkedConversation(user, params.id) }
  catch (e) {
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const afterId = req.nextUrl.searchParams.get("after")
  let afterDate: Date | undefined
  if (afterId) {
    const afterMsg = await prisma.message.findUnique({ where: { id: afterId, conversationId: params.id }, select: { createdAt: true } })
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
