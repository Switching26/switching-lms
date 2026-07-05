import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateUser } from "@/lib/data/users"

export async function PUT(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = session.user.id
  const { firstName, lastName, email } = await req.json()

  const user = await updateUser(userId, { firstName, lastName, email })
  const { password, ...safeUser } = user as Record<string, any>
  return NextResponse.json({ success: true, user: safeUser })
}
