import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getUserById, updateUser } from "@/lib/data/users"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const user = await getUserById(session.user.id)
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })
  return NextResponse.json({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = session.user.id
  const { firstName, lastName, email } = await req.json()

  const user = await updateUser(userId, { firstName, lastName, email })
  const { password, visiblePasswordEncrypted, ...safeUser } = user as Record<string, any>
  return NextResponse.json({ success: true, user: safeUser })
}
