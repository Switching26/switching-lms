import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canReadIntro, INTRO_HEADERS } from "@/lib/video/intro-access"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Session requise" }, { status: 401, headers: INTRO_HEADERS })
  const chapter = await prisma.chapter.findUnique({
    where: { id: params.chapterId },
    include: { formation: true, simulation: { select: { app: true, mode: true } }, introVideo: true,
      section: { include: { introVideo: true, chapters: { where: { isPublished: true, simulation: { app: "EXCEL" } },
        orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, simulation: { select: { mode: true } } } } } } },
  })
  if (!chapter) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404, headers: INTRO_HEADERS })
  if (!await canReadIntro(session.user, chapter.formation, chapter.isPublished)) {
    return NextResponse.json({ error: "Accès à la formation requis" }, { status: 403, headers: INTRO_HEADERS })
  }
  // Exercises, assessments and other applications retain their existing opening.
  if (chapter.simulation?.app !== "EXCEL" || chapter.simulation.mode !== "LESSON") {
    return NextResponse.json({ lesson: null, module: null }, { headers: INTRO_HEADERS })
  }
  const media = (video: { id: string; durationSeconds: number } | null) => video && ({
    id: video.id, durationSeconds: video.durationSeconds,
    src: `/api/intro-videos/${encodeURIComponent(video.id)}/video`,
    poster: `/api/intro-videos/${encodeURIComponent(video.id)}/poster`,
  })
  const section = chapter.section
  const firstLesson = section?.chapters.find(c => c.simulation?.mode === "LESSON")
  const moduleVideo = section?.introVideo && firstLesson?.id === chapter.id ? {
    ...media(section.introVideo)!, title: section.title, number: section.order,
    lessons: section.chapters.filter(c => c.simulation?.mode === "LESSON").length,
    exercises: section.chapters.filter(c => c.simulation?.mode === "EXERCISE").length,
    evaluations: section.chapters.filter(c => c.simulation?.mode === "EVALUATION").length,
  } : null
  return NextResponse.json({ lesson: media(chapter.introVideo), module: moduleVideo }, { headers: INTRO_HEADERS })
}
