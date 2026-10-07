import { sendEmail } from "@/lib/email"
import { getBaseUrl } from "@/lib/get-base-url"

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

export interface ElearningAddedMailInput {
  learner: { id: string; firstName: string; email: string }
  password: string
  startedAt: Date
  expiresAt: Date
  partner: { name: string; slug: string; primaryColor: string; mailProfile?: string | null; useDefaultSmtp: boolean }
}

/** Transactional LMS template, same responsive frame as the existing LMS mails. */
export function elearningAddedEmail(input: ElearningAddedMailInput) {
  const e = escape
  const name = e(input.partner.name)
  const color = /^#[0-9a-f]{6}$/i.test(input.partner.primaryColor) ? input.partner.primaryColor : "#111111"
  const loginUrl = `${getBaseUrl()}/login?partner=${encodeURIComponent(input.partner.slug)}`
  const date = (value: Date) => {
    const day = value.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })
    const time = value.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", " h ")
    return `${day}, ${time}`
  }
  const available = input.startedAt > new Date()
    ? `Votre accès s'ouvrira le ${e(date(input.startedAt))}.`
    : "Votre accès est ouvert : vous pouvez commencer dès maintenant."
  return {
    subject: "Votre accès e-learning SILAE et vos exercices",
    html: `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${name}</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background-color:#f5f5f7"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<tr><td style="padding:30px 24px;text-align:center;background-color:${color}"><h1 style="margin:0;color:#fff;font-size:24px">${name}</h1></td></tr>
<tr><td style="padding:28px 24px;color:#555;font-size:15px;line-height:1.6;overflow-wrap:anywhere">
<h2 style="margin:0 0 16px;color:#111;font-size:22px">Votre bonus e-learning SILAE</h2>
<p>Bonjour ${e(input.learner.firstName)},</p>
<p>Votre formatrice vous a ajouté l'accès e-learning ainsi que les exercices sur la plateforme.</p>
<p>${available} Il reste disponible jusqu'au ${e(date(input.expiresAt))}, soit 12 mois à partir de votre démarrage administratif.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;border-radius:8px"><tr><td style="padding:16px">
<p style="margin:0 0 8px"><strong>Identifiant</strong><br>${e(input.learner.email)}</p>
<p style="margin:0"><strong>Mot de passe</strong><br>${e(input.password)}</p></td></tr></table>
<p style="margin:24px 0;text-align:center"><a href="${e(loginUrl)}" style="display:inline-block;padding:14px 24px;background-color:${color};color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:6px">Se connecter à la plateforme</a></p>
<p>Ce bonus gratuit ne modifie pas vos heures de formation ni votre parcours CPF.</p>
<p>Bien à vous,<br>L'équipe pédagogique</p>
</td></tr><tr><td style="padding:20px 24px;text-align:center;background-color:#f9f9fb;color:#999;font-size:12px">Cet email a été envoyé par ${name}</td></tr>
</table></td></tr></table></body></html>`,
  }
}

export async function sendElearningAddedMail(input: ElearningAddedMailInput): Promise<boolean> {
  const email = elearningAddedEmail(input)
  return sendEmail(input.learner.email, email.subject, email.html, input.learner.id, "ELEARNING_ADDED", input.partner)
}
