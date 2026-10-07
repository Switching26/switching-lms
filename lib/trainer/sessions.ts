import { TrainerSessionStatus, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assertTrainerOwnsAssignment, TrainerAccessError } from "./access"
import { trainerDate } from "./assignments"

export interface TrainerSessionInput {
  startsAt?: Date | string
  durationMinutes?: number
  status?: TrainerSessionStatus
  note?: string | null
}

export function validateSessionInput(input: TrainerSessionInput, requireStart = false) {
  const data: { startsAt?: Date; durationMinutes?: number; status?: TrainerSessionStatus; note?: string | null } = {}
  if (requireStart && input.startsAt === undefined) throw new TrainerAccessError("Date de séance obligatoire", 400)
  if (input.startsAt !== undefined) {
    if (!(input.startsAt instanceof Date) && typeof input.startsAt !== "string") throw new TrainerAccessError("Date de séance invalide", 400)
    data.startsAt = trainerDate(input.startsAt, "startsAt")
  }
  if (input.durationMinutes !== undefined) {
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 2147483647) {
      throw new TrainerAccessError("Durée de séance invalide", 400)
    }
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
  return data
}

export async function listSessionsForAssignment(trainerId: string, assignmentId: string) {
  await assertTrainerOwnsAssignment(trainerId, assignmentId)
  return prisma.trainerSession.findMany({ where: { assignmentId, assignment: { trainerId } }, orderBy: { startsAt: "asc" } })
}

export async function createTrainerSession(trainerId: string, assignmentId: string, input: TrainerSessionInput) {
  await assertTrainerOwnsAssignment(trainerId, assignmentId)
  const data = validateSessionInput(input, true)
  return prisma.trainerSession.create({ data: {
    ...data, startsAt: data.startsAt!,
    // Ownership is checked again in the FK connect, including during a reassignment.
    assignment: { connect: { id: assignmentId, trainerId } },
  } })
}

export async function updateTrainerSession(trainerId: string, sessionId: string, input: TrainerSessionInput) {
  const session = await prisma.trainerSession.findFirst({ where: { id: sessionId, assignment: { trainerId } } })
  if (!session) throw new TrainerAccessError("Séance introuvable", 404)
  const data: Prisma.TrainerSessionUpdateManyMutationInput = validateSessionInput(input)
  const result = await prisma.trainerSession.updateMany({ where: { id: sessionId, assignment: { trainerId } }, data })
  if (!result.count) throw new TrainerAccessError("Séance introuvable", 404)
  const updated = await prisma.trainerSession.findFirst({ where: { id: sessionId, assignment: { trainerId } } })
  if (!updated) throw new TrainerAccessError("Séance introuvable", 404)
  return updated
}

export async function deleteTrainerSession(trainerId: string, sessionId: string) {
  const result = await prisma.trainerSession.deleteMany({ where: { id: sessionId, assignment: { trainerId } } })
  if (!result.count) throw new TrainerAccessError("Séance introuvable", 404)
  return { success: true }
}

export async function listTrainerAgenda(trainerId: string, from: Date | string, to: Date | string) {
  const fromDate = trainerDate(from, "from")
  const toDate = trainerDate(to, "to")
  if (toDate <= fromDate) throw new TrainerAccessError("La fin doit suivre le début de la période", 400)
  return prisma.trainerSession.findMany({
    where: { assignment: { trainerId, archivedAt: null }, startsAt: { gte: fromDate, lt: toDate } },
    include: { assignment: { select: {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      hasElearning: true, formationLabel: true, adminStartAt: true, adminEndAt: true, visioStartAt: true,
    } } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  })
}
