"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Badge from "@/components/ui/Badge"

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

  const active = chapters[activeIndex]

  const isAccessible = (index: number) => {
    if (preview) return true
    if (index === 0) return true
    return completedMap[chapters[index - 1]?.id]
  }

  const handleChapterCompleted = (chapterId: string) => {
    setCompletedMap((prev) => ({ ...prev, [chapterId]: true }))
  }

  // Group chapters by section for sidebar
  const sortedSections = (sections || []).sort((a, b) => a.order - b.order)
  const rootChapters = chapters.filter((c) => !c.sectionId)
  const chaptersBySection = (sectionId: string) =>
    chapters.filter((c) => c.sectionId === sectionId)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Player */}
      <div className="lg:col-span-2 space-y-4">
        {formationCoverUrl ? (
          <div className="relative h-[80px] rounded-xl overflow-hidden">
            <img src={formationCoverUrl} alt={formationTitle} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-0 flex items-center px-5">
              <h1 className="text-lg font-semibold text-white">{formationTitle}</h1>
            </div>
          </div>
        ) : (
          <h1 className="text-lg font-semibold">{formationTitle}</h1>
        )}

        {active?.videoUrl ? (
          preview ? (
            <div className="aspect-video bg-black rounded-xl overflow-hidden">
              <iframe
                src={`https://iframe.cloudflarestream.com/${active.videoUrl}`}
                className="w-full h-full"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <CloudflarePlayer
              key={active.id}
              streamId={active.videoUrl}
              chapterId={active.id}
              lastPosition={active.lastPosition}
              onCompleted={() => handleChapterCompleted(active.id)}
            />
          )
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

        {/* Exercises */}
        {active?.exercises?.length > 0 && (
          <div className="space-y-4">
            {active.exercises.map((ex) => (
              <ExerciseBlock
                key={ex.id}
                exercise={ex}
                userId={userId}
                preview={preview}
              />
            ))}
          </div>
        )}

        {/* Formation-level attachments */}
        {formationAttachments && formationAttachments.length > 0 && (
          <div className="bg-white rounded-xl border border-border p-6">
            <h3 className="text-sm font-semibold mb-2">Documents de la formation</h3>
            <div className="space-y-1">
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

      {/* Sidebar chapitres */}
      <div className="bg-white rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Chapitres</h3>
        <div className="space-y-1">
          {/* Root chapters */}
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

          {/* Sections with chapters */}
          {sortedSections.map((section) => {
            const sectionChapters = chaptersBySection(section.id)
            if (sectionChapters.length === 0 && rootChapters.length > 0) return null
            return (
              <div key={section.id} className="mt-3">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{section.title}</p>
                  {section.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{section.description}</p>
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
      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
        isActive
          ? "bg-gray-100 font-medium"
          : accessible
          ? "hover:bg-gray-50"
          : "opacity-40 cursor-not-allowed"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-5">{index + 1}.</span>
        <span className="truncate">{chapter.title}</span>
      </span>
      {completed && <Badge variant="success">OK</Badge>}
      {!accessible && <span className="text-xs">🔒</span>}
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

  // Load existing response
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

  return (
    <div className="bg-white rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="default">
          {exercise.type === "QCM" ? "QCM" : exercise.type === "VRAI_FAUX" ? "Vrai/Faux" : "Rédaction"}
        </Badge>
        <h3 className="text-sm font-semibold">{exercise.title}</h3>
      </div>

      {exercise.instructions && (
        <p className="text-sm text-gray-500">{exercise.instructions}</p>
      )}

      {existingResponse && !submitted && (
        <div className="text-sm bg-green-50 text-green-600 rounded-lg px-4 py-3">
          Exercice déjà complété{existingResponse.score != null ? ` — Score : ${Math.round(existingResponse.score * 100)}%` : ""}
        </div>
      )}

      <div className="space-y-4">
        {exercise.questions.map((q, qi) => {
          const correction = getCorrection(q.id)
          return (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-medium">{qi + 1}. {q.text}</p>

              {(exercise.type === "QCM" || exercise.type === "VRAI_FAUX") && (
                <div className="space-y-1 ml-4">
                  {q.choices.map((choice) => {
                    const selected = answers[q.id]?.selectedChoiceId === choice.id
                    let bgClass = ""
                    if (submitted && correction) {
                      if (choice.id === correction.correctChoiceId) bgClass = "bg-green-50 border-green-300"
                      else if (selected && !correction.isCorrect) bgClass = "bg-red-50 border-red-300"
                    }

                    return (
                      <label
                        key={choice.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer ${
                          bgClass || (selected ? "border-primary bg-blue-50" : "border-border hover:bg-gray-50")
                        } ${submitted ? "pointer-events-none" : ""}`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={selected}
                          onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: { selectedChoiceId: choice.id } }))}
                          disabled={submitted}
                          className="accent-primary"
                        />
                        <span className="text-sm">{choice.text}</span>
                        {submitted && choice.id === correction?.correctChoiceId && (
                          <span className="text-green-600 text-xs ml-auto">✓</span>
                        )}
                        {submitted && selected && !correction?.isCorrect && choice.id !== correction?.correctChoiceId && (
                          <span className="text-red-600 text-xs ml-auto">✗</span>
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
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary resize-none disabled:bg-gray-50"
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
          className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Validation..." : "Valider mes réponses"}
        </button>
      ) : (
        <div className="space-y-2">
          {score && (
            <div className={`text-sm font-medium rounded-lg px-4 py-3 ${
              score.correct === score.total ? "bg-green-50 text-green-600" : "bg-yellow-50 text-yellow-700"
            }`}>
              Score : {score.correct}/{score.total} bonne{score.correct > 1 ? "s" : ""} réponse{score.correct > 1 ? "s" : ""}
            </div>
          )}
          {exercise.type === "REDACTION" && (
            <p className="text-xs text-gray-400">Réponse enregistrée. Pas de correction automatique pour les questions de rédaction.</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════ CLOUDFLARE STREAM PLAYER ═══════════ */

function CloudflarePlayer({
  streamId,
  chapterId,
  lastPosition,
  onCompleted,
}: {
  streamId: string
  chapterId: string
  lastPosition: number
  onCompleted: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasEndedRef = useRef(false)
  const currentTimeRef = useRef(0)
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
    const iframe = iframeRef.current
    if (!iframe) return

    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "string") return
      try {
        const data = JSON.parse(event.data)
        if (data.type === "stream:timeupdate" && typeof data.currentTime === "number") {
          currentTimeRef.current = data.currentTime
        }
        if (data.type === "stream:ended") {
          if (hasEndedRef.current) return
          hasEndedRef.current = true
          saveProgress(0, true)
        }
      } catch {}
    }

    window.addEventListener("message", handleMessage)

    // Save progress every 30 seconds
    progressTimerRef.current = setInterval(() => {
      if (currentTimeRef.current > 0 && !hasEndedRef.current) {
        saveProgress(currentTimeRef.current)
      }
    }, 30000)

    // Check if video is ready
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/upload/video/${streamId}/status`)
        const data = await res.json()
        if (data.status === "processing") {
          setProcessing(true)
        }
      } catch {}
    }
    checkStatus()

    return () => {
      window.removeEventListener("message", handleMessage)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      if (currentTimeRef.current > 0 && !hasEndedRef.current) {
        saveProgress(currentTimeRef.current)
      }
    }
  }, [streamId, chapterId, saveProgress])

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

  const startTime = lastPosition > 0 ? `#t=${lastPosition}s` : ""

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden">
      <iframe
        ref={iframeRef}
        src={`https://iframe.cloudflarestream.com/${streamId}?autoplay=false&preload=auto${startTime}`}
        className="w-full h-full"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
