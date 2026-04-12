import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/crypto"
import { sendTestEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

// GET — Retrieve SMTP config (password masked)
export async function GET() {
  const session = await auth()
  const role = session?.user?.role
  if (!session || role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const partnerId = session.user.partnerId
  if (!partnerId) return NextResponse.json({ error: "Partenaire requis" }, { status: 400 })
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { smtpHost: true, smtpPort: true, smtpEmail: true, smtpPassword: true, smtpFromName: true, useDefaultSmtp: true },
  })
  if (!partner) return NextResponse.json({ error: "Partenaire introuvable" }, { status: 404 })

  return NextResponse.json({
    smtpHost: partner.smtpHost || "",
    smtpPort: partner.smtpPort || 587,
    smtpEmail: partner.smtpEmail || "",
    smtpFromName: partner.smtpFromName || "",
    useDefaultSmtp: partner.useDefaultSmtp,
    hasPassword: !!partner.smtpPassword,
  })
}

// PUT — Update SMTP config
export async function PUT(req: Request) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const partnerId = session.user.partnerId
  const { smtpHost, smtpPort, smtpEmail, smtpPassword, smtpFromName, useDefaultSmtp } = await req.json()

  const data: any = {
    smtpHost: smtpHost || null,
    smtpPort: smtpPort ? parseInt(smtpPort) : null,
    smtpEmail: smtpEmail || null,
    smtpFromName: smtpFromName || null,
    useDefaultSmtp: !!useDefaultSmtp,
  }

  // Only update password if provided (non-empty)
  if (smtpPassword) {
    data.smtpPassword = encrypt(smtpPassword)
  }

  if (!partnerId) return NextResponse.json({ error: "Partenaire requis" }, { status: 400 })
  await prisma.partner.update({ where: { id: partnerId }, data })
  return NextResponse.json({ success: true })
}

// POST — Test SMTP config
export async function POST(req: Request) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const partnerId = session.user.partnerId
  if (!partnerId) return NextResponse.json({ error: "Partenaire requis" }, { status: 400 })
  const { smtpHost, smtpPort, smtpEmail, smtpPassword, smtpFromName } = await req.json()

  // If no password sent, retrieve stored one
  let password = smtpPassword
  if (!password) {
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { smtpPassword: true },
    })
    if (partner?.smtpPassword) {
      password = decrypt(partner.smtpPassword)
    }
  }

  if (!smtpHost || !smtpEmail || !password) {
    return NextResponse.json({ error: "Configuration SMTP incomplète" }, { status: 400 })
  }

  const result = await sendTestEmail(
    {
      smtpHost,
      smtpPort: smtpPort ? parseInt(smtpPort) : 587,
      smtpEmail,
      smtpPassword: encrypt(password), // sendTestEmail calls decrypt internally
      smtpFromName: smtpFromName || "",
      useDefaultSmtp: false,
    },
    smtpEmail
  )

  if (result.success) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: result.error }, { status: 400 })
}
