import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { formationAssignedEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { formationId, expiresAt } = await req.json()

  if (!formationId) {
    return NextResponse.json({ error: "Formation requise" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: params.userId }, include: { partner: true } })
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }

  // Partner admin scope check
  if (role === "PARTNER_ADMIN") {
    const adminPartnerId = (session.user as any).partnerId
    if (user.partnerId !== adminPartnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
  }

  // Check existing enrollment
  const existing = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId: params.userId, formationId } },
  })
  if (existing) {
    return NextResponse.json({ error: "Déjà inscrit à cette formation" }, { status: 400 })
  }

  // If user has a partner, deduct a license
  if (user.partnerId) {
    const license = await prisma.license.findUnique({
      where: { partnerId_formationId: { partnerId: user.partnerId, formationId } },
    })
    if (license) {
      if (license.usedSeats >= license.totalSeats) {
        return NextResponse.json({ error: "Plus de licences disponibles" }, { status: 400 })
      }
      await prisma.license.update({
        where: { id: license.id },
        data: { usedSeats: { increment: 1 } },
      })
    }
  }

  const enrollment = await prisma.enrollment.create({
    data: {
      userId: params.userId,
      formationId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      assignedByPartnerId: user.partnerId || null,
    },
    include: { formation: true },
  })

  // Send formation assigned email (non-blocking)
  try {
    const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://app.switching.fr"
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
        logo_url: user.partner?.logoUrl || "",
      }
      const subject = replaceVariables(dynamic.subject, vars)
      const html = replaceVariables(dynamic.htmlContent, vars)
      sendEmail(user.email, subject, html, user.id, "FORMATION_ASSIGNED", user.partner)
    } else {
      const emailData = formationAssignedEmail(user.firstName, enrollment.formation.title, expiresAt || null, user.partner)
      sendEmail(user.email, emailData.subject, emailData.html, user.id, "FORMATION_ASSIGNED", user.partner)
    }
  } catch {
    // Never block enrollment if email fails
  }

  return NextResponse.json(enrollment, { status: 201 })
}
