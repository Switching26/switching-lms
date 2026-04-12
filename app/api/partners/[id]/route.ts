import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const body = await req.json()
  const { name, slug, primaryColor, secondaryColor, logoUrl, faviconUrl, isActive } = body

  if (slug) {
    const existing = await prisma.partner.findFirst({
      where: { slug: slug.trim().toLowerCase(), NOT: { id: params.id } },
    })
    if (existing) {
      return NextResponse.json({ error: "Ce slug existe déjà" }, { status: 400 })
    }
  }

  const partner = await prisma.partner.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(slug !== undefined && { slug: slug.trim().toLowerCase() }),
      ...(primaryColor !== undefined && { primaryColor }),
      ...(secondaryColor !== undefined && { secondaryColor }),
      ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
      ...(faviconUrl !== undefined && { faviconUrl: faviconUrl || null }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  // If deactivated, deactivate all users
  if (isActive === false) {
    await prisma.user.updateMany({
      where: { partnerId: params.id },
      data: { isActive: false },
    })
  }

  return NextResponse.json(partner)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  await prisma.partner.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
