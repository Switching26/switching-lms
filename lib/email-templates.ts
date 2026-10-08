import { buildLoginLinks } from "@/lib/login-link"

// Registre partagé pour les nouveaux mails de l'espace formateur.
export const TRAINER_EMAIL_TYPES = [
  { value: "TRAINER_NEW_STUDENT", label: "Nouvel élève attribué au formateur" },
  { value: "TRAINER_NEW_MESSAGE", label: "Nouveau message au formateur" },
  { value: "SESSION_SCHEDULED", label: "Séance de visioconférence programmée" },
  { value: "SESSION_UPDATED", label: "Séance de visioconférence modifiée" },
  { value: "SESSION_CANCELLED", label: "Séance de visioconférence annulée" },
  { value: "SESSION_REMINDER", label: "Rappel de séance à 30 minutes" },
  { value: "ELEARNING_ADDED", label: "Accès e-learning ajouté par la formatrice" },
] as const

function trainerEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

export interface TrainerNewStudentMailData {
  trainerFirstName: string
  firstName: string
  lastName: string
  civility?: string | null
  email: string
  phone?: string | null
  formationLabel: string
  visioHours?: number | null
  hasElearning: boolean
  adminStartAt: Date
  adminEndAt?: Date | null
  visioStartAt?: Date | null
  assignmentUrl: string
}

/** Même gabarit LMS que les deux notifications validées dans la maquette SILAE. */
export function trainerNewStudentEmail(data: TrainerNewStudentMailData, partner?: Parameters<typeof getBrand>[0]) {
  const brand = getBrand(partner)
  const female = /^(mme|madame|mlle|mademoiselle)\.?$/i.test(data.civility || "")
  const name = `${data.firstName} ${data.lastName}`
  const e = trainerEscape
  const date = (value?: Date | null) => value ? value.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris",
  }) : "À confirmer"
  const hours = data.visioHours ? `${data.visioHours} heures` : "Durée à confirmer"
  const line = (label: string, value: string, margin = 12) => `<p style="margin:0 0 4px;font-size:13px;color:#888;">${label}</p><p style="margin:0 0 ${margin}px;font-size:15px;color:#111;font-weight:600;overflow-wrap:anywhere;">${e(value)}</p>`
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">${female ? "Une nouvelle élève vous est attribuée" : "Un nouvel élève vous est attribué"}</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">Bonjour <strong>${e(data.trainerFirstName)}</strong>, <strong>${e(name)}</strong> vient d'être ${female ? "inscrite" : "inscrit"} à la formation <strong>${e(data.formationLabel)}</strong>${data.hasElearning ? "" : ` (${e(hours)} en visioconférence)`} et vous est ${female ? "attribuée" : "attribué"} dans votre espace formatrice.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 20px;"><tr><td style="padding:16px 20px;">
      ${line("Élève", [name, data.email, data.phone].filter(Boolean).join(" · "))}
      ${line(data.hasElearning ? "Démarrage administratif et ouverture de l'e-learning" : "Démarrage administratif", date(data.adminStartAt), 4)}
      <p style="margin:0 0 12px;font-size:13px;color:#555;">Ce jour-là : envoi de l'accès au logiciel SILAE et démarrage de l'élève.</p>
      ${line(data.visioStartAt ? "Début des visioconférences" : "Visioconférences", data.visioStartAt ? `À partir du ${date(data.visioStartAt)} · ${hours}` : `${hours}, planning à convenir avec l'élève`)}
      ${line("Fin administrative", date(data.adminEndAt), 0)}
    </td></tr></table>
    <h2 style="margin:0 0 8px;font-size:16px;color:#111;">Dès maintenant : convenir du planning</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">Prenez contact avec l'élève dès cette attribution, avant le démarrage administratif, pour convenir ensemble du planning des visioconférences.</p>
    <h2 style="margin:0 0 8px;font-size:16px;color:#111;">Le jour du démarrage : transmettre l'accès SILAE</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">Le ${e(date(data.adminStartAt))}, transmettez l'accès au logiciel SILAE : l'élève pourra alors démarrer.${data.hasElearning ? " Son espace e-learning ouvrira également à cette date." : ""}</p>
    <p style="margin:0 0 8px;color:#555;font-size:15px;line-height:1.6;">${data.hasElearning
      ? `Depuis sa fiche, vous pourrez noter vos contacts, le planning convenu et l'envoi de l'accès SILAE. Vous recevrez aussi le mail de démarrage qui lui sera envoyé le ${e(data.adminStartAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }))}.`
      : "Cet élève n'a pas d'espace e-learning : vous le suivez depuis votre espace formatrice, où vous pourrez noter vos contacts, le planning convenu, l'envoi de l'accès SILAE et ses séances."}</p>
    ${button("Ouvrir sa fiche", e(data.assignmentUrl), brand.primaryColor)}
  `)
  return { subject: `${female ? "Nouvelle élève attribuée" : "Nouvel élève attribué"} — ${name} · ${data.formationLabel}`, html }
}

export function trainerNewMessageEmail(trainerFirstName: string, learnerName: string, messagesUrl: string, partner?: Parameters<typeof getBrand>[0]) {
  const brand = getBrand(partner)
  return {
    subject: `Nouveau message — ${learnerName}`,
    html: layout(brand, `<h1 style="margin:0 0 16px;font-size:22px;color:#111;">Un nouveau message vous attend</h1><p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">Bonjour <strong>${trainerEscape(trainerFirstName)}</strong>, <strong>${trainerEscape(learnerName)}</strong> vous a écrit depuis son espace e-learning.</p>${button("Ouvrir les messages", trainerEscape(messagesUrl), brand.primaryColor)}`),
  }
}

export type SessionMailType = "SESSION_SCHEDULED" | "SESSION_UPDATED" | "SESSION_CANCELLED" | "SESSION_REMINDER"

export interface SessionMailSlot {
  startsAt: Date
  durationMinutes: number
  visioUrl?: string | null
}

export interface SessionMailData extends SessionMailSlot {
  audience: "learner" | "trainer"
  learnerFirstName: string
  learnerName: string
  trainerFirstName: string
  trainerName: string
  formationLabel: string
  before?: SessionMailSlot | null
}

/** The instant is always rendered in Paris, including the daylight-saving offset. */
export function sessionParisDate(value: Date): string {
  const day = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
  }).format(value)
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris",
  }).formatToParts(value)
  return `${day}, ${Number(parts.find((part) => part.type === "hour")?.value)} h ${parts.find((part) => part.type === "minute")?.value}`
}

/** Transactional session mail: the existing LMS layout, no learner account required. */
export function trainerSessionEmail(type: SessionMailType, data: SessionMailData, partner?: Parameters<typeof getBrand>[0]) {
  const brand = getBrand(partner)
  const e = trainerEscape
  const titles: Record<SessionMailType, string> = {
    SESSION_SCHEDULED: "Votre séance de visioconférence est programmée",
    SESSION_UPDATED: "Votre séance de visioconférence a été modifiée",
    SESSION_CANCELLED: "Votre séance de visioconférence est annulée",
    SESSION_REMINDER: "Votre séance de visioconférence commence bientôt",
  }
  const subjects: Record<SessionMailType, string> = {
    SESSION_SCHEDULED: "Séance programmée",
    SESSION_UPDATED: "Séance modifiée",
    SESSION_CANCELLED: "Séance annulée",
    SESSION_REMINDER: "Rappel de votre séance",
  }
  const trainer = data.audience === "trainer"
  const greeting = trainer ? data.trainerFirstName : data.learnerFirstName
  const introductions: Record<SessionMailType, string> = trainer ? {
    SESSION_SCHEDULED: `Votre séance avec <strong>${e(data.learnerName)}</strong> est programmée.`,
    SESSION_UPDATED: `Votre séance avec <strong>${e(data.learnerName)}</strong> a été modifiée. Voici l'ancien et le nouveau créneau.`,
    SESSION_CANCELLED: `Votre séance avec <strong>${e(data.learnerName)}</strong> est annulée.`,
    SESSION_REMINDER: `Votre séance avec <strong>${e(data.learnerName)}</strong> commence bientôt.`,
  } : {
    SESSION_SCHEDULED: `Votre formatrice <strong>${e(data.trainerName)}</strong> a programmé votre séance de visioconférence.`,
    SESSION_UPDATED: `Votre formatrice <strong>${e(data.trainerName)}</strong> a modifié votre séance de visioconférence. Voici l'ancien et le nouveau créneau.`,
    SESSION_CANCELLED: `Votre formatrice <strong>${e(data.trainerName)}</strong> a annulé votre séance de visioconférence.`,
    SESSION_REMINDER: `Votre séance de visioconférence avec votre formatrice <strong>${e(data.trainerName)}</strong> commence bientôt.`,
  }
  const line = (label: string, value: string) => `<p style="margin:0 0 4px;font-size:13px;color:#888;">${label}</p><p style="margin:0 0 14px;font-size:15px;color:#111;font-weight:600;overflow-wrap:anywhere;">${e(value)}</p>`
  // Defense in depth: malformed or non-HTTPS URLs never become links in email HTML.
  let visioUrl: string | null = null
  if (data.visioUrl) {
    try {
      const url = new URL(data.visioUrl)
      if (url.protocol === "https:" && !url.username && !url.password) visioUrl = url.href
    } catch { /* No CTA for an invalid stored URL. */ }
  }
  const oldSlot = type === "SESSION_UPDATED" && data.before
    ? `${line("Ancien créneau", `${sessionParisDate(data.before.startsAt)} · ${data.before.durationMinutes} minutes`)}<p style="margin:0 0 14px;color:#555;font-size:14px;">↓ Nouveau créneau</p>`
    : ""
  const reminder = type === "SESSION_CANCELLED"
    ? "Cette séance est annulée. Aucun rappel ne sera envoyé pour ce créneau."
    : type === "SESSION_REMINDER"
      ? "Votre séance débute dans les 30 prochaines minutes. Toutes les heures indiquées sont celles de Paris."
      : "Un rappel vous sera envoyé 30 minutes avant. Toutes les heures indiquées sont celles de Paris."
  return {
    subject: `${subjects[type]} — ${data.learnerName} · ${sessionParisDate(data.startsAt)}`,
    html: layout(brand, `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111;">${titles[type]}</h1>
      <p style="margin:0 0 12px;color:#555;font-size:15px;line-height:1.6;">Bonjour ${e(greeting)},</p>
      <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">${introductions[type]}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 20px;"><tr><td style="padding:16px 20px;">
        ${line("Élève", data.learnerName)}
        ${line("Formatrice", data.trainerName)}
        ${line("Formation", data.formationLabel)}
        ${oldSlot}
        ${line(type === "SESSION_UPDATED" ? "Nouveau créneau · heure de Paris" : "Créneau · heure de Paris", sessionParisDate(data.startsAt))}
        ${line("Durée", `${data.durationMinutes} minutes`)}
      </td></tr></table>
      <p style="margin:0 0 8px;color:#555;font-size:15px;line-height:1.6;">${reminder}</p>
      ${visioUrl && type !== "SESSION_CANCELLED" ? button("Rejoindre la visio", e(visioUrl), brand.primaryColor) : ""}
    `),
  }
}

interface BrandConfig {
  name: string
  primaryColor: string
  secondaryColor: string
  logoUrl?: string | null
  baseUrl: string
}

const DEFAULT_BRAND: BrandConfig = {
  name: "Switching Formation",
  primaryColor: "#1e2847",
  secondaryColor: "#2dbdb6",
  logoUrl: null,
  baseUrl: (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, ""),
}

function toAbsoluteUrl(url: string | null | undefined, baseUrl: string): string | null {
  if (!url) return null
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`
}

function getBrand(partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null): BrandConfig {
  if (!partner) return DEFAULT_BRAND
  return {
    name: partner.name,
    primaryColor: partner.primaryColor,
    secondaryColor: partner.secondaryColor,
    logoUrl: toAbsoluteUrl(partner.logoUrl, DEFAULT_BRAND.baseUrl),
    baseUrl: DEFAULT_BRAND.baseUrl,
  }
}

function layout(brand: BrandConfig, content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${brand.name}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:${brand.primaryColor};padding:30px 32px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:bold;font-family:Arial,sans-serif;">${brand.name}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#f9f9fb;text-align:center;border-top:1px solid #eee;">
              <span style="color:#999;font-size:12px;">Cet email a été envoyé par ${brand.name}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function button(text: string, url: string, color: string): string {
  return `<table cellspacing="0" cellpadding="0" style="margin:24px auto;">
    <tr>
      <td align="center" bgcolor="${color}" style="border-radius:6px;">
        <a href="${url}" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;" target="_blank">${text}</a>
      </td>
    </tr>
  </table>`
}

// ═══════════════════════════════
// TEMPLATE 1 — Création de compte (avec lien d'activation)
// ═══════════════════════════════
export function accountCreatedEmail(
  firstName: string,
  email: string,
  activationToken: string,
  partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null,
  partnerSlug?: string | null
) {
  const brand = getBrand(partner)
  const subject = `Bienvenue sur ${brand.name}, ${firstName}`
  const partnerParam = partnerSlug ? `&partner=${partnerSlug}` : ""
  const activationUrl = `${brand.baseUrl}/login/activer?token=${activationToken}${partnerParam}`
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Votre compte a été créé</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Bonjour <strong>${firstName}</strong>, votre espace de formation est prêt.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;padding:0;margin:0 0 20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:13px;color:#888;">Votre email de connexion</p>
          <p style="margin:0;font-size:15px;color:#111;font-weight:600;">${email}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#555;font-size:15px;line-height:1.6;">
      Cliquez sur le bouton ci-dessous pour créer votre mot de passe et activer votre compte :
    </p>
    ${button("Activer mon compte", activationUrl, brand.primaryColor)}
    <p style="margin:0;color:#999;font-size:13px;text-align:center;">
      Ce lien reste valable jusqu'à l'activation de votre compte.
    </p>
  `)
  return { subject, html }
}

// ═══════════════════════════════
// TEMPLATE 5 — Mot de passe oublié
// ═══════════════════════════════
export function passwordResetEmail(
  firstName: string,
  resetToken: string,
  partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null,
  partnerSlug?: string | null
) {
  const brand = getBrand(partner)
  const subject = `Réinitialisation de votre mot de passe — ${brand.name}`
  const partnerParam = partnerSlug ? `&partner=${partnerSlug}` : ""
  const resetUrl = `${brand.baseUrl}/login/reinitialiser?token=${resetToken}${partnerParam}`
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Réinitialisation du mot de passe</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Bonjour <strong>${firstName}</strong>, vous avez demandé la réinitialisation de votre mot de passe.
    </p>
    <p style="margin:0 0 8px;color:#555;font-size:15px;line-height:1.6;">
      Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :
    </p>
    ${button("Réinitialiser mon mot de passe", resetUrl, brand.primaryColor)}
    <p style="margin:0;color:#999;font-size:13px;text-align:center;">
      Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.
    </p>
  `)
  return { subject, html }
}

// ═══════════════════════════════
// TEMPLATE 6 — Renvoi lien d'activation
// ═══════════════════════════════
export function resendActivationEmail(
  firstName: string,
  activationToken: string,
  partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null,
  partnerSlug?: string | null
) {
  const brand = getBrand(partner)
  const subject = `Activez votre compte — ${brand.name}`
  const partnerParam = partnerSlug ? `&partner=${partnerSlug}` : ""
  const activationUrl = `${brand.baseUrl}/login/activer?token=${activationToken}${partnerParam}`
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Activez votre compte</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Bonjour <strong>${firstName}</strong>, voici votre nouveau lien d'activation :
    </p>
    ${button("Activer mon compte", activationUrl, brand.primaryColor)}
    <p style="margin:0;color:#999;font-size:13px;text-align:center;">
      Ce lien reste valable jusqu'à l'activation de votre compte.
    </p>
  `)
  return { subject, html }
}

// ═══════════════════════════════
// TEMPLATE 7 — Lien de connexion
// ═══════════════════════════════
export function loginLinkEmail(
  firstName: string,
  email: string,
  partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null,
  partnerSlug?: string | null
) {
  const brand = getBrand(partner)
  const subject = `Votre lien de connexion à ${brand.name}`
  const { loginUrl, forgotPasswordUrl: forgotUrl } = buildLoginLinks(brand.baseUrl, partnerSlug)
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Lien de connexion</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Bonjour <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 16px;color:#555;font-size:15px;line-height:1.6;">
      Vous pouvez vous reconnecter à votre espace en cliquant sur le bouton ci-dessous.
    </p>
    ${button("Me connecter", loginUrl, brand.primaryColor)}
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;padding:0;margin:0 0 18px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:13px;color:#888;">Votre identifiant</p>
          <p style="margin:0;font-size:15px;color:#111;font-weight:600;">${email}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 10px;color:#555;font-size:15px;line-height:1.6;">
      Utilisez l'adresse email et le mot de passe que vous connaissez déjà.
    </p>
    <p style="margin:0;color:#777;font-size:14px;line-height:1.6;">
      Si vous avez oublié votre mot de passe, utilisez le lien « Mot de passe oublié » sur la page de connexion, ou cliquez ici :
      <a href="${forgotUrl}" target="_blank" style="color:${brand.primaryColor};font-weight:600;text-decoration:none;">réinitialiser mon mot de passe</a>.
    </p>
  `)
  return { subject, html }
}

// ═══════════════════════════════
// TEMPLATE 2 — Formation attribuée
// ═══════════════════════════════
export function formationAssignedEmail(
  firstName: string,
  formationTitle: string,
  expiresAt: string | null,
  partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null
) {
  const brand = getBrand(partner)
  const subject = `Votre formation ${formationTitle} est disponible`
  const expiresLine = expiresAt
    ? `<p style="margin:0 0 8px;color:#555;font-size:14px;">Accès valable jusqu'au : <strong>${new Date(expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong></p>`
    : ""
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Nouvelle formation disponible</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Bonjour <strong>${firstName}</strong>, la formation <strong>${formationTitle}</strong> vous a été attribuée.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:16px;color:#111;font-weight:600;">${formationTitle}</p>
          ${expiresLine}
        </td>
      </tr>
    </table>
    ${button("Commencer ma formation", `${brand.baseUrl}/login`, brand.secondaryColor)}
  `)
  return { subject, html }
}

// ═══════════════════════════════
// TEMPLATE 3 — Chapitre terminé
// ═══════════════════════════════
export function chapterCompletedEmail(
  firstName: string,
  chapterTitle: string,
  chapterNumber: number,
  progressPercent: number,
  nextChapterTitle: string | null,
  partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null
) {
  const brand = getBrand(partner)
  const subject = `Bravo ! Chapitre ${chapterNumber} terminé`
  const nextLine = nextChapterTitle
    ? `<p style="margin:16px 0 0;color:#555;font-size:14px;">Prochain chapitre : <strong>${nextChapterTitle}</strong></p>`
    : ""
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Chapitre terminé !</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Félicitations <strong>${firstName}</strong>, vous avez terminé le chapitre :
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 12px;font-size:16px;color:#111;font-weight:600;">${chapterTitle}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#888;">Progression globale</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#e5e5e5;border-radius:4px;height:8px;">
                  <tr>
                    <td style="width:${progressPercent}%;background-color:${brand.secondaryColor};border-radius:4px;height:8px;"></td>
                    <td></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <p style="margin:4px 0 0;font-size:14px;color:#111;font-weight:600;">${progressPercent}%</p>
          ${nextLine}
        </td>
      </tr>
    </table>
    ${button("Continuer", `${brand.baseUrl}/login`, brand.primaryColor)}
  `)
  return { subject, html }
}

// ═══════════════════════════════
// TEMPLATE 4 — Formation terminée
// ═══════════════════════════════
export function formationCompletedEmail(
  firstName: string,
  formationTitle: string,
  enrollmentId: string,
  partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null
) {
  const brand = getBrand(partner)
  const subject = `Félicitations ! Vous avez terminé ${formationTitle}`
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Formation terminée !</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Félicitations <strong>${firstName}</strong>, vous avez complété la formation <strong>${formationTitle}</strong> à 100% !
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 20px;">
      <tr>
        <td style="padding:20px;text-align:center;">
          <span style="font-size:48px;">🎉</span>
          <p style="margin:12px 0 0;font-size:16px;color:#111;font-weight:600;">${formationTitle}</p>
          <p style="margin:4px 0 0;font-size:14px;color:${brand.secondaryColor};font-weight:600;">100% complété</p>
        </td>
      </tr>
    </table>
    ${button("Télécharger mon attestation", `${brand.baseUrl}/api/attestation/${enrollmentId}`, brand.primaryColor)}
  `)
  return { subject, html }
}

// ═══════════════════════════════
// TEMPLATE — Invitation à une évaluation (candidat SANS compte)
// ═══════════════════════════════
export function assessmentInvitationEmail(
  firstName: string | null,
  assessmentTitle: string,
  assessmentUrl: string,
  isPositionnement: boolean,
  expiresAt?: Date | null,
  partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null
) {
  const brand = getBrand(partner)
  const label = isPositionnement ? "test de positionnement" : "évaluation"
  const subject = isPositionnement
    ? `Votre test de positionnement — ${assessmentTitle}`
    : `Votre évaluation — ${assessmentTitle}`
  const deadline = expiresAt
    ? new Date(expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">${assessmentTitle}</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Bonjour${firstName ? ` <strong>${firstName}</strong>` : ""},
    </p>
    <p style="margin:0 0 16px;color:#555;font-size:15px;line-height:1.6;">
      Vous êtes invité(e) à réaliser un ${label}. Il vous suffit de cliquer sur le bouton
      ci-dessous : aucun compte ni mot de passe n'est nécessaire.
    </p>
    ${button("Commencer", assessmentUrl, brand.primaryColor)}
    <p style="margin:0 0 10px;color:#555;font-size:15px;line-height:1.6;">
      Prenez le temps de répondre au calme : <strong>vos réponses ne peuvent être validées qu'une seule fois</strong>.
    </p>
    ${deadline ? `<p style="margin:0;color:#777;font-size:14px;line-height:1.6;">Ce lien est valable jusqu'au ${deadline}.</p>` : ""}
  `)
  return { subject, html }
}

// ═══════════════════════════════
// TEMPLATE — Notification interne : un candidat a terminé son évaluation
// ═══════════════════════════════
export function assessmentCompletedEmail(
  assessmentTitle: string,
  candidate: { firstName?: string | null; lastName?: string | null; email: string },
  scoreLine: string | null,
  needsManualReview: boolean,
  adminUrl: string,
  partner?: { name: string; primaryColor: string; secondaryColor: string; logoUrl?: string | null } | null
) {
  const brand = getBrand(partner)
  const fullName = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") || candidate.email
  const subject = `${fullName} a terminé « ${assessmentTitle} »`
  const html = layout(brand, `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Évaluation terminée</h1>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      <strong>${fullName}</strong> vient de valider ses réponses.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px;margin:0 0 18px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 10px;font-size:13px;color:#888;">Candidat</p>
        <p style="margin:0 0 4px;font-size:15px;color:#111;font-weight:600;">${fullName}</p>
        <p style="margin:0 0 14px;font-size:14px;color:#555;">${candidate.email}</p>
        <p style="margin:0 0 10px;font-size:13px;color:#888;">Évaluation</p>
        <p style="margin:0 0 ${scoreLine ? "14px" : "0"};font-size:15px;color:#111;">${assessmentTitle}</p>
        ${scoreLine ? `<p style="margin:0 0 10px;font-size:13px;color:#888;">Résultat</p>
        <p style="margin:0;font-size:20px;color:${brand.primaryColor};font-weight:700;">${scoreLine}</p>` : ""}
      </td></tr>
    </table>
    ${needsManualReview ? `<p style="margin:0 0 18px;color:#92400E;font-size:14px;line-height:1.6;background-color:#FFFBEB;border-radius:8px;padding:12px 16px;">
      Ce test contient des réponses rédigées : le score affiché ne les inclut pas encore, elles sont à relire.
    </p>` : ""}
    ${button("Voir le détail des réponses", adminUrl, brand.primaryColor)}
  `)
  return { subject, html }
}
