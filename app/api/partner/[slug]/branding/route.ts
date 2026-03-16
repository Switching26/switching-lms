import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Public route — no auth required (used by login page)
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const partner = await prisma.partner.findUnique({
    where: { slug: params.slug, isActive: true },
    select: {
      name: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
    },
  })

  if (!partner) {
    return NextResponse.json({ error: "Partenaire introuvable" }, { status: 404 })
  }

  return NextResponse.json(partner)
}
