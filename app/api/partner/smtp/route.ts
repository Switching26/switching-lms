import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export const dynamic = "force-dynamic"

async function requirePartnerAdmin() {
  const session = await auth()
  if (!session || session.user?.role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Acces refuse" }, { status: 403 })
  }
  return null
}

export async function GET() {
  const denied = await requirePartnerAdmin()
  if (denied) return denied

  return NextResponse.json({
    disabled: true,
    smtpHost: "",
    smtpPort: 587,
    smtpEmail: "",
    smtpFromName: "",
    useDefaultSmtp: true,
    hasPassword: false,
  })
}

export async function PUT() {
  const denied = await requirePartnerAdmin()
  if (denied) return denied

  return NextResponse.json(
    { error: "Configuration SMTP partenaire desactivee" },
    { status: 410 }
  )
}

export async function POST() {
  const denied = await requirePartnerAdmin()
  if (denied) return denied

  return NextResponse.json(
    { error: "Configuration SMTP partenaire desactivee" },
    { status: 410 }
  )
}
