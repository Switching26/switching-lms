import { sendEmail } from "@/lib/email"
import { getBaseUrl } from "@/lib/get-base-url"

export function escapeMessageHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}
export function trainerMessageEmail(learnerName: string, preview: string, conversationId: string): string {
  const link = `${getBaseUrl()}/trainer/messages?conversation=${encodeURIComponent(conversationId)}`
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif"><div style="max-width:600px;margin:40px auto;background:white;border-radius:8px;overflow:hidden"><div style="background:#10ABAF;padding:30px;text-align:center"><h1 style="color:white;margin:0;font-size:24px">Switching Formation</h1></div><div style="padding:30px"><h2 style="font-size:20px">Nouveau message de votre élève</h2><p>${escapeMessageHtml(learnerName)} vous a écrit dans Switching LMS.</p><p style="padding:16px;background:#f5f5f5;border-left:4px solid #10ABAF">${escapeMessageHtml(preview.slice(0, 180))}</p><p><a href="${escapeMessageHtml(link)}" style="display:inline-block;padding:14px 24px;background:#10ABAF;color:white;border-radius:6px;text-decoration:none">Lire et répondre</a></p><p style="font-size:13px;color:#666">Les messages suivants restent regroupés dans cette conversation jusqu'à votre lecture.</p></div><div style="padding:20px;text-align:center;color:#666;font-size:12px">Switching Formation</div></div></body></html>`
}
export async function notifyTrainerMessage(trainer: { id: string; email: string }, learnerName: string, preview: string, conversationId: string) {
  const subject = `Nouveau message de ${learnerName}`
  const html = trainerMessageEmail(learnerName, preview, conversationId)
  // Local QA only: capture the exact HTML without loading any Gmail credentials.
  const capture = process.env.NODE_ENV === "development" && process.env.LMS_TRAINER_MAIL_CAPTURE_DIR
  if (capture) {
    const { mkdir, writeFile } = await import("fs/promises")
    const { join } = await import("path")
    const { randomUUID } = await import("crypto")
    await mkdir(capture, { recursive: true, mode: 0o700 })
    const name = randomUUID()
    await writeFile(join(capture, `${name}.html`), html, { mode: 0o600 })
    await writeFile(join(capture, `${name}.json`), JSON.stringify({ to: trainer.email, subject,
      bcc: "contact@switchingformation.com", type: "TRAINER_NEW_MESSAGE", conversationId }), { mode: 0o600 })
    return true
  }
  return sendEmail(trainer.email, subject, html,
    trainer.id, "TRAINER_NEW_MESSAGE", { name: "Switching Formation", mailProfile: "switching", useDefaultSmtp: true },
    { bcc: "contact@switchingformation.com" })
}
