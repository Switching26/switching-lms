import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { conversationWhere } from "../_access"
import { TrainerAccessError } from "@/lib/trainer/access"
import { MESSAGE_PREFIX, readCorrection } from "@/components/messages/content"
export const dynamic = "force-dynamic"
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ count: 0 })
  try {
    const where = await conversationWhere(session.user)
    const count = await prisma.conversation.count({ where: { ...where,
      ...(session.user.role === "LEARNER" ? { isReadLearner: false } : { isReadAdmin: false }) } })
    if (String(session.user.role) === "TRAINER") {
      const submissions = await prisma.message.findMany({ where: {
        conversation: where, content: { startsWith: MESSAGE_PREFIX },
      }, select: { content: true } })
      const correctionsPending = submissions.filter(message => {
        const correction = readCorrection(message.content)
        return correction?.kind === "submission" && correction.status !== "corrected"
      }).length
      return NextResponse.json({ count, correctionsPending })
    }
    return NextResponse.json({ count })
  } catch (e) {
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
