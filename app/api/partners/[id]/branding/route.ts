import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  const partnerId = (session.user as any).partnerId

  // SUPER_ADMIN can update any partner, PARTNER_ADMIN can only update their own
  if (role === "PARTNER_ADMIN" && partnerId !== params.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { logoUrl, primaryColor, secondaryColor, name } = await req.json()

  // Validate hex colors
  const hexRegex = /^#[0-9A-Fa-f]{6}$/
  if (primaryColor && !hexRegex.test(primaryColor)) {
    return NextResponse.json({ error: "Couleur principale invalide" }, { status: 400 })
  }
  if (secondaryColor && !hexRegex.test(secondaryColor)) {
    return NextResponse.json({ error: "Couleur secondaire invalide" }, { status: 400 })
  }

  const partner = await prisma.partner.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
      ...(primaryColor !== undefined && { primaryColor }),
      ...(secondaryColor !== undefined && { secondaryColor }),
    },
  })

  return NextResponse.json(partner)
}
