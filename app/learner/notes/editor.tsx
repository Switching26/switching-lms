"use client"

import { useState, useCallback, useRef, useEffect } from "react"

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (chapterId: string, content: string) => {
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
  }, [])

  const handleChange = (value: string) => {
    setNotes((prev) => ({ ...prev, [activeId]: value }))

    // Debounced autosave after 1.5s of inactivity
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const chapterIdToSave = activeId
    debounceRef.current = setTimeout(() => {
      save(chapterIdToSave, value)
    }, 1500)
  }

  // Save pending changes when switching chapters
  const handleSwitchChapter = (newId: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
      save(activeId, notes[activeId] || "")
    }
    setActiveId(newId)
  }

  // Save on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
      {/* Mobile dropdown */}
      <div className="md:hidden">
        <select
          value={activeId}
          onChange={(e) => handleSwitchChapter(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white outline-none focus:border-primary"
          style={{ fontSize: 16, minHeight: 44 }}
        >
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>{ch.order}. {ch.title}</option>
          ))}
        </select>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block bg-white rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Chapitres</h3>
        <div className="space-y-1">
          {chapters.map((ch) => (
            <button
              key={ch.id}
              onClick={() => handleSwitchChapter(ch.id)}
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
        <div className="bg-white rounded-xl border border-border p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">
              {chapters.find((c) => c.id === activeId)?.title}
            </h2>
            {saving && (
              <span className="text-xs text-gray-400">Sauvegarde...</span>
            )}
          </div>
          <textarea
            value={notes[activeId] || ""}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Prenez vos notes ici..."
            className="w-full min-h-[300px] md:min-h-[400px] text-sm border border-border rounded-lg p-4 outline-none resize-none focus:border-primary transition-colors"
            style={{ fontSize: 16 }}
          />
        </div>
      </div>
    </div>
  )
}
