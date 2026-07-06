import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recomputeLicensesForFormations } from "@/lib/licenses"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = session.user.role
  const callerPartnerId = session.user.partnerId

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

  // Les inscriptions (attribution / retrait / dates) sont gérées par les routes
  // dédiées /api/user/[userId]/assign-formation (POST / DELETE / PATCH) — le
  // multi-formations rend l'ancien basculement mono-formation (deleteMany +
  // create) destructeur. Un éventuel body.formationId hérité est ignoré.

  // Re-fetch with updated enrollments
  const final = await prisma.user.findUnique({
    where: { id: params.id },
    include: { partner: true, enrollments: { include: { formation: true } } },
  })

  // Ne jamais renvoyer le hash de mot de passe au client.
  if (final) {
    const { password, ...safe } = final as Record<string, any>
    return NextResponse.json(safe)
  }
  return NextResponse.json(final)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: { enrollments: true },
  })
  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }

  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Impossible de supprimer un super admin" }, { status: 400 })
  }

  const removedFormationIds = target.enrollments.map((e) => e.formationId)

  await prisma.user.delete({ where: { id: params.id } })

  // Libérer les sièges de licence occupés par cet utilisateur.
  await recomputeLicensesForFormations(target.partnerId, removedFormationIds)

  return NextResponse.json({ success: true })
}
