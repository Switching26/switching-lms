import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  if (role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Réservé aux partenaires" }, { status: 403 })
  }

  // Return all active super admin default templates
  const templates = await prisma.emailTemplate.findMany({
    where: { isDefault: true, isActive: true, partnerId: null },
    orderBy: [{ type: "asc" }, { updatedAt: "desc" }],
  })

  return NextResponse.json(templates)
}
