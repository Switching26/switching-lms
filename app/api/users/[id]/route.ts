import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
        await prisma.enrollment.create({
          data: {
            userId: params.id,
            formationId: body.formationId,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            assignedByPartnerId: target.partnerId || null,
          },
        })
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
