import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  let sectionId: string | null = null
  try {
    const body = await req.json()
    sectionId = body.sectionId || null
  } catch {}

  const lastChapter = await prisma.chapter.findFirst({
    where: { formationId: params.id },
    orderBy: { order: "desc" },
  })

  const chapter = await prisma.chapter.create({
    data: {
      formationId: params.id,
      title: "Nouveau chapitre",
      order: (lastChapter?.order ?? 0) + 1,
      sectionId,
    },
    include: { attachments: true },
  })

  return NextResponse.json(chapter, { status: 201 })
}
