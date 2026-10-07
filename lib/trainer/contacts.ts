import { TrainerContactKind, type Prisma, type TrainerContactEvent } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { TrainerAccessError, assertTrainerOwnsAssignment, trainerAssignmentScope, withTrainerTransaction } from "./access"
import { trainerDate } from "./assignments"

export interface AddContactEventInput {
  kind: TrainerContactKind
  occurredAt: Date | string
  note?: string | null
}

/** Recompute from the complete history, including backdated events/deletions. */
export async function syncContactFields(tx: Prisma.TransactionClient, trainerId: string, assignmentId: string) {
  const events = await tx.trainerContactEvent.findMany({
    where: { assignmentId, assignment: trainerAssignmentScope(trainerId) },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  })
  const last = (kind: TrainerContactKind) => events.filter(event => event.kind === kind).at(-1)?.occurredAt ?? null
  const result = await tx.trainerAssignment.updateMany({
    where: { id: assignmentId, ...trainerAssignmentScope(trainerId) },
    data: { contactDoneAt: events.find(event => event.kind === "CONTACT")?.occurredAt ?? null,
      planningAgreedAt: last("PLANNING_VALIDE"), noAnswerAt: last("PAS_DE_RETOUR"),
      silaeAccessSentAt: last("ACCES_SILAE_ENVOYE") },
  })
  if (!result.count) throw new TrainerAccessError("Élève introuvable", 404)
}

export async function listContactEvents(trainerId: string, assignmentId: string): Promise<TrainerContactEvent[]> {
  await assertTrainerOwnsAssignment(trainerId, assignmentId)
  return prisma.trainerContactEvent.findMany({
    where: { assignmentId, assignment: trainerAssignmentScope(trainerId) },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  })
}

export async function addContactEvent(trainerId: string, assignmentId: string, input: AddContactEventInput): Promise<TrainerContactEvent> {
  if (!Object.values(TrainerContactKind).includes(input.kind)) throw new TrainerAccessError("Type de contact invalide", 400)
  const occurredAt = trainerDate(input.occurredAt, "occurredAt")
  if (input.note != null && (typeof input.note !== "string" || input.note.length > 20000)) throw new TrainerAccessError("Note invalide", 400)
  return withTrainerTransaction(trainerId, async tx => {
    const event = await tx.trainerContactEvent.create({ data: {
      assignment: { connect: { ...trainerAssignmentScope(trainerId), id: assignmentId } },
      kind: input.kind, occurredAt, note: input.note ?? null, createdBy: { connect: { id: trainerId } },
    } })
    await syncContactFields(tx, trainerId, assignmentId)
    return event
  })
}

export async function deleteContactEvent(trainerId: string, assignmentId: string, eventId: string): Promise<{ success: true }> {
  return withTrainerTransaction(trainerId, async tx => {
    const result = await tx.trainerContactEvent.deleteMany({ where: {
      id: eventId, assignmentId, assignment: trainerAssignmentScope(trainerId),
    } })
    if (!result.count) throw new TrainerAccessError("Contact introuvable", 404)
    await syncContactFields(tx, trainerId, assignmentId)
    return { success: true }
  })
}
