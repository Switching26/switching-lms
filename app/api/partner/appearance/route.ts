import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updatePartner } from "@/lib/data/partners"

export async function PUT(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  const partnerId = (session.user as any).partnerId

  if (role !== "PARTNER_ADMIN" || !partnerId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { name, primaryColor, secondaryColor, logoUrl, faviconUrl } = await req.json()

  const partner = await updatePartner(partnerId, {
    name,
    primaryColor,
    secondaryColor,
    logoUrl,
    faviconUrl,
  })

  return NextResponse.json({ success: true, partner })
}
