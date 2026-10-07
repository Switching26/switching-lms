import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { getBaseUrl } from "@/lib/get-base-url"
import { checkedConversation, ensureConversation } from "./_access"
import { TrainerAccessError } from "@/lib/trainer/access"
import { storeSubmission, removeSubmission } from "./_files"
import { MESSAGE_PREFIX, readCorrection, writeCorrection, messageText, type CorrectionStatus } from "@/components/messages/content"
import { notifyTrainerMessage, escapeMessageHtml } from "@/lib/trainer/message-mail"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const user = session.user
  let storedFile: Awaited<ReturnType<typeof storeSubmission>> | null = null
  try {
    const multipart = req.headers.get("content-type")?.startsWith("multipart/form-data")
    const form = multipart ? await req.formData() : null
    const body = form ? Object.fromEntries(form.entries()) : await req.json()
    if (!body || typeof body !== "object") throw new TrainerAccessError("Requête invalide", 400)
    const content = body.content ?? ""
    if (typeof content !== "string" || content.length > 20000 || content.trim().startsWith(MESSAGE_PREFIX)) {
      throw new TrainerAccessError("Message invalide (20 000 caractères maximum)", 400)
    }
    if (body.conversationId != null && typeof body.conversationId !== "string") throw new TrainerAccessError("Conversation invalide", 400)
    const file = form?.get("file")
    if (file && !(file instanceof File)) throw new TrainerAccessError("Fichier invalide", 400)
    const correctionId = body.correctionId
    if (correctionId != null && typeof correctionId !== "string") throw new TrainerAccessError("Correction invalide", 400)
    if (!content.trim() && !file && !correctionId) throw new TrainerAccessError("Message requis", 400)
    let convId = body.conversationId
    if (!convId && user.role === "LEARNER") convId = (await ensureConversation(user)).id
    if (!convId) throw new TrainerAccessError("conversationId requis", 400)
    const conversation = await checkedConversation(user, convId)
    const isLearner = user.id === conversation.learnerId
    if (file && (!isLearner || conversation.admin.role !== "TRAINER")) {
      throw new TrainerAccessError("Le cas pratique doit être envoyé à votre formatrice", 403)
    }
    if (correctionId && (String(user.role) !== "TRAINER" || isLearner || file)) throw new TrainerAccessError("Accès refusé", 403)
    const status = body.status as CorrectionStatus | undefined
    if (status != null && !["corrected", "revision"].includes(status)) throw new TrainerAccessError("Statut invalide", 400)
    if (correctionId && !status && !content.trim()) throw new TrainerAccessError("Commentaire requis", 400)
    if (status && !correctionId) throw new TrainerAccessError("Correction requise", 400)
    if (file instanceof File) storedFile = await storeSubmission(file)
    let notifyTrainer = false
    const message = await prisma.$transaction(async tx => {
      // This row lock serializes simultaneous sends and reads in a conversation.
      await tx.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } })
      if (isLearner && conversation.admin.role === "TRAINER") {
        notifyTrainer = await tx.message.count({ where: { conversationId: convId,
          senderId: conversation.learnerId, isRead: false } }) === 0
      }
      let storedContent = content.trim()
      if (storedFile) storedContent = writeCorrection({ kind: "submission", text: storedContent,
        status: "pending", file: storedFile })
      if (correctionId) {
        const original = await tx.message.findFirst({ where: { id: correctionId, conversationId: convId,
          senderId: conversation.learnerId } })
        const submission = original ? readCorrection(original.content) : null
        if (!submission || submission.kind !== "submission") throw new TrainerAccessError("Cas pratique introuvable", 404)
        const nextStatus = status || submission.status
        await tx.message.update({ where: { id: correctionId }, data: {
          content: writeCorrection({ ...submission, status: nextStatus }) } })
        storedContent = writeCorrection({ kind: "feedback", text: content.trim(),
          status: nextStatus, submissionId: correctionId })
      }
      const created = await tx.message.create({ data: { conversationId: convId, senderId: user.id, content: storedContent },
        include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } } })
      await tx.conversation.update({ where: { id: convId },
        data: isLearner ? { isReadAdmin: false } : { isReadLearner: false } })
      return created
    })
    // Once committed, the file belongs to a durable Message and must not be removed.
    storedFile = null
    // Send email notification (non-blocking, with 10-min cooldown)
    try {
      const baseUrl = getBaseUrl()
      const preview = conversation.admin.role === "TRAINER" ? messageText(message.content).slice(0, 180)
        : content.trim().substring(0, 50) + (content.trim().length > 50 ? "..." : "")

      if (isLearner && conversation.admin.role === "TRAINER") {
        if (notifyTrainer) await notifyTrainerMessage(conversation.admin,
          `${conversation.learner.firstName} ${conversation.learner.lastName}`, preview, convId)
      } else if (isLearner) {
        // Learner → Admin: check cooldown
        const recentReply = await prisma.message.findFirst({
          where: {
            conversationId: convId,
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
          void sendEmail(
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
            conversationId: convId,
            senderId: { not: conversation.learnerId },
            createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
            id: { not: message.id },
          },
        })
        if (!recentEmail) {
          const platformName = conversation.admin.role === "TRAINER"
            ? `${conversation.admin.firstName} ${conversation.admin.lastName}`
            : conversation.learner.partner?.name || "Switching Formation"
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
          void sendEmail(
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
  } catch (e) {
    if (storedFile) await removeSubmission(storedFile.key)
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Requête invalide" }, { status: 400 })
    throw e
  }
}

function buildNotificationEmail(
  fromName: string,
  preview: string,
  linkUrl: string,
  buttonText: string,
  primaryColor: string,
  brandName: string
): string {
  fromName = escapeMessageHtml(fromName)
  preview = escapeMessageHtml(preview)
  linkUrl = escapeMessageHtml(linkUrl)
  buttonText = escapeMessageHtml(buttonText)
  brandName = escapeMessageHtml(brandName)
  primaryColor = /^#[0-9a-f]{3,8}$/i.test(primaryColor) ? primaryColor : "#1e2847"
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
