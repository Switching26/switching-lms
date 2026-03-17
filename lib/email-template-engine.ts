import { prisma } from "@/lib/prisma"
import type { EmailType } from "@prisma/client"

/* ═══════════════════════════════
   AVAILABLE VARIABLES
   ═══════════════════════════════ */
export const TEMPLATE_VARIABLES = [
  { key: "prenom", label: "Prénom", category: "Utilisateur" },
  { key: "nom", label: "Nom", category: "Utilisateur" },
  { key: "email", label: "Email", category: "Utilisateur" },
  { key: "formation_titre", label: "Titre formation", category: "Formation" },
  { key: "formation_description", label: "Description formation", category: "Formation" },
  { key: "date_expiration", label: "Date d'expiration", category: "Accès" },
  { key: "lien_connexion", label: "Lien de connexion", category: "Liens" },
  { key: "lien_activation", label: "Lien d'activation", category: "Liens" },
  { key: "lien_reinitialisation", label: "Lien de réinitialisation", category: "Liens" },
  { key: "chapitre_titre", label: "Titre chapitre", category: "Chapitre" },
  { key: "chapitre_numero", label: "Numéro chapitre", category: "Chapitre" },
  { key: "prochain_chapitre", label: "Prochain chapitre", category: "Chapitre" },
  { key: "progression", label: "Progression (%)", category: "Chapitre" },
  { key: "plateforme_nom", label: "Nom plateforme", category: "Plateforme" },
  { key: "plateforme_url", label: "URL plateforme", category: "Plateforme" },
  { key: "partenaire_nom", label: "Nom partenaire", category: "Partenaire" },
  { key: "couleur_principale", label: "Couleur principale", category: "Branding" },
  { key: "couleur_secondaire", label: "Couleur secondaire", category: "Branding" },
  { key: "logo_url", label: "Logo URL", category: "Branding" },
  { key: "logo_url_style", label: "Style h1 si logo", category: "Branding" },
] as const

export type TemplateVariableData = Partial<Record<string, string>>

/* ═══════════════════════════════
   REPLACE VARIABLES
   ═══════════════════════════════ */
export function replaceVariables(content: string, data: TemplateVariableData): string {
  const validKeys = new Set(TEMPLATE_VARIABLES.map((v) => v.key))

  // Pre-process logo_url: if present, convert to <img> tag and hide h1
  const processedData = { ...data }
  if (processedData.logo_url) {
    const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://switching-lms-production.up.railway.app"
    let logoSrc = processedData.logo_url
    // Ensure absolute URL for email clients
    if (!logoSrc.startsWith("http://") && !logoSrc.startsWith("https://")) {
      logoSrc = `${baseUrl}${logoSrc.startsWith("/") ? "" : "/"}${logoSrc}`
    }
    const altText = processedData.plateforme_nom || ""
    processedData.logo_url = `<img src="${logoSrc}" alt="${altText}" style="max-height:60px;max-width:200px;display:block;margin:0 auto">`
    processedData.logo_url_style = "display:none"
  } else {
    processedData.logo_url = ""
    processedData.logo_url_style = ""
  }

  // Replace known variables
  const result = content.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (validKeys.has(key)) {
      return processedData[key] || ""
    }
    return "" // clean unknown variables
  })
  return result
}

/* ═══════════════════════════════
   RESOLVE TEMPLATE FOR A TYPE
   ═══════════════════════════════ */
export async function resolveTemplate(
  type: EmailType,
  partnerId?: string | null
): Promise<{ subject: string; htmlContent: string } | null> {
  // 1. If partner, check for partner-specific active template
  if (partnerId) {
    const partnerTemplate = await prisma.emailTemplate.findFirst({
      where: { type, partnerId, isActive: true },
      orderBy: { updatedAt: "desc" },
    })
    if (partnerTemplate) {
      return { subject: partnerTemplate.subject, htmlContent: partnerTemplate.htmlContent }
    }
  }

  // 2. Check for super admin default active template
  const defaultTemplate = await prisma.emailTemplate.findFirst({
    where: { type, isDefault: true, isActive: true },
    orderBy: { updatedAt: "desc" },
  })
  if (defaultTemplate) {
    return { subject: defaultTemplate.subject, htmlContent: defaultTemplate.htmlContent }
  }

  // 3. No template found — caller should use hardcoded fallback
  return null
}
