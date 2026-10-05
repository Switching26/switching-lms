import { NextResponse } from "next/server"
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, UploadPartCommand, ListPartsCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getR2Config, r2Client } from "@/lib/video/r2"
import { VIDEO_PART_BYTES } from "@/lib/video/hls"

export const dynamic = "force-dynamic"
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  const session = await auth()
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const job = await prisma.videoJob.findUnique({ where: { id: params.jobId } })
  if (!job) return NextResponse.json({ error: "Dépôt introuvable" }, { status: 404 })
  const body = await req.json()
  try {
    const config = await getR2Config()
    const client = r2Client(config)
    const base = { Bucket: config.bucket, Key: job.sourceKey, UploadId: job.multipartId }
    if (body.action === "cancel") {
      if (job.status === "UPLOADING") {
        try { await client.send(new AbortMultipartUploadCommand(base)) }
        catch (error) { if (!(error instanceof Error) || error.name !== "NoSuchUpload") throw error }
      }
      const result = await prisma.videoJob.updateMany({ where: { id: job.id, status: { in: ["UPLOADING", "QUEUED", "PROCESSING", "FAILED"] } }, data: { status: "CANCELLED", leaseToken: null, leaseUntil: null } })
      return NextResponse.json({ cancelled: Boolean(result.count) })
    }
    if (job.status !== "UPLOADING") return NextResponse.json({ error: "Dépôt déjà finalisé" }, { status: 409 })
    const count = Math.ceil(Number(job.fileSize) / VIDEO_PART_BYTES)
    if (body.action === "part") {
      if (!Number.isInteger(body.partNumber) || body.partNumber < 1 || body.partNumber > count) return NextResponse.json({ error: "Partie invalide" }, { status: 400 })
      const url = await getSignedUrl(client, new UploadPartCommand({ ...base, PartNumber: body.partNumber }), { expiresIn: 3600 })
      return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } })
    }
    if (body.action === "complete") {
      const listed = await client.send(new ListPartsCommand(base))
      const parts = listed.Parts || []
      const size = parts.reduce((sum, part) => sum + (part.Size || 0), 0)
      if (listed.IsTruncated || parts.length !== count || size !== Number(job.fileSize) || parts.some((part, i) => part.PartNumber !== i + 1 || !part.ETag || (i < parts.length - 1 && part.Size !== VIDEO_PART_BYTES))) {
        return NextResponse.json({ error: "Dépôt incomplet : taille ou parties incorrectes" }, { status: 400 })
      }
      await client.send(new CompleteMultipartUploadCommand({ ...base, MultipartUpload: { Parts: parts.map(part => ({ ETag: part.ETag, PartNumber: part.PartNumber })) } }))
      await prisma.videoJob.updateMany({ where: { id: job.id, status: "UPLOADING" }, data: { status: "QUEUED" } })
      return NextResponse.json({ status: "QUEUED" })
    }
    return NextResponse.json({ error: "Action invalide" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Échec du dépôt vidéo" }, { status: 503 })
  }
}
