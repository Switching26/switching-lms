import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import type { EmailType } from "@prisma/client"

export interface PartnerSmtp {
  name?: string | null
  smtpHost?: string | null
  smtpPort?: number | null
  smtpEmail?: string | null
  smtpPassword?: string | null
  smtpFromName?: string | null
  useDefaultSmtp: boolean
}

interface BrevoConfig {
  apiKey: string
  senderEmail: string
  senderName: string
}

async function getBrevoConfig(): Promise<BrevoConfig> {
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: ["brevo_api_key", "sender_email", "sender_name"] } },
    })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    if (cfg.brevo_api_key) {
      return {
        apiKey: decrypt(cfg.brevo_api_key),
        senderEmail: cfg.sender_email || "contact@switchingformation.com",
        senderName: cfg.sender_name || "Switching Formation",
      }
    }
  } catch {
    // Fallback to env vars
  }

  return {
    apiKey: process.env.BREVO_API_KEY || "",
    senderEmail: process.env.SENDER_EMAIL || "contact@switchingformation.com",
    senderName: process.env.FROM_NAME || "Switching Formation",
  }
}

async function sendViaBrevo(
  to: string,
  subject: string,
  html: string,
  senderEmail?: string,
  senderName?: string
): Promise<void> {
  const cfg = await getBrevoConfig()
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": cfg.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: senderName || cfg.senderName,
        email: senderEmail || cfg.senderEmail,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Brevo error: ${JSON.stringify(error)}`)
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
    await sendViaBrevo(to, subject, html, undefined, partnerSenderName)

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
    const cfg = await getBrevoConfig()
    await sendViaBrevo(
      to,
      "Test Brevo — Switching LMS",
      "<p>La configuration email fonctionne correctement.</p>",
      cfg.senderEmail,
      cfg.senderName
    )
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erreur inconnue" }
  }
}
