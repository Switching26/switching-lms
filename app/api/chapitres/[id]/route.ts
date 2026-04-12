import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { title, description, content, videoUrl, videoDuration, isPublished, order, sectionId } = await req.json()

  const chapter = await prisma.chapter.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description || null }),
      ...(content !== undefined && { content: content || null }),
      ...(videoUrl !== undefined && { videoUrl: videoUrl || null }),
      ...(videoDuration !== undefined && { videoDuration: videoDuration || 0 }),
      ...(isPublished !== undefined && { isPublished }),
      ...(order !== undefined && { order }),
      ...(sectionId !== undefined && { sectionId: sectionId || null }),
    },
    include: { attachments: true },
  })

  return NextResponse.json(chapter)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  await prisma.chapter.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
