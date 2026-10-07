import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canReadIntro, INTRO_HEADERS, validIntroKey } from "@/lib/video/intro-access"
import { getR2Config, r2Client, signVideoObject } from "@/lib/video/r2"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { id: string; asset: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Session requise" }, { status: 401, headers: INTRO_HEADERS })
  if (params.asset !== "video" && params.asset !== "poster") return NextResponse.json({ error: "Média introuvable" }, { status: 404, headers: INTRO_HEADERS })
  const video = await prisma.introVideo.findUnique({ where: { id: params.id },
    include: { chapter: { include: { formation: true, simulation: { select: { app: true, mode: true } } } },
      section: { include: { formation: true } } } })
  const formation = video?.chapter?.formation || video?.section?.formation
  if (!video || !formation) return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404, headers: INTRO_HEADERS })
  if (video.chapter && (video.chapter.simulation?.app !== "EXCEL" || video.chapter.simulation.mode !== "LESSON")) {
    return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404, headers: INTRO_HEADERS })
  }
  if (!await canReadIntro(session.user, formation, video.chapter?.isPublished ?? true)) {
    return NextResponse.json({ error: "Accès à la formation requis" }, { status: 403, headers: INTRO_HEADERS })
  }
  const key = params.asset === "video" ? video.videoKey : video.posterKey
  if (!validIntroKey(key, params.asset)) return NextResponse.json({ error: "Média introuvable" }, { status: 404, headers: INTRO_HEADERS })
  try {
    const config = await getR2Config()
    const url = await signVideoObject(r2Client(config), config.bucket, key, 300)
    return new NextResponse(null, { status: 307, headers: { ...INTRO_HEADERS, Location: url } })
  } catch {
    return NextResponse.json({ error: "Vidéo temporairement indisponible" }, { status: 503, headers: INTRO_HEADERS })
  }
}
