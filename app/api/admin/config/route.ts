import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

const SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_email", "smtp_password", "smtp_from_name"]
const ALL_KEYS = [...SMTP_KEYS, "cloudflare_account_id", "cloudflare_stream_token", "storage_path", "storage_base_url"]
const SENSITIVE_KEYS = ["smtp_password", "cloudflare_stream_token"]

export async function GET() {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: ALL_KEYS } },
  })

  const config: Record<string, string> = {}
  for (const r of rows) {
    config[r.key] = SENSITIVE_KEYS.includes(r.key) ? "" : r.value
  }

  const hasPassword = rows.some((r) => r.key === "smtp_password" && r.value)
  const hasCloudflareToken = rows.some((r) => r.key === "cloudflare_stream_token" && r.value)

  return NextResponse.json({ config, hasPassword, hasCloudflareToken })
}

export async function PUT(req: Request) {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { config } = await req.json() as { config: Record<string, string> }

  for (const [key, value] of Object.entries(config)) {
    if (!ALL_KEYS.includes(key)) continue

    // Skip empty sensitive values (keep existing)
    if (SENSITIVE_KEYS.includes(key) && !value) continue

    const storedValue = SENSITIVE_KEYS.includes(key) ? encrypt(value) : value

    await prisma.systemConfig.upsert({
      where: { key },
      update: { value: storedValue },
      create: { key, value: storedValue },
    })
  }

  return NextResponse.json({ success: true })
}
