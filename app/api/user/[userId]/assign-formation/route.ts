import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { formationAssignedEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"
import { getBaseUrl } from "@/lib/get-base-url"
import { hasAvailableSeat, recomputeLicenseSeats } from "@/lib/licenses"

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { formationId, startedAt, expiresAt } = await req.json()

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
  }

  // La formation doit exister (évite une erreur FK brute 500).
  const formationExists = await prisma.formation.findUnique({ where: { id: formationId }, select: { id: true } })
  if (!formationExists) {
    return NextResponse.json({ error: "Formation introuvable" }, { status: 404 })
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
  } catch (e: any) {
    // Course concurrente sur la contrainte unique (userId, formationId).
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Déjà inscrit à cette formation" }, { status: 400 })
    }
    throw e
  }

  // Recalculer le compteur de sièges à partir des inscriptions réelles.
  await recomputeLicenseSeats(user.partnerId, formationId)

  // Compte inactif (ex. migration RiseUp silencieuse) : ne JAMAIS notifier.
  // L'email d'attribution partira via le renvoi d'activation / la campagne.
  if (!user.isActive) {
    return NextResponse.json({ ...enrollment, emailSent: null, emailSkipped: "compte inactif — aucun email envoyé" }, { status: 201 })
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

  return NextResponse.json({ ...enrollment, emailSent }, { status: 201 })
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
