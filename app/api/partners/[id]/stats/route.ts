import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const partner = await prisma.partner.findUnique({
    where: { id: params.id },
    include: {
      users: { include: { enrollments: true } },
      licenses: { include: { formation: true } },
    },
  })

  if (!partner) return NextResponse.json({ error: "Introuvable" }, { status: 404 })

  const learners = partner.users.filter((u) => u.role === "LEARNER")
  const admins = partner.users.filter((u) => u.role === "PARTNER_ADMIN")

  return NextResponse.json({
    totalUsers: partner.users.length,
    totalLearners: learners.length,
    activeLearners: learners.filter((u) => u.isActive).length,
    totalAdmins: admins.length,
    licenses: partner.licenses.map((l) => ({
      formation: l.formation.title,
      totalSeats: l.totalSeats,
      usedSeats: l.usedSeats,
    })),
  })
}
