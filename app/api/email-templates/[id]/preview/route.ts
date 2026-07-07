import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { replaceVariables } from "@/lib/email-template-engine"
import { getBaseUrl } from "@/lib/get-base-url"

// Rendu final d'un template (variables remplacées) pour prévisualisation — aucun envoi.
// Admin partenaire : lecture seule des templates par défaut / de son partenaire,
// rendu AVEC son branding (couleurs + logo). Super-admin : rendu générique / branding du template.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = session.user.role
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const template = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
  if (!template) return NextResponse.json({ error: "Template introuvable" }, { status: 404 })

  // Admin partenaire : uniquement les templates par défaut ou les siens.
  if (role === "PARTNER_ADMIN" && template.partnerId && template.partnerId !== session.user.partnerId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Branding : admin partenaire -> son partenaire ; super admin -> partenaire du template si spécifique.
  const brandingPartnerId = role === "PARTNER_ADMIN" ? session.user.partnerId : template.partnerId
  const partnerData = brandingPartnerId
    ? await prisma.partner.findUnique({ where: { id: brandingPartnerId } })
    : null

  const baseUrl = getBaseUrl()
  const loginUrl = partnerData?.slug ? `${baseUrl}/login?partner=${partnerData.slug}` : `${baseUrl}/login`
  const forgotPasswordUrl = partnerData?.slug
    ? `${baseUrl}/login/mot-de-passe-oublie?partner=${partnerData.slug}`
    : `${baseUrl}/login/mot-de-passe-oublie`

  const sampleData = {
    prenom: "Marie",
    nom: "Durand",
    email: "marie.durand@exemple.fr",
    formation_titre: "Formation SEO – Search Engine Optimization",
    formation_description: "Maîtrisez le référencement naturel de A à Z.",
    date_expiration: new Date(Date.now() + 30 * 86400000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
    lien_connexion: loginUrl,
    lien_activation: `${baseUrl}/login/activer?token=exemple`,
    lien_reinitialisation: `${baseUrl}/login/reinitialiser?token=exemple`,
    lien_mot_de_passe_oublie: forgotPasswordUrl,
    chapitre_titre: "Introduction au SEO",
    chapitre_numero: "1",
    prochain_chapitre: "La recherche de mots-clés",
    progression: "42",
    plateforme_nom: partnerData?.name || "Switching Formation",
    plateforme_url: loginUrl,
    partenaire_nom: partnerData?.name || session.user.partnerName || "Partenaire",
    couleur_principale: partnerData?.primaryColor || "#4F46E5",
    couleur_secondaire: partnerData?.secondaryColor || "#22D3EE",
    logo_url: partnerData?.logoUrl
      ? (partnerData.logoUrl.startsWith("http") ? partnerData.logoUrl : `${baseUrl}${partnerData.logoUrl.startsWith("/") ? "" : "/"}${partnerData.logoUrl}`)
      : "",
  }

  const subject = replaceVariables(template.subject, sampleData)
  const html = replaceVariables(template.htmlContent, sampleData)
  return NextResponse.json({ subject, html })
}
