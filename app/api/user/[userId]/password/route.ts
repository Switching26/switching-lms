import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import { validatePassword } from "@/lib/validate-password"
import { encryptVisiblePassword } from "@/lib/visible-password"

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { newPassword } = await req.json()

  const pwCheck = validatePassword(newPassword)
  if (!pwCheck.valid) {
    return NextResponse.json({ error: pwCheck.error }, { status: 400 })
  }

  // Partner admin can only change passwords for their own org
  if (role === "PARTNER_ADMIN") {
    const user = await prisma.user.findUnique({ where: { id: params.userId } })
    if (!user || user.partnerId !== session.user.partnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
  }

  const hashed = await hash(newPassword, 12)
  await prisma.user.update({
    where: { id: params.userId },
    data: { password: hashed, visiblePasswordEncrypted: encryptVisiblePassword(newPassword) },
  })

  return NextResponse.json({ success: true })
}
