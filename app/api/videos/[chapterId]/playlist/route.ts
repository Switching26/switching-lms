import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getR2Config, r2Client, loadPlaylist, signVideoObject } from "@/lib/video/r2"
import { rewriteHls, validMasterKey } from "@/lib/video/hls"
import { resolveHlsReference } from "@/lib/video/hls"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: { chapterId: string } }) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Session requise" }, { status: 401, headers })
  const chapter = await prisma.chapter.findUnique({ where: { id: params.chapterId }, include: { formation: true } })
  if (!chapter?.videoR2Key || !validMasterKey(chapter.videoR2Key)) return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404, headers })
  const preview = req.nextUrl.searchParams.get("preview") === "1" && session.user.role === "SUPER_ADMIN"
  if (!preview) {
    const enrollment = await prisma.enrollment.findUnique({ where: { userId_formationId: { userId: session.user.id, formationId: chapter.formationId } } })
    const now = new Date()
    if (!chapter.isPublished || !chapter.formation.isPublished || chapter.formation.deletedAt || !enrollment || enrollment.startedAt > now || (enrollment.expiresAt && enrollment.expiresAt < now)) {
      return NextResponse.json({ error: "Inscription active requise" }, { status: 403, headers })
    }
  }
  const relative = req.nextUrl.searchParams.get("path")
  let key = chapter.videoR2Key
  if (relative) {
    try {
      key = resolveHlsReference(chapter.videoR2Key, chapter.videoR2Key, relative)
    } catch {
      return NextResponse.json({ error: "Chemin de playlist invalide" }, { status: 400, headers })
    }
  }
  if (!key.endsWith(".m3u8")) return NextResponse.json({ error: "Playlist requise" }, { status: 400, headers })
  try {
    const config = await getR2Config()
    const client = r2Client(config)
    const masterDir = chapter.videoR2Key.slice(0, chapter.videoR2Key.lastIndexOf("/") + 1)
    const text = await loadPlaylist(client, config.bucket, key)
    const rewritten = await rewriteHls(text, async uri => {
      const target = resolveHlsReference(chapter.videoR2Key!, key, uri)
      if (target.endsWith(".m3u8")) {
        const query = new URLSearchParams({ path: target.slice(masterDir.length) })
        if (preview) query.set("preview", "1")
        return `/api/videos/${encodeURIComponent(chapter.id)}/playlist?${query}`
      }
      return signVideoObject(client, config.bucket, target)
    })
    return new NextResponse(rewritten, { headers: { ...headers, "Content-Type": "application/vnd.apple.mpegurl" } })
  } catch {
    return NextResponse.json({ error: "Vidéo temporairement indisponible" }, { status: 503, headers })
  }
}
