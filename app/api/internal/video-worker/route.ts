import { NextResponse } from "next/server"
import { randomUUID, timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { getR2Config, r2Client, loadPlaylist } from "@/lib/video/r2"
import { hlsReferences, validMasterKey, resolveHlsReference } from "@/lib/video/hls"

export const dynamic = "force-dynamic"
const LEASE_MS = 5 * 60 * 1000

export async function POST(req: Request) {
  const row = await prisma.systemConfig.findUnique({ where: { key: "video_worker_token" } })
  const expected = row ? decrypt(row.value) : ""
  const received = req.headers.get("authorization")?.replace(/^Bearer /, "") || ""
  if (expected.length < 32 || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }
  const body = await req.json()
  const now = new Date()
  if (body.action === "claim") {
    await prisma.videoJob.updateMany({ where: { status: "PROCESSING", leaseUntil: { lt: now }, attempts: { gte: 3 } }, data: { status: "FAILED", error: "Conversion interrompue trois fois", leaseToken: null, leaseUntil: null } })
    const job = await prisma.videoJob.findFirst({ where: { attempts: { lt: 3 }, OR: [{ status: "QUEUED" }, { status: "PROCESSING", leaseUntil: { lt: now } }] }, orderBy: { createdAt: "asc" } })
    if (!job) return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } })
    const config = await getR2Config()
    const leaseToken = randomUUID()
    const result = await prisma.videoJob.updateMany({ where: { id: job.id, attempts: job.attempts, status: job.status, leaseToken: job.leaseToken, leaseUntil: job.leaseUntil }, data: { status: "PROCESSING", attempts: { increment: 1 }, leaseToken, leaseUntil: new Date(Date.now() + LEASE_MS), error: null } })
    if (!result.count) return NextResponse.json(null)
    return NextResponse.json({ id: job.id, fileName: job.fileName, sourceKey: job.sourceKey, leaseToken, config }, { headers: { "Cache-Control": "no-store" } })
  }
  if (typeof body.id !== "string" || typeof body.leaseToken !== "string") return NextResponse.json({ error: "Mission invalide" }, { status: 400 })
  const where = { id: body.id, leaseToken: body.leaseToken, status: "PROCESSING", leaseUntil: { gt: now } }
  if (body.action === "heartbeat") {
    const result = await prisma.videoJob.updateMany({ where, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } })
    return NextResponse.json({ ok: Boolean(result.count) }, { status: result.count ? 200 : 409 })
  }
  if (body.action === "finish") {
    // A trusted worker may only finish its current immutable attempt.
    const prefix = `videos/${body.id}/${body.leaseToken}/`
    if (!validMasterKey(body.hlsKey) || !body.hlsKey.startsWith(prefix) || !Number.isSafeInteger(body.duration) || body.duration < 1) return NextResponse.json({ error: "Résultat invalide" }, { status: 400 })
    const config = await getR2Config()
    const text = await loadPlaylist(r2Client(config), config.bucket, body.hlsKey)
    const refs = hlsReferences(text)
    if (!refs.length || refs.some(uri => !resolveHlsReference(body.hlsKey, body.hlsKey, uri).endsWith(".m3u8"))) return NextResponse.json({ error: "Master invalide" }, { status: 400 })
    const result = await prisma.videoJob.updateMany({ where, data: { status: "READY", hlsKey: body.hlsKey, duration: body.duration, leaseToken: null, leaseUntil: null } })
    return NextResponse.json({ ok: Boolean(result.count) }, { status: result.count ? 200 : 409 })
  }
  if (body.action === "fail") {
    const job = await prisma.videoJob.findFirst({ where })
    if (!job) return NextResponse.json({ error: "Bail expiré" }, { status: 409 })
    await prisma.videoJob.updateMany({ where, data: { status: job.attempts < 3 ? "QUEUED" : "FAILED", error: "Conversion impossible : vérifier le fichier et le journal du worker", leaseToken: null, leaseUntil: null } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: "Action invalide" }, { status: 400 })
}
