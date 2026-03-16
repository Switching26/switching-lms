import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { formationId, expiresAt } = await req.json()

  if (!formationId) {
    return NextResponse.json({ error: "Formation requise" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: params.userId } })
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }

  // Partner admin scope check
  if (role === "PARTNER_ADMIN") {
    const adminPartnerId = (session.user as any).partnerId
    if (user.partnerId !== adminPartnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
  }

  // Check existing enrollment
  const existing = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId: params.userId, formationId } },
  })
  if (existing) {
    return NextResponse.json({ error: "Déjà inscrit à cette formation" }, { status: 400 })
  }

  // If user has a partner, deduct a license
  if (user.partnerId) {
    const license = await prisma.license.findUnique({
      where: { partnerId_formationId: { partnerId: user.partnerId, formationId } },
    })
    if (license) {
      if (license.usedSeats >= license.totalSeats) {
        return NextResponse.json({ error: "Plus de licences disponibles" }, { status: 400 })
      }
      await prisma.license.update({
        where: { id: license.id },
        data: { usedSeats: { increment: 1 } },
      })
    }
  }

  const enrollment = await prisma.enrollment.create({
    data: {
      userId: params.userId,
      formationId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      assignedByPartnerId: user.partnerId || null,
    },
    include: { formation: true },
  })

  return NextResponse.json(enrollment, { status: 201 })
}
