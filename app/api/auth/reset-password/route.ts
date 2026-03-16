import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import { verifyToken, markTokenUsed } from "@/lib/tokens"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const { token, password } = await req.json()

  if (!token || !password || password.length < 6) {
    return NextResponse.json({ error: "Mot de passe requis (6 caractères minimum)" }, { status: 400 })
  }

  const result = await verifyToken(token, "RESET")

  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const hashed = await hash(password, 12)

  await prisma.user.update({
    where: { id: result.record.userId },
    data: { password: hashed },
  })

  await markTokenUsed(token)

  return NextResponse.json({ success: true })
}
