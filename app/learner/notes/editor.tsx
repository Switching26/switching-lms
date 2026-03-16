"use client"

import { useState, useCallback } from "react"

interface Chapter {
  id: string
  title: string
  order: number
  note: string
}

export default function NotesEditor({ chapters, userId }: { chapters: Chapter[]; userId: string }) {
  const [activeId, setActiveId] = useState(chapters[0]?.id || "")
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(chapters.map((c) => [c.id, c.note]))
  )
  const [saving, setSaving] = useState(false)

  const save = useCallback(
    async (chapterId: string, content: string) => {
      setSaving(true)
      try {
        await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterId, content }),
        })
      } finally {
        setSaving(false)
      }
    },
    []
  )

  const handleChange = (value: string) => {
    setNotes((prev) => ({ ...prev, [activeId]: value }))
  }

  const handleBlur = () => {
    save(activeId, notes[activeId] || "")
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Sidebar */}
      <div className="bg-white rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Chapitres</h3>
        <div className="space-y-1">
          {chapters.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveId(ch.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                activeId === ch.id ? "bg-gray-100 font-medium" : "hover:bg-gray-50 text-gray-500"
              }`}
            >
              {ch.order}. {ch.title}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="md:col-span-3">
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">
              {chapters.find((c) => c.id === activeId)?.title}
            </h2>
            <span className="text-xs text-gray-400">
              {saving ? "Sauvegarde..." : "Sauvegardé"}
            </span>
          </div>
          <textarea
            value={notes[activeId] || ""}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder="Prenez vos notes ici..."
            className="w-full min-h-[400px] text-sm border border-border rounded-lg p-4 outline-none resize-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </div>
  )
}
