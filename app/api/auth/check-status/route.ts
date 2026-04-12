import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "unknown"

  // Rate limit: 20 requests per IP per 15 minutes (called on each login attempt)
  const limit = checkRateLimit(`check-status:ip:${ip}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 })
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs)

  const { email } = await req.json()
  if (!email) {
    return NextResponse.json({ disabled: false })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { isActive: true, archivedAt: true },
  })

  // Don't reveal if account exists — only flag disabled if account exists AND is inactive/archived
  if (user && (!user.isActive || user.archivedAt)) {
    return NextResponse.json({ disabled: true })
  }

  return NextResponse.json({ disabled: false })
}
