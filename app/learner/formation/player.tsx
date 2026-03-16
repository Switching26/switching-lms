"use client"

import { useState } from "react"
import Badge from "@/components/ui/Badge"

interface Chapter {
  id: string
  title: string
  description: string | null
  order: number
  videoUrl: string | null
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

  const active = chapters[activeIndex]

  const isAccessible = (index: number) => {
    if (index === 0) return true
    return chapters[index - 1]?.completed
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Player */}
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-lg font-semibold">{formationTitle}</h1>

        {active?.videoUrl ? (
          <div className="aspect-video bg-black rounded-xl overflow-hidden">
            <video
              key={active.id}
              controls
              className="w-full h-full"
              src={active.videoUrl}
            >
              Votre navigateur ne supporte pas la lecture vidéo.
            </video>
          </div>
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
                {ch.completed && <Badge variant="success">OK</Badge>}
                {!accessible && <span className="text-xs">🔒</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
