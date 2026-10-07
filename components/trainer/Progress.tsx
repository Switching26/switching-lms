"use client"

import { useEffect, useState } from "react"
import { dateLabel, trainerRequest, type TrainerProgress } from "./data"

export default function Progress({ assignmentId, detail = false }: { assignmentId: string; detail?: boolean }) {
  const [progress, setProgress] = useState<TrainerProgress | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    setProgress(null); setError("")
    trainerRequest<TrainerProgress>(`assignments/${encodeURIComponent(assignmentId)}/progress`, { signal: controller.signal })
      .then(setProgress).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Progression indisponible.") })
    return () => controller.abort()
  }, [assignmentId])
  if (error) return <p className="trainer-error" role="alert">{error}</p>
  if (!progress) return <p className="trainer-muted" role="status">Chargement de la progression…</p>
  if (!progress.hasElearning) return null
  // Never turn a missing progress value into an invented 0%.
  if (progress.percent == null) return <p className="trainer-muted">Progression e-learning indisponible</p>
  const value = Math.min(100, Math.max(0, progress.percent))
  const formation = progress.formations[0]
  return <div className="trainer-progress">
    {detail && <h2>Progression e-learning</h2>}
    <div className="progress-bar" role="progressbar" aria-label="Progression e-learning" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className="progress-bar-fill" style={{ width: `${value}%` }} /></div>
    <p className="trainer-muted">{detail ? `${value} %` : `E-learning ${value} %`}
      {detail && formation?.completedChapters != null && formation.totalChapters != null && ` · ${formation.completedChapters}/${formation.totalChapters} chapitres`}
      {detail && ` · Dernière activité : ${progress.lastActivity ? dateLabel(progress.lastActivity) : "aucune pour l’instant"}`}
    </p>
  </div>
}
