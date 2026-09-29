import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isPendingActivation, sendActivationEmail } from "@/lib/activation-email"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { auth } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const session = await auth()
  const ip = req.headers.get("x-forwarded-for") || "unknown"
  const { email } = await req.json()
  let emailSent: boolean | undefined
  let canReadDelivery = false

  // Rate limit: 3 requests per email per 15 minutes, 10 per IP per 15 minutes
  const ipLimit = checkRateLimit(`resend-act:ip:${ip}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 })
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterMs)

  if (email?.trim()) {
    const emailLimit = checkRateLimit(`resend-act:email:${email.trim().toLowerCase()}`, { maxAttempts: 3, windowMs: 15 * 60 * 1000 })
    if (!emailLimit.allowed) return NextResponse.json({ success: true })
  }

  // Always return success to prevent email enumeration
  if (!email?.trim()) {
    return NextResponse.json({ success: true })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { partner: true },
    })

    // Ne (ré)envoyer une activation que pour un compte réellement en attente
    // d'activation : jamais un compte déjà actif, archivé, désactivé par un admin
    // après usage, ou migré depuis RiseUp (voir isPendingActivation).
    if (user && (await isPendingActivation(user))) {
      canReadDelivery = session?.user?.role === "SUPER_ADMIN" ||
        (session?.user?.role === "PARTNER_ADMIN" && session.user.partnerId === user.partnerId)
      emailSent = await sendActivationEmail(user)
    }
  } catch (err) {
    console.error("[RESEND-ACTIVATION]", err)
  }

  return NextResponse.json(canReadDelivery && emailSent !== undefined ? { success: true, emailSent } : { success: true })
}
