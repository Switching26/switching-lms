import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { conversationWhere } from "../_access"
import { TrainerAccessError } from "@/lib/trainer/access"
export const dynamic = "force-dynamic"
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ count: 0 })
  try {
    const where = await conversationWhere(session.user)
    const count = await prisma.conversation.count({ where: { ...where,
      ...(session.user.role === "LEARNER" ? { isReadLearner: false } : { isReadAdmin: false }) } })
    return NextResponse.json({ count })
  } catch (e) {
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
