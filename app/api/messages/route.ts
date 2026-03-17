import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

// POST — send a message
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const user = session.user as any
  const { conversationId, content } = await req.json()

  if (!conversationId || !content?.trim()) {
    return NextResponse.json({ error: "Message requis" }, { status: 400 })
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      learner: { select: { id: true, firstName: true, lastName: true, email: true, partnerId: true, partner: true } },
      admin: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 })

  if (conversation.learnerId !== user.id && conversation.adminId !== user.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: user.id,
      content: content.trim(),
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  })

  // Update conversation: mark as unread for the other party
  const isLearner = user.id === conversation.learnerId
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      updatedAt: new Date(),
      ...(isLearner ? { isReadAdmin: false } : { isReadLearner: false }),
    },
  })

  // Send email notification (non-blocking, with 10-min cooldown)
  try {
    const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://switching-lms-production.up.railway.app"
    const preview = content.trim().substring(0, 50) + (content.trim().length > 50 ? "..." : "")

    if (isLearner) {
      // Learner → Admin: check cooldown
      const recentReply = await prisma.message.findFirst({
        where: {
          conversationId,
          senderId: conversation.adminId,
          createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
        },
      })
      if (!recentReply) {
        const senderName = `${conversation.learner.firstName} ${conversation.learner.lastName}`
        const adminUrl = `${baseUrl}/super-admin/messages`
        const html = buildNotificationEmail(
          senderName,
          preview,
          adminUrl,
          "Répondre",
          "#1e2847",
          "Switching Formation"
        )
        sendEmail(
          conversation.admin.email,
          `Nouveau message de ${senderName}`,
          html,
          conversation.admin.id,
          "CUSTOM"
        )
      }
    } else {
      // Admin → Learner: check cooldown
      const recentEmail = await prisma.message.findFirst({
        where: {
          conversationId,
          senderId: { not: conversation.learnerId },
          createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
          id: { not: message.id },
        },
      })
      if (!recentEmail) {
        const platformName = conversation.learner.partner?.name || "Switching Formation"
        const primaryColor = conversation.learner.partner?.primaryColor || "#1e2847"
        const learnerUrl = `${baseUrl}/learner/messages`
        const html = buildNotificationEmail(
          platformName,
          preview,
          learnerUrl,
          "Voir la réponse",
          primaryColor,
          platformName
        )
        sendEmail(
          conversation.learner.email,
          `Vous avez reçu une réponse de ${platformName}`,
          html,
          conversation.learner.id,
          "CUSTOM",
          conversation.learner.partner
        )
      }
    }
  } catch {
    // Never block message send if email fails
  }

  return NextResponse.json(message, { status: 201 })
}

function buildNotificationEmail(
  fromName: string,
  preview: string,
  linkUrl: string,
  buttonText: string,
  primaryColor: string,
  brandName: string
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden">
  <div style="background:${primaryColor};padding:30px;text-align:center">
    <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:bold;font-family:Arial,sans-serif">${brandName}</h1>
  </div>
  <div style="padding:40px 30px">
    <h2 style="color:#111;font-size:20px;margin-bottom:10px">Nouveau message</h2>
    <p style="color:#555;line-height:1.6">De : <strong>${fromName}</strong></p>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:20px 0;border-left:4px solid ${primaryColor}">
      <p style="margin:0;color:#333;font-size:14px;font-style:italic">"${preview}"</p>
    </div>
    <table cellspacing="0" cellpadding="0" style="margin:20px auto"><tr><td align="center" style="border-radius:6px;background:${primaryColor}"><a href="${linkUrl}" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px">${buttonText}</a></td></tr></table>
  </div>
  <div style="background:#f5f5f5;padding:20px 30px;text-align:center;color:#999;font-size:12px;font-family:Arial,sans-serif">${brandName}</div>
</div>
</body></html>`
}
