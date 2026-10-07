import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { runDueSessionReminders } from "@/lib/trainer/session-mails"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" }
  const expected = process.env.TRAINER_REMINDERS_SECRET?.trim() || ""
  if (!expected) return NextResponse.json({ error: "Rappels non configurés" }, { status: 503, headers })
  const received = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ""
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  if (!b.length || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401, headers })
  }
  try {
    const result = await runDueSessionReminders()
    return NextResponse.json(result, { status: result.failed ? 503 : 200, headers })
  } catch {
    console.error("[SESSION_REMINDERS] Runner failed")
    return NextResponse.json({ error: "Les rappels n'ont pas pu être traités" }, { status: 503, headers })
  }
}
