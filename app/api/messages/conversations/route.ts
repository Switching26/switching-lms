import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// GET — list conversations for current user
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const user = session.user as any
  const where = user.role === "LEARNER"
    ? { learnerId: user.id }
    : user.role === "PARTNER_ADMIN"
      ? { adminId: user.id }
      : { adminId: user.id } // SUPER_ADMIN

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      learner: { select: { id: true, firstName: true, lastName: true, email: true } },
      admin: { select: { id: true, firstName: true, lastName: true, email: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  })

  const result = conversations.map((c) => ({
    id: c.id,
    learner: c.learner,
    admin: c.admin,
    lastMessage: c.messages[0] || null,
    isRead: user.role === "LEARNER" ? c.isReadLearner : c.isReadAdmin,
    updatedAt: c.updatedAt,
  }))

  return NextResponse.json(result)
}

// POST — create or get existing conversation for learner
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "LEARNER") {
    return NextResponse.json({ error: "Seuls les apprenants peuvent initier une conversation" }, { status: 403 })
  }

  // Find the admin to route to
  let adminId: string | null = null

  if (user.partnerId) {
    // Find partner admin
    const partnerAdmin = await prisma.user.findFirst({
      where: { partnerId: user.partnerId, role: "PARTNER_ADMIN", isActive: true, archivedAt: null },
    })
    adminId = partnerAdmin?.id || null
  }

  if (!adminId) {
    // Fallback to super admin
    const superAdmin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true, archivedAt: null },
    })
    adminId = superAdmin?.id || null
  }

  if (!adminId) {
    return NextResponse.json({ error: "Aucun administrateur disponible" }, { status: 404 })
  }

  // Upsert conversation
  const existing = await prisma.conversation.findFirst({
    where: { learnerId: user.id, adminId },
  })

  if (existing) {
    return NextResponse.json(existing)
  }

  const conversation = await prisma.conversation.create({
    data: { learnerId: user.id, adminId },
  })

  return NextResponse.json(conversation, { status: 201 })
}
