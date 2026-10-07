import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTrainer, TrainerAccessError } from "@/lib/trainer/access"
import { conversationWhere } from "../_access"
import { MESSAGE_PREFIX, readCorrection } from "@/components/messages/content"
export const dynamic = "force-dynamic"
export async function GET() {
  try {
    const trainer = await requireTrainer()
    const messages = await prisma.message.findMany({ where: {
      conversation: await conversationWhere(trainer), content: { startsWith: MESSAGE_PREFIX },
    }, include: { conversation: { select: { learner: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: "desc" } })
    return NextResponse.json(messages.flatMap(m => {
      const correction = readCorrection(m.content)
      return correction?.kind === "submission" ? [{ id: m.id, conversationId: m.conversationId,
        createdAt: m.createdAt, learner: m.conversation.learner, correction }] : []
    }))
  } catch (e) {
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
