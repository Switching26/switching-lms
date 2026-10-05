import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { validMasterKey } from "@/lib/video/hls"
import { getR2Config, r2Client, loadPlaylist } from "@/lib/video/r2"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { title, description, content, videoR2Key, videoDuration, isPublished, order, sectionId } = await req.json()
  let readyDuration: number | undefined
  if (videoR2Key !== undefined && videoR2Key !== null) {
    if (!validMasterKey(videoR2Key)) return NextResponse.json({ error: "Clé vidéo invalide" }, { status: 400 })
    const current = await prisma.chapter.findUnique({ where: { id: params.id }, select: { videoR2Key: true } })
    if (current?.videoR2Key !== videoR2Key) {
      const ready = await prisma.videoJob.findFirst({ where: { chapterId: params.id, hlsKey: videoR2Key, status: "READY" } })
      if (!ready) return NextResponse.json({ error: "La conversion de ce chapitre doit être terminée" }, { status: 409 })
      if (!ready.duration || ready.duration <= 0) return NextResponse.json({ error: "Durée vidéo indisponible" }, { status: 409 })
      readyDuration = ready.duration
      try {
        const config = await getR2Config()
        await loadPlaylist(r2Client(config), config.bucket, videoR2Key)
      } catch { return NextResponse.json({ error: "Vidéo indisponible" }, { status: 503 }) }
    }
  }

  const chapter = await prisma.chapter.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description || null }),
      ...(content !== undefined && { content: content || null }),
      ...(videoR2Key !== undefined && { videoR2Key }),
      ...(videoR2Key === null
        ? { videoDuration: 0 }
        : readyDuration !== undefined
          ? { videoDuration: readyDuration }
          : videoDuration !== undefined && { videoDuration: videoDuration || 0 }),
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
