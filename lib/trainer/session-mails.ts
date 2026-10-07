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

function recipients(learnerEmail: string, trainerEmail: string): string {
  const unique = Array.from(new Set([learnerEmail.trim(), trainerEmail.trim()].map((value) => value.toLowerCase())))
  if (unique.some((value) => !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value))) {
    throw new Error("Invalid session recipient")
  }
  return unique.join(", ")
}

async function deliver(tx: Prisma.TransactionClient, type: SessionMailType, session: TrainerSession,
  assignment: NonNullable<Awaited<ReturnType<typeof mailContext>>>, before?: TrainerSession | null) {
  const partner = await switchingPartner(tx)
  if (!partner) return false
  const mail = trainerSessionEmail(type, { ...session, before,
    learnerName: `${assignment.firstName} ${assignment.lastName}`,
    trainerName: `${assignment.trainer.firstName} ${assignment.trainer.lastName}`,
    formationLabel: assignment.formationLabel }, partner)
  // A single Gmail submission addresses both people, even when learnerId is null.
  // SESSION_* is excluded from the central trainer Bcc rule in lib/email.ts.
  return sendEmail(recipients(assignment.email, assignment.trainer.email), mail.subject, mail.html,
    assignment.trainer.id, type, partner)
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
      const sent = await deliver(tx, type, snapshot, assignment, before)
      if (sent && after) await tx.trainerSession.update({ where: { id: after.id }, data: { notifiedAt: new Date() } })
      return { sent, skipped: false, ...(sent ? {} : { reason: "delivery_failed" as const }) }
    }, { maxWait: 10000, timeout: 60000 })
  } catch {
    // The mutation already succeeded: never suggest that re-creating it is needed.
    console.error("[SESSION_MAIL] Notification failed")
    return { sent: false, skipped: false, reason: "delivery_failed" }
  }
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
    try {
      const notification = await prisma.$transaction(async (tx): Promise<SessionNotification> => {
        const locks = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('trainer-session-mail-v2'), hashtext(${candidate.id})) AS locked`
        if (!locks[0]?.locked) return skipped("busy")
        await tx.$queryRaw`SELECT "id" FROM "TrainerSession" WHERE "id" = ${candidate.id} FOR UPDATE`
        const session = await tx.trainerSession.findUnique({ where: { id: candidate.id },
          include: { assignment: { select: { trainerId: true } } } })
        if (!session || session.status !== "PLANNED" || session.cancelledAt || session.reminderSentAt ||
          session.startsAt < now || session.startsAt > until) return skipped("not_due")
        const assignment = await mailContext(tx, session.assignmentId, session.assignment.trainerId)
        if (!assignment) return skipped("unavailable")
        const sent = await deliver(tx, "SESSION_REMINDER", session, assignment)
        if (sent) await tx.trainerSession.update({ where: { id: session.id }, data: { reminderSentAt: new Date() } })
        return { sent, skipped: false, ...(sent ? {} : { reason: "delivery_failed" as const }) }
      }, { maxWait: 10000, timeout: 60000 })
      if (notification.sent) result.sent++
      else if (notification.skipped) result.skipped++
      else result.failed++
    } catch {
      result.failed++
      console.error("[SESSION_REMINDER] Delivery failed")
    }
  }
  return result
}
