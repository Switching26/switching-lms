"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Badge from "@/components/ui/Badge"

interface Chapter {
  id: string
  title: string
  description: string | null
  order: number
  videoUrl: string | null
  videoDuration: number
  content: string | null
  completed: boolean
  inProgress: boolean
  lastPosition: number
  attachments: { id: string; name: string; fileUrl: string }[]
}

export default function FormationPlayer({
  formationTitle,
  chapters,
  userId,
}: {
  formationTitle: string
  chapters: Chapter[]
  userId: string
}) {
  const [activeIndex, setActiveIndex] = useState(() => {
    const inProgress = chapters.findIndex((c) => c.inProgress && !c.completed)
    if (inProgress >= 0) return inProgress
    const firstIncomplete = chapters.findIndex((c) => !c.completed)
    return firstIncomplete >= 0 ? firstIncomplete : 0
  })
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    chapters.forEach((c) => { map[c.id] = c.completed })
    return map
  })

  const active = chapters[activeIndex]

  const isAccessible = (index: number) => {
    if (index === 0) return true
    return completedMap[chapters[index - 1]?.id]
  }

  const handleChapterCompleted = (chapterId: string) => {
    setCompletedMap((prev) => ({ ...prev, [chapterId]: true }))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Player */}
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-lg font-semibold">{formationTitle}</h1>

        {active?.videoUrl ? (
          <VimeoPlayer
            key={active.id}
            vimeoId={active.videoUrl}
            chapterId={active.id}
            lastPosition={active.lastPosition}
            onCompleted={() => handleChapterCompleted(active.id)}
          />
        ) : (
          <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center">
            <p className="text-gray-400 text-sm">Aucune vidéo pour ce chapitre</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-base font-semibold mb-2">{active?.title}</h2>
          {active?.description && (
            <p className="text-sm text-gray-500 mb-4">{active.description}</p>
          )}
          {active?.content && (
            <div className="text-sm text-gray-600 whitespace-pre-wrap">{active.content}</div>
          )}
          {active?.attachments?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold mb-2">Pièces jointes</h3>
              <div className="space-y-1">
                {active.attachments.map((att) => {
                  const href = att.fileUrl.startsWith("/api/files/")
                    ? att.fileUrl
                    : `/api/files/${att.fileUrl.split("/").pop()}`
                  return (
                    <a
                      key={att.id}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm">📄</span>
                      <span className="text-sm text-primary hover:underline">{att.name}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar chapitres */}
      <div className="bg-white rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Chapitres</h3>
        <div className="space-y-1">
          {chapters.map((ch, i) => {
            const accessible = isAccessible(i)
            return (
              <button
                key={ch.id}
                onClick={() => accessible && setActiveIndex(i)}
                disabled={!accessible}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
                  i === activeIndex
                    ? "bg-gray-100 font-medium"
                    : accessible
                    ? "hover:bg-gray-50"
                    : "opacity-40 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                  <span className="truncate">{ch.title}</span>
                </span>
                {completedMap[ch.id] && <Badge variant="success">OK</Badge>}
                {!accessible && <span className="text-xs">🔒</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function VimeoPlayer({
  vimeoId,
  chapterId,
  lastPosition,
  onCompleted,
}: {
  vimeoId: string
  chapterId: string
  lastPosition: number
  onCompleted: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const playerRef = useRef<any>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasEndedRef = useRef(false)
  const [processing, setProcessing] = useState(false)

  const saveProgress = useCallback(async (position: number, completed: boolean = false) => {
    try {
      const body: Record<string, any> = { lastPosition: Math.floor(position) }
      if (completed) {
        body.completedAt = new Date().toISOString()
      }
      await fetch(`/api/progress/${chapterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (completed) onCompleted()
    } catch {}
  }, [chapterId, onCompleted])

  useEffect(() => {
    let player: any = null

    const initPlayer = async () => {
      // Dynamically import Vimeo Player
      const VimeoPlayerLib = (await import("@vimeo/player")).default

      if (!iframeRef.current) return
      player = new VimeoPlayerLib(iframeRef.current)
      playerRef.current = player

      // Check if video is processing
      try {
        await player.ready()
      } catch {
        setProcessing(true)
        return
      }

      // Seek to last position if any
      if (lastPosition > 0) {
        try { await player.setCurrentTime(lastPosition) } catch {}
      }

      // Save progress every 30s
      progressTimerRef.current = setInterval(async () => {
        try {
          const time = await player.getCurrentTime()
          saveProgress(time)
        } catch {}
      }, 30000)

      // On video ended → mark chapter completed
      player.on("ended", () => {
        if (hasEndedRef.current) return
        hasEndedRef.current = true
        saveProgress(0, true)
      })
    }

    initPlayer()

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      if (player) {
        // Save final position on unmount
        player.getCurrentTime().then((time: number) => {
          if (!hasEndedRef.current) saveProgress(time)
        }).catch(() => {})
        player.destroy().catch(() => {})
      }
    }
  }, [vimeoId, chapterId, lastPosition, saveProgress])

  if (processing) {
    return (
      <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm font-medium">Vidéo en cours de traitement</p>
          <p className="text-gray-400 text-xs mt-1">Revenez dans quelques minutes</p>
        </div>
      </div>
    )
  }

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden">
      <iframe
        ref={iframeRef}
        src={`https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0&dnt=1`}
        className="w-full h-full"
        frameBorder="0"
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    </div>
  )
}
