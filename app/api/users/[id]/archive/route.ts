import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }

  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Impossible d'archiver un super admin" }, { status: 400 })
  }

  if (target.archivedAt) {
    return NextResponse.json({ error: "Utilisateur déjà archivé" }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { archivedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true, archivedAt: user.archivedAt })
}
