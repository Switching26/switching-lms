"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import Modal from "@/components/ui/Modal"
import { dateLabel, dayKey, parisInputToIso, studentName, trainerRequest, type TrainerAgenda, type TrainerAssignment, type AgendaSession, type TrainerUnavailability } from "./data"
import CalendarGrid, { shiftDay, weekDays, type CalendarItem } from "./CalendarGrid"
import SessionEditor from "./SessionEditor"
import SessionRow from "./SessionRow"
import SessionActionDialog, { type SessionAction } from "./SessionActionDialog"
import UnavailabilityEditor from "./UnavailabilityEditor"

export default function Agenda() {
  const [students, setStudents] = useState<TrainerAssignment[]>([])
  const [sessions, setSessions] = useState<AgendaSession[]>([])
  const [unavailability, setUnavailability] = useState<TrainerUnavailability[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [view, setView] = useState<"day" | "week" | "month">("week")
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()))
  const [editing, setEditing] = useState<AgendaSession | null>(null)
  const [details, setDetails] = useState<AgendaSession | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [initialStartsAt, setInitialStartsAt] = useState("")
  const [offItem, setOffItem] = useState<TrainerUnavailability | null>(null)
  const [offOpen, setOffOpen] = useState(false)
  const [action, setAction] = useState<SessionAction | null>(null)
  const days = useMemo(() => {
    if (view === "day") return [selectedDay]
    if (view === "week") return weekDays(selectedDay)
    const first = `${selectedDay.slice(0, 7)}-01`
    const start = weekDays(first)[0]
    return Array.from({ length: 42 }, (_, i) => shiftDay(start, i))
  }, [view, selectedDay])
  const from = parisInputToIso(`${days[0]}T00:00`)
  const to = parisInputToIso(`${shiftDay(days[days.length - 1], 1)}T00:00`)
  const load = useCallback(async (signal?: AbortSignal) => {
    setError(""); setLoading(true)
    try {
      const [assignments, payload] = await Promise.all([
        trainerRequest<TrainerAssignment[]>("assignments", { signal }),
        trainerRequest<TrainerAgenda>(`agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal }),
      ])
      if (signal?.aborted) return
      setStudents(assignments); setSessions(payload.sessions); setUnavailability(payload.unavailability)
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "L’agenda n’a pas pu être chargé.") }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [from, to])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  const items: CalendarItem[] = [
    ...sessions.filter(session => session.status !== "CANCELLED").map(session => ({ id: session.id, startsAt: session.startsAt, endsAt: new Date(new Date(session.startsAt).getTime() + session.durationMinutes * 60000).toISOString(), label: studentName(session.assignment), kind: "session" as const })),
    ...unavailability.map(item => ({ id: item.id, startsAt: item.startsAt, endsAt: item.endsAt, label: item.note ? `Indisponible · ${item.note}` : "Indisponible", kind: "unavailable" as const })),
  ]
  function create(local = "") { setEditing(null); setInitialStartsAt(local); setEditorOpen(true) }
  function saved(warning?: string) { setNotice(warning || "Enregistré."); void load() }
  function shiftPeriod(direction: number) {
    if (view !== "month") setSelectedDay(shiftDay(selectedDay, direction * (view === "week" ? 7 : 1)))
    else {
      const date = new Date(`${selectedDay.slice(0, 7)}-01T12:00:00Z`)
      date.setUTCMonth(date.getUTCMonth() + direction)
      setSelectedDay(dayKey(date))
    }
  }
  function showItem(item: CalendarItem) {
    if (item.kind === "unavailable") { setOffItem(unavailability.find(row => row.id === item.id) || null); setOffOpen(true) }
    else setDetails(sessions.find(row => row.id === item.id) || null)
  }
  const periodLabel = view === "month" ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(`${selectedDay}T12:00Z`)) : view === "week" ? `Semaine du ${dateLabel(from)}` : dateLabel(from)
  return <div className="trainer-page">
    <header className="trainer-page-heading"><p className="lms-eyebrow">ESPACE FORMATRICE</p><h1>Agenda</h1><p>Toutes les visios de vos élèves et vos indisponibilités · heure de Paris.</p></header>
    <div className="trainer-list-toolbar"><div className="trainer-view-tabs" role="group" aria-label="Vue de l’agenda">{([{ key: "day", label: "Jour" }, { key: "week", label: "Semaine" }, { key: "month", label: "Mois" }] as const).map(item => <button key={item.key} className={view === item.key ? "is-selected" : ""} aria-pressed={view === item.key} onClick={() => setView(item.key)}>{item.label}</button>)}</div>
      <div className="trainer-calendar-actions"><button className="trainer-button" disabled={!students.length || loading} onClick={() => create()}><Plus size={16} aria-hidden />Ajouter une séance</button><button className="trainer-button" disabled={loading} onClick={() => { setOffItem(null); setOffOpen(true) }}>Indisponibilité</button></div>
    </div>
    <div className="trainer-calendar-navigation"><strong>{periodLabel}</strong><button className="trainer-button" aria-label="Période précédente" onClick={() => shiftPeriod(-1)}>‹</button><button className="trainer-button" onClick={() => setSelectedDay(dayKey(new Date()))}>Aujourd’hui</button><button className="trainer-button" aria-label="Période suivante" onClick={() => shiftPeriod(1)}>›</button><label className="sr-only" htmlFor="trainer-agenda-date">Aller à une date</label><input id="trainer-agenda-date" aria-label="Aller à une date" type="date" className="input-field trainer-agenda-date" value={selectedDay} onChange={event => { if (event.target.value) setSelectedDay(event.target.value) }} /></div>
    <div className="trainer-agenda-legend"><span className="is-session">Visio</span><span className="is-unavailable">Indisponible</span><span>Case libre : créer une séance</span></div>
    {notice && <p className="trainer-callout" role="status">{notice}</p>}
    {loading && <p className="trainer-empty" role="status">Chargement de l’agenda…</p>}
    {error && <p className="trainer-error" role="alert">{error}</p>}
    {!loading && !error && <CalendarGrid days={days} items={items} month={view === "month"} selectedDay={selectedDay} onSlot={create} onItem={showItem} onDay={day => { setSelectedDay(day); setView("day") }} />}
    <SessionEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={saved} students={students} session={editing} initialStartsAt={initialStartsAt} />
    <UnavailabilityEditor open={offOpen} item={offItem} onClose={() => setOffOpen(false)} onSaved={() => saved()} />
    <SessionActionDialog action={action} onClose={() => setAction(null)} onSaved={saved} />
    <Modal open={!!details} title="Séance" onClose={() => setDetails(null)}>{details && <div className="trainer-confirm-summary"><h3>{studentName(details.assignment)}</h3><Link className="trainer-button" href={`/trainer/eleves/${encodeURIComponent(details.assignmentId)}`}>Voir la fiche élève</Link><SessionRow session={details} onEdit={() => { setEditing(details); setInitialStartsAt(""); setDetails(null); setEditorOpen(true) }} onCancel={() => { setAction({ session: details, studentName: studentName(details.assignment), kind: "cancel" }); setDetails(null) }} onDelete={() => { setAction({ session: details, studentName: studentName(details.assignment), kind: "delete" }); setDetails(null) }} /></div>}</Modal>
  </div>
}
