import { NextResponse } from "next/server"
import { randomBytes, timingSafeEqual } from "crypto"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { encryptVisiblePassword, decryptVisiblePassword } from "@/lib/visible-password"
import { getBaseUrl } from "@/lib/get-base-url"
import { notifyTrainerNewStudent } from "@/lib/trainer/new-student-mail"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
const headers = { "Cache-Control": "no-store" }
class InputError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

function text(value: unknown, field: string, required = false): string | null {
  if (value == null && !required) return null
  if (typeof value !== "string" || value.length > 500 || (required && !value.trim())) throw new InputError(`Champ invalide : ${field}`)
  return value.trim() || null
}
function date(value: unknown, field: string, required = false): Date | null {
  const raw = text(value, field, required)
  if (!raw) return null
  // ISO uniquement : pas de date ambiguë JJ/MM interprétée par le serveur.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(raw)) throw new InputError(`Date ISO requise : ${field}`)
  const day = new Date(`${raw.slice(0, 10)}T00:00:00Z`)
  const result = new Date(raw)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== raw.slice(0, 10) || !Number.isFinite(result.getTime())) {
    throw new InputError(`Date invalide : ${field}`)
  }
  return result
}

export async function POST(req: Request) {
  const expected = process.env.CRM_TRAINER_ASSIGNMENTS_SECRET?.trim() || ""
  const received = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ""
  if (!expected) return NextResponse.json({ error: "Connexion CRM non configurée" }, { status: 503, headers })
  if (!received || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 401, headers })
  }
  try {
    const body = await req.json().catch(() => { throw new InputError("JSON invalide") })
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Demande invalide")
    if (!Number.isSafeInteger(body.crmBeneficiaireId) || body.crmBeneficiaireId <= 0 || body.crmBeneficiaireId > 2147483647) throw new InputError("Identifiant CRM invalide")
    if (typeof body.hasElearning !== "boolean") throw new InputError("Modalité hasElearning requise")
    if (body.visioHours != null && (!Number.isInteger(body.visioHours) || body.visioHours <= 0 || body.visioHours > 10000)) throw new InputError("Durée des visios invalide")
    const trainerId = text(body.trainerId, "trainerId", true)!
    const email = text(body.email, "email", true)!.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError("Email invalide")
    const adminStartAt = date(body.adminStartAt, "adminStartAt", true)!
    const adminEndAt = date(body.adminEndAt, "adminEndAt")
    const visioStartAt = date(body.visioStartAt, "visioStartAt", body.hasElearning)
    if (adminEndAt && adminEndAt < adminStartAt) throw new InputError("La fin précède le début administratif")
    const formationId = text(body.formationId, "formationId", body.hasElearning)
    const data = {
      crmBeneficiaireId: body.crmBeneficiaireId as number, trainerId, email,
      firstName: text(body.firstName, "firstName", true)!, lastName: text(body.lastName, "lastName", true)!,
      formationLabel: text(body.formationLabel, "formationLabel", true)!,
      phone: text(body.phone, "phone"), civility: text(body.civility, "civility"),
      visioHours: body.visioHours ?? null, hasElearning: body.hasElearning as boolean,
      adminStartAt, adminEndAt, visioStartAt,
    }
    const result = await prisma.$transaction(async (tx) => {
      // Sérialise les appels d'un même bénéficiaire, y compris les créations concurrentes.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-trainer:${data.crmBeneficiaireId}`}))::text`
      const existing = await tx.trainerAssignment.findUnique({ where: { crmBeneficiaireId: data.crmBeneficiaireId },
        include: { learner: true, enrollment: true } })
      if (existing) {
        if (existing.trainerId !== trainerId || existing.email.toLowerCase() !== email || existing.hasElearning !== data.hasElearning ||
          (data.hasElearning && (!existing.learnerId || !existing.enrollmentId || existing.enrollment?.formationId !== formationId))) {
          throw new InputError("Ce bénéficiaire possède déjà une attribution différente", 409)
        }
        return { assignment: existing, created: false, password: decryptVisiblePassword(existing.learner?.visiblePasswordEncrypted) }
      }
      const switching = await tx.partner.findUnique({ where: { slug: "switching" } })
      const trainer = await tx.user.findUnique({ where: { id: trainerId } })
      if (!switching?.isInternal || !switching.isActive || !trainer || trainer.role !== "TRAINER" || !trainer.isActive || trainer.archivedAt || trainer.partnerId !== switching.id) {
        throw new InputError("Formatrice Switching introuvable")
      }
      let learnerId: string | null = null
      let enrollmentId: string | null = null
      let password: string | null = null
      if (data.hasElearning) {
        const formation = await tx.formation.findUnique({ where: { id: formationId! } })
        if (!formation || formation.deletedAt) throw new InputError("Formation introuvable")
        // Un email existant ne donne jamais accès à un compte tiers ni à son mot de passe.
        if (await tx.user.findUnique({ where: { email } })) throw new InputError("Cet email a déjà un compte LMS : rattachement à traiter par Switching", 409)
        password = randomBytes(18).toString("base64url")
        const learner = await tx.user.create({ data: { firstName: data.firstName, lastName: data.lastName, email,
          password: await hash(password, 12), visiblePasswordEncrypted: encryptVisiblePassword(password),
          role: "LEARNER", partnerId: switching.id, isActive: true } })
        learnerId = learner.id
        const expiresAt = new Date(adminStartAt)
        expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1)
        const enrollment = await tx.enrollment.create({ data: { userId: learner.id, formationId: formationId!,
          assignedByPartnerId: switching.id, startedAt: adminStartAt, expiresAt } })
        enrollmentId = enrollment.id
      }
      const assignment = await tx.trainerAssignment.create({ data: { ...data, learnerId, enrollmentId } })
      return { assignment, created: true, password }
    }, { maxWait: 10000, timeout: 20000 })
    let trainerNotified = false
    try { trainerNotified = await notifyTrainerNewStudent(result.assignment.id) } catch { /* Le replay retente un mail non confirmé. */ }
    const loginUrl = `${getBaseUrl()}/login?partner=switching`
    return NextResponse.json({ assignmentId: result.assignment.id, created: result.created,
      learnerId: result.assignment.learnerId, enrollmentId: result.assignment.enrollmentId, trainerNotified,
      ...(result.assignment.hasElearning ? { login: email, email, password: result.password, loginUrl } : {}) },
    { status: result.created ? 201 : 200, headers })
  } catch (error) {
    if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    if ((error as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Compte ou attribution déjà existant : rejouez la demande" }, { status: 409, headers })
    console.error("[CRM_TRAINER_ASSIGNMENT] Échec de création")
    return NextResponse.json({ error: "Création impossible" }, { status: 500, headers })
  }
}
