import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { replaceVariables } from "@/lib/email-template-engine"
import { sendEmail } from "@/lib/email"
import type { EmailType } from "@prisma/client"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const template = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
  if (!template) return NextResponse.json({ error: "Template introuvable" }, { status: 404 })

  const user = await prisma.user.findUnique({ where: { id: (session.user as any).id } })
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://switching-lms-production.up.railway.app"

  // Fetch partner for branding if template is partner-specific
  let partnerData = null
  if (template.partnerId) {
    partnerData = await prisma.partner.findUnique({ where: { id: template.partnerId } })
  }

  const loginUrl = partnerData?.slug ? `${baseUrl}/login?partner=${partnerData.slug}` : `${baseUrl}/login`

  // Sample data for preview
  const sampleData = {
    prenom: user.firstName,
    nom: user.lastName,
    email: user.email,
    formation_titre: "Formation exemple",
    formation_description: "Description de la formation exemple",
    date_expiration: new Date(Date.now() + 30 * 86400000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
    lien_connexion: loginUrl,
    lien_activation: `${baseUrl}/login/activer?token=sample-token`,
    lien_reinitialisation: `${baseUrl}/login/reinitialiser?token=sample-token`,
    chapitre_titre: "Chapitre exemple",
    chapitre_numero: "1",
    prochain_chapitre: "Chapitre suivant",
    progression: "65",
    plateforme_nom: partnerData?.name || "Switching Formation",
    plateforme_url: loginUrl,
    partenaire_nom: partnerData?.name || (session.user as any).partnerName || "Partenaire",
    couleur_principale: partnerData?.primaryColor || "#111111",
    couleur_secondaire: partnerData?.secondaryColor || "#F5F5F7",
    logo_url: partnerData?.logoUrl || "",
  }

  const subject = replaceVariables(template.subject, sampleData)
  const html = replaceVariables(template.htmlContent, sampleData)

  const success = await sendEmail(user.email, subject, html, user.id, template.type as EmailType, partnerData)

  if (success) {
    return NextResponse.json({ success: true, sentTo: user.email })
  }
  return NextResponse.json({ error: "Échec de l'envoi" }, { status: 500 })
}
