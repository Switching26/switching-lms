import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { checkGmailOAuthHealth } from "@/lib/email"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") || ""
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ""
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (message.includes("invalid_grant")) return "invalid_grant"
  if (message.includes("non configuré")) return "missing_configuration"
  if (message.includes("scope missing")) return "scope_missing"
  if (message.includes("sender mismatch")) return "sender_mismatch"
  if (message.includes("timeout") || message.includes("abort")) return "provider_timeout"
  return "provider_error"
}

export async function POST(request: Request) {
  const checkedAt = new Date().toISOString()
  const expectedSecret = process.env.GMAIL_OAUTH_HEALTHCHECK_SECRET?.trim() || ""
  const providedSecret = bearerToken(request)

  if (!expectedSecret) {
    return NextResponse.json(
      { status: "error", code: "monitor_not_configured", checkedAt },
      { status: 503, headers: { "cache-control": "no-store" } }
    )
  }

  if (!providedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
    return NextResponse.json(
      { status: "unauthorized", checkedAt },
      { status: 401, headers: { "cache-control": "no-store" } }
    )
  }

  try {
    const health = await checkGmailOAuthHealth()
    return NextResponse.json(
      {
        status: "ok",
        checkedAt,
        senderEmail: health.senderEmail,
        expiresIn: health.expiresIn,
        gmailSendScope: true,
      },
      { headers: { "cache-control": "no-store" } }
    )
  } catch (error) {
    const code = errorCode(error)
    console.error(`[GMAIL_OAUTH_HEALTH] ${code}`)
    return NextResponse.json(
      { status: "error", code, checkedAt },
      { status: 503, headers: { "cache-control": "no-store" } }
    )
  }
}
