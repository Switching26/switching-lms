import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { formationAssignedEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  const callerPartnerId = (session.user as any).partnerId

  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: { enrollments: true },
  })
  if (!target) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  // Partner admin scope check
  if (role === "PARTNER_ADMIN" && target.partnerId !== callerPartnerId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Cannot modify super admins (except by themselves which shouldn't happen here)
  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Impossible de modifier un super admin" }, { status: 400 })
  }

  const body = await req.json()
  const data: any = {}

  // Fields both roles can update
  if (body.firstName !== undefined) data.firstName = body.firstName.trim()
  if (body.lastName !== undefined) data.lastName = body.lastName.trim()
  if (body.email !== undefined) {
    const normalizedEmail = body.email.trim().toLowerCase()
    if (normalizedEmail !== target.email) {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
      if (existing) return NextResponse.json({ error: "Cet email est déjà utilisé" }, { status: 400 })
      data.email = normalizedEmail
    }
  }
  if (body.isActive !== undefined) data.isActive = body.isActive

  // Reference (optional, unique if set)
  if (body.reference !== undefined) {
    const trimmedRef = body.reference?.trim() || null
    if (trimmedRef) {
      const existingRef = await prisma.user.findUnique({ where: { reference: trimmedRef } })
      if (existingRef && existingRef.id !== params.id) {
        return NextResponse.json({ error: "Cette référence est déjà utilisée" }, { status: 400 })
      }
    }
    data.reference = trimmedRef
  }

  // Super admin only fields
  if (role === "SUPER_ADMIN") {
    if (body.role !== undefined && (body.role === "LEARNER" || body.role === "PARTNER_ADMIN")) {
      data.role = body.role
    }
    if (body.partnerId !== undefined) {
      data.partnerId = body.partnerId || null
    }
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    include: { partner: true, enrollments: { include: { formation: true } } },
  })

  // Handle enrollment changes if provided
  if (body.formationId !== undefined) {
    if (body.formationId === null || body.formationId === "") {
      // Remove all enrollments
      await prisma.enrollment.deleteMany({ where: { userId: params.id } })
    } else {
      // Check if already enrolled in this formation
      const existingEnrollment = target.enrollments.find((e) => e.formationId === body.formationId)
      if (!existingEnrollment) {
        // Remove existing enrollments and create new one
        await prisma.enrollment.deleteMany({ where: { userId: params.id } })
        const newEnrollment = await prisma.enrollment.create({
          data: {
            userId: params.id,
            formationId: body.formationId,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            assignedByPartnerId: target.partnerId || null,
          },
          include: { formation: true },
        })

        // Send formation assigned email (non-blocking)
        try {
          const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://switching-lms-production.up.railway.app"
          const loginUrl = updated.partner?.slug ? `${baseUrl}/login?partner=${updated.partner.slug}` : `${baseUrl}/login`
          const dynamic = await resolveTemplate("FORMATION_ASSIGNED", target.partnerId)
          console.log("[EMAIL] Envoi formation attribuée à:", target.email)
          if (dynamic) {
            const vars = {
              prenom: target.firstName,
              nom: target.lastName,
              email: target.email,
              formation_titre: newEnrollment.formation.title,
              formation_description: newEnrollment.formation.description || "",
              date_expiration: body.expiresAt ? new Date(body.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "",
              lien_connexion: loginUrl,
              plateforme_nom: updated.partner?.name || "Switching Formation",
              plateforme_url: loginUrl,
              partenaire_nom: updated.partner?.name || "",
              couleur_principale: updated.partner?.primaryColor || "#111111",
              couleur_secondaire: updated.partner?.secondaryColor || "#F5F5F7",
              logo_url: updated.partner?.logoUrl ? (updated.partner.logoUrl.startsWith("http") ? updated.partner.logoUrl : `${baseUrl}${updated.partner.logoUrl.startsWith("/") ? "" : "/"}${updated.partner.logoUrl}`) : "",
            }
            const subject = replaceVariables(dynamic.subject, vars)
            const html = replaceVariables(dynamic.htmlContent, vars)
            sendEmail(target.email, subject, html, target.id, "FORMATION_ASSIGNED", updated.partner)
          } else {
            const emailData = formationAssignedEmail(target.firstName, newEnrollment.formation.title, body.expiresAt || null, updated.partner)
            sendEmail(target.email, emailData.subject, emailData.html, target.id, "FORMATION_ASSIGNED", updated.partner)
          }
        } catch {
          // Never block enrollment if email fails
        }
      } else if (body.expiresAt !== undefined) {
        // Update expiration on existing enrollment
        await prisma.enrollment.update({
          where: { id: existingEnrollment.id },
          data: { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null },
        })
      }
    }
  } else if (body.expiresAt !== undefined && target.enrollments.length > 0) {
    // Just update expiration on first enrollment
    await prisma.enrollment.update({
      where: { id: target.enrollments[0].id },
      data: { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null },
    })
  }

  // Re-fetch with updated enrollments
  const final = await prisma.user.findUnique({
    where: { id: params.id },
    include: { partner: true, enrollments: { include: { formation: true } } },
  })

  return NextResponse.json(final)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }

  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Impossible de supprimer un super admin" }, { status: 400 })
  }

  await prisma.user.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
