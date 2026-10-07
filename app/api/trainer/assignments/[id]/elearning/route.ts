import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { hash } from "bcryptjs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { assertTrainerOwnsAssignment, requireTrainer, TrainerAccessError } from "@/lib/trainer/access"
import { encryptVisiblePassword } from "@/lib/visible-password"
import { sendElearningAddedMail } from "@/lib/trainer/elearning-added-mail"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
const headers = { "Cache-Control": "private, no-store" }
class BonusError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** Accounts, enrollment and the assignment link are committed together. Only
 * the request which created the access sends the mail, after commit. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new BonusError("Non autorisé", 401)
    if (session.user.realAdmin) throw new BonusError("Accès refusé pendant une visualisation", 403)
    if (session.user.role === "TRAINER") {
      const trainer = await requireTrainer()
      await assertTrainerOwnsAssignment(trainer.id, params.id)
    } else if (session.user.role === "SUPER_ADMIN") {
      const admin = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, isActive: true, archivedAt: true } })
      if (!admin || admin.role !== "SUPER_ADMIN" || !admin.isActive || admin.archivedAt) throw new BonusError("Accès refusé", 403)
    } else throw new BonusError("Accès réservé à la formatrice ou au super-admin", 403)

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`elearning-assignment:${params.id}`}))::text`
      const assignment = await tx.trainerAssignment.findUnique({ where: { id: params.id }, include: { learner: true, enrollment: true } })
      if (!assignment || (session.user.role === "TRAINER" && assignment.trainerId !== session.user.id)) throw new BonusError("Élève introuvable", 404)
      if (assignment.archivedAt) throw new BonusError("Cette attribution est archivée", 409)
      const partnerId = assignment.partnerId || assignment.learner?.partnerId || assignment.enrollment?.assignedByPartnerId
      if (!partnerId) throw new BonusError("L'organisme de cette attribution doit être renseigné par Switching", 409)
      const partner = await tx.partner.findUnique({ where: { id: partnerId } })
      const trainer = await tx.user.findUnique({ where: { id: assignment.trainerId }, select: { role: true, isActive: true, archivedAt: true } })
      const membership = await tx.trainerPartner.findUnique({ where: { trainerId_partnerId: { trainerId: assignment.trainerId, partnerId } } })
      if (!partner?.isActive || !trainer || trainer.role !== "TRAINER" || !trainer.isActive || trainer.archivedAt || !membership) throw new BonusError("Formatrice non rattachée à l'organisme de l'élève", 409)
      if (assignment.learnerId || assignment.enrollmentId) {
        if (!assignment.hasElearning || !assignment.learner || !assignment.enrollment || assignment.learner.role !== "LEARNER" ||
          assignment.learner.archivedAt || assignment.learner.partnerId !== partnerId || assignment.enrollment.userId !== assignment.learnerId) {
          throw new BonusError("Les liens e-learning de cette attribution doivent être vérifiés par Switching", 409)
        }
        return { created: false as const, assignmentId: assignment.id, learnerId: assignment.learnerId, enrollmentId: assignment.enrollmentId }
      }
      const formationId = process.env.SILAE_BONUS_FORMATION_ID?.trim()
      if (!formationId) throw new BonusError("Le bonus SILAE n'est pas configuré : renseigner SILAE_BONUS_FORMATION_ID", 503)
      const formation = await tx.formation.findUnique({ where: { id: formationId }, select: { isPublished: true, deletedAt: true } })
      if (!formation?.isPublished || formation.deletedAt) throw new BonusError("La formation bonus SILAE configurée est introuvable ou non publiée", 503)
      const email = assignment.email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BonusError("L'adresse email de l'élève doit être corrigée", 400)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`elearning-email:${email}`}))::text`
      if (await tx.user.findUnique({ where: { email } })) throw new BonusError("Cet élève a déjà un compte LMS : le rattachement doit être vérifié par Switching", 409)
      const password = randomBytes(18).toString("base64url")
      const learner = await tx.user.create({ data: { firstName: assignment.firstName, lastName: assignment.lastName, email,
        password: await hash(password, 12), visiblePasswordEncrypted: encryptVisiblePassword(password), role: "LEARNER", partnerId, isActive: true } })
      const expiresAt = new Date(assignment.adminStartAt)
      const month = expiresAt.getUTCMonth()
      expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1)
      if (expiresAt.getUTCMonth() !== month) expiresAt.setUTCDate(0)
      const enrollment = await tx.enrollment.create({ data: { userId: learner.id, formationId, assignedByPartnerId: partnerId, startedAt: assignment.adminStartAt, expiresAt } })
      await tx.trainerAssignment.update({ where: { id: assignment.id }, data: { learnerId: learner.id, enrollmentId: enrollment.id, hasElearning: true, partnerId } })
      return { created: true as const, assignmentId: assignment.id, learnerId: learner.id, enrollmentId: enrollment.id,
        mail: { learner: { id: learner.id, firstName: learner.firstName, email }, password, startedAt: assignment.adminStartAt, expiresAt, partner } }
    }, { maxWait: 10000, timeout: 20000 })

    let emailSent: boolean | null = null
    if (result.created) {
      try { emailSent = await sendElearningAddedMail(result.mail) } catch { emailSent = false }
    }
    return NextResponse.json({ created: result.created, hasElearning: true, assignmentId: result.assignmentId,
      learnerId: result.learnerId, enrollmentId: result.enrollmentId, emailSent,
      ...(emailSent === false ? { warning: "L'accès est créé, mais le mail n'a pas été envoyé. Switching doit transmettre les accès à l'élève." } : {}) }, { status: result.created ? 201 : 200, headers })
  } catch (error) {
    if (error instanceof BonusError || error instanceof TrainerAccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    if ((error as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Un compte existe déjà pour cet élève : le rattachement doit être vérifié par Switching" }, { status: 409, headers })
    console.error("[TRAINER_ELEARNING] Ajout impossible")
    return NextResponse.json({ error: "Impossible d'ajouter l'e-learning" }, { status: 500, headers })
  }
}
