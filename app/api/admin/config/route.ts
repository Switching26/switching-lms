import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

const BREVO_KEYS = ["brevo_api_key", "sender_email", "sender_name"]
const ALL_KEYS = [...BREVO_KEYS, "vimeo_token", "storage_path", "storage_base_url"]
const SENSITIVE_KEYS = ["brevo_api_key", "vimeo_token"]

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

  const hasBrevoKey = rows.some((r) => r.key === "brevo_api_key" && r.value)
  const hasVimeoToken = rows.some((r) => r.key === "vimeo_token" && r.value)

  return NextResponse.json({ config, hasBrevoKey, hasVimeoToken })
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
