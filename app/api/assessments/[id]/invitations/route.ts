import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { assessmentInvitationEmail } from "@/lib/email-templates"
import { getBaseUrl } from "@/lib/get-base-url"
import { generateInvitationToken } from "@/lib/assessments"

async function guard(id: string) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  const assessment = await prisma.assessment.findFirst({
    where: { id, deletedAt: null },
    include: { partner: true },
  })
  if (!assessment) {
    return { error: NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 }) }
  }
  if (role === "PARTNER_ADMIN" && assessment.partnerId !== session.user.partnerId) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) }
  }
  return { session, role, assessment }
}

/**
 * Invite un candidat : génère un lien unique et, si demandé, envoie l'email.
 *
 * Deux usages :
 * - prospect SANS compte → email + nom saisis à la main ;
 * - apprenant existant   → `userId`, ses coordonnées sont reprises du compte.
 *
 * `sendMail: false` permet de récupérer le lien pour l'envoyer soi-même
 * (depuis le CRM par exemple) sans qu'aucun email ne parte du LMS.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ("error" in g) return g.error
  const { assessment, session } = g

  if (!assessment.isPublished) {
    return NextResponse.json(
      { error: "Publiez l'évaluation avant d'inviter des candidats" },
      { status: 400 }
    )
  }
  const questionCount = await prisma.assessmentQuestion.count({ where: { assessmentId: params.id } })
  if (questionCount === 0) {
    return NextResponse.json({ error: "Cette évaluation n'a aucune question" }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const sendMail = body?.sendMail !== false

  let email = String(body?.email || "").trim().toLowerCase()
  let firstName = body?.firstName ? String(body.firstName).trim() : null
  let lastName = body?.lastName ? String(body.lastName).trim() : null
  let userId: string | null = null

  if (body?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: String(body.userId) },
      select: { id: true, email: true, firstName: true, lastName: true, partnerId: true, archivedAt: true },
    })
    if (!user || user.archivedAt) {
      return NextResponse.json({ error: "Apprenant introuvable" }, { status: 404 })
    }
    // Un admin partenaire ne peut inviter que ses propres apprenants.
    if (g.role === "PARTNER_ADMIN" && user.partnerId !== session.user.partnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
    userId = user.id
    email = user.email
    firstName = user.firstName
    lastName = user.lastName
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 })
  }

  const expiresAt = new Date(Date.now() + (assessment.validityDays || 30) * 86400_000)

  const invitation = await prisma.assessmentInvitation.create({
    data: {
      assessmentId: params.id,
      token: generateInvitationToken(),
      candidateEmail: email,
      candidateFirstName: firstName,
      candidateLastName: lastName,
      userId,
      createdById: session.user.id,
      expiresAt,
    },
  })

  const url = `${getBaseUrl()}/evaluation/${invitation.token}`

  let emailSent: boolean | null = null
  if (sendMail) {
    try {
      const mail = assessmentInvitationEmail(
        firstName,
        assessment.title,
        url,
        assessment.type === "POSITIONNEMENT",
        expiresAt,
        assessment.partner
      )
      // userId null pour un prospect : l'envoi n'est pas journalisé dans
      // EmailLog (clé étrangère obligatoire), la trace reste `sentAt` ici.
      emailSent = await sendEmail(
        email, mail.subject, mail.html, userId, "ASSESSMENT_INVITATION", assessment.partner
      )
      if (emailSent) {
        await prisma.assessmentInvitation.update({
          where: { id: invitation.id },
          data: { sentAt: new Date() },
        })
      }
    } catch {
      emailSent = false
    }
  }

  return NextResponse.json({ ...invitation, url, emailSent }, { status: 201 })
}

/** Suppression d'une invitation (lien révoqué). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id)
  if ("error" in g) return g.error

  const body = await req.json().catch(() => ({}))
  if (!body?.invitationId) {
    return NextResponse.json({ error: "Invitation requise" }, { status: 400 })
  }
  const inv = await prisma.assessmentInvitation.findFirst({
    where: { id: String(body.invitationId), assessmentId: params.id },
  })
  if (!inv) return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 })

  await prisma.assessmentInvitation.delete({ where: { id: inv.id } })
  return NextResponse.json({ success: true })
}
