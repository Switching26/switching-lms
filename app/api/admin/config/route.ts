import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

const SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_email", "smtp_password", "smtp_from_name"]

export async function GET() {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: SMTP_KEYS } },
  })

  const config: Record<string, string> = {}
  for (const r of rows) {
    config[r.key] = r.key === "smtp_password" ? "" : r.value
  }

  const hasPassword = rows.some((r) => r.key === "smtp_password" && r.value)

  return NextResponse.json({ config, hasPassword })
}

export async function PUT(req: Request) {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { config } = await req.json() as { config: Record<string, string> }

  for (const [key, value] of Object.entries(config)) {
    if (!SMTP_KEYS.includes(key)) continue

    // Skip empty password (keep existing)
    if (key === "smtp_password" && !value) continue

    const storedValue = key === "smtp_password" ? encrypt(value) : value

    await prisma.systemConfig.upsert({
      where: { key },
      update: { value: storedValue },
      create: { key, value: storedValue },
    })
  }

  return NextResponse.json({ success: true })
}
