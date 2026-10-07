"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

type Media = { id: string; src: string; poster: string; durationSeconds: number }
type Module = Media & { title: string; number: number; lessons: number; exercises: number; evaluations: number }
type Intros = { lesson: Media | null; module: Module | null }

export function useIntroVideos(chapterId: string, enabled: boolean) {
  const [result, setResult] = useState<{ chapterId: string; data: Intros | null } | null>(null)
  const [moduleSeen, setModuleSeen] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    // A missing introduction must never prevent the lesson from opening.
    const timer = window.setTimeout(() => controller.abort(), 8000)
    fetch(`/api/intro-videos/chapter/${encodeURIComponent(chapterId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => response.ok ? await response.json() as Intros : null)
      .then(data => { if (!controller.signal.aborted) setResult({ chapterId, data }) })
      .catch(() => setResult({ chapterId, data: null }))
      .finally(() => window.clearTimeout(timer))
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [chapterId, enabled])
  const data = result?.chapterId === chapterId ? result.data : null
  return { lesson: enabled ? data?.lesson ?? null : null,
    module: enabled && moduleSeen !== chapterId ? data?.module ?? null : null,
    pending: enabled && result?.chapterId !== chapterId,
    beginModule: () => setModuleSeen(chapterId) }
}

function IntroductionVideo({ media, module }: { media: Media; module: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [failed, setFailed] = useState(false)
  return <figure style={{ margin: 0, width: "100%", minWidth: 0 }}>
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#171a18", boxShadow: "0 24px 50px -22px rgba(16,32,27,.35)" }}>
      <video ref={video} controls={started} playsInline preload="none" poster={media.poster}
        src={media.src} aria-label={module ? "Présentation du module" : "Présentation de la leçon"}
        onPlay={() => { setStarted(true); setFailed(false) }} onError={() => setFailed(true)}
        style={{ display: "block", width: "100%", aspectRatio: "16 / 9" }} />
      {!started && !failed && <button type="button" aria-label="Lire la présentation" onClick={() => {
        void video.current?.play().catch(() => setFailed(true))
      }} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 64, height: 64,
        borderRadius: "50%", border: "1px solid rgba(255,255,255,.45)", background: "rgba(23,26,24,.8)", color: "#fff", fontSize: 26, cursor: "pointer" }}>▶</button>}
    </div>
    <figcaption style={{ marginTop: 10, fontSize: 13, color: "#5F6661", fontWeight: 600 }}>
      Présentation {module ? "du module" : "de la leçon"} · {Math.round(media.durationSeconds)} s
    </figcaption>
    {failed && <p role="status" style={{ fontSize: 13, color: "#5F6661", marginTop: 8 }}>La vidéo est indisponible. Vous pouvez commencer sans la regarder.</p>}
  </figure>
}

/** Display contents keeps the existing no-video layout exactly as it was. */
export default function IntroVideoOpening({ lesson, module, beginModule, children }: {
  lesson: Media | null; module: Module | null; beginModule: () => void; children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  const media = module || lesson
  useEffect(() => {
    if (!media || !root.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [media])
  if (!media) return <div style={{ display: "contents" }}>{children}</div>
  return <div ref={root} data-intro-video={module ? "module" : "lesson"} style={{ width: "100%", maxWidth: 1320, margin: "0 auto",
    display: "grid", gridTemplateColumns: width >= 700 ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
    gap: width >= 700 ? 48 : 24, alignItems: "center" }}>
    {module ? <div>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "2.2px", color: "#187a4e", marginBottom: 14, textTransform: "uppercase" }}>Module {module.number} — Introduction</div>
      <h2 tabIndex={-1} style={{ fontSize: "clamp(24px, 4.5vw, 40px)", lineHeight: 1.06, fontWeight: 850, letterSpacing: "-0.8px", color: "#171a18", marginBottom: 14 }}>{module.title}</h2>
      <p style={{ fontSize: "clamp(13px, 1.8vw, 15.5px)", color: "#3c423e", lineHeight: 1.6, marginBottom: 16 }}>
        {module.lessons} leçon{module.lessons > 1 ? "s" : ""}, {module.exercises} exercice{module.exercises > 1 ? "s" : ""} et {module.evaluations === 1 ? "une évaluation" : `${module.evaluations} évaluations`}.
      </p>
      <div style={{ fontSize: 12.5, color: "#9aa19c", marginBottom: 22 }}>Vidéo de {Math.round(module.durationSeconds)} s</div>
      <button type="button" data-control="intro-module-commencer" onClick={() => {
        beginModule()
        window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-control="intro-commencer"]')?.focus(), 0)
      }} style={{ display: "inline-flex", alignItems: "center", gap: 10, borderRadius: 12, background: "#171a18", color: "#fff", fontSize: 14.5, fontWeight: 700, padding: "12px 22px" }}>
        <span aria-hidden style={{ width: 0, height: 0, borderLeft: "8px solid #fff", borderTop: "5.5px solid transparent", borderBottom: "5.5px solid transparent" }} />Commencer le module
      </button>
    </div> : children}
    <IntroductionVideo key={media.id} media={media} module={!!module} />
  </div>
}
