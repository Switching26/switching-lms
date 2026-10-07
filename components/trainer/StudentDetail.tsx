"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Mail, Phone, Plus } from "lucide-react"
import { dateLabel, studentName, trainerRequest, type TrainerAssignment, type TrainerSession } from "./data"
import StepChecklist from "./StepChecklist"
import Progress from "./Progress"
import SessionEditor from "./SessionEditor"
import SessionRow from "./SessionRow"

export default function StudentDetail({ id }: { id: string }) {
  const [student, setStudent] = useState<TrainerAssignment | null>(null)
  const [sessions, setSessions] = useState<TrainerSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busySession, setBusySession] = useState<string | null>(null)
  const [editing, setEditing] = useState<TrainerSession | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const load = useCallback(async (signal?: AbortSignal) => {
    setError("")
    try {
      const [assignment, rows] = await Promise.all([
        trainerRequest<TrainerAssignment>(`assignments/${encodeURIComponent(id)}`, { signal }),
        trainerRequest<TrainerSession[]>(`assignments/${encodeURIComponent(id)}/sessions`, { signal }),
      ])
      if (signal?.aborted) return
      setStudent(assignment); setSessions(rows)
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "La fiche n’a pas pu être chargée.") }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [id])
  useEffect(() => { const controller = new AbortController(); setLoading(true); setStudent(null); void load(controller.signal); return () => controller.abort() }, [load])
  const options = useMemo(() => student ? [student] : [], [student])
  async function cancel(session: TrainerSession) {
    setBusySession(session.id); setError("")
    try {
      const updated = await trainerRequest<TrainerSession>(`sessions/${encodeURIComponent(session.id)}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) })
      setSessions(current => current.map(row => row.id === updated.id ? updated : row))
    } catch (error) { setError(error instanceof Error ? error.message : "La séance n’a pas pu être annulée.") }
    finally { setBusySession(null) }
  }
  return <div className="trainer-page">
    <Link href="/trainer/eleves" className="trainer-back"><ArrowLeft size={17} aria-hidden />Mes élèves</Link>
    {loading && <p className="trainer-empty" role="status">Chargement de la fiche…</p>}
    {error && <p className="trainer-error" role="alert">{error}</p>}
    {student && <>
      <section className="trainer-card trainer-detail-card">
        <div className="trainer-card-heading"><h1>{student.civility && `${student.civility} `}{studentName(student)}</h1><span className={`trainer-kind ${student.hasElearning ? "is-bonus" : "is-visio"}`}>{student.hasElearning ? "Visio + bonus" : "Visio seule"}</span></div>
        <p className="trainer-muted">{student.formationLabel}{student.visioHours != null && ` · ${student.visioHours} h de visio`}</p>
        <div className="trainer-contacts"><a href={`mailto:${student.email}`}><Mail size={17} aria-hidden />{student.email}</a>{student.phone && <a href={`tel:${student.phone.replace(/[^\d+]/g, "")}`}><Phone size={17} aria-hidden />{student.phone}</a>}</div>
        <div className="trainer-date-grid">
          <div><span>Démarrage administratif</span><strong>{dateLabel(student.adminStartAt)}</strong><small>Contact + accès SILAE</small></div>
          <div><span>Visios à partir du</span><strong>{dateLabel(student.visioStartAt)}</strong></div>
          <div><span>Fin administrative</span><strong>{student.adminEndAt ? dateLabel(student.adminEndAt) : "Non renseignée"}</strong></div>
        </div>
        <StepChecklist student={student} onChange={setStudent} />
      </section>
      <section className="trainer-card trainer-detail-card">
        <div className="trainer-section-heading"><h2>Séances planifiées</h2><button className="trainer-button" onClick={() => { setEditing(null); setEditorOpen(true) }}><Plus size={16} aria-hidden />Ajouter une séance</button></div>
        {sessions.length ? sessions.map(session => <SessionRow key={session.id} session={session} onEdit={() => { setEditing(session); setEditorOpen(true) }} onCancel={() => cancel(session)} busy={busySession !== null} />) : <p className="trainer-muted">Aucune séance.</p>}
        {student.hasElearning && student.learnerId && <Link className="trainer-button trainer-message-link" href={`/trainer/messages?learnerId=${encodeURIComponent(student.learnerId)}`}>Envoyer un message</Link>}
      </section>
      {student.hasElearning ? <section className="trainer-card trainer-detail-card"><Progress assignmentId={student.id} detail /></section> : <p className="trainer-callout">Visio seule : pas d’espace e-learning. Vous suivez ici le contact, l’accès SILAE, le planning et les séances.</p>}
      <SessionEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => { void load() }} students={options} assignmentId={student.id} session={editing} />
    </>}
  </div>
}
