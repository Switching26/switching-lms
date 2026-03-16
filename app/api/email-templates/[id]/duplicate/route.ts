import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  const partnerId = (session.user as any).partnerId

  if (role !== "PARTNER_ADMIN" || !partnerId) {
    return NextResponse.json({ error: "Réservé aux partenaires" }, { status: 403 })
  }

  const source = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
  if (!source) return NextResponse.json({ error: "Template introuvable" }, { status: 404 })

  // Check if partner already has a template for this type
  const existing = await prisma.emailTemplate.findFirst({
    where: { partnerId, type: source.type },
  })
  if (existing) {
    return NextResponse.json(
      { error: "Vous avez déjà un template pour ce type. Supprimez-le d'abord." },
      { status: 409 }
    )
  }

  const duplicate = await prisma.emailTemplate.create({
    data: {
      name: `${source.name} (copie)`,
      subject: source.subject,
      htmlContent: source.htmlContent,
      type: source.type,
      isDefault: false,
      isActive: true,
      partnerId,
      duplicatedFromId: source.id,
    },
  })

  return NextResponse.json(duplicate, { status: 201 })
}
