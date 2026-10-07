import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { canTrainerSeeLearner, requireTrainer, TrainerAccessError } from "@/lib/trainer/access"

export interface MessageIdentity { id: string; role: string; partnerId?: string | null }

/** Role and partner can change while an existing session is still valid. */
export async function currentMessageIdentity(user: MessageIdentity) {
  const current = await prisma.user.findUnique({ where: { id: user.id },
    select: { id: true, role: true, partnerId: true } })
  if (!current) throw new TrainerAccessError("Non autorisé", 401)
  return current
}

export async function allowedLearners(trainerId: string): Promise<string[]> {
  const assignments = await prisma.trainerAssignment.findMany({
    where: { trainerId, hasElearning: true, archivedAt: null,
      learnerId: { not: null }, enrollmentId: { not: null } },
    select: { learnerId: true },
  })
  const allowed: string[] = []
  for (const learnerId of Array.from(new Set(assignments.map(a => a.learnerId!)))) {
    if (await canTrainerSeeLearner(trainerId, learnerId)) allowed.push(learnerId)
  }
  return allowed
}

export async function conversationWhere(identity: MessageIdentity): Promise<Prisma.ConversationWhereInput> {
  const user = await currentMessageIdentity(identity)
  if (user.role === "TRAINER") {
    await requireTrainer()
    return { adminId: user.id, learnerId: { in: await allowedLearners(user.id) } }
  }
  // Preserve the super-admin's existing scope, including all learner partners.
  if (user.role === "SUPER_ADMIN") return { adminId: user.id }
  if (user.role === "PARTNER_ADMIN") return user.partnerId
    ? { adminId: user.id, learner: { role: "LEARNER", partnerId: user.partnerId } }
    : { adminId: user.id, learnerId: { in: [] } }
  if (user.role !== "LEARNER") throw new TrainerAccessError("Accès refusé", 403)
  const assignments = await prisma.trainerAssignment.findMany({ where: { learnerId: user.id }, select: { trainerId: true } })
  const allowed: string[] = []
  for (const a of assignments) if (await canTrainerSeeLearner(a.trainerId, user.id)) allowed.push(a.trainerId)
  return { learnerId: user.id, OR: [
    { admin: { role: "SUPER_ADMIN" } },
    ...(user.partnerId ? [{ admin: { role: "PARTNER_ADMIN" as const, partnerId: user.partnerId } }] : []),
    { admin: { role: "TRAINER" }, adminId: { in: allowed } },
  ] }
}

export async function checkedConversation(user: MessageIdentity, id: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id }, include: {
    learner: { include: { partner: true } }, admin: true,
  } })
  if (!conversation) throw new TrainerAccessError("Conversation introuvable", 404)
  if (conversation.learnerId !== user.id && conversation.adminId !== user.id) {
    throw new TrainerAccessError("Accès refusé", 403)
  }
  const isLearner = conversation.learnerId === user.id
  const current = isLearner ? conversation.learner : conversation.admin
  if (isLearner && current.role !== "LEARNER") throw new TrainerAccessError("Accès refusé", 403)
  if (current.role === "TRAINER") await requireTrainer()
  // The included users are freshly loaded; an old adminId grants no rights by itself.
  if (conversation.admin.role === "SUPER_ADMIN") return conversation
  if (conversation.learner.role === "LEARNER") {
    if (conversation.admin.role === "PARTNER_ADMIN" && conversation.admin.partnerId &&
      conversation.admin.partnerId === conversation.learner.partnerId) return conversation
    if (conversation.admin.role === "TRAINER" &&
      await canTrainerSeeLearner(conversation.adminId, conversation.learnerId)) return conversation
  }
  throw new TrainerAccessError("Accès refusé", 403)
}

export async function ensureConversation(identity: MessageIdentity, target: { trainerId?: string; learnerId?: string } = {}) {
  const user = await currentMessageIdentity(identity)
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
