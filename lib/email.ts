import nodemailer from "nodemailer"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import type { EmailType } from "@prisma/client"

interface PartnerSmtp {
  smtpHost?: string | null
  smtpPort?: number | null
  smtpEmail?: string | null
  smtpPassword?: string | null
  smtpFromName?: string | null
  useDefaultSmtp: boolean
}

function createTransporter(partner?: PartnerSmtp | null) {
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

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  })
}

function getFromAddress(partner?: PartnerSmtp | null): string {
  if (partner && !partner.useDefaultSmtp && partner.smtpEmail && partner.smtpFromName) {
    return `"${partner.smtpFromName}" <${partner.smtpEmail}>`
  }
  if (partner && !partner.useDefaultSmtp && partner.smtpEmail) {
    return partner.smtpEmail
  }
  const name = process.env.FROM_NAME || "Switching Formation"
  const email = process.env.SMTP_EMAIL || "noreply@switching.fr"
  return `"${name}" <${email}>`
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
    const transporter = createTransporter(partner)
    await transporter.sendMail({
      from: getFromAddress(partner),
      to,
      subject,
      html,
    })

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
    const transporter = createTransporter(partner)
    await transporter.sendMail({
      from: getFromAddress(partner),
      to,
      subject: "Test de configuration SMTP",
      html: "<p>Si vous recevez cet email, la configuration SMTP fonctionne correctement.</p>",
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erreur inconnue" }
  }
}
