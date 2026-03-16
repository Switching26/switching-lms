import nodemailer from "nodemailer"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import type { EmailType } from "@prisma/client"

export interface PartnerSmtp {
  smtpHost?: string | null
  smtpPort?: number | null
  smtpEmail?: string | null
  smtpPassword?: string | null
  smtpFromName?: string | null
  useDefaultSmtp: boolean
}

interface SmtpConfig {
  host: string
  port: number
  email: string
  password: string
  fromName: string
}

async function getSystemSmtpConfig(): Promise<SmtpConfig> {
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: ["smtp_host", "smtp_port", "smtp_email", "smtp_password", "smtp_from_name"] } },
    })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    if (cfg.smtp_host && cfg.smtp_email && cfg.smtp_password) {
      return {
        host: cfg.smtp_host,
        port: parseInt(cfg.smtp_port || "587"),
        email: cfg.smtp_email,
        password: decrypt(cfg.smtp_password),
        fromName: cfg.smtp_from_name || "Switching Formation",
      }
    }
  } catch {
    // Fallback to env vars if DB read fails
  }

  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    email: process.env.SMTP_EMAIL || "",
    password: process.env.SMTP_PASSWORD || "",
    fromName: process.env.FROM_NAME || "Switching Formation",
  }
}

async function createTransporter(partner?: PartnerSmtp | null) {
  // Priority 1: Partner's own SMTP
  if (partner && !partner.useDefaultSmtp && partner.smtpHost && partner.smtpEmail && partner.smtpPassword) {
    return nodemailer.createTransport({
      host: partner.smtpHost,
      port: partner.smtpPort || 587,
      secure: partner.smtpPort === 465,
      auth: {
        user: partner.smtpEmail,
        pass: decrypt(partner.smtpPassword),
      },
    })
  }

  // Priority 2: SystemConfig from DB, then env vars as fallback
  const cfg = await getSystemSmtpConfig()
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {
      user: cfg.email,
      pass: cfg.password,
    },
  })
}

async function getFromAddress(partner?: PartnerSmtp | null): Promise<string> {
  if (partner && !partner.useDefaultSmtp && partner.smtpEmail && partner.smtpFromName) {
    return `"${partner.smtpFromName}" <${partner.smtpEmail}>`
  }
  if (partner && !partner.useDefaultSmtp && partner.smtpEmail) {
    return partner.smtpEmail
  }
  const cfg = await getSystemSmtpConfig()
  return `"${cfg.fromName}" <${cfg.email}>`
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
    const transporter = await createTransporter(partner)
    const from = await getFromAddress(partner)
    await transporter.sendMail({ from, to, subject, html })

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

export async function sendTestEmail(partner: PartnerSmtp, to: string): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = await createTransporter(partner)
    const from = await getFromAddress(partner)
    await transporter.sendMail({
      from,
      to,
      subject: "Test de configuration SMTP",
      html: "<p>Si vous recevez cet email, la configuration SMTP fonctionne correctement.</p>",
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erreur inconnue" }
  }
}

export async function sendSystemTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cfg = await getSystemSmtpConfig()
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.email, pass: cfg.password },
    })
    await transporter.sendMail({
      from: `"${cfg.fromName}" <${cfg.email}>`,
      to,
      subject: "Test de configuration SMTP - Switching LMS",
      html: "<p>Si vous recevez cet email, la configuration SMTP globale fonctionne correctement.</p>",
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erreur inconnue" }
  }
}
