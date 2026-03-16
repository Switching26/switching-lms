import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { compare, hash } from "bcryptjs"

export async function PUT(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = (session.user as any).id
  const { currentPassword, newPassword } = await req.json()

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: "Mot de passe invalide (min 6 caractères)" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  const valid = await compare(currentPassword, user.password)
  if (!valid) return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 400 })

  const hashed = await hash(newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } })

  return NextResponse.json({ success: true })
}
