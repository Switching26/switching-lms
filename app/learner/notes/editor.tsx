"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"

interface Chapter {
  id: string
  title: string
  order: number
  note: string
  formationId: string
  formationTitle: string
}

export default function NotesEditor({
  chapters,
  initialChapterId,
}: {
  chapters: Chapter[]
  userId: string
  initialChapterId?: string
}) {
  const [activeId, setActiveId] = useState(() => {
    // Deep-link ?chapitre=<id> (depuis le bloc notes du player)
    if (initialChapterId && chapters.some((c) => c.id === initialChapterId)) return initialChapterId
    return chapters[0]?.id || ""
  })
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(chapters.map((c) => [c.id, c.note]))
  )
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [savedAt, setSavedAt] = useState<string>("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Regroupement par formation, dans l'ordre d'apparition
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; title: string; chapters: Chapter[] }>()
    for (const ch of chapters) {
      if (!map.has(ch.formationId)) {
        map.set(ch.formationId, { id: ch.formationId, title: ch.formationTitle, chapters: [] })
      }
      map.get(ch.formationId)!.chapters.push(ch)
    }
    return Array.from(map.values())
  }, [chapters])

  const activeChapter = chapters.find((c) => c.id === activeId)
  const hasNote = (id: string) => (notes[id] || "").trim().length > 0

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

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
      {/* Mobile dropdown — groupé par formation */}
      <div className="md:hidden">
        <select
          value={activeId}
          onChange={(e) => handleSwitchChapter(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white outline-none focus:border-primary"
          style={{ fontSize: 16, minHeight: 44 }}
        >
          {groups.map((g) => (
            <optgroup key={g.id} label={g.title}>
              {g.chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {hasNote(ch.id) ? "• " : ""}{ch.order}. {ch.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop sidebar — groupé par formation */}
      <div className="hidden md:block bg-white rounded-xl border border-border p-4 max-h-[70vh] overflow-y-auto">
        {groups.map((g) => (
          <div key={g.id} className="mb-5 last:mb-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-50 mb-2 px-1 truncate" title={g.title}>
              {g.title}
            </h3>
            <div className="space-y-1">
              {g.chapters.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => handleSwitchChapter(ch.id)}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeId === ch.id ? "bg-gray-100 font-medium text-ink" : "hover:bg-gray-50 text-gray-500"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasNote(ch.id) ? "bg-primary" : "bg-gray-200"}`}
                    aria-hidden
                  />
                  <span className="truncate">{ch.order}. {ch.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Editor */}
      <div className="md:col-span-3">
        <div className="bg-white rounded-xl border border-border p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="min-w-0">
              {activeChapter && (
                <p className="text-xs text-ink-50 truncate mb-0.5" title={activeChapter.formationTitle}>
                  {activeChapter.formationTitle}
                </p>
              )}
              <h2 className="text-base font-semibold min-w-0 truncate">{activeChapter?.title}</h2>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
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
              {activeChapter && (
                <a
                  href={`/learner/formation?id=${activeChapter.formationId}&chapitre=${activeId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Ouvrir le chapitre
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </a>
              )}
            </div>
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
