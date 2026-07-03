import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/tokens"
import { sendEmail } from "@/lib/email"
import { resendActivationEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"
import { getBaseUrl } from "@/lib/get-base-url"
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

    if (user) {
      canReadDelivery = session?.user?.role === "SUPER_ADMIN" ||
        (session?.user?.role === "PARTNER_ADMIN" && session.user.partnerId === user.partnerId)

      const token = await generateToken(user.id, "ACTIVATION")
      const baseUrl = getBaseUrl()
      const partnerParam = user.partner?.slug ? `&partner=${user.partner.slug}` : ""
      const activationUrl = `${baseUrl}/login/activer?token=${token}${partnerParam}`
      const loginUrl = user.partner?.slug ? `${baseUrl}/login?partner=${user.partner.slug}` : `${baseUrl}/login`

      const dynamic = await resolveTemplate("ACTIVATION_LINK", user.partnerId)
      if (dynamic) {
        const vars = {
          prenom: user.firstName,
          nom: user.lastName,
          email: user.email,
          lien_activation: activationUrl,
          lien_connexion: loginUrl,
          plateforme_nom: user.partner?.name || "Switching Formation",
          plateforme_url: loginUrl,
          partenaire_nom: user.partner?.name || "",
          couleur_principale: user.partner?.primaryColor || "#111111",
          couleur_secondaire: user.partner?.secondaryColor || "#F5F5F7",
          logo_url: user.partner?.logoUrl ? (user.partner.logoUrl.startsWith("http") ? user.partner.logoUrl : `${baseUrl}${user.partner.logoUrl.startsWith("/") ? "" : "/"}${user.partner.logoUrl}`) : "",
        }
        emailSent = await sendEmail(user.email, replaceVariables(dynamic.subject, vars), replaceVariables(dynamic.htmlContent, vars), user.id, "ACTIVATION_LINK", user.partner)
      } else {
        const emailData = resendActivationEmail(user.firstName, token, user.partner, user.partner?.slug)
        emailSent = await sendEmail(user.email, emailData.subject, emailData.html, user.id, "ACTIVATION_LINK", user.partner)
      }
    }
  } catch (err) {
    console.error("[RESEND-ACTIVATION]", err)
  }

  return NextResponse.json(canReadDelivery && emailSent !== undefined ? { success: true, emailSent } : { success: true })
}
