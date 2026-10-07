import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { activeTrainerScope, trainerAssignmentScope } from "./partners"
export { trainerAssignmentScope, canTrainerSeeLearner } from "./partners"

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
  partnerIds: string[]
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
      trainerPartners: { where: { partner: { isActive: true } }, select: { partnerId: true } },
    },
  })
  if (!trainer || !trainer.isActive || trainer.archivedAt) {
    throw new TrainerAccessError("Non autorisé", 401)
  }
  if (trainer.role !== "TRAINER" || !trainer.trainerPartners.length) {
    throw new TrainerAccessError("Accès réservé aux formateurs rattachés à un organisme", 403)
  }
  return { id: trainer.id, role: "TRAINER", firstName: trainer.firstName,
    lastName: trainer.lastName, email: trainer.email, partnerId: trainer.partnerId,
    partnerIds: trainer.trainerPartners.map(row => row.partnerId) }
}

export async function assertActiveTrainer(trainerId: string, db: Prisma.TransactionClient = prisma): Promise<void> {
  if (!await db.user.findFirst({ where: { id: trainerId, ...activeTrainerScope }, select: { id: true } })) {
    throw new TrainerAccessError("Formatrice introuvable ou sans organisme", 403)
  }
}

/** Unknown, another trainer's or transferred students all return 404. */
export async function assertTrainerOwnsAssignment(trainerId: string, assignmentId: string) {
  const assignment = await prisma.trainerAssignment.findFirst({
    where: { ...trainerAssignmentScope(trainerId), id: assignmentId },
  })
  if (!assignment) throw new TrainerAccessError("Élève introuvable", 404)
  return assignment
}

/** Serialize agenda/contact changes per trainer, retry serialization conflicts. */
export async function withTrainerTransaction<T>(trainerId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${trainerId}))`
        await assertActiveTrainer(trainerId, tx)
        return work(tx)
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue
      throw error
    }
  }
}
