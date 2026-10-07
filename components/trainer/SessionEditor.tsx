"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Modal from "@/components/ui/Modal"
import ActionConfirmation from "./ActionConfirmation"
import { dateTimeLabel, notificationWarning, parisInput, parisInputToIso, safeVisioUrl, studentName, trainerRequest, type TrainerAssignment, type TrainerSession } from "./data"

type SessionInput = { startsAt: string; durationMinutes: number; note: string | null; visioUrl: string | null }

export default function SessionEditor({ open, onClose, onSaved, students, assignmentId, session, initialStartsAt }: {
  open: boolean; onClose: () => void; onSaved: (warning?: string) => void
  students: TrainerAssignment[]; assignmentId?: string; session?: TrainerSession | null; initialStartsAt?: string
}) {
  const [studentId, setStudentId] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [duration, setDuration] = useState("60")
  const [visioUrl, setVisioUrl] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [review, setReview] = useState<SessionInput | null>(null)
  const saving = useRef(false)
  useEffect(() => {
    if (!open) return
    setStudentId(session?.assignmentId || assignmentId || "")
    setStartsAt(session ? parisInput(session.startsAt) : initialStartsAt || "")
    setDuration(String(session?.durationMinutes || 60)); setNote(session?.note || "")
    setVisioUrl(session?.visioUrl || ""); setError(""); setReview(null)
  }, [open, session, assignmentId, initialStartsAt])
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("")
    try {
      const minutes = Number(duration)
      if (!students.some(student => student.id === studentId) || !Number.isInteger(minutes) || minutes <= 0) throw new Error("Choisissez un élève et une durée positive en minutes.")
      const link = visioUrl.trim()
      if (link && !safeVisioUrl(link)) throw new Error("Le lien visio doit commencer par https://, sans identifiant ni mot de passe.")
      setReview({ startsAt: parisInputToIso(startsAt), durationMinutes: minutes, note: note.trim() || null, visioUrl: link || null })
    } catch (error) { setError(error instanceof Error ? error.message : "Vérifiez les champs de la séance.") }
  }
  async function confirm() {
    if (!review || saving.current) return
    saving.current = true; setBusy(true); setError("")
    try {
      const result = await trainerRequest(session ? `sessions/${encodeURIComponent(session.id)}` : `assignments/${encodeURIComponent(studentId)}/sessions`, {
        method: session ? "PATCH" : "POST", body: JSON.stringify(review),
      })
      onSaved(notificationWarning(result)); onClose()
    } catch (error) { setError(error instanceof Error ? error.message : "La séance n’a pas pu être enregistrée.") }
    finally { saving.current = false; setBusy(false) }
  }
  const student = students.find(row => row.id === studentId)
  const changedTime = !!session && !!review && (session.startsAt !== review.startsAt || session.durationMinutes !== review.durationMinutes)
  if (review) return <ActionConfirmation open={open} title={session ? changedTime ? "Confirmer le déplacement" : "Confirmer la modification" : "Confirmer la création"} busy={busy} error={error} onClose={() => { setReview(null); setError("") }} onConfirm={() => { void confirm() }} mailNotice={`Un mail sera envoyé à ${student ? studentName(student) : "l’élève"} et à vous. Aucune copie à Switching.`}>
    <h3>{student && studentName(student)}</h3>
    <dl>
      {session && changedTime && <><dt>Avant</dt><dd>{dateTimeLabel(session.startsAt)} · {session.durationMinutes} min</dd></>}
      <dt>{changedTime ? "Après" : "Séance"}</dt><dd>{dateTimeLabel(review.startsAt)} · {review.durationMinutes} min</dd>
      <dt>Lien visio</dt><dd>{review.visioUrl || "Non renseigné"}</dd>
      {review.note && <><dt>Note</dt><dd>{review.note}</dd></>}
    </dl><p className="trainer-muted">Rappel par mail 30 min avant, à l’élève et à vous.</p>
  </ActionConfirmation>
  return <Modal open={open} onClose={onClose} title={session ? "Modifier ou déplacer la séance" : "Ajouter une séance"}>
    <form className="trainer-session-form" onSubmit={submit}>
      <label>Élève<select aria-label="Élève" className="input-field" value={studentId} onChange={event => setStudentId(event.target.value)} disabled={!!session || !!assignmentId} required>
        <option value="">Choisir un élève</option>
        {students.map(student => <option key={student.id} value={student.id}>{studentName(student)}</option>)}
      </select></label>
      <label>Date et heure <small>Heure de Paris</small><input className="input-field" type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} required /></label>
      <label>Durée en minutes<input className="input-field" type="number" min="1" max="1440" step="1" value={duration} onChange={event => setDuration(event.target.value)} required /></label>
      <label>Lien visio<input className="input-field" type="url" placeholder="https://…" value={visioUrl} onChange={event => setVisioUrl(event.target.value)} maxLength={2000} /></label>
      <label>Note<textarea aria-label="Note de séance" className="input-field" rows={3} maxLength={20000} value={note} onChange={event => setNote(event.target.value)} /></label>
      <p className="trainer-muted">Rappel par mail 30 min avant, à l’élève et à vous.</p>
      {error && <p className="trainer-error" role="alert">{error}</p>}
      <div className="trainer-form-actions"><button className="trainer-button" type="button" onClick={onClose}>Fermer</button><button className="lms-primary" type="submit">Vérifier la séance</button></div>
    </form>
  </Modal>
}
