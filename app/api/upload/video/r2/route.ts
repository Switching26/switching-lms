import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getR2Config, r2Client } from "@/lib/video/r2"
import { VIDEO_MAX_BYTES, VIDEO_PART_BYTES } from "@/lib/video/hls"

export const dynamic = "force-dynamic"
export async function POST(req: Request) {
  const session = await auth()
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const { chapterId, fileName, fileSize } = await req.json()
  if (typeof chapterId !== "string" || typeof fileName !== "string" || fileName.length > 255 || !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > VIDEO_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier invalide (5 Go maximum)" }, { status: 400 })
  }
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } })
  if (!chapter) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 })
  try {
    const config = await getR2Config()
    const client = r2Client(config)
    const id = randomUUID()
    const sourceKey = `sources/${id}/original`
    const multipart = await client.send(new CreateMultipartUploadCommand({ Bucket: config.bucket, Key: sourceKey, ContentType: "application/octet-stream" }))
    if (!multipart.UploadId) throw new Error("Dépôt non créé")
    await prisma.videoJob.create({ data: { id, chapterId, createdBy: session.user.id, fileName, fileSize: BigInt(fileSize), sourceKey, multipartId: multipart.UploadId } })
    return NextResponse.json({ id, partSize: VIDEO_PART_BYTES }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Stockage vidéo indisponible : vérifier les réglages R2" }, { status: 503 })
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const chapterId = new URL(req.url).searchParams.get("chapterId") || ""
  const job = await prisma.videoJob.findFirst({ where: { chapterId }, orderBy: { createdAt: "desc" } })
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { videoR2Key: true } })
  return NextResponse.json(job ? { id: job.id, status: job.status, hlsKey: job.hlsKey, duration: job.duration, error: job.error, activeKey: chapter?.videoR2Key || null } : null, { headers: { "Cache-Control": "no-store" } })
}
