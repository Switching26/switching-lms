import type { TrainerUnavailability } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assertActiveTrainer, TrainerAccessError, withTrainerTransaction } from "./access"
import { trainerDate } from "./assignments"
import { findConflictsInTransaction, TrainerConflictError } from "./sessions"

export interface TrainerUnavailabilityInput { startsAt?: Date | string; endsAt?: Date | string; note?: string | null }
function validateInput(input: TrainerUnavailabilityInput, creating = false) {
  if (creating && (input.startsAt === undefined || input.endsAt === undefined)) throw new TrainerAccessError("Début et fin obligatoires", 400)
  const data: { startsAt?: Date; endsAt?: Date; note?: string | null } = {}
  if (input.startsAt !== undefined) data.startsAt = trainerDate(input.startsAt, "startsAt")
  if (input.endsAt !== undefined) data.endsAt = trainerDate(input.endsAt, "endsAt")
  if (input.note !== undefined) {
    if (input.note !== null && (typeof input.note !== "string" || input.note.length > 20000)) throw new TrainerAccessError("Note invalide", 400)
    data.note = input.note
  }
  return data
}
export async function listUnavailability(trainerId: string, from?: Date | string, to?: Date | string): Promise<TrainerUnavailability[]> {
  await assertActiveTrainer(trainerId)
  if (Boolean(from) !== Boolean(to)) throw new TrainerAccessError("Dates from et to obligatoires ensemble", 400)
  const start = from ? trainerDate(from, "from") : undefined, end = to ? trainerDate(to, "to") : undefined
  if (start && end && end <= start) throw new TrainerAccessError("La fin doit suivre le début", 400)
  return prisma.trainerUnavailability.findMany({ where: {
    trainerId, trainer: { role: "TRAINER", isActive: true, archivedAt: null, trainerPartners: { some: { partner: { isActive: true } } } },
    ...(start && end ? { startsAt: { lt: end }, endsAt: { gt: start } } : {}),
  }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] })
}
export async function createUnavailability(trainerId: string, input: TrainerUnavailabilityInput): Promise<TrainerUnavailability> {
  const data = validateInput(input, true)
  return withTrainerTransaction(trainerId, async tx => {
    const conflicts = await findConflictsInTransaction(tx, trainerId, data.startsAt!, data.endsAt!)
    if (conflicts.sessions.length || conflicts.unavailability.length) throw new TrainerConflictError(conflicts)
    return tx.trainerUnavailability.create({ data: { ...data, trainerId, startsAt: data.startsAt!, endsAt: data.endsAt! } })
  })
}
export async function updateUnavailability(trainerId: string, id: string, input: TrainerUnavailabilityInput): Promise<TrainerUnavailability> {
  const data = validateInput(input)
  return withTrainerTransaction(trainerId, async tx => {
    const where = { id, trainerId }, before = await tx.trainerUnavailability.findFirst({ where: { id, trainerId } })
    if (!before) throw new TrainerAccessError("Indisponibilité introuvable", 404)
    const next = { ...before, ...data }
    const conflicts = await findConflictsInTransaction(tx, trainerId, next.startsAt, next.endsAt, undefined, id)
    if (conflicts.sessions.length || conflicts.unavailability.length) throw new TrainerConflictError(conflicts)
    if (!(await tx.trainerUnavailability.updateMany({ where, data })).count) throw new TrainerAccessError("Indisponibilité introuvable", 404)
    return tx.trainerUnavailability.findFirstOrThrow({ where })
  })
}
export async function deleteUnavailability(trainerId: string, id: string): Promise<{ success: true }> {
  return withTrainerTransaction(trainerId, async tx => {
    if (!(await tx.trainerUnavailability.deleteMany({ where: { id, trainerId } })).count) throw new TrainerAccessError("Indisponibilité introuvable", 404)
    return { success: true }
  })
}
