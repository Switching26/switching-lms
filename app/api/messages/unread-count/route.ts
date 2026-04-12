import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ count: 0 })

  const user = session.user

  if (user.role === "LEARNER") {
    const count = await prisma.conversation.count({
      where: { learnerId: user.id, isReadLearner: false },
    })
    return NextResponse.json({ count })
  }

  // Admin: count conversations with unread messages
  const count = await prisma.conversation.count({
    where: { adminId: user.id, isReadAdmin: false },
  })
  return NextResponse.json({ count })
}
