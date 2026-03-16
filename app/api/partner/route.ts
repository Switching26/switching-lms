import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")

  if (!slug) {
    return NextResponse.json({ error: "Slug requis" }, { status: 400 })
  }

  const partner = await prisma.partner.findUnique({
    where: { slug, isActive: true },
    select: { name: true, primaryColor: true, logoUrl: true },
  })

  if (!partner) {
    return NextResponse.json({ error: "Partenaire introuvable" }, { status: 404 })
  }

  return NextResponse.json(partner)
}
