import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = session.user.role
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }

  if (!target.archivedAt) {
    return NextResponse.json({ error: "Utilisateur non archivé" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: params.id },
    data: { archivedAt: null, isActive: true },
  })

  return NextResponse.json({ success: true })
}
