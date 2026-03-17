import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/tokens"
import { sendEmail } from "@/lib/email"
import { resendActivationEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const { email } = await req.json()

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
      const token = await generateToken(user.id, "ACTIVATION")
      const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://app.switching.fr"
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
          logo_url: user.partner?.logoUrl || "",
        }
        sendEmail(user.email, replaceVariables(dynamic.subject, vars), replaceVariables(dynamic.htmlContent, vars), user.id, "ACTIVATION_LINK", user.partner)
      } else {
        const emailData = resendActivationEmail(user.firstName, token, user.partner, user.partner?.slug)
        sendEmail(user.email, emailData.subject, emailData.html, user.id, "ACTIVATION_LINK", user.partner)
      }
    }
  } catch (err) {
    console.error("[RESEND-ACTIVATION]", err)
  }

  return NextResponse.json({ success: true })
}
