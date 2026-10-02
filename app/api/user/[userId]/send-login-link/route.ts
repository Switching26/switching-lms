import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getAdminLoginLinkUser } from "@/lib/admin-login-link"
import { buildLoginLinks } from "@/lib/login-link"
import { sendEmail } from "@/lib/email"
import { loginLinkEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"
import { getBaseUrl } from "@/lib/get-base-url"

export const dynamic = "force-dynamic"

// Envoi admin d'un simple lien de connexion brandé.
// Ne crée aucun token : si le compte n'a jamais été activé, utiliser le renvoi
// d'activation. Si le mot de passe est oublié, l'email pointe vers la page dédiée.
export async function POST(_req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  const result = await getAdminLoginLinkUser(session?.user, params.userId)
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
  const { user } = result

  let emailSent = false
  try {
    const baseUrl = getBaseUrl()
    const { loginUrl, forgotPasswordUrl } = buildLoginLinks(baseUrl, user.partner?.slug)

    const dynamicTemplate = await resolveTemplate("LOGIN_LINK", user.partnerId)
    if (dynamicTemplate) {
      const vars = {
        prenom: user.firstName,
        nom: user.lastName,
        email: user.email,
        lien_connexion: loginUrl,
        lien_mot_de_passe_oublie: forgotPasswordUrl,
        plateforme_nom: user.partner?.name || "Switching Formation",
        plateforme_url: loginUrl,
        partenaire_nom: user.partner?.name || "Switching Formation",
        couleur_principale: user.partner?.primaryColor || "#111111",
        couleur_secondaire: user.partner?.secondaryColor || "#F5F5F7",
        logo_url: user.partner?.logoUrl
          ? (user.partner.logoUrl.startsWith("http")
            ? user.partner.logoUrl
            : `${baseUrl}${user.partner.logoUrl.startsWith("/") ? "" : "/"}${user.partner.logoUrl}`)
          : "",
      }
      emailSent = await sendEmail(
        user.email,
        replaceVariables(dynamicTemplate.subject, vars),
        replaceVariables(dynamicTemplate.htmlContent, vars),
        user.id,
        "LOGIN_LINK",
        user.partner
      )
    } else {
      const emailData = loginLinkEmail(user.firstName, user.email, user.partner, user.partner?.slug)
      emailSent = await sendEmail(user.email, emailData.subject, emailData.html, user.id, "LOGIN_LINK", user.partner)
    }
  } catch (err) {
    console.error("[ADMIN-SEND-LOGIN-LINK]", err)
    return NextResponse.json({ error: "Erreur lors de l'envoi" }, { status: 500 })
  }

  return NextResponse.json({ success: true, emailSent })
}
