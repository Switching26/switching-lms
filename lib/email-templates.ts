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
      Ce lien est valable 72 heures.
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
      Ce lien est valable 72 heures.
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
  const loginUrl = partnerSlug ? `${brand.baseUrl}/login?partner=${partnerSlug}` : `${brand.baseUrl}/login`
  const forgotUrl = partnerSlug ? `${brand.baseUrl}/login/mot-de-passe-oublie?partner=${partnerSlug}` : `${brand.baseUrl}/login/mot-de-passe-oublie`
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
