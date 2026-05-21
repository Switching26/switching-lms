"use client"

import { useState, useEffect, useRef, useCallback } from "react"

/* ═══════════ TYPES ═══════════ */

interface Choice {
  id: string
  text: string
  isCorrect: boolean
}

interface Question {
  id: string
  text: string
  type: string
  order: number
  choices: Choice[]
}

interface Exercise {
  id: string
  type: string
  title: string
  instructions: string | null
  order: number
  questions: Question[]
}

interface ChapterAttachment {
  id: string
  name: string
  fileUrl: string
}

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
  sectionId?: string | null
  attachments: ChapterAttachment[]
  exercises: Exercise[]
}

interface Section {
  id: string
  title: string
  description: string | null
  order: number
}

interface FormationAttachment {
  id: string
  name: string
  fileUrl: string
  fileSize: number
}

/* ═══════════ MAIN PLAYER ═══════════ */

export default function FormationPlayer({
  formationTitle,
  formationCoverUrl,
  chapters,
  sections,
  formationAttachments,
  userId,
  preview,
}: {
  formationTitle: string
  formationCoverUrl?: string | null
  chapters: Chapter[]
  sections?: Section[]
  formationAttachments?: FormationAttachment[]
  userId: string
  preview?: boolean
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
  const [showChapters, setShowChapters] = useState(false)

  const active = chapters[activeIndex]
  const completedCount = Object.values(completedMap).filter(Boolean).length
  const progressPercent = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0

  const isAccessible = (_index: number) => {
    // Accès libre : tous les chapitres sont accessibles en permanence
    // (style Rise Up — apprenant adulte autonome)
    return true
  }

  const handleChapterCompleted = (chapterId: string) => {
    setCompletedMap((prev) => ({ ...prev, [chapterId]: true }))
  }

  const sortedSections = (sections || []).sort((a, b) => a.order - b.order)
  const rootChapters = chapters.filter((c) => !c.sectionId)
  const chaptersBySection = (sectionId: string) =>
    chapters.filter((c) => c.sectionId === sectionId)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 animate-fade-in-up">
      {/* Main content */}
      <div className="space-y-5 min-w-0">
        {/* Video */}
        {active?.videoUrl ? (
          preview ? (
            <div className="aspect-video bg-primary rounded-2xl overflow-hidden shadow-lg">
              <iframe
                src={`https://player.vimeo.com/video/${active.videoUrl}?title=0&byline=0&portrait=0&dnt=1&outro=0`}
                style={{ border: "none", width: "100%", height: "100%" }}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <VimeoPlayer
              key={active.id}
              vimeoId={active.videoUrl}
              chapterId={active.id}
              lastPosition={active.lastPosition}
              onCompleted={() => handleChapterCompleted(active.id)}
            />
          )
        ) : active?.exercises?.length > 0 ? (
          // Carte d'intro quiz interactive (style Rise Up) — affichée quand le chapter n'a pas de vidéo mais a un exercice
          (() => {
            const ex = active.exercises[0]
            const questionsCount = ex.questions?.length || 0
            return (
              <div className="bg-white rounded-2xl border border-border shadow-sm p-8">
                <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                  {/* Illustration */}
                  <div className="flex-shrink-0">
                    <svg viewBox="0 0 200 200" className="w-32 h-32 sm:w-40 sm:h-40" fill="none">
                      <rect x="40" y="30" width="100" height="140" rx="6" fill="#fff" stroke="#1f3a8a" strokeWidth="3"/>
                      <rect x="76" y="22" width="28" height="14" rx="3" fill="#1f3a8a"/>
                      <rect x="56" y="55" width="12" height="12" rx="2" fill="none" stroke="#1f3a8a" strokeWidth="2"/>
                      <rect x="56" y="80" width="12" height="12" rx="2" fill="none" stroke="#1f3a8a" strokeWidth="2"/>
                      <path d="M58 84 L62 88 L67 82" stroke="#1f3a8a" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="56" y="105" width="12" height="12" rx="2" fill="none" stroke="#1f3a8a" strokeWidth="2"/>
                      <rect x="56" y="130" width="12" height="12" rx="2" fill="none" stroke="#1f3a8a" strokeWidth="2"/>
                      <line x1="76" y1="61" x2="125" y2="61" stroke="#1f3a8a" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="76" y1="86" x2="125" y2="86" stroke="#1f3a8a" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="76" y1="111" x2="125" y2="111" stroke="#1f3a8a" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="76" y1="136" x2="125" y2="136" stroke="#1f3a8a" strokeWidth="2" strokeLinecap="round"/>
                      {/* Crayon */}
                      <g transform="rotate(35 150 120)">
                        <rect x="142" y="90" width="14" height="50" rx="3" fill="#4f46e5"/>
                        <polygon points="142,90 156,90 149,80" fill="#fbbf24"/>
                        <rect x="142" y="135" width="14" height="6" fill="#1f3a8a"/>
                      </g>
                    </svg>
                  </div>
                  {/* Infos */}
                  <div className="flex-1 w-full">
                    <h2 className="font-display text-xl sm:text-2xl font-semibold text-primary mb-4 text-center sm:text-left">
                      Vous allez commencer un quiz
                    </h2>
                    <div className="bg-surface-subtle rounded-xl p-4 space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2 text-warm-600">
                          <svg className="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Questions
                        </span>
                        <span className="font-semibold text-primary tabular-nums">{questionsCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2 text-warm-600">
                          <svg className="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Temps
                        </span>
                        <span className="font-semibold text-primary">Aucune limite</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2 text-warm-600">
                          <svg className="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                          Score à atteindre
                        </span>
                        <span className="font-semibold text-primary">100%</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2 text-warm-600">
                          <svg className="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                          Essais maximum
                        </span>
                        <span className="font-semibold text-primary">Illimité</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-border mt-6 pt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      document.getElementById(`exercise-${ex.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }}
                    className="bg-brand-600 hover:bg-brand-700 text-white font-semibold uppercase tracking-wider text-sm px-8 py-3 rounded-full transition-colors shadow-md"
                  >
                    Démarrer le quiz
                  </button>
                </div>
              </div>
            )
          })()
        ) : (
          <div className="aspect-video bg-warm-100 rounded-2xl flex items-center justify-center border border-warm-200">
            <div className="text-center">
              <svg className="w-10 h-10 text-warm-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
              </svg>
              <p className="text-warm-400 text-sm">Aucune vidéo pour ce chapitre</p>
            </div>
          </div>
        )}

        {/* Chapter info */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <p className="text-[11px] font-semibold text-warm-400 uppercase tracking-wider mb-1">
                Chapitre {activeIndex + 1} / {chapters.length}
              </p>
              <h2 className="font-display text-xl font-semibold text-primary">{active?.title}</h2>
            </div>
            {completedMap[active?.id] && (
              <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Terminé
              </span>
            )}
          </div>
          {active?.description && (
            <p className="text-warm-500 text-sm leading-relaxed mb-4 whitespace-pre-line">{active.description}</p>
          )}
          {active?.content && (
            <div className="text-sm text-warm-600 leading-relaxed whitespace-pre-wrap border-t border-border pt-4">{active.content}</div>
          )}
          {active?.attachments?.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border">
              <h3 className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-3">Pièces jointes</h3>
              <div className="space-y-1.5">
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
                      className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-warm-50 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0 group-hover:bg-warm-200 transition-colors">
                        <svg className="w-4 h-4 text-warm-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      </div>
                      <span className="text-sm text-warm-600 group-hover:text-primary transition-colors">{att.name}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Exercises */}
        {active?.exercises?.length > 0 && (
          <div className="space-y-4">
            {active.exercises.map((ex) => (
              <ExerciseBlock key={ex.id} exercise={ex} userId={userId} preview={preview} />
            ))}
          </div>
        )}

        {/* Formation-level attachments */}
        {formationAttachments && formationAttachments.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-3">Documents de la formation</h3>
            <div className="space-y-1.5">
              {formationAttachments.map((att) => {
                const href = att.fileUrl.startsWith("/api/files/")
                  ? att.fileUrl
                  : `/api/files/${att.fileUrl.split("/").pop()}`
                return (
                  <a
                    key={att.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-warm-50 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0 group-hover:bg-warm-200 transition-colors">
                      <svg className="w-4 h-4 text-warm-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <span className="text-sm text-warm-600 group-hover:text-primary transition-colors">{att.name}</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Mobile toggle */}
      <div className="lg:hidden">
        <button
          onClick={() => setShowChapters(!showChapters)}
          className="w-full py-3 bg-white rounded-2xl border border-border text-sm font-semibold text-warm-600 hover:bg-warm-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
          style={{ minHeight: 48 }}
        >
          <svg className={`w-4 h-4 transition-transform ${showChapters ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
          {showChapters ? "Masquer les chapitres" : `Voir les chapitres (${completedCount}/${chapters.length})`}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`${showChapters ? "block" : "hidden"} lg:block`}>
        <div className="bg-white rounded-2xl border border-border shadow-sm lg:sticky lg:top-[80px] overflow-hidden">
          {/* Sidebar header */}
          <div className="p-4 border-b border-border bg-warm-50/50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-sm font-semibold text-primary">{formationTitle}</h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-warm-200/50 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.max(progressPercent, 2)}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-warm-500 tabular-nums">{progressPercent}%</span>
            </div>
          </div>

          {/* Chapter list */}
          <div className="p-2 max-h-[calc(100vh-200px)] overflow-y-auto">
            {rootChapters.map((ch) => {
              const i = chapters.indexOf(ch)
              const accessible = isAccessible(i)
              return (
                <ChapterButton
                  key={ch.id}
                  chapter={ch}
                  index={i}
                  isActive={i === activeIndex}
                  accessible={accessible}
                  completed={completedMap[ch.id]}
                  onClick={() => accessible && setActiveIndex(i)}
                />
              )
            })}

            {sortedSections.map((section) => {
              const sectionChapters = chaptersBySection(section.id)
              if (sectionChapters.length === 0 && rootChapters.length > 0) return null
              return (
                <div key={section.id} className="mt-2">
                  <div className="px-3 py-2.5">
                    <p className="text-[10px] font-bold text-warm-400 uppercase tracking-widest">{section.title}</p>
                    {section.description && (
                      <p className="text-[11px] text-warm-400 mt-0.5 leading-snug">{section.description}</p>
                    )}
                  </div>
                  {sectionChapters.map((ch) => {
                    const i = chapters.indexOf(ch)
                    const accessible = isAccessible(i)
                    return (
                      <ChapterButton
                        key={ch.id}
                        chapter={ch}
                        index={i}
                        isActive={i === activeIndex}
                        accessible={accessible}
                        completed={completedMap[ch.id]}
                        onClick={() => accessible && setActiveIndex(i)}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════ CHAPTER BUTTON ═══════════ */

function ChapterButton({
  chapter,
  index,
  isActive,
  accessible,
  completed,
  onClick,
}: {
  chapter: Chapter
  index: number
  isActive: boolean
  accessible: boolean
  completed: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!accessible}
      className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] transition-all duration-200 flex items-center gap-2.5 group ${
        isActive
          ? "bg-primary text-white font-medium shadow-sm"
          : accessible
          ? "hover:bg-warm-50 text-warm-600"
          : "opacity-35 cursor-not-allowed text-warm-400"
      }`}
    >
      {/* Status indicator */}
      <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${
        isActive
          ? "bg-white/20 text-white"
          : completed
          ? "bg-emerald-100 text-emerald-600"
          : "bg-warm-100 text-warm-400"
      }`}>
        {completed && !isActive ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : !accessible ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        ) : (
          <span>{index + 1}</span>
        )}
      </div>
      <span className="truncate flex-1">{chapter.title}</span>
    </button>
  )
}

/* ═══════════ EXERCISE BLOCK ═══════════ */

function ExerciseBlock({
  exercise,
  userId,
  preview,
}: {
  exercise: Exercise
  userId: string
  preview?: boolean
}) {
  const [answers, setAnswers] = useState<Record<string, { selectedChoiceId?: string; responseText?: string }>>({})
  const [submitted, setSubmitted] = useState(false)
  const [corrections, setCorrections] = useState<any[]>([])
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [existingResponse, setExistingResponse] = useState<any>(null)

  useEffect(() => {
    if (preview) return
    fetch(`/api/exercises/${exercise.id}/responses`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) setExistingResponse(data)
      })
      .catch(() => {})
  }, [exercise.id, preview])

  const handleSubmit = async () => {
    setSubmitting(true)
    const answerList = exercise.questions.map((q) => ({
      questionId: q.id,
      selectedChoiceId: answers[q.id]?.selectedChoiceId,
      responseText: answers[q.id]?.responseText,
    }))

    try {
      const res = await fetch(`/api/exercises/${exercise.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answerList, preview: !!preview }),
      })
      if (res.ok) {
        const data = await res.json()
        setCorrections(data.corrections)
        setScore({ correct: data.correct, total: data.total })
        setSubmitted(true)
      }
    } catch {}
    finally { setSubmitting(false) }
  }

  const getCorrection = (questionId: string) =>
    corrections.find((c) => c.questionId === questionId)

  const typeLabel = exercise.type === "QCM" ? "QCM" : exercise.type === "VRAI_FAUX" ? "Vrai / Faux" : "Rédaction"

  return (
    <div id={`exercise-${exercise.id}`} className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-5 scroll-mt-24">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700">
          {typeLabel}
        </span>
        <h3 className="font-display text-base font-semibold text-primary">{exercise.title}</h3>
      </div>

      {exercise.instructions && (
        <p className="text-sm text-warm-500 leading-relaxed">{exercise.instructions}</p>
      )}

      {existingResponse && !submitted && (
        <div className="flex items-center gap-2 text-sm bg-emerald-50 text-emerald-700 rounded-xl px-4 py-3 border border-emerald-100">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Exercice complété{existingResponse.score != null ? ` — Score : ${Math.round(existingResponse.score * 100)}%` : ""}
        </div>
      )}

      <div className="space-y-5">
        {exercise.questions.map((q, qi) => {
          const correction = getCorrection(q.id)
          return (
            <div key={q.id} className="space-y-2.5">
              <p className="text-sm font-semibold text-primary">{qi + 1}. {q.text}</p>

              {(exercise.type === "QCM" || exercise.type === "VRAI_FAUX") && (
                <div className="space-y-1.5 ml-1">
                  {q.choices.map((choice) => {
                    const selected = answers[q.id]?.selectedChoiceId === choice.id
                    let classes = "border-border hover:border-warm-300 hover:bg-warm-50"
                    if (submitted && correction) {
                      if (choice.id === correction.correctChoiceId) classes = "border-emerald-300 bg-emerald-50"
                      else if (selected && !correction.isCorrect) classes = "border-rose-300 bg-rose-50"
                    } else if (selected) {
                      classes = "border-primary bg-primary/5"
                    }

                    return (
                      <label
                        key={choice.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${classes} ${submitted ? "pointer-events-none" : ""}`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={selected}
                          onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: { selectedChoiceId: choice.id } }))}
                          disabled={submitted}
                          className="accent-primary w-4 h-4"
                        />
                        <span className="text-sm text-warm-700 flex-1">{choice.text}</span>
                        {submitted && choice.id === correction?.correctChoiceId && (
                          <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                        {submitted && selected && !correction?.isCorrect && choice.id !== correction?.correctChoiceId && (
                          <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}

              {exercise.type === "REDACTION" && (
                <textarea
                  value={answers[q.id]?.responseText || ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: { responseText: e.target.value } }))}
                  placeholder="Votre réponse..."
                  rows={4}
                  disabled={submitted}
                  className="w-full px-4 py-3 text-sm border border-border rounded-xl outline-none focus:border-primary focus:ring-1 focus:ring-primary/10 resize-none disabled:bg-warm-50 transition-all"
                />
              )}
            </div>
          )
        })}
      </div>

      {!submitted ? (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98]"
        >
          {submitting ? "Validation..." : "Valider mes réponses"}
        </button>
      ) : (
        <div className="space-y-2">
          {score && (
            <div className={`flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-3 ${
              score.correct === score.total ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
            }`}>
              {score.correct === score.total ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
              Score : {score.correct}/{score.total} bonne{score.correct > 1 ? "s" : ""} réponse{score.correct > 1 ? "s" : ""}
            </div>
          )}
          {exercise.type === "REDACTION" && (
            <p className="text-xs text-warm-400 italic">Réponse enregistrée. Pas de correction automatique pour les questions de rédaction.</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════ VIMEO PLAYER ═══════════ */

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
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasEndedRef = useRef(false)
  const currentTimeRef = useRef(0)
  const [processing, setProcessing] = useState(false)
  const playerReadyRef = useRef(false)

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
    const iframe = iframeRef.current
    if (!iframe) return

    const postToVimeo = (method: string, value?: any) => {
      const msg: Record<string, any> = { method }
      if (value !== undefined) msg.value = value
      iframe.contentWindow?.postMessage(JSON.stringify(msg), "https://player.vimeo.com")
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://player.vimeo.com") return
      let data: any
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
      } catch { return }

      if (data.event === "ready") {
        playerReadyRef.current = true
        postToVimeo("addEventListener", "timeupdate")
        postToVimeo("addEventListener", "ended")
        if (lastPosition > 0) {
          postToVimeo("setCurrentTime", lastPosition)
        }
      }

      if (data.event === "timeupdate" && typeof data.data?.seconds === "number") {
        currentTimeRef.current = data.data.seconds
      }

      if (data.event === "ended") {
        if (hasEndedRef.current) return
        hasEndedRef.current = true
        saveProgress(0, true)
      }
    }

    window.addEventListener("message", handleMessage)

    progressTimerRef.current = setInterval(() => {
      if (currentTimeRef.current > 0 && !hasEndedRef.current) {
        saveProgress(currentTimeRef.current)
      }
    }, 30000)

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/upload/video/${vimeoId}/status`)
        const data = await res.json()
        if (data.status === "transcoding" || data.status === "transcode_starting") {
          setProcessing(true)
        }
      } catch {}
    }
    checkStatus()

    return () => {
      window.removeEventListener("message", handleMessage)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      if (currentTimeRef.current > 0 && !hasEndedRef.current) {
        fetch(`/api/progress/${chapterId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastPosition: Math.floor(currentTimeRef.current) }),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [vimeoId, chapterId, lastPosition, saveProgress])

  if (processing) {
    return (
      <div className="aspect-video bg-warm-100 rounded-2xl flex items-center justify-center border border-warm-200">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-warm-300 border-t-warm-500 animate-spin" />
          <p className="text-warm-600 text-sm font-medium">Vidéo en cours de traitement</p>
          <p className="text-warm-400 text-xs mt-1">Revenez dans quelques minutes</p>
        </div>
      </div>
    )
  }

  return (
    <div className="aspect-video bg-primary rounded-2xl overflow-hidden shadow-lg">
      <iframe
        ref={iframeRef}
        src={`https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0&dnt=1&api=1&outro=0`}
        style={{ border: "none", width: "100%", height: "100%" }}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
