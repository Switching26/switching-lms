import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { canTrainerSeeLearner, requireTrainer, TrainerAccessError } from "@/lib/trainer/access"

export interface MessageIdentity { id: string; role: string; partnerId?: string | null }

export async function allowedLearners(trainerId: string): Promise<string[]> {
  const assignments = await prisma.trainerAssignment.findMany({
    where: { trainerId, hasElearning: true, archivedAt: null, learnerId: { not: null }, enrollmentId: { not: null },
      trainer: { role: "TRAINER", isActive: true, archivedAt: null,
        OR: [{ partnerId: null }, { partner: { isInternal: true } }] },
      learner: { role: "LEARNER", archivedAt: null,
        OR: [{ partnerId: null }, { partner: { isInternal: true } }] } },
    select: { learnerId: true },
  })
  return Array.from(new Set(assignments.map(a => a.learnerId!)))
}

export async function conversationWhere(user: MessageIdentity): Promise<Prisma.ConversationWhereInput> {
  if (user.role === "TRAINER") {
    await requireTrainer()
    return { adminId: user.id, learnerId: { in: await allowedLearners(user.id) } }
  }
  if (user.role !== "LEARNER") return { adminId: user.id }
  const assignments = await prisma.trainerAssignment.findMany({ where: { learnerId: user.id }, select: { trainerId: true } })
  const allowed: string[] = []
  for (const a of assignments) if (await canTrainerSeeLearner(a.trainerId, user.id)) allowed.push(a.trainerId)
  return { learnerId: user.id, OR: [{ admin: { role: { not: "TRAINER" } } }, { adminId: { in: allowed } }] }
}

export async function checkedConversation(user: MessageIdentity, id: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id }, include: {
    learner: { include: { partner: true } }, admin: true,
  } })
  if (!conversation) throw new TrainerAccessError("Conversation introuvable", 404)
  if (conversation.learnerId !== user.id && conversation.adminId !== user.id) {
    throw new TrainerAccessError("Accès refusé", 403)
  }
  if (user.role === "TRAINER") await requireTrainer()
  if ((conversation.admin.role === "TRAINER" || user.role === "TRAINER") &&
    !await canTrainerSeeLearner(conversation.adminId, conversation.learnerId)) {
    throw new TrainerAccessError("Accès refusé", 403)
  }
  return conversation
}

export async function ensureConversation(user: MessageIdentity, target: { trainerId?: string; learnerId?: string } = {}) {
  let adminId: string | undefined
  let learnerId = user.id
  if (user.role === "TRAINER") {
    await requireTrainer()
    if (!target.learnerId || !await canTrainerSeeLearner(user.id, target.learnerId)) {
      throw new TrainerAccessError("Élève introuvable", 404)
    }
    learnerId = target.learnerId
    adminId = user.id
  } else if (user.role === "LEARNER") {
    if (target.trainerId) {
      if (!await canTrainerSeeLearner(target.trainerId, user.id)) throw new TrainerAccessError("Accès refusé", 403)
      adminId = target.trainerId
    } else {
      if (user.partnerId) adminId = (await prisma.user.findFirst({ where: {
        partnerId: user.partnerId, role: "PARTNER_ADMIN", isActive: true, archivedAt: null,
      } }))?.id
      if (!adminId) adminId = (await prisma.user.findFirst({ where: {
        role: "SUPER_ADMIN", isActive: true, archivedAt: null,
      } }))?.id
    }
  } else throw new TrainerAccessError("Seuls les apprenants peuvent initier une conversation", 403)
  if (!adminId) throw new TrainerAccessError("Aucun administrateur disponible", 404)
  return prisma.conversation.upsert({ where: { learnerId_adminId: { learnerId, adminId } },
    create: { learnerId, adminId,
      ...((user.role === "TRAINER" || target.trainerId) ? { isReadAdmin: true, isReadLearner: true } : {}) }, update: {} })
}
