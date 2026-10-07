"use client"

import { useEffect, useState, type FormEvent } from "react"
import Modal from "@/components/ui/Modal"
import { parisInput, parisInputToIso, studentName, trainerRequest, type TrainerAssignment, type TrainerSession } from "./data"

export default function SessionEditor({ open, onClose, onSaved, students, assignmentId, session }: {
  open: boolean; onClose: () => void; onSaved: () => void
  students: TrainerAssignment[]; assignmentId?: string; session?: TrainerSession | null
}) {
  const [studentId, setStudentId] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [duration, setDuration] = useState("60")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!open) return
    setStudentId(session?.assignmentId || assignmentId || students[0]?.id || "")
    setStartsAt(session ? parisInput(session.startsAt) : "")
    setDuration(String(session?.durationMinutes || 60)); setNote(session?.note || ""); setError("")
  }, [open, session, assignmentId, students])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError("")
    try {
      const minutes = Number(duration)
      if (!studentId || !Number.isInteger(minutes) || minutes <= 0) throw new Error("Choisissez un élève et une durée positive en minutes.")
      const body = { startsAt: parisInputToIso(startsAt), durationMinutes: minutes, note: note.trim() || null }
      await trainerRequest(session ? `sessions/${encodeURIComponent(session.id)}` : `assignments/${encodeURIComponent(studentId)}/sessions`, {
        method: session ? "PATCH" : "POST", body: JSON.stringify(body),
      })
      onSaved(); onClose()
    } catch (error) { setError(error instanceof Error ? error.message : "La séance n’a pas pu être enregistrée.") }
    finally { setBusy(false) }
  }
  return <Modal open={open} onClose={() => { if (!busy) onClose() }} title={session ? "Modifier la séance" : "Ajouter une séance"}>
    <form className="trainer-session-form" onSubmit={submit} aria-busy={busy}>
      <label>Élève<select className="input-field" value={studentId} onChange={event => setStudentId(event.target.value)} disabled={busy || !!session || !!assignmentId} required>
        {!studentId && <option value="">Choisir un élève</option>}
        {students.map(student => <option key={student.id} value={student.id}>{studentName(student)}</option>)}
      </select></label>
      <label>Date et heure <small>Heure de Paris</small><input className="input-field" type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} disabled={busy} required /></label>
      <label>Durée en minutes<input className="input-field" type="number" min="1" step="1" value={duration} onChange={event => setDuration(event.target.value)} disabled={busy} required /></label>
      <label>Note<textarea className="input-field" rows={3} maxLength={20000} value={note} onChange={event => setNote(event.target.value)} disabled={busy} /></label>
      {error && <p className="trainer-error" role="alert">{error}</p>}
      <div className="trainer-form-actions"><button className="trainer-button" type="button" onClick={onClose} disabled={busy}>Fermer</button><button className="lms-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button></div>
    </form>
  </Modal>
}
