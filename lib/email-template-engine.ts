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
  { key: "lien_connexion", label: "Lien de connexion", category: "Accès" },
  { key: "chapitre_titre", label: "Titre chapitre", category: "Chapitre" },
  { key: "chapitre_numero", label: "Numéro chapitre", category: "Chapitre" },
  { key: "prochain_chapitre", label: "Prochain chapitre", category: "Chapitre" },
  { key: "plateforme_nom", label: "Nom plateforme", category: "Plateforme" },
  { key: "plateforme_url", label: "URL plateforme", category: "Plateforme" },
  { key: "partenaire_nom", label: "Nom partenaire", category: "Partenaire" },
] as const

export type TemplateVariableData = Partial<Record<string, string>>

/* ═══════════════════════════════
   REPLACE VARIABLES
   ═══════════════════════════════ */
export function replaceVariables(content: string, data: TemplateVariableData): string {
  const validKeys = new Set(TEMPLATE_VARIABLES.map((v) => v.key))
  // Replace known variables
  let result = content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (validKeys.has(key)) {
      return data[key] || ""
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

/* ═══════════════════════════════
   DEFAULT TEMPLATE HTML LAYOUT
   ═══════════════════════════════ */
export function defaultEmailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{plateforme_nom}}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1e2847;padding:28px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:18px;font-weight:600;">{{plateforme_nom}}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#f9f9fb;text-align:center;border-top:1px solid #eee;">
              <span style="color:#999;font-size:12px;">Cet email a été envoyé par {{plateforme_nom}}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/* ═══════════════════════════════
   SEED TEMPLATES
   ═══════════════════════════════ */
export const SEED_TEMPLATES = [
  {
    name: "Création de compte",
    type: "ACCOUNT_CREATED" as EmailType,
    subject: "Bienvenue sur {{plateforme_nom}}, {{prenom}}",
    htmlContent: defaultEmailLayout(`
      <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Votre compte a été créé</h1>
      <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
        Bonjour <strong>{{prenom}}</strong>, votre espace de formation est prêt.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 20px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:13px;color:#888;">Votre email de connexion</p>
            <p style="margin:0;font-size:15px;color:#111;font-weight:600;">{{email}}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#555;font-size:15px;line-height:1.6;">
        Cliquez sur le bouton ci-dessous pour créer votre mot de passe et activer votre compte :
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td align="center">
            <a href="{{lien_connexion}}" style="display:inline-block;padding:14px 32px;background-color:#1e2847;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" target="_blank">Activer mon compte</a>
          </td>
        </tr>
      </table>
      <p style="margin:0;color:#999;font-size:13px;text-align:center;">
        Ce lien est valable 72 heures.
      </p>
    `),
  },
  {
    name: "Formation attribuée",
    type: "FORMATION_ASSIGNED" as EmailType,
    subject: "Votre formation {{formation_titre}} est disponible",
    htmlContent: defaultEmailLayout(`
      <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Nouvelle formation disponible</h1>
      <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
        Bonjour <strong>{{prenom}}</strong>, la formation <strong>{{formation_titre}}</strong> vous a été attribuée.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 20px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:16px;color:#111;font-weight:600;">{{formation_titre}}</p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td align="center">
            <a href="{{lien_connexion}}" style="display:inline-block;padding:14px 32px;background-color:#2dbdb6;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" target="_blank">Commencer ma formation</a>
          </td>
        </tr>
      </table>
    `),
  },
  {
    name: "Chapitre terminé",
    type: "CHAPTER_COMPLETED" as EmailType,
    subject: "Bravo ! Chapitre {{chapitre_numero}} terminé",
    htmlContent: defaultEmailLayout(`
      <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Chapitre terminé !</h1>
      <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
        Félicitations <strong>{{prenom}}</strong>, vous avez terminé le chapitre <strong>{{chapitre_titre}}</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 20px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:16px;color:#111;font-weight:600;">{{chapitre_titre}}</p>
            <p style="margin:8px 0 0;color:#555;font-size:14px;">Prochain chapitre : <strong>{{prochain_chapitre}}</strong></p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td align="center">
            <a href="{{lien_connexion}}" style="display:inline-block;padding:14px 32px;background-color:#1e2847;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" target="_blank">Continuer</a>
          </td>
        </tr>
      </table>
    `),
  },
  {
    name: "Formation terminée",
    type: "FORMATION_COMPLETED" as EmailType,
    subject: "Félicitations ! Vous avez terminé {{formation_titre}}",
    htmlContent: defaultEmailLayout(`
      <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Formation terminée !</h1>
      <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
        Félicitations <strong>{{prenom}}</strong>, vous avez complété la formation <strong>{{formation_titre}}</strong> à 100% !
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 20px;">
        <tr>
          <td style="padding:20px;text-align:center;">
            <span style="font-size:48px;">🎉</span>
            <p style="margin:12px 0 0;font-size:16px;color:#111;font-weight:600;">{{formation_titre}}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#2dbdb6;font-weight:600;">100% complété</p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td align="center">
            <a href="{{lien_connexion}}" style="display:inline-block;padding:14px 32px;background-color:#1e2847;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" target="_blank">Accéder à mon espace</a>
          </td>
        </tr>
      </table>
    `),
  },
]
