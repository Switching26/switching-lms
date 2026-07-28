import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { assessmentScopeWhere, getInternalPartnerId } from "@/lib/assessments"

/** Liste des évaluations visibles par l'administrateur connecté. */
export async function GET() {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const assessments = await prisma.assessment.findMany({
    where: await assessmentScopeWhere(role, session.user.partnerId),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      isPublished: true,
      createdAt: true,
      partner: { select: { name: true } },
      _count: { select: { questions: true, invitations: true } },
      invitations: { where: { submittedAt: { not: null } }, select: { id: true } },
    },
  })

  return NextResponse.json(
    assessments.map(({ invitations, ...a }) => ({ ...a, submittedCount: invitations.length }))
  )
}

/** Création d'une évaluation. */
export async function POST(req: NextRequest) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const title = String(body?.title || "").trim()
  if (!title) return NextResponse.json({ error: "Titre requis" }, { status: 400 })

  // Un admin partenaire ne peut créer que pour SON organisme : le partnerId
  // reçu du client est ignoré.
  //
  // Super-admin : il choisit librement, mais sans choix explicite le contenu
  // revient à l'organisme interne (Switching). Un contenu sans propriétaire
  // n'apparaîtrait nulle part côté Switching et s'afficherait au candidat sans
  // la marque. `partnerId: null` reste possible en l'envoyant explicitement.
  const partnerId =
    role === "PARTNER_ADMIN"
      ? session.user.partnerId
      : body?.partnerId !== undefined
      ? body.partnerId || null
      : await getInternalPartnerId()

  const assessment = await prisma.assessment.create({
    data: {
      title,
      description: body?.description ? String(body.description) : null,
      type: body?.type === "EVALUATION" ? "EVALUATION" : "POSITIONNEMENT",
      partnerId,
      showScore: body?.showScore !== false,
      showCorrectAnswers: body?.showCorrectAnswers !== false,
      passingScore: body?.passingScore != null ? Number(body.passingScore) : null,
      timeLimitMinutes: body?.timeLimitMinutes != null ? Number(body.timeLimitMinutes) : null,
      validityDays: body?.validityDays != null ? Number(body.validityDays) : 30,
    },
  })

  return NextResponse.json(assessment, { status: 201 })
}
