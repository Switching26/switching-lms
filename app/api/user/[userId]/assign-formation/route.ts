import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { formationAssignedEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"
import { getBaseUrl } from "@/lib/get-base-url"
import { canPartnerDistributeFormation, hasAvailableSeat, recomputeLicenseSeats } from "@/lib/licenses"
import { createTrainerAssignment, type CreateTrainerAssignmentInput } from "@/lib/trainer/assignments"
import { TrainerAccessError } from "@/lib/trainer/access"
import { notifyTrainerNewStudent } from "@/lib/trainer/new-student-mail"

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { formationId, startedAt, expiresAt, sendAutomaticEmails = true, trainer } = await req.json()
  if (typeof sendAutomaticEmails !== "boolean") {
    return NextResponse.json({ error: "Option de mails invalide" }, { status: 400 })
  }

  if (!formationId) {
    return NextResponse.json({ error: "Formation requise" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: params.userId }, include: { partner: true } })
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }

  // Ne pas inscrire (ni notifier) un compte archivé.
  if (user.archivedAt) {
    return NextResponse.json({ error: "Utilisateur archivé" }, { status: 400 })
  }

  // Partner admin scope check
  if (role === "PARTNER_ADMIN") {
    const adminPartnerId = session.user.partnerId
    if (user.partnerId !== adminPartnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
    // Cloisonnement du catalogue : sans licence ouverte par le super-admin,
    // l'organisme ne peut pas distribuer cette formation (elle ne lui est
    // même pas listée). Empêche un partenaire d'attribuer une formation
    // interne Switching via un appel API direct.
    const allowed = await canPartnerDistributeFormation(adminPartnerId, formationId)
    if (!allowed) {
      return NextResponse.json(
        { error: "Cette formation n'est pas disponible pour votre organisme" },
        { status: 403 }
      )
    }
  }

  // La formation doit exister (évite une erreur FK brute 500).
  const formationExists = await prisma.formation.findUnique({ where: { id: formationId }, select: { id: true } })
  if (!formationExists) {
    return NextResponse.json({ error: "Formation introuvable" }, { status: 404 })
  }

  let trainerInput: CreateTrainerAssignmentInput | undefined
  if (trainer != null) {
    if (role !== "SUPER_ADMIN" || user.role !== "LEARNER" || user.partner?.slug !== "switching" || !user.partner.isInternal) {
      return NextResponse.json({ error: "Attribution formatrice réservée aux apprenants Switching" }, { status: 403 })
    }
    const formatrice = typeof trainer.trainerId === "string" ? await prisma.user.findUnique({
      where: { id: trainer.trainerId }, include: { partner: true },
    }) : null
    if (!formatrice || formatrice.role !== "TRAINER" || !formatrice.isActive || formatrice.archivedAt ||
      formatrice.partner?.slug !== "switching" || !formatrice.partner.isInternal) {
      return NextResponse.json({ error: "Formatrice Switching introuvable" }, { status: 400 })
    }
    const start = new Date(startedAt)
    const end = trainer.adminEndAt ? new Date(trainer.adminEndAt) : null
    const visio = trainer.visioStartAt ? new Date(trainer.visioStartAt) : null
    if (!startedAt || !Number.isFinite(start.getTime()) || !visio || !Number.isFinite(visio.getTime()) ||
      (end && (!Number.isFinite(end.getTime()) || end < start)) ||
      (trainer.visioHours != null && (!Number.isInteger(trainer.visioHours) || trainer.visioHours <= 0))) {
      return NextResponse.json({ error: "Dates administratives, début des visios ou durée invalides" }, { status: 400 })
    }
    trainerInput = { trainerId: formatrice.id, learnerId: user.id, firstName: user.firstName,
      lastName: user.lastName, email: user.email, phone: typeof trainer.phone === "string" ? trainer.phone : null,
      civility: typeof trainer.civility === "string" ? trainer.civility : null,
      formationLabel: trainer.formationLabel?.trim() || "", visioHours: trainer.visioHours ?? null,
      hasElearning: true, adminStartAt: start, adminEndAt: end, visioStartAt: visio }
  }

  // Check existing enrollment
  const existing = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId: params.userId, formationId } },
  })
  if (existing) {
    return NextResponse.json({ error: "Déjà inscrit à cette formation — aucun nouvel email n'a été envoyé" }, { status: 400 })
  }

  // Vérifier la disponibilité d'un siège de licence AVANT de créer l'inscription.
  if (user.partnerId) {
    const seatOk = await hasAvailableSeat(user.partnerId, formationId)
    if (!seatOk) {
      return NextResponse.json({ error: "Plus de licences disponibles" }, { status: 400 })
    }
  }

  let enrollment
  let assignmentId: string | undefined
  try {
    enrollment = await prisma.enrollment.create({
      data: {
        userId: params.userId,
        formationId,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        assignedByPartnerId: user.partnerId || null,
      },
      include: { formation: true },
    })
    if (trainerInput) {
      const assignment = await createTrainerAssignment({ ...trainerInput, enrollmentId: enrollment.id,
        formationLabel: trainerInput.formationLabel || enrollment.formation.title })
      assignmentId = assignment.id
    }
  } catch (e: any) {
    if (enrollment) await prisma.enrollment.delete({ where: { id: enrollment.id } })
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    // Course concurrente sur la contrainte unique (userId, formationId).
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Déjà inscrit à cette formation" }, { status: 400 })
    }
    throw e
  }

  // Recalculer le compteur de sièges à partir des inscriptions réelles.
  await recomputeLicenseSeats(user.partnerId, formationId)

  let trainerEmailSent: boolean | undefined
  if (assignmentId && sendAutomaticEmails) {
    try { trainerEmailSent = await notifyTrainerNewStudent(assignmentId) } catch { trainerEmailSent = false }
  }
  const trainerResult = assignmentId ? { trainerAssignmentId: assignmentId, trainerEmailSent } : {}
  if (!sendAutomaticEmails) {
    return NextResponse.json({ ...enrollment, ...trainerResult, emailSent: null,
      emailSkipped: "mails automatiques désactivés" }, { status: 201 })
  }

  // Compte inactif (ex. migration RiseUp silencieuse) : ne JAMAIS notifier.
  // L'email d'attribution partira via le renvoi d'activation / la campagne.
  if (!user.isActive) {
    return NextResponse.json({ ...enrollment, ...trainerResult, emailSent: null, emailSkipped: "compte inactif — aucun email envoyé" }, { status: 201 })
  }

  let emailSent = false

  // Send formation assigned email
  try {
    const baseUrl = getBaseUrl()
    const loginUrl = user.partner?.slug ? `${baseUrl}/login?partner=${user.partner.slug}` : `${baseUrl}/login`
    const dynamic = await resolveTemplate("FORMATION_ASSIGNED", user.partnerId)
    if (dynamic) {
      const vars = {
        prenom: user.firstName,
        nom: user.lastName,
        email: user.email,
        formation_titre: enrollment.formation.title,
        formation_description: enrollment.formation.description || "",
        date_expiration: expiresAt ? new Date(expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "",
        lien_connexion: loginUrl,
        plateforme_nom: user.partner?.name || "Switching Formation",
        plateforme_url: loginUrl,
        partenaire_nom: user.partner?.name || "",
        couleur_principale: user.partner?.primaryColor || "#111111",
        couleur_secondaire: user.partner?.secondaryColor || "#F5F5F7",
        logo_url: user.partner?.logoUrl ? (user.partner.logoUrl.startsWith("http") ? user.partner.logoUrl : `${baseUrl}${user.partner.logoUrl.startsWith("/") ? "" : "/"}${user.partner.logoUrl}`) : "",
      }
      const subject = replaceVariables(dynamic.subject, vars)
      const html = replaceVariables(dynamic.htmlContent, vars)
      emailSent = await sendEmail(user.email, subject, html, user.id, "FORMATION_ASSIGNED", user.partner)
    } else {
      const emailData = formationAssignedEmail(user.firstName, enrollment.formation.title, expiresAt || null, user.partner)
      emailSent = await sendEmail(user.email, emailData.subject, emailData.html, user.id, "FORMATION_ASSIGNED", user.partner)
    }
  } catch {
    // Never block enrollment if email fails
  }

  return NextResponse.json({ ...enrollment, ...trainerResult, emailSent }, { status: 201 })
}

// Garde commune DELETE/PATCH : session admin + scope partenaire + enrollment existant.
async function resolveEnrollment(req: NextRequest, userId: string) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  let body: any
  try { body = await req.json() } catch { body = {} }
  if (!body?.formationId) {
    return { error: NextResponse.json({ error: "Formation requise" }, { status: 400 }) }
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { error: NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 }) }
  if (role === "PARTNER_ADMIN" && user.partnerId !== session.user.partnerId) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId, formationId: body.formationId } },
  })
  if (!enrollment) {
    return { error: NextResponse.json({ error: "Cet utilisateur n'est pas inscrit à cette formation" }, { status: 404 }) }
  }
  return { user, enrollment, body }
}

// Retirer une formation attribuée (la progression est conservée en base).
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const resolved = await resolveEnrollment(req, params.userId)
  if ("error" in resolved) return resolved.error
  const { user, enrollment } = resolved

  await prisma.enrollment.delete({ where: { id: enrollment.id } })
  await recomputeLicenseSeats(user.partnerId, enrollment.formationId)

  return NextResponse.json({ success: true })
}

// Modifier les dates d'accès (début / fin) d'une formation attribuée.
// expiresAt vide/null explicite → accès illimité.
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const resolved = await resolveEnrollment(req, params.userId)
  if ("error" in resolved) return resolved.error
  const { enrollment, body } = resolved

  const startedAt = body.startedAt !== undefined
    ? (body.startedAt ? new Date(body.startedAt) : enrollment.startedAt)
    : undefined
  const expiresAt = body.expiresAt !== undefined
    ? (body.expiresAt ? new Date(body.expiresAt) : null)
    : undefined
  if (startedAt instanceof Date && isNaN(startedAt.getTime())) {
    return NextResponse.json({ error: "Date de début invalide" }, { status: 400 })
  }
  if (expiresAt instanceof Date && isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: "Date de fin invalide" }, { status: 400 })
  }

  const updated = await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      ...(startedAt !== undefined ? { startedAt } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    },
  })
  return NextResponse.json(updated)
}
