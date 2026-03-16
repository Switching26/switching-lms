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

  // Sample data for preview
  const sampleData = {
    prenom: user.firstName,
    nom: user.lastName,
    email: user.email,
    formation_titre: "Formation exemple",
    formation_description: "Description de la formation exemple",
    date_expiration: new Date(Date.now() + 30 * 86400000).toLocaleDateString("fr-FR"),
    lien_connexion: process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://app.switching.fr",
    chapitre_titre: "Chapitre exemple",
    chapitre_numero: "1",
    prochain_chapitre: "Chapitre suivant",
    plateforme_nom: "Switching Formation",
    plateforme_url: process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://app.switching.fr",
    partenaire_nom: (session.user as any).partnerName || "Partenaire",
  }

  const subject = replaceVariables(template.subject, sampleData)
  const html = replaceVariables(template.htmlContent, sampleData)

  // Get partner SMTP if applicable
  let partner = null
  if (template.partnerId) {
    partner = await prisma.partner.findUnique({ where: { id: template.partnerId } })
  }

  const success = await sendEmail(user.email, subject, html, user.id, template.type as EmailType, partner)

  if (success) {
    return NextResponse.json({ success: true, sentTo: user.email })
  }
  return NextResponse.json({ error: "Échec de l'envoi" }, { status: 500 })
}
