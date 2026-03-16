import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Verify formation exists and is soft-deleted
  const formation = await prisma.formation.findUnique({ where: { id: params.id } })
  if (!formation) {
    return NextResponse.json({ error: "Formation introuvable" }, { status: 404 })
  }
  if (!formation.deletedAt) {
    return NextResponse.json({ error: "La formation doit être dans la corbeille avant suppression définitive" }, { status: 400 })
  }

  // Cascade delete: Formation + Chapters + Attachments + Enrollments + Progress + Notes
  // Prisma onDelete: Cascade handles chapters, sections, attachments, enrollments, licenses
  await prisma.formation.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
