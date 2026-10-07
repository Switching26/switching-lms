import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { conversationWhere, ensureConversation } from "../_access"
import { TrainerAccessError } from "@/lib/trainer/access"
import { messageText } from "@/components/messages/content"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  try {
    const user = session.user
    const conversations = await prisma.conversation.findMany({ where: await conversationWhere(user),
      include: { learner: { select: { id: true, firstName: true, lastName: true, email: true } },
        admin: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } })
    return NextResponse.json(conversations.map(c => ({ id: c.id, learner: c.learner, admin: c.admin,
      lastMessage: c.messages[0] ? { ...c.messages[0], content: messageText(c.messages[0].content) } : null,
      isRead: user.role === "LEARNER" ? c.isReadLearner : c.isReadAdmin, updatedAt: c.updatedAt })))
  } catch (e) {
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  try {
    const text = await req.text()
    const target = text ? JSON.parse(text) : {}
    if (!target || typeof target !== "object" || (target.trainerId != null && typeof target.trainerId !== "string") ||
      (target.learnerId != null && typeof target.learnerId !== "string")) {
      return NextResponse.json({ error: "Destinataire invalide" }, { status: 400 })
    }
    return NextResponse.json(await ensureConversation(session.user, target))
  } catch (e) {
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Requête invalide" }, { status: 400 })
    throw e
  }
}
