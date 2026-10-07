import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export class TrainerAccessError extends Error {
  constructor(message: string, public readonly status: 400 | 401 | 403 | 404 | 409) {
    super(message)
    this.name = "TrainerAccessError"
  }
}

export interface TrainerIdentity {
  id: string
  role: "TRAINER"
  firstName: string
  lastName: string
  email: string
  partnerId: string | null
}

/** Server-only guard: recheck role/account in the database, not only the JWT. */
export async function requireTrainer(): Promise<TrainerIdentity> {
  const session = await auth()
  if (!session?.user?.id) throw new TrainerAccessError("Non autorisé", 401)
  if (String(session.user.role) !== "TRAINER" || session.user.realAdmin) {
    throw new TrainerAccessError("Accès réservé aux formateurs", 403)
  }
  const trainer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, role: true, firstName: true, lastName: true, email: true,
      partnerId: true, isActive: true, archivedAt: true,
      partner: { select: { isInternal: true } },
    },
  })
  if (!trainer || !trainer.isActive || trainer.archivedAt) {
    throw new TrainerAccessError("Non autorisé", 401)
  }
  if (trainer.role !== "TRAINER" || (trainer.partner && !trainer.partner.isInternal)) {
    throw new TrainerAccessError("Accès réservé aux formateurs Switching", 403)
  }
  return { id: trainer.id, role: "TRAINER", firstName: trainer.firstName,
    lastName: trainer.lastName, email: trainer.email, partnerId: trainer.partnerId }
}

/** Resolve the learner's CURRENT organisation for every read/write. Accounts
 * without a partner are central Switching accounts; visio-only assignments
 * have no learner account and remain visible.
 */
export function trainerAssignmentScope(trainerId: string) {
  return {
    trainerId,
    OR: [
      { learnerId: null },
      { learner: { role: "LEARNER", archivedAt: null,
        OR: [{ partnerId: null }, { partner: { isInternal: true } }] } },
    ],
  } satisfies Prisma.TrainerAssignmentWhereInput
}

/** Unknown, another trainer's or transferred students all return 404. */
export async function assertTrainerOwnsAssignment(trainerId: string, assignmentId: string) {
  const assignment = await prisma.trainerAssignment.findFirst({
    where: { ...trainerAssignmentScope(trainerId), id: assignmentId },
  })
  if (!assignment) throw new TrainerAccessError("Élève introuvable", 404)
  return assignment
}

/** Used by messaging: only active bonus assignments with an actual LMS learner. */
export async function canTrainerSeeLearner(trainerId: string, learnerId: string): Promise<boolean> {
  const assignment = await prisma.trainerAssignment.findFirst({
    where: {
      ...trainerAssignmentScope(trainerId), learnerId, hasElearning: true, archivedAt: null,
      trainer: { role: "TRAINER", isActive: true, archivedAt: null,
        OR: [{ partnerId: null }, { partner: { isInternal: true } }] },
      enrollmentId: { not: null },
    },
    select: { id: true },
  })
  return assignment !== null
}
