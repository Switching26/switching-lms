import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/crypto"
import { R2_KEYS, validateR2Config } from "@/lib/video/r2"

export const dynamic = "force-dynamic"

const GMAIL_KEYS = ["gmail_client_id", "gmail_client_secret", "gmail_refresh_token", "sender_email", "sender_name"]
const ALL_KEYS = [...GMAIL_KEYS, "storage_path", "storage_base_url", ...R2_KEYS]
const SENSITIVE_KEYS = ["gmail_client_secret", "gmail_refresh_token", ...R2_KEYS]

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
    config[r.key] = ["r2_endpoint", "r2_bucket"].includes(r.key) ? decrypt(r.value) : SENSITIVE_KEYS.includes(r.key) ? "" : r.value
  }

  const hasGmailClientSecret = rows.some((r) => r.key === "gmail_client_secret" && r.value)
  const hasGmailRefreshToken = rows.some((r) => r.key === "gmail_refresh_token" && r.value)
  const envGmailConfigured = Boolean(
    (process.env.GMAIL_CLIENT_ID || process.env.GMAIL_OAUTH_CLIENT_ID) &&
    (process.env.GMAIL_CLIENT_SECRET || process.env.GMAIL_OAUTH_CLIENT_SECRET) &&
    (process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_OAUTH_REFRESH_TOKEN)
  )

  const configuredR2Keys = rows.filter(r => R2_KEYS.includes(r.key) && r.value).map(r => r.key)
  return NextResponse.json({ config, hasGmailClientSecret, hasGmailRefreshToken, envGmailConfigured, configuredR2Keys }, { headers: { "Cache-Control": "no-store" } })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { config } = await req.json() as { config: Record<string, string> }
  if (!config || Object.values(config).some(value => typeof value !== "string")) return NextResponse.json({ error: "Configuration invalide" }, { status: 400 })
  if (R2_KEYS.some(key => config[key])) {
    const existing = await prisma.systemConfig.findMany({ where: { key: { in: R2_KEYS } } })
    const merged = Object.fromEntries(existing.map(r => [r.key, decrypt(r.value)]))
    for (const key of R2_KEYS) if (config[key]) merged[key] = config[key]
    try {
      validateR2Config({ endpoint: merged.r2_endpoint, bucket: merged.r2_bucket, accessKey: merged.r2_access_key, secretKey: merged.r2_secret_key })
      if (merged.video_worker_token && merged.video_worker_token.length < 32) throw new Error("Le token worker doit contenir au moins 32 caractères")
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Configuration R2 invalide" }, { status: 400 }) }
  }
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
