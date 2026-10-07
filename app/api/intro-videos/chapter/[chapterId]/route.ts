import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canReadIntro, INTRO_HEADERS } from "@/lib/video/intro-access"
import { INTRO_APPS, isIntroApp } from "@/lib/video/intro-keys"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Session requise" }, { status: 401, headers: INTRO_HEADERS })
  const chapter = await prisma.chapter.findUnique({
    where: { id: params.chapterId },
    include: { formation: true, simulation: { select: { app: true, mode: true } }, introVideo: true,
      section: { include: { introVideo: true, chapters: { where: { isPublished: true, simulation: { app: { in: [...INTRO_APPS] } } },
        orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, simulation: { select: { app: true, mode: true } } } } } } },
  })
  if (!chapter) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404, headers: INTRO_HEADERS })
  if (!await canReadIntro(session.user, chapter.formation, chapter.isPublished)) {
    return NextResponse.json({ error: "Accès à la formation requis" }, { status: 403, headers: INTRO_HEADERS })
  }
  // Only published simulation lessons have introductions; exercises keep their opening.
  if (!isIntroApp(chapter.simulation?.app) || chapter.simulation?.mode !== "LESSON") {
    return NextResponse.json({ lesson: null, module: null }, { headers: INTRO_HEADERS })
  }
  const media = (video: { id: string; durationSeconds: number } | null) => video && ({
    id: video.id, durationSeconds: video.durationSeconds,
    src: `/api/intro-videos/${encodeURIComponent(video.id)}/video`,
    poster: `/api/intro-videos/${encodeURIComponent(video.id)}/poster`,
  })
  const section = chapter.section
  const chapters = section?.chapters.filter(c => c.simulation?.app === chapter.simulation?.app) ?? []
  const firstLesson = chapters.find(c => c.simulation?.mode === "LESSON")
  const moduleVideo = section?.introVideo && firstLesson?.id === chapter.id ? {
    ...media(section.introVideo)!, title: section.title, number: section.order,
    lessons: chapters.filter(c => c.simulation?.mode === "LESSON").length,
    exercises: chapters.filter(c => c.simulation?.mode === "EXERCISE").length,
    evaluations: chapters.filter(c => c.simulation?.mode === "EVALUATION").length,
  } : null
  return NextResponse.json({ lesson: media(chapter.introVideo), module: moduleVideo }, { headers: INTRO_HEADERS })
}
