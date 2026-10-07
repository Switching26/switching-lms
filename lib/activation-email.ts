import type { Partner, User } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/tokens"
import { sendEmail } from "@/lib/email"
import { resendActivationEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"
import { getBaseUrl } from "@/lib/get-base-url"

type UserWithPartner = User & { partner: Partner | null }

/**
 * Le compte a-t-il déjà servi à se connecter au LMS ? Les connexions importées de
 * RiseUp (userAgent « riseup-import… ») ne comptent pas ; une connexion LMS réelle
 * peut avoir un userAgent NULL — d'où le OR, un simple NOT exclurait les NULL.
 */
export async function hasLmsLogin(userId: string): Promise<boolean> {
  const n = await prisma.loginLog.count({
    where: {
      userId,
      OR: [{ userAgent: null }, { NOT: { userAgent: { startsWith: "riseup-import" } } }],
    },
  })
  return n > 0
}

/**
 * Compte réellement en attente d'activation : invité qui n'a jamais créé son mot de
 * passe. Exclut les comptes actifs, archivés, désactivés par un admin après usage
 * (ils se sont déjà connectés) et les comptes migrés depuis RiseUp (import silencieux,
 * aucun email tant que Samuel n'a pas donné le GO).
 */
export async function isPendingActivation(user: Pick<User, "id" | "isActive" | "archivedAt" | "reference">): Promise<boolean> {
  if (user.isActive || user.archivedAt) return false
  if (user.reference?.startsWith("RISEUP-")) return false
  return !(await hasLmsLogin(user.id))
}

/** Envoie un lien d'activation (template dynamique de l'organisme, sinon gabarit par défaut). */
export async function sendActivationEmail(user: UserWithPartner): Promise<boolean> {
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
    return sendEmail(user.email, replaceVariables(dynamic.subject, vars), replaceVariables(dynamic.htmlContent, vars), user.id, "ACTIVATION_LINK", user.partner,
      user.role === "TRAINER" ? { bcc: "contact@switchingformation.com" } : undefined)
  }
  const emailData = resendActivationEmail(user.firstName, token, user.partner, user.partner?.slug)
  return sendEmail(user.email, emailData.subject, emailData.html, user.id, "ACTIVATION_LINK", user.partner,
    user.role === "TRAINER" ? { bcc: "contact@switchingformation.com" } : undefined)
}
