import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { newPassword } = await req.json()

  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: "Mot de passe invalide (min 6 caractères)" }, { status: 400 })
  }

  // Partner admin can only change passwords for their own org
  if (role === "PARTNER_ADMIN") {
    const user = await prisma.user.findUnique({ where: { id: params.userId } })
    if (!user || user.partnerId !== (session.user as any).partnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
  }

  const hashed = await hash(newPassword, 12)
  await prisma.user.update({ where: { id: params.userId }, data: { password: hashed } })

  return NextResponse.json({ success: true })
}
