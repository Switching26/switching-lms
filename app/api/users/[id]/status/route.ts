import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = session.user.role
  const callerPartnerId = session.user.partnerId

  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  // Partner admin scope
  if (role === "PARTNER_ADMIN" && target.partnerId !== callerPartnerId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Cannot deactivate super admin
  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Impossible de modifier le statut d'un super admin" }, { status: 400 })
  }

  const { isActive } = await req.json()

  // Ne pas réactiver un compte archivé (il redeviendrait éligible aux emails).
  if (isActive === true && target.archivedAt) {
    return NextResponse.json({ error: "Compte archivé — le restaurer d'abord" }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { isActive },
  })

  return NextResponse.json({ isActive: updated.isActive })
}
