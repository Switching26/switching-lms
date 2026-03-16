import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"

export async function POST(req: Request) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { firstName, lastName, email, password, userRole, partnerId } = await req.json()

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "Tous les champs sont requis" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "Cet email existe déjà" }, { status: 400 })
  }

  // Partner admin can only create learners in their own org
  if (role === "PARTNER_ADMIN") {
    const adminPartnerId = (session.user as any).partnerId
    if (userRole !== "LEARNER" || partnerId !== adminPartnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
  }

  const hashed = await hash(password, 12)

  const user = await prisma.user.create({
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      role: userRole || "LEARNER",
      partnerId: partnerId || null,
    },
    include: { partner: true },
  })

  return NextResponse.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    partnerId: user.partnerId,
    partner: user.partner,
  }, { status: 201 })
}
