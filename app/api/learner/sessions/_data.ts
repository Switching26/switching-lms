import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { activeTrainerScope, trainerAssignmentScope } from "@/lib/trainer/partners"
import type { LearnerPlanningData, LearnerSession } from "@/components/learner-planning/data"
import { parisDateLabel, safeVisioUrl } from "@/components/learner-planning/dates"

export class LearnerPlanningError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message)
    this.name = "LearnerPlanningError"
  }
}

export async function requirePlanningLearner() {
  const session = await auth()
  if (!session?.user?.id) throw new LearnerPlanningError("Non autorisé", 401)
  if (session.user.role !== "LEARNER") throw new LearnerPlanningError("Accès réservé aux élèves", 403)
  // The JWT can outlive a role or organisation change. Read the account now.
  const learner = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isActive: true, archivedAt: true },
  })
  if (!learner || !learner.isActive || learner.archivedAt) throw new LearnerPlanningError("Non autorisé", 401)
  if (learner.role !== "LEARNER") throw new LearnerPlanningError("Accès réservé aux élèves", 403)
  return learner
}

export async function readLearnerPlanning(learnerId: string): Promise<LearnerPlanningData> {
  const trainers = await prisma.trainerAssignment.findMany({
    where: { learnerId, archivedAt: null, trainer: activeTrainerScope },
    select: { trainerId: true }, distinct: ["trainerId"],
  })
  // Every scope is re-evaluated in SQL against CURRENT partner memberships.
  // learnerId remains an AND condition: none of these trainer scopes can
  // return another pupil, including when the same trainer has several pupils.
  const assignments = trainers.length ? await prisma.trainerAssignment.findMany({
    where: { learnerId, archivedAt: null, OR: trainers.map(({ trainerId }) => trainerAssignmentScope(trainerId)) },
    select: {
      formationLabel: true,
      trainer: { select: { firstName: true, lastName: true } },
      sessions: { select: {
        id: true, startsAt: true, durationMinutes: true, status: true,
        cancelledAt: true, visioUrl: true,
      }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] },
    },
  }) : []
  const sessions: LearnerSession[] = assignments.flatMap(assignment => assignment.sessions.map(session => {
    const endsAt = new Date(session.startsAt.getTime() + session.durationMinutes * 60_000)
    return {
      id: session.id, startsAt: session.startsAt.toISOString(), endsAt: endsAt.toISOString(),
      dateLabel: parisDateLabel(session.startsAt), endLabel: parisDateLabel(endsAt),
      durationMinutes: session.durationMinutes,
      status: session.cancelledAt ? "CANCELLED" : session.status,
      visioUrl: safeVisioUrl(session.visioUrl),
      formationLabel: assignment.formationLabel, trainer: assignment.trainer,
    }
  })).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
  // No private notes, learner identities, email addresses or assignment fields.
  return { hasTrainer: assignments.length > 0, timeZone: "Europe/Paris", serverTime: new Date().toISOString(), sessions }
}
