import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { trainerNewStudentEmail } from "@/lib/email-templates"
import { getBaseUrl } from "@/lib/get-base-url"

/** Notification distincte des mails apprenant ; succès seul horodate l'attribution. */
export async function notifyTrainerNewStudent(assignmentId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Les replays/concurrences du CRM ne peuvent envoyer deux fois le même mail.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${assignmentId}))::text`
    const assignment = await tx.trainerAssignment.findUnique({
      where: { id: assignmentId }, include: { trainer: { include: { partner: true } } },
    })
    if (!assignment || assignment.archivedAt) return false
    if (assignment.trainerNotifiedAt) return true
    const trainer = assignment.trainer
    if (trainer.role !== "TRAINER" || !trainer.isActive || trainer.archivedAt ||
      trainer.partner?.slug !== "switching" || !trainer.partner.isInternal || !trainer.partner.isActive) return false
    const email = trainerNewStudentEmail({ ...assignment, trainerFirstName: trainer.firstName,
      assignmentUrl: `${getBaseUrl()}/trainer/eleves/${encodeURIComponent(assignment.id)}` }, trainer.partner)
    const sent = await sendEmail(trainer.email, email.subject, email.html, trainer.id,
      "TRAINER_NEW_STUDENT", trainer.partner, { bcc: "contact@switchingformation.com" })
    if (sent) await tx.trainerAssignment.update({ where: { id: assignmentId }, data: { trainerNotifiedAt: new Date() } })
    return sent
  }, { maxWait: 10000, timeout: 60000 })
}
