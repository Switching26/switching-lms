import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export const activeTrainerScope = {
  role: "TRAINER", isActive: true, archivedAt: null,
  trainerPartners: { some: { partner: { isActive: true } } },
} satisfies Prisma.UserWhereInput

/** Current memberships only. User.partnerId is no longer a trainer permission. */
export async function trainerPartnerIds(trainerId: string): Promise<string[]> {
  const rows = await prisma.trainerPartner.findMany({
    where: { trainerId, trainer: activeTrainerScope, partner: { isActive: true } },
    select: { partnerId: true }, orderBy: { partnerId: "asc" },
  })
  return rows.map(row => row.partnerId)
}

/** Synchronous relational scope: evaluated by PostgreSQL on every read/write. */
export function trainerAssignmentScope(trainerId: string) {
  return {
    trainerId, trainer: activeTrainerScope,
    OR: [
      { learnerId: null, partner: { isActive: true, trainers: { some: { trainerId } } } },
      { learner: { role: "LEARNER", archivedAt: null, partner: {
        isActive: true, trainers: { some: { trainerId } },
      } } },
      // Legacy central learners belong to Switching; require an internal membership.
      { learner: { role: "LEARNER", archivedAt: null, partnerId: null },
        trainer: { ...activeTrainerScope, trainerPartners: { some: { partner: { isInternal: true, isActive: true } } } } },
    ],
  } satisfies Prisma.TrainerAssignmentWhereInput
}

/** Messaging stays restricted to active bonus assignments with linked LMS enrollment. */
export async function canTrainerSeeLearner(trainerId: string, learnerId: string): Promise<boolean> {
  return await prisma.trainerAssignment.findFirst({
    where: { ...trainerAssignmentScope(trainerId), learnerId, hasElearning: true,
      archivedAt: null, enrollmentId: { not: null } }, select: { id: true },
  }) !== null
}
