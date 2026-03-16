import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  const partnerId = (session.user as any).partnerId

  if (role === "SUPER_ADMIN") {
    // Super admin sees all default templates (no partnerId)
    const templates = await prisma.emailTemplate.findMany({
      where: { partnerId: null },
      orderBy: [{ type: "asc" }, { updatedAt: "desc" }],
    })
    return NextResponse.json(templates)
  }

  if (role === "PARTNER_ADMIN" && partnerId) {
    // Partner admin sees their own templates
    const templates = await prisma.emailTemplate.findMany({
      where: { partnerId },
      orderBy: [{ type: "asc" }, { updatedAt: "desc" }],
    })
    return NextResponse.json(templates)
  }

  return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  const partnerId = (session.user as any).partnerId

  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { name, subject, htmlContent, type, isDefault, isActive } = await req.json()

  if (!name || !subject || !htmlContent || !type) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 })
  }

  const template = await prisma.emailTemplate.create({
    data: {
      name,
      subject,
      htmlContent,
      type,
      isDefault: role === "SUPER_ADMIN" ? (isDefault ?? true) : false,
      isActive: isActive ?? true,
      partnerId: role === "PARTNER_ADMIN" ? partnerId : null,
    },
  })

  return NextResponse.json(template, { status: 201 })
}
