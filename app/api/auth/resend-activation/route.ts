import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/tokens"
import { sendEmail } from "@/lib/email"
import { resendActivationEmail } from "@/lib/email-templates"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const { email } = await req.json()

  // Always return success to prevent email enumeration
  if (!email?.trim()) {
    return NextResponse.json({ success: true })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { partner: true },
    })

    if (user) {
      const token = await generateToken(user.id, "ACTIVATION")
      const emailData = resendActivationEmail(
        user.firstName,
        token,
        user.partner,
        user.partner?.slug
      )
      sendEmail(user.email, emailData.subject, emailData.html, user.id, "ACTIVATION_LINK", user.partner)
    }
  } catch (err) {
    console.error("[RESEND-ACTIVATION]", err)
  }

  return NextResponse.json({ success: true })
}
