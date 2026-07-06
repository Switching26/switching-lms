import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/tokens"
import { sendEmail } from "@/lib/email"
import { resendActivationEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"
import { getBaseUrl } from "@/lib/get-base-url"

export const dynamic = "force-dynamic"

// Renvoi d'activation par un ADMIN pour un utilisateur ciblé.
// Contrairement à la route publique /api/auth/resend-activation (anti-énumération,
// qui refuse silencieusement les comptes RiseUp migrés/actifs), ici c'est un acte
// admin délibéré et unitaire : il fonctionne pour un compte importé jamais activé,
// qu'il soit « Invité » ou repassé « Actif ».
export async function POST(_req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    include: { partner: true, _count: { select: { loginLogs: true } } },
  })
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  if (role === "PARTNER_ADMIN" && user.partnerId !== session.user.partnerId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }
  if (user.archivedAt) {
    return NextResponse.json({ error: "Utilisateur archivé — restaurez-le d'abord" }, { status: 400 })
  }
  if (user._count.loginLogs > 0) {
    return NextResponse.json({ error: "Ce compte est déjà activé (connexions existantes) — utilisez « Envoyer réinitialisation »" }, { status: 400 })
  }

  let emailSent = false
  try {
    const token = await generateToken(user.id, "ACTIVATION")
    const baseUrl = getBaseUrl()
    const partnerParam = user.partner?.slug ? `&partner=${user.partner.slug}` : ""
    const activationUrl = `${baseUrl}/login/activer?token=${token}${partnerParam}`
    const loginUrl = user.partner?.slug ? `${baseUrl}/login?partner=${user.partner.slug}` : `${baseUrl}/login`

    const dynamicTemplate = await resolveTemplate("ACTIVATION_LINK", user.partnerId)
    if (dynamicTemplate) {
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
      emailSent = await sendEmail(user.email, replaceVariables(dynamicTemplate.subject, vars), replaceVariables(dynamicTemplate.htmlContent, vars), user.id, "ACTIVATION_LINK", user.partner)
    } else {
      const emailData = resendActivationEmail(user.firstName, token, user.partner, user.partner?.slug)
      emailSent = await sendEmail(user.email, emailData.subject, emailData.html, user.id, "ACTIVATION_LINK", user.partner)
    }
  } catch (err) {
    console.error("[ADMIN-RESEND-ACTIVATION]", err)
    return NextResponse.json({ error: "Erreur lors de l'envoi" }, { status: 500 })
  }

  return NextResponse.json({ success: true, emailSent })
}
