import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const user = await prisma.user.findUnique({ where: { id: params.userId } })
  if (!user) return NextResponse.json({ error: "Introuvable" }, { status: 404 })

  // Ne jamais désactiver un super admin via ce raccourci.
  if (user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Impossible de modifier le statut d'un super admin" }, { status: 400 })
  }
  // Ne pas réactiver un compte archivé.
  if (!user.isActive && user.archivedAt) {
    return NextResponse.json({ error: "Compte archivé — le restaurer d'abord" }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: { isActive: !user.isActive },
  })

  return NextResponse.json({ isActive: updated.isActive })
}
