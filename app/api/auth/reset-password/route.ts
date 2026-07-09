import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import { verifyToken, markTokenUsed } from "@/lib/tokens"
import { validatePassword } from "@/lib/validate-password"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { encryptVisiblePassword } from "@/lib/visible-password"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "unknown"

  // Rate limit: 5 reset attempts per IP per 15 minutes
  const limit = checkRateLimit(`reset-pw:ip:${ip}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 })
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs)

  const { token, password } = await req.json()

  if (!token) {
    return NextResponse.json({ error: "Token requis" }, { status: 400 })
  }
  const pwCheck = validatePassword(password)
  if (!pwCheck.valid) {
    return NextResponse.json({ error: pwCheck.error }, { status: 400 })
  }

  const result = await verifyToken(token, "RESET")

  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const hashed = await hash(password, 12)

  await prisma.user.update({
    where: { id: result.record.userId },
    data: { password: hashed, visiblePasswordEncrypted: encryptVisiblePassword(password) },
  })

  await markTokenUsed(token)

  return NextResponse.json({ success: true })
}
