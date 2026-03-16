import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const lastChapter = await prisma.chapter.findFirst({
    where: { formationId: params.id },
    orderBy: { order: "desc" },
  })

  const chapter = await prisma.chapter.create({
    data: {
      formationId: params.id,
      title: "Nouveau chapitre",
      order: (lastChapter?.order ?? 0) + 1,
    },
    include: { attachments: true },
  })

  return NextResponse.json(chapter, { status: 201 })
}
