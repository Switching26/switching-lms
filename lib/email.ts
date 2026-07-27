import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import type { EmailType } from "@prisma/client"

export interface PartnerSmtp {
  name?: string | null
  /** Compte d'envoi de l'organisme — voir `Partner.mailProfile`. */
  mailProfile?: string | null
  smtpHost?: string | null
  smtpPort?: number | null
  smtpEmail?: string | null
  smtpPassword?: string | null
  smtpFromName?: string | null
  useDefaultSmtp: boolean
}

interface GmailConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  senderEmail: string
  senderName: string
}

interface GmailAccessTokenResult {
  accessToken: string
  expiresIn: number | null
  scopes: string[]
}

export interface GmailOAuthHealthResult {
  senderEmail: string
  expiresIn: number | null
  scopes: string[]
}

const GMAIL_CONFIG_KEYS = [
  "gmail_client_id",
  "gmail_client_secret",
  "gmail_refresh_token",
  "sender_email",
  "sender_name",
]

function firstValue(...values: Array<string | undefined | null>): string {
  return values.find((value) => value && value.trim())?.trim() || ""
}

function readSecret(value: string | undefined): string {
  if (!value) return ""
  try {
    return decrypt(value)
  } catch {
    return value
  }
}

/**
 * Compte d'envoi dédié à un organisme (`Partner.mailProfile`).
 *
 * Les apprenants Switching Formation doivent recevoir leurs emails depuis la
 * boîte Switching, pas depuis celle de la plateforme e-learning : chaque
 * profil a donc son propre jeu de credentials OAuth. Si le profil demandé
 * n'est pas configuré sur l'environnement, on retombe volontairement sur le
 * compte par défaut plutôt que de faire échouer un email critique (activation,
 * réinitialisation) — l'incident est visible dans EmailLog via l'expéditeur.
 */
async function getGmailConfigForProfile(mailProfile?: string | null): Promise<GmailConfig> {
  if (mailProfile === "switching") {
    const cfg = {
      clientId: firstValue(process.env.GMAIL_SWITCHING_CLIENT_ID, process.env.GMAIL_CLIENT_ID),
      clientSecret: firstValue(process.env.GMAIL_SWITCHING_CLIENT_SECRET, process.env.GMAIL_CLIENT_SECRET),
      refreshToken: firstValue(process.env.GMAIL_SWITCHING_REFRESH_TOKEN),
      senderEmail: firstValue(process.env.GMAIL_SWITCHING_FROM_EMAIL, "contact@switchingformation.com"),
      senderName: firstValue(process.env.GMAIL_SWITCHING_FROM_NAME, "Switching Formation"),
    }
    // Le refresh token est propre au compte : sans lui, pas de bascule.
    if (cfg.clientId && cfg.clientSecret && cfg.refreshToken) return cfg
  }
  return getGmailConfig()
}

async function getGmailConfig(): Promise<GmailConfig> {
  const envConfig = {
    clientId: firstValue(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_OAUTH_CLIENT_ID),
    clientSecret: firstValue(process.env.GMAIL_CLIENT_SECRET, process.env.GMAIL_OAUTH_CLIENT_SECRET),
    refreshToken: firstValue(process.env.GMAIL_REFRESH_TOKEN, process.env.GMAIL_OAUTH_REFRESH_TOKEN),
    senderEmail: firstValue(process.env.GMAIL_FROM_EMAIL, process.env.SENDER_EMAIL, "contact@switchingformation.com"),
    senderName: firstValue(process.env.GMAIL_FROM_NAME, process.env.FROM_NAME, "Switching Formation"),
  }

  if (envConfig.clientId && envConfig.clientSecret && envConfig.refreshToken) {
    return envConfig
  }

  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: GMAIL_CONFIG_KEYS } },
    })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const dbConfig = {
      clientId: firstValue(cfg.gmail_client_id, envConfig.clientId),
      clientSecret: firstValue(readSecret(cfg.gmail_client_secret), envConfig.clientSecret),
      refreshToken: firstValue(readSecret(cfg.gmail_refresh_token), envConfig.refreshToken),
      senderEmail: firstValue(cfg.sender_email, envConfig.senderEmail),
      senderName: firstValue(cfg.sender_name, envConfig.senderName),
    }

    if (dbConfig.clientId && dbConfig.clientSecret && dbConfig.refreshToken) {
      return {
        ...dbConfig,
        senderEmail: dbConfig.senderEmail || "contact@switchingformation.com",
        senderName: dbConfig.senderName || "Switching Formation",
      }
    }
  } catch {
    // Let the explicit error below explain the missing Gmail configuration.
  }

  throw new Error("Gmail API non configuré : renseigner GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET et GMAIL_REFRESH_TOKEN")
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

function formatAddress(email: string, name?: string): string {
  const cleanEmail = email.trim()
  const cleanName = name?.trim()
  return cleanName ? `${encodeHeader(cleanName)} <${cleanEmail}>` : cleanEmail
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function requestGmailAccessToken(cfg: GmailConfig): Promise<GmailAccessTokenResult> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) {
    throw new Error(`Gmail token error: ${data.error_description || data.error || response.status}`)
  }
  return {
    accessToken: data.access_token,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : null,
    scopes: typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : [],
  }
}

async function getGmailAccessToken(cfg: GmailConfig): Promise<string> {
  return (await requestGmailAccessToken(cfg)).accessToken
}

async function getAccessTokenScopes(accessToken: string): Promise<string[]> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    { cache: "no-store" }
  )
  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Gmail tokeninfo error: ${data.error_description || data.error || response.status}`)
  }
  return typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : []
}

async function getGmailProfileEmail(accessToken: string): Promise<string> {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  const data = await response.json()
  if (!response.ok || typeof data.emailAddress !== "string") {
    throw new Error(`Gmail profile error: ${data.error?.message || response.status}`)
  }
  return data.emailAddress.trim()
}

export async function checkGmailOAuthHealth(): Promise<GmailOAuthHealthResult> {
  const cfg = await getGmailConfig()
  const token = await requestGmailAccessToken(cfg)
  const scopes = token.scopes.length ? token.scopes : await getAccessTokenScopes(token.accessToken)

  if (!scopes.includes("https://www.googleapis.com/auth/gmail.send")) {
    throw new Error("Gmail OAuth scope missing: gmail.send")
  }

  const profileEmail = await getGmailProfileEmail(token.accessToken)
  if (profileEmail.toLowerCase() !== cfg.senderEmail.toLowerCase()) {
    throw new Error("Gmail OAuth sender mismatch")
  }

  return {
    senderEmail: profileEmail,
    expiresIn: token.expiresIn,
    scopes,
  }
}

async function sendViaGmailApi(
  to: string,
  subject: string,
  html: string,
  senderEmail?: string,
  senderName?: string,
  mailProfile?: string | null
): Promise<void> {
  const cfg = await getGmailConfigForProfile(mailProfile)
  const accessToken = await getGmailAccessToken(cfg)

  const headers = [
    `From: ${formatAddress(senderEmail || cfg.senderEmail, senderName || cfg.senderName)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=\"UTF-8\"",
    "Content-Transfer-Encoding: 8bit",
  ].join("\r\n")

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      raw: base64Url(`${headers}\r\n\r\n${html}`),
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Gmail API error: ${JSON.stringify(error)}`)
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  userId: string,
  type: EmailType,
  partner?: PartnerSmtp | null
): Promise<boolean> {
  try {
    const partnerSenderName = partner?.name || undefined
    // L'adresse d'envoi suit le profil de l'organisme (Switching a la sienne),
    // le nom affiché reste celui du partenaire.
    await sendViaGmailApi(to, subject, html, undefined, partnerSenderName, partner?.mailProfile)

    await prisma.emailLog.create({
      data: { userId, type, subject, success: true },
    })
    return true
  } catch (err: any) {
    try {
      await prisma.emailLog.create({
        data: { userId, type, subject, success: false, error: err?.message?.slice(0, 500) || "Unknown error" },
      })
    } catch {
      // Silently fail log write
    }
    console.error(`[EMAIL] Failed to send ${type} to ${to}:`, err?.message)
    return false
  }
}

export async function sendSystemTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cfg = await getGmailConfig()
    await sendViaGmailApi(
      to,
      "Test Gmail API - Switching LMS",
      "<p>La configuration email fonctionne correctement.</p>",
      cfg.senderEmail,
      cfg.senderName
    )
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erreur inconnue" }
  }
}
