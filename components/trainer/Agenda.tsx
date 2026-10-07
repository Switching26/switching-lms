"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { dayKey, parisInputToIso, studentName, trainerRequest, type TrainerAssignment, type TrainerSession } from "./data"
import SessionEditor from "./SessionEditor"
import SessionRow from "./SessionRow"

type AgendaSession = TrainerSession & { assignment: Pick<TrainerAssignment, "id" | "firstName" | "lastName"> }
type AgendaEvent = { id: string; date: string; kind: "session" | "start" | "visio"; student: Pick<TrainerAssignment, "id" | "firstName" | "lastName">; text?: string; session?: AgendaSession }

export default function Agenda() {
  const [students, setStudents] = useState<TrainerAssignment[]>([])
  const [sessions, setSessions] = useState<AgendaSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [view, setView] = useState<"list" | "week" | "month">("list")
  const [today] = useState(() => dayKey(new Date()))
  const [editing, setEditing] = useState<TrainerSession | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [busySession, setBusySession] = useState<string | null>(null)
  const load = useCallback(async (signal?: AbortSignal) => {
    setError("")
    try {
      const assignments = await trainerRequest<TrainerAssignment[]>("assignments", { signal })
      // The list includes sessions, so this range covers all assigned students,
      // including their past and future sessions rather than an arbitrary horizon.
      const dates = [today, ...assignments.flatMap(student => [dayKey(student.adminStartAt), ...(student.visioStartAt ? [dayKey(student.visioStartAt)] : []), ...(student.sessions || []).map(session => dayKey(session.startsAt))])].sort()
      const from = parisInputToIso(`${dates[0]}T00:00`)
      const last = new Date(`${dates[dates.length - 1]}T12:00:00Z`)
      last.setUTCDate(last.getUTCDate() + 1)
      const to = parisInputToIso(`${dayKey(last)}T00:00`)
      const rows = await trainerRequest<AgendaSession[]>(`agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal })
      if (signal?.aborted) return
      setStudents(assignments); setSessions(rows)
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "L’agenda n’a pas pu être chargé.") }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [today])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  const events = useMemo(() => {
    const rows: AgendaEvent[] = sessions.map(session => ({ id: session.id, date: session.startsAt, kind: "session", student: session.assignment, session }))
    for (const student of students) {
      const missing = [!student.contactDoneAt && "contact", !student.silaeAccessSentAt && "accès SILAE", !student.planningAgreedAt && "planning"].filter(Boolean)
      if (missing.length) rows.push({ id: `admin-${student.id}`, date: student.adminStartAt, kind: "start", student, text: `Démarrage : ${missing.join(" + ")}` })
      if (student.visioStartAt && !student.planningAgreedAt) rows.push({ id: `visio-${student.id}`, date: student.visioStartAt, kind: "visio", student, text: "Visios prévues dès ce jour, planning à fixer" })
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  }, [students, sessions])
  const weekStart = new Date(`${today}T12:00:00Z`)
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7)
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)
  const visible = events.filter(event => view === "list" || (view === "month" ? dayKey(event.date).slice(0, 7) === today.slice(0, 7) : dayKey(event.date) >= dayKey(weekStart) && dayKey(event.date) < dayKey(weekEnd)))
  const days = Array.from(new Set(visible.map(event => dayKey(event.date)))).sort()
  async function cancel(session: TrainerSession) {
    setBusySession(session.id); setError("")
    try {
      const updated = await trainerRequest<TrainerSession>(`sessions/${encodeURIComponent(session.id)}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) })
      setSessions(current => current.map(row => row.id === updated.id ? { ...row, ...updated } : row))
    } catch (error) { setError(error instanceof Error ? error.message : "La séance n’a pas pu être annulée.") }
    finally { setBusySession(null) }
  }
  return <div className="trainer-page">
    <header className="trainer-page-heading"><p className="lms-eyebrow">ESPACE FORMATRICE</p><h1>Agenda</h1><p>Les séances et les démarrages de vos élèves · heure de Paris.</p></header>
    <div className="trainer-list-toolbar"><div className="trainer-view-tabs" role="group" aria-label="Vue de l’agenda">{([{ key: "list", label: "Liste" }, { key: "week", label: "Semaine" }, { key: "month", label: "Mois" }] as const).map(item => <button key={item.key} className={view === item.key ? "is-selected" : ""} aria-pressed={view === item.key} onClick={() => setView(item.key)}>{item.label}</button>)}</div>
      <button className="trainer-button" disabled={!students.length || loading} onClick={() => { setEditing(null); setEditorOpen(true) }}><Plus size={16} aria-hidden />Ajouter une séance</button>
    </div>
    {view !== "list" && <p className="trainer-muted">{view === "month" ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(`${today}T12:00Z`)) : `Semaine du ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(weekStart)}`}</p>}
    <div className="trainer-agenda-legend"><span className="is-session">Visio planifiée</span><span className="is-start">Démarrage à traiter</span><span className="is-marker">Repère</span></div>
    {loading && <p className="trainer-empty" role="status">Chargement de l’agenda…</p>}
    {error && <p className="trainer-error" role="alert">{error}</p>}
    {!loading && !error && !visible.length && <div className="trainer-empty"><h2>Aucune séance ni démarrage sur cette période</h2></div>}
    <div className="trainer-card trainer-agenda-list">{days.map(day => <section className="trainer-agenda-day" key={day}>
      <h2><time dateTime={day}>{new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(`${day}T12:00Z`))}</time>{day === today && <small>Aujourd’hui</small>}</h2>
      <div className="trainer-agenda-events">{visible.filter(event => dayKey(event.date) === day).map(event => <article key={event.id} className={`trainer-agenda-event is-${event.kind}`}>
        <Link href={`/trainer/eleves/${encodeURIComponent(event.student.id)}`} className="trainer-agenda-student">{studentName(event.student)}</Link>
        {event.session ? <SessionRow session={event.session} showDate={false} onEdit={() => { setEditing(event.session!); setEditorOpen(true) }} onCancel={() => cancel(event.session!)} busy={busySession !== null} /> : <p>{event.text}</p>}
      </article>)}</div>
    </section>)}</div>
    <SessionEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => { void load() }} students={students} session={editing} />
  </div>
}
