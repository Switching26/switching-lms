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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [savedAt, setSavedAt] = useState<string>("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (chapterId: string, content: string) => {
    setSaveState("saving")
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, content }),
      })
      if (!res.ok) throw new Error("save failed")
      setSaveState("saved")
      setSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }))
    } catch {
      setSaveState("error")
    }
  }, [])

  const handleChange = (value: string) => {
    setNotes((prev) => ({ ...prev, [activeId]: value }))
    setSaveState((prev) => (prev === "saving" ? prev : "idle"))

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
    } else {
      setSaveState("idle")
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
            {saveState === "saving" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <span className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
                Enregistrement…
              </span>
            )}
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Enregistré{savedAt ? ` à ${savedAt}` : ""}
              </span>
            )}
            {saveState === "error" && (
              <span className="inline-flex items-center gap-1 text-xs text-red-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M12 3a9 9 0 100 18 9 9 0 000-18z" />
                </svg>
                Échec de l'enregistrement
              </span>
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
