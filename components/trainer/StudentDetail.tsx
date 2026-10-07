"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Mail, Phone, Plus } from "lucide-react"
import { dateLabel, notificationWarning, studentName, trainerRequest, type TrainerAssignment, type TrainerSession } from "./data"
import StepChecklist from "./StepChecklist"
import Progress from "./Progress"
import SessionEditor from "./SessionEditor"
import SessionRow from "./SessionRow"
import ContactHistory from "./ContactHistory"
import ActionConfirmation from "./ActionConfirmation"
import SessionActionDialog, { type SessionAction } from "./SessionActionDialog"

export default function StudentDetail({ id }: { id: string }) {
  const [student, setStudent] = useState<TrainerAssignment | null>(null)
  const [sessions, setSessions] = useState<TrainerSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [editing, setEditing] = useState<TrainerSession | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [action, setAction] = useState<SessionAction | null>(null)
  const [elearningOpen, setElearningOpen] = useState(false)
  const [elearningBusy, setElearningBusy] = useState(false)
  const [elearningError, setElearningError] = useState("")
  const adding = useRef(false)
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
  useEffect(() => { const controller = new AbortController(); setLoading(true); setStudent(null); setNotice(""); void load(controller.signal); return () => controller.abort() }, [load])
  const options = useMemo(() => student ? [student] : [], [student])
  function saved(warning?: string) { setNotice(warning || "Enregistré."); void load() }
  async function addElearning() {
    if (adding.current || !student) return
    adding.current = true; setElearningBusy(true); setElearningError("")
    try {
      const result = await trainerRequest(`assignments/${encodeURIComponent(id)}/elearning`, { method: "POST" })
      setNotice(notificationWarning(result) || "L’accès e-learning a été ajouté."); setElearningOpen(false); await load()
    } catch (error) { setElearningError(error instanceof Error ? error.message : "L’accès e-learning n’a pas pu être ajouté.") }
    finally { adding.current = false; setElearningBusy(false) }
  }
  return <div className="trainer-page">
    <Link href="/trainer/eleves" className="trainer-back"><ArrowLeft size={17} aria-hidden />Mes élèves</Link>
    {loading && <p className="trainer-empty" role="status">Chargement de la fiche…</p>}
    {error && <p className="trainer-error" role="alert">{error}</p>}
    {notice && <p className="trainer-callout" role="status">{notice}</p>}
    {student && <>
      <section className="trainer-card trainer-detail-card">
        <div className="trainer-card-heading"><h1>{student.civility && `${student.civility} `}{studentName(student)}</h1><span className={`trainer-kind ${student.hasElearning ? "is-bonus" : "is-visio"}`}>{student.hasElearning ? "Visio + bonus" : "Visio seule"}</span></div>
        <p className="trainer-muted">{student.formationLabel}{student.visioHours != null && ` · ${student.visioHours} h de visio`}</p>
        <div className="trainer-contacts"><a href={`mailto:${student.email}`}><Mail size={17} aria-hidden />{student.email}</a>{student.phone && <a href={`tel:${student.phone.replace(/[^\d+]/g, "")}`}><Phone size={17} aria-hidden />{student.phone}</a>}</div>
        <div className="trainer-date-grid">
          <div><span>Démarrage administratif</span><strong>{dateLabel(student.adminStartAt)}</strong><small>Accès SILAE au jour du démarrage</small></div>
          <div><span>Visios à partir du</span><strong>{dateLabel(student.visioStartAt)}</strong></div>
          <div><span>Fin administrative</span><strong>{student.adminEndAt ? dateLabel(student.adminEndAt) : "Non renseignée"}</strong></div>
        </div>
        <StepChecklist student={student} />
      </section>
      <ContactHistory assignmentId={student.id} hasContact={!!student.contactDoneAt} onSaved={() => { void load() }} />
      <section className="trainer-card trainer-detail-card">
        <div className="trainer-section-heading"><h2>Séances de l’élève</h2><button className="trainer-button" onClick={() => { setEditing(null); setEditorOpen(true) }}><Plus size={16} aria-hidden />Ajouter une séance</button></div>
        {sessions.length ? sessions.map(session => <SessionRow key={session.id} session={session} onEdit={() => { setEditing(session); setEditorOpen(true) }} onCancel={() => setAction({ session, studentName: studentName(student), kind: "cancel" })} onDelete={() => setAction({ session, studentName: studentName(student), kind: "delete" })} />) : <p className="trainer-muted">Aucune séance.</p>}
        {student.hasElearning && student.learnerId && <div className="trainer-calendar-actions"><Link className="trainer-button trainer-message-link" href={`/trainer/messages?learnerId=${encodeURIComponent(student.learnerId)}`}>Envoyer un message</Link><Link className="trainer-button trainer-message-link" href="/trainer/corrections">Voir les exercices à corriger</Link></div>}
      </section>
      {student.hasElearning ? <section className="trainer-card trainer-detail-card"><Progress assignmentId={student.id} detail /></section> : <section className="trainer-card trainer-detail-card"><h2>E-learning et exercices</h2><p className="trainer-muted">Cet élève suit actuellement les visios seules. Vous pouvez lui ajouter le bonus e-learning gratuit, sans changement des heures CPF.</p><button className="trainer-button" onClick={() => { setElearningError(""); setElearningOpen(true) }}>Ajouter l’e-learning</button></section>}
      <SessionEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={saved} students={options} assignmentId={student.id} session={editing} />
      <SessionActionDialog action={action} onClose={() => setAction(null)} onSaved={saved} />
      <ActionConfirmation open={elearningOpen} title="Ajouter l’e-learning" busy={elearningBusy} error={elearningError} onClose={() => setElearningOpen(false)} onConfirm={() => { void addElearning() }} confirmLabel="Ajouter l’e-learning" mailNotice={`Un compte e-learning sera créé et ${studentName(student)} recevra ses identifiants par mail.`}>
        <h3>{studentName(student)}</h3><p>Accès à « SILAE — Bonus e-learning » et aux exercices. Ce bonus est gratuit et ne modifie ni le dossier EDOF ni les heures CPF.</p>
      </ActionConfirmation>
    </>}
  </div>
}
