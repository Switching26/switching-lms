import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assertTrainerOwnsAssignment, TrainerAccessError } from "./access"
import { sortChaptersByLearningOrder } from "@/lib/data/chapter-order"
import { getFormationQuizResults } from "@/lib/data/quiz"

export interface CreateTrainerAssignmentInput {
  trainerId: string
  learnerId?: string | null
  enrollmentId?: string | null
  crmBeneficiaireId?: number | null
  civility?: string | null
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  formationLabel: string
  visioHours?: number | null
  hasElearning?: boolean
  adminStartAt: Date | string
  adminEndAt?: Date | string | null
  visioStartAt?: Date | string | null
}

export function trainerDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new TrainerAccessError(`Date invalide : ${field}`, 400)
  return date
}

/** No account creation, no enrollment creation and no email side effect. */
export async function createTrainerAssignment(input: CreateTrainerAssignmentInput) {
  const hasElearning = input.hasElearning ?? false
  const adminStartAt = trainerDate(input.adminStartAt, "adminStartAt")
  const adminEndAt = input.adminEndAt ? trainerDate(input.adminEndAt, "adminEndAt") : null
  const visioStartAt = input.visioStartAt ? trainerDate(input.visioStartAt, "visioStartAt") : null
  if (adminEndAt && adminEndAt < adminStartAt) throw new TrainerAccessError("La fin précède le début administratif", 400)
  if (hasElearning && !visioStartAt) throw new TrainerAccessError("Début des visios obligatoire avec le bonus", 400)
  if ((!hasElearning && (input.learnerId || input.enrollmentId)) || Boolean(input.learnerId) !== Boolean(input.enrollmentId)) {
    throw new TrainerAccessError("Liens LMS invalides : réservés au bonus et fournis ensemble", 400)
  }
  if (!input.firstName?.trim() || !input.lastName?.trim() || !input.formationLabel?.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new TrainerAccessError("Identité, email et formation obligatoires", 400)
  }
  if (input.visioHours != null && (!Number.isInteger(input.visioHours) || input.visioHours <= 0)) {
    throw new TrainerAccessError("Nombre d'heures invalide", 400)
  }
  return prisma.$transaction(async (tx) => {
    const trainer = await tx.user.findUnique({ where: { id: input.trainerId },
      select: { role: true, isActive: true, archivedAt: true, partner: { select: { isInternal: true } } } })
    if (!trainer || trainer.role !== "TRAINER" || !trainer.isActive || trainer.archivedAt ||
      (trainer.partner && !trainer.partner.isInternal)) throw new TrainerAccessError("Formatrice Switching introuvable", 400)
    if (input.enrollmentId) {
      const enrollment = await tx.enrollment.findUnique({ where: { id: input.enrollmentId },
        include: { user: { select: { role: true, partner: { select: { isInternal: true } } } } } })
      if (!enrollment || enrollment.userId !== input.learnerId || enrollment.user.role !== "LEARNER" ||
        (enrollment.user.partner && !enrollment.user.partner.isInternal) ||
        enrollment.startedAt.getTime() !== adminStartAt.getTime()) {
        throw new TrainerAccessError("Inscription bonus invalide ou début administratif différent", 400)
      }
    }
    return tx.trainerAssignment.create({ data: {
      trainerId: input.trainerId, learnerId: input.learnerId || null,
      enrollmentId: input.enrollmentId || null, crmBeneficiaireId: input.crmBeneficiaireId ?? null,
      civility: input.civility ?? null, firstName: input.firstName.trim(), lastName: input.lastName.trim(),
      email: input.email.trim(), phone: input.phone ?? null, formationLabel: input.formationLabel.trim(),
      visioHours: input.visioHours ?? null, hasElearning, adminStartAt, adminEndAt, visioStartAt,
    } })
  })
}

export async function listAssignmentsForTrainer(trainerId: string, options: { archived?: boolean } = {}) {
  return prisma.trainerAssignment.findMany({
    where: { trainerId, archivedAt: options.archived ? { not: null } : null },
    include: { sessions: { orderBy: { startsAt: "asc" } } },
    orderBy: [{ adminStartAt: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  })
}

export interface AssignmentStepsInput {
  contactDone?: boolean
  silaeAccessSent?: boolean
  planningAgreed?: boolean
  noAnswer?: boolean
  planningNote?: string | null
}

/** A checked box retains its first timestamp; unchecking clears it. */
export async function updateAssignmentSteps(trainerId: string, assignmentId: string, input: AssignmentStepsInput) {
  const assignment = await assertTrainerOwnsAssignment(trainerId, assignmentId)
  const fields = { contactDone: "contactDoneAt", silaeAccessSent: "silaeAccessSentAt",
    planningAgreed: "planningAgreedAt", noAnswer: "noAnswerAt" } as const
  const data: Prisma.TrainerAssignmentUpdateManyMutationInput = {}
  const now = new Date()
  for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") throw new TrainerAccessError(`Case invalide : ${key}`, 400)
      const field = fields[key]
      data[field] = input[key] ? assignment[field] ?? now : null
    }
  }
  if (input.planningAgreed && input.noAnswer) throw new TrainerAccessError("Planning convenu et pas de réponse sont incompatibles", 400)
  if (input.planningAgreed) data.noAnswerAt = null
  if (input.noAnswer) data.planningAgreedAt = null
  if (input.planningNote !== undefined) {
    if (input.planningNote !== null && (typeof input.planningNote !== "string" || input.planningNote.length > 20000)) {
      throw new TrainerAccessError("Note invalide", 400)
    }
    data.planningNote = input.planningNote
  }
  const result = await prisma.trainerAssignment.updateMany({ where: { id: assignmentId, trainerId }, data })
  if (!result.count) throw new TrainerAccessError("Élève introuvable", 404)
  return assertTrainerOwnsAssignment(trainerId, assignmentId)
}

/** Same chapter ordering, completion formula and quiz reader as the admin.
 * Scope exclusively to this assignment's enrollment; never expose other courses.
 */
export async function getAssignmentProgress(trainerId: string, assignmentId: string) {
  const assignment = await assertTrainerOwnsAssignment(trainerId, assignmentId)
  const empty = { hasElearning: assignment.hasElearning, percent: 0, progressPercent: 0,
    completedChapters: 0, totalChapters: 0, totalTime: 0, totalExpected: 0,
    lastActivity: null, formations: [] }
  if (!assignment.hasElearning || !assignment.learnerId || !assignment.enrollmentId) return empty
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: assignment.enrollmentId, userId: assignment.learnerId, trainerAssignment: { trainerId } },
    include: { formation: { include: {
      sections: { orderBy: { order: "asc" } },
      chapters: { where: { isPublished: true }, include: { section: true }, orderBy: { order: "asc" } },
    } } },
  })
  if (!enrollment) return empty
  const rows = await prisma.progress.findMany({ where: { userId: assignment.learnerId,
    chapterId: { in: enrollment.formation.chapters.map((chapter) => chapter.id) } } })
  const byChapter = new Map(rows.map((row) => [row.chapterId, row]))
  const chapters = sortChaptersByLearningOrder(enrollment.formation.chapters, enrollment.formation.sections).map((chapter) => {
    const progress = byChapter.get(chapter.id)
    return { id: chapter.id, title: chapter.title, expectedDuration: chapter.videoDuration || 0,
      status: progress?.completedAt ? "done" : progress ? "in_progress" : "not_started",
      timeSpent: progress?.timeSpentSeconds || 0, sessionCount: progress?.sessionCount || 0,
      completedAt: progress?.completedAt || null }
  })
  const completedChapters = chapters.filter((chapter) => chapter.status === "done").length
  const percent = chapters.length ? Math.round(completedChapters / chapters.length * 100) : 0
  const timeSpent = chapters.reduce((sum, chapter) => sum + chapter.timeSpent, 0)
  const expectedDuration = chapters.reduce((sum, chapter) => sum + chapter.expectedDuration, 0)
  const activities = rows.flatMap((row) => [row.lastAccessedAt, row.completedAt].filter((date): date is Date => date !== null))
  const lastActivity = activities.length ? new Date(Math.max(...activities.map((date) => date.getTime()))) : null
  return { hasElearning: true, percent, progressPercent: percent, completedChapters, totalChapters: chapters.length,
    totalTime: timeSpent, totalExpected: expectedDuration, lastActivity,
    formations: [{ id: enrollment.formation.id, title: enrollment.formation.title, startedAt: enrollment.startedAt,
      expiresAt: enrollment.expiresAt, completedChapters, totalChapters: chapters.length, percent, timeSpent,
      expectedDuration, chapters, quiz: await getFormationQuizResults(assignment.learnerId, enrollment.formation.id) }] }
}
