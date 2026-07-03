import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

const GMAIL_KEYS = ["gmail_client_id", "gmail_client_secret", "gmail_refresh_token", "sender_email", "sender_name"]
const ALL_KEYS = [...GMAIL_KEYS, "vimeo_token", "storage_path", "storage_base_url"]
const SENSITIVE_KEYS = ["gmail_client_secret", "gmail_refresh_token", "vimeo_token"]

export async function GET() {
  const session = await auth()
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: ALL_KEYS } },
  })

  const config: Record<string, string> = {}
  for (const r of rows) {
    config[r.key] = SENSITIVE_KEYS.includes(r.key) ? "" : r.value
  }

  const hasGmailClientSecret = rows.some((r) => r.key === "gmail_client_secret" && r.value)
  const hasGmailRefreshToken = rows.some((r) => r.key === "gmail_refresh_token" && r.value)
  const hasVimeoToken = rows.some((r) => r.key === "vimeo_token" && r.value)
  const envGmailConfigured = Boolean(
    (process.env.GMAIL_CLIENT_ID || process.env.GMAIL_OAUTH_CLIENT_ID) &&
    (process.env.GMAIL_CLIENT_SECRET || process.env.GMAIL_OAUTH_CLIENT_SECRET) &&
    (process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_OAUTH_REFRESH_TOKEN)
  )

  return NextResponse.json({ config, hasGmailClientSecret, hasGmailRefreshToken, envGmailConfigured, hasVimeoToken })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (session?.user?.role !== "SUPER_ADMIN") {
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
