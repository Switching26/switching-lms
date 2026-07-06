import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { upsertNote } from "@/lib/data/notes"

const MAX_NOTE_LENGTH = 20000

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const userId = session.user.id
  let body: { chapterId?: string; content?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const { chapterId, content } = body

  if (!chapterId) return NextResponse.json({ error: "chapterId requis" }, { status: 400 })
  if (content !== undefined && typeof content !== "string") {
    return NextResponse.json({ error: "content invalide" }, { status: 400 })
  }
  if (typeof content === "string" && content.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: "Note trop longue" }, { status: 400 })
  }

  // La note doit porter sur un chapitre d'une formation à laquelle l'apprenant est inscrit
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { formationId: true },
  })
  if (!chapter) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 })

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId, formationId: chapter.formationId } },
    select: { id: true },
  })
  if (!enrollment) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  const note = await upsertNote(userId, chapterId, (content as string) || "")
  return NextResponse.json({ chapterId: note.chapterId, updatedAt: note.updatedAt })
}
