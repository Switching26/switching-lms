import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = session.user.role

  // Édition réservée au super-admin : les admins partenaires sont en lecture seule
  // (ils visualisent les templates, ils ne les modifient pas — 07/07/2026).
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const template = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
  if (!template) return NextResponse.json({ error: "Template introuvable" }, { status: 404 })

  const { name, subject, htmlContent, type, isDefault, isActive } = await req.json()

  const updated = await prisma.emailTemplate.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(subject !== undefined && { subject }),
      ...(htmlContent !== undefined && { htmlContent }),
      ...(type !== undefined && { type }),
      ...(isDefault !== undefined && role === "SUPER_ADMIN" && { isDefault }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = session.user.role

  // Suppression réservée au super-admin (admins partenaires en lecture seule).
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const template = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
  if (!template) return NextResponse.json({ error: "Template introuvable" }, { status: 404 })

  await prisma.emailTemplate.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
