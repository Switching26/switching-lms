import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { upsertNote } from "@/lib/data/notes"

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = session.user.id
  const { chapterId, content } = await req.json()

  if (!chapterId) return NextResponse.json({ error: "chapterId requis" }, { status: 400 })

  const note = await upsertNote(userId, chapterId, content || "")
  return NextResponse.json(note)
}
