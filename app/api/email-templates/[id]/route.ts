import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = session.user.role
  const partnerId = session.user.partnerId

  const template = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
  if (!template) return NextResponse.json({ error: "Template introuvable" }, { status: 404 })

  // Ownership check
  if (role === "PARTNER_ADMIN" && template.partnerId !== partnerId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

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
  const partnerId = session.user.partnerId

  const template = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
  if (!template) return NextResponse.json({ error: "Template introuvable" }, { status: 404 })

  if (role === "PARTNER_ADMIN" && template.partnerId !== partnerId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  await prisma.emailTemplate.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
