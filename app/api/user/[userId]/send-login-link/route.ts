import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    include: {
      partner: true,
      _count: {
        select: {
          loginLogs: {
            where: {
              OR: [
                { userAgent: null },
                { NOT: { userAgent: { startsWith: "riseup-import" } } },
              ],
            },
          },
        },
      },
    },
  })
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  if (role === "PARTNER_ADMIN" && user.partnerId !== session.user.partnerId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }
  if (user.archivedAt) {
    return NextResponse.json({ error: "Utilisateur archivé — restaurez-le d'abord" }, { status: 400 })
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Compte inactif — utilisez « Renvoyer activation »" }, { status: 400 })
  }
  if (user._count.loginLogs === 0) {
    return NextResponse.json({ error: "Compte jamais activé — utilisez « Renvoyer activation »" }, { status: 400 })
  }

  let emailSent = false
  try {
    const baseUrl = getBaseUrl()
    const loginUrl = user.partner?.slug ? `${baseUrl}/login?partner=${user.partner.slug}` : `${baseUrl}/login`
    const forgotPasswordUrl = user.partner?.slug
      ? `${baseUrl}/login/mot-de-passe-oublie?partner=${user.partner.slug}`
      : `${baseUrl}/login/mot-de-passe-oublie`

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
