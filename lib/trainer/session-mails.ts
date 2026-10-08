import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { trainerSessionEmail, type SessionMailType } from "@/lib/email-templates"
import { trainerAssignmentScope } from "@/lib/trainer/access"
import type { Prisma, TrainerSession } from "@prisma/client"

export interface SessionNotification {
  sent: boolean
  skipped: boolean
  reason?: "unchanged" | "obsolete" | "unavailable" | "delivery_failed" | "busy" | "not_due"
}

const skipped = (reason: SessionNotification["reason"]): SessionNotification => ({ sent: false, skipped: true, reason })
const trainerSelect = { id: true, firstName: true, lastName: true, email: true } as const

async function mailContext(tx: Prisma.TransactionClient, assignmentId: string, trainerId: string) {
  return tx.trainerAssignment.findFirst({
    where: { ...trainerAssignmentScope(trainerId), id: assignmentId, archivedAt: null },
    include: { trainer: { select: trainerSelect } },
  })
}

async function switchingPartner(tx: Prisma.TransactionClient) {
  return tx.partner.findFirst({ where: { slug: "switching", isInternal: true, isActive: true },
    select: { name: true, primaryColor: true, secondaryColor: true, logoUrl: true, mailProfile: true, useDefaultSmtp: true } })
}

function sameSlot(left: TrainerSession, right: TrainerSession): boolean {
  return left.startsAt.getTime() === right.startsAt.getTime() && left.durationMinutes === right.durationMinutes &&
    left.visioUrl === right.visioUrl
}

function notificationType(before: TrainerSession | null, after: TrainerSession | null): SessionMailType | null {
  if (after?.status === "PLANNED" && (!before || before.status !== "PLANNED")) return "SESSION_SCHEDULED"
  if (before?.status === "PLANNED" && (!after || after.status === "CANCELLED")) return "SESSION_CANCELLED"
  if (before?.status === "PLANNED" && after?.status === "PLANNED" && !sameSlot(before, after)) return "SESSION_UPDATED"
  return null
}

type SessionAudience = "learner" | "trainer"
type ReminderAttempt = "complete" | "delivered" | "failed" | "skipped"

async function deliver(tx: Prisma.TransactionClient, type: SessionMailType, session: TrainerSession,
  assignment: NonNullable<Awaited<ReturnType<typeof mailContext>>>, audience: SessionAudience,
  before?: TrainerSession | null) {
  const partner = await switchingPartner(tx)
  if (!partner) return false
  const email = (audience === "learner" ? assignment.email : assignment.trainer.email).trim().toLowerCase()
  try {
    if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)) throw new Error("Invalid session recipient")
    const mail = trainerSessionEmail(type, { ...session, before, audience,
      learnerFirstName: assignment.firstName, learnerName: `${assignment.firstName} ${assignment.lastName}`,
      trainerFirstName: assignment.trainer.firstName,
      trainerName: `${assignment.trainer.firstName} ${assignment.trainer.lastName}`,
      formationLabel: assignment.formationLabel }, partner)
    // One recipient per submission, no Cc/Bcc; SESSION_* bypasses the central trainer Bcc rule.
    return await sendEmail(email, mail.subject, mail.html,
      audience === "learner" ? assignment.learnerId : assignment.trainer.id, type, partner)
  } catch {
    console.error(`[SESSION_MAIL] ${audience} delivery failed`)
    return false
  }
}

/** Mutations belong to the socle; only the routes call this notification helper. */
export async function notifySessionChange(before: TrainerSession | null, after: TrainerSession | null): Promise<SessionNotification> {
  const type = notificationType(before, after)
  const snapshot = after || before
  if (!type || !snapshot) return skipped("unchanged")
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('trainer-session-mail-v2'), hashtext(${snapshot.id}))::text`
      await tx.$queryRaw`SELECT "id" FROM "TrainerSession" WHERE "id" = ${snapshot.id} FOR UPDATE`
      const current = await tx.trainerSession.findUnique({ where: { id: snapshot.id }, include: { assignment: { select: { trainerId: true } } } })
      if (after && (!current || current.status !== after.status || !sameSlot(current, after))) return skipped("obsolete")
      if (!after && current) return skipped("obsolete")
      const owner = current?.assignment.trainerId || (await tx.trainerAssignment.findUnique({
        where: { id: snapshot.assignmentId }, select: { trainerId: true },
      }))?.trainerId
      if (!owner) return skipped("unavailable")
      const assignment = await mailContext(tx, snapshot.assignmentId, owner)
      if (!assignment) return skipped("unavailable")
      const learnerSent = await deliver(tx, type, snapshot, assignment, "learner", before)
      const trainerSent = await deliver(tx, type, snapshot, assignment, "trainer", before)
      const sent = learnerSent && trainerSent
      if (sent && after) await tx.trainerSession.update({ where: { id: after.id }, data: { notifiedAt: new Date() } })
      return { sent, skipped: false, ...(sent ? {} : { reason: "delivery_failed" as const }) }
    }, { maxWait: 10000, timeout: 60000 })
  } catch {
    // The mutation already succeeded: never suggest that re-creating it is needed.
    console.error("[SESSION_MAIL] Notification failed")
    return { sent: false, skipped: false, reason: "delivery_failed" }
  }
}

/** Commit each recipient before attempting the next; row locks also serialize schedule mutations. */
async function remindRecipient(id: string, audience: SessionAudience, now: Date, until: Date): Promise<ReminderAttempt> {
  return prisma.$transaction(async (tx): Promise<ReminderAttempt> => {
    const locks = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('trainer-session-mail-v2'), hashtext(${id})) AS locked`
    if (!locks[0]?.locked) return "skipped"
    await tx.$queryRaw`SELECT "id" FROM "TrainerSession" WHERE "id" = ${id} FOR UPDATE`
    const session = await tx.trainerSession.findUnique({ where: { id },
      include: { assignment: { select: { trainerId: true } } } })
    if (!session || session.status !== "PLANNED" || session.cancelledAt || session.reminderSentAt ||
      session.startsAt < now || session.startsAt > until) return "skipped"
    if (session.learnerReminderSentAt && session.trainerReminderSentAt) {
      await tx.trainerSession.update({ where: { id }, data: { reminderSentAt: new Date() } })
      return "complete"
    }
    const field = audience === "learner" ? "learnerReminderSentAt" : "trainerReminderSentAt"
    const otherField = audience === "learner" ? "trainerReminderSentAt" : "learnerReminderSentAt"
    if (session[field]) return "skipped"
    const assignment = await mailContext(tx, session.assignmentId, session.assignment.trainerId)
    if (!assignment) return "skipped"
    if (!await deliver(tx, "SESSION_REMINDER", session, assignment, audience)) return "failed"
    const sentAt = new Date()
    const data: Prisma.TrainerSessionUpdateInput = { [field]: sentAt,
      ...(session[otherField] ? { reminderSentAt: sentAt } : {}) }
    await tx.trainerSession.update({ where: { id }, data })
    return session[otherField] ? "complete" : "delivered"
  }, { maxWait: 10000, timeout: 60000 })
}

export async function runDueSessionReminders(now = new Date()) {
  const until = new Date(now.getTime() + 30 * 60 * 1000)
  const candidates = await prisma.trainerSession.findMany({
    where: { status: "PLANNED", cancelledAt: null, reminderSentAt: null, startsAt: { gte: now, lte: until },
      assignment: { archivedAt: null, trainer: { role: "TRAINER", isActive: true, archivedAt: null } } },
    select: { id: true }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 100,
  })
  const result = { scanned: candidates.length, sent: 0, skipped: 0, failed: 0 }
  for (const candidate of candidates) {
    const attempts: ReminderAttempt[] = []
    for (const audience of ["learner", "trainer"] as const) {
      try {
        attempts.push(await remindRecipient(candidate.id, audience, now, until))
      } catch {
        attempts.push("failed")
        console.error(`[SESSION_REMINDER] ${audience} delivery failed`)
      }
    }
    if (attempts.includes("complete")) result.sent++
    else if (attempts.includes("failed")) result.failed++
    else result.skipped++
  }
  return result
}
