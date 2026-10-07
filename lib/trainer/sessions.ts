import { TrainerSessionStatus, type Prisma, type TrainerSession, type TrainerUnavailability } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assertActiveTrainer, assertTrainerOwnsAssignment, trainerAssignmentScope, TrainerAccessError, withTrainerTransaction } from "./access"
import { trainerDate } from "./assignments"

export interface TrainerSessionInput {
  startsAt?: Date | string
  durationMinutes?: number
  status?: TrainerSessionStatus
  note?: string | null
  visioUrl?: string | null
}
export interface SessionChange { before: TrainerSession | null; after: TrainerSession | null }
export interface TrainerConflicts { sessions: TrainerSession[]; unavailability: TrainerUnavailability[] }
export class TrainerConflictError extends TrainerAccessError {
  constructor(public readonly conflicts: TrainerConflicts) {
    super("Ce créneau chevauche une séance ou une indisponibilité", 409)
    this.name = "TrainerConflictError"
  }
}
export function sessionEndsAt(session: Pick<TrainerSession, "startsAt" | "durationMinutes">): Date {
  const end = new Date(session.startsAt.getTime() + session.durationMinutes * 60000)
  if (!Number.isFinite(end.getTime())) throw new TrainerAccessError("Fin de séance invalide", 400)
  return end
}
export function validateSessionInput(input: TrainerSessionInput, requireStart = false) {
  const data: { startsAt?: Date; durationMinutes?: number; status?: TrainerSessionStatus; note?: string | null; visioUrl?: string | null } = {}
  if (requireStart && input.startsAt === undefined) throw new TrainerAccessError("Date de séance obligatoire", 400)
  if (input.startsAt !== undefined) data.startsAt = trainerDate(input.startsAt, "startsAt")
  if (input.durationMinutes !== undefined) {
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 2147483647) throw new TrainerAccessError("Durée de séance invalide", 400)
    data.durationMinutes = input.durationMinutes
  }
  if (input.status !== undefined) {
    if (!Object.values(TrainerSessionStatus).includes(input.status)) throw new TrainerAccessError("Statut de séance invalide", 400)
    data.status = input.status
  }
  if (input.note !== undefined) {
    if (input.note !== null && (typeof input.note !== "string" || input.note.length > 20000)) throw new TrainerAccessError("Note invalide", 400)
    data.note = input.note
  }
  if (input.visioUrl !== undefined) {
    if (input.visioUrl === null || input.visioUrl === "") data.visioUrl = null
    else {
      if (typeof input.visioUrl !== "string" || input.visioUrl.length > 4096 || /[\r\n]/.test(input.visioUrl)) throw new TrainerAccessError("Lien visio invalide", 400)
      let url: URL
      try { url = new URL(input.visioUrl.trim()) } catch { throw new TrainerAccessError("Lien visio invalide", 400) }
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new TrainerAccessError("Le lien visio doit être HTTPS", 400)
      data.visioUrl = url.toString()
    }
  }
  return data
}
/** Half-open intervals: touching endpoints are free, cancelled sessions never block. */
export async function findConflicts(trainerId: string, startsAt: Date | string, endsAt: Date | string, ignoreSessionId?: string): Promise<TrainerConflicts> {
  await assertActiveTrainer(trainerId)
  return findConflictsInTransaction(prisma, trainerId, startsAt, endsAt, ignoreSessionId)
}
export async function findConflictsInTransaction(db: Prisma.TransactionClient, trainerId: string, startsAt: Date | string, endsAt: Date | string, ignoreSessionId?: string, ignoreUnavailabilityId?: string): Promise<TrainerConflicts> {
  const start = trainerDate(startsAt, "startsAt"), end = trainerDate(endsAt, "endsAt")
  if (end <= start) throw new TrainerAccessError("La fin doit suivre le début", 400)
  const [rows, unavailability] = await Promise.all([
    db.trainerSession.findMany({ where: {
      ...(ignoreSessionId ? { id: { not: ignoreSessionId } } : {}),
      assignment: { ...trainerAssignmentScope(trainerId), archivedAt: null },
      status: { not: "CANCELLED" }, cancelledAt: null, startsAt: { lt: end },
    }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
    db.trainerUnavailability.findMany({ where: {
      trainerId, ...(ignoreUnavailabilityId ? { id: { not: ignoreUnavailabilityId } } : {}),
      startsAt: { lt: end }, endsAt: { gt: start },
    }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
  ])
  return { sessions: rows.filter(session => sessionEndsAt(session) > start), unavailability }
}
export async function listSessionsForAssignment(trainerId: string, assignmentId: string) {
  await assertTrainerOwnsAssignment(trainerId, assignmentId)
  return prisma.trainerSession.findMany({ where: { assignmentId, assignment: trainerAssignmentScope(trainerId) }, orderBy: { startsAt: "asc" } })
}
export async function createSession(trainerId: string, assignmentId: string, input: TrainerSessionInput): Promise<SessionChange> {
  const data = validateSessionInput(input, true)
  return withTrainerTransaction(trainerId, async tx => {
    if (!await tx.trainerAssignment.findFirst({ where: { id: assignmentId, ...trainerAssignmentScope(trainerId), archivedAt: null }, select: { id: true } })) throw new TrainerAccessError("Élève introuvable", 404)
    const end = sessionEndsAt({ startsAt: data.startsAt!, durationMinutes: data.durationMinutes ?? 60 })
    if (data.status !== "CANCELLED") {
      const conflicts = await findConflictsInTransaction(tx, trainerId, data.startsAt!, end)
      if (conflicts.sessions.length || conflicts.unavailability.length) throw new TrainerConflictError(conflicts)
    }
    const after = await tx.trainerSession.create({ data: {
      ...data, startsAt: data.startsAt!, cancelledAt: data.status === "CANCELLED" ? new Date() : null,
      assignment: { connect: { ...trainerAssignmentScope(trainerId), id: assignmentId, archivedAt: null } },
    } })
    return { before: null, after }
  })
}
export async function updateSession(trainerId: string, sessionId: string, input: TrainerSessionInput): Promise<SessionChange> {
  const values = validateSessionInput(input)
  return withTrainerTransaction(trainerId, async tx => {
    const where = { id: sessionId, assignment: { ...trainerAssignmentScope(trainerId), archivedAt: null } }
    const before = await tx.trainerSession.findFirst({ where })
    if (!before) throw new TrainerAccessError("Séance introuvable", 404)
    const next = { ...before, ...values }, end = sessionEndsAt({ ...before, ...values })
    if (next.status !== "CANCELLED") {
      const conflicts = await findConflictsInTransaction(tx, trainerId, next.startsAt, end, sessionId)
      if (conflicts.sessions.length || conflicts.unavailability.length) throw new TrainerConflictError(conflicts)
    }
    const changed = Object.entries(values).some(([key, value]) => {
      const old = before[key as keyof typeof values]
      return value instanceof Date ? value.getTime() !== (old as Date).getTime() : value !== old
    })
    const data: Prisma.TrainerSessionUpdateManyMutationInput = { ...values,
      cancelledAt: next.status === "CANCELLED" ? before.cancelledAt ?? new Date() : null,
      ...(changed ? { reminderSentAt: null, notifiedAt: null } : {}),
    }
    if (!(await tx.trainerSession.updateMany({ where, data })).count) throw new TrainerAccessError("Séance introuvable", 404)
    const after = await tx.trainerSession.findFirst({ where })
    if (!after) throw new TrainerAccessError("Séance introuvable", 404)
    return { before, after }
  })
}
export async function cancelSession(trainerId: string, sessionId: string): Promise<SessionChange> {
  return updateSession(trainerId, sessionId, { status: "CANCELLED" })
}
export async function deleteSession(trainerId: string, sessionId: string): Promise<SessionChange> {
  return withTrainerTransaction(trainerId, async tx => {
    const where = { id: sessionId, assignment: { ...trainerAssignmentScope(trainerId), archivedAt: null } }
    const before = await tx.trainerSession.findFirst({ where })
    if (!before) throw new TrainerAccessError("Séance introuvable", 404)
    if (!(await tx.trainerSession.deleteMany({ where })).count) throw new TrainerAccessError("Séance introuvable", 404)
    return { before, after: null }
  })
}
// V1 adapters, until the notification routes adopt the before/after contract.
export async function createTrainerSession(trainerId: string, assignmentId: string, input: TrainerSessionInput): Promise<TrainerSession> {
  return (await createSession(trainerId, assignmentId, input)).after!
}
export async function updateTrainerSession(trainerId: string, sessionId: string, input: TrainerSessionInput): Promise<TrainerSession> {
  return (await updateSession(trainerId, sessionId, input)).after!
}
export async function deleteTrainerSession(trainerId: string, sessionId: string): Promise<{ success: true }> {
  await deleteSession(trainerId, sessionId)
  return { success: true }
}
export async function listTrainerAgenda(trainerId: string, from: Date | string, to: Date | string) {
  await assertActiveTrainer(trainerId)
  const fromDate = trainerDate(from, "from"), toDate = trainerDate(to, "to")
  if (toDate <= fromDate) throw new TrainerAccessError("La fin doit suivre le début de la période", 400)
  const rows = await prisma.trainerSession.findMany({
    where: { assignment: { ...trainerAssignmentScope(trainerId), archivedAt: null }, startsAt: { lt: toDate } },
    include: { assignment: { select: { id: true, learnerId: true, firstName: true, lastName: true, email: true, phone: true,
      hasElearning: true, formationLabel: true, adminStartAt: true, adminEndAt: true, visioStartAt: true } } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  })
  return rows.filter(session => sessionEndsAt(session) > fromDate)
}
