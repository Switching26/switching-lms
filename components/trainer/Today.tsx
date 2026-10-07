"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { shiftDay } from "./CalendarGrid"
import { dateLabel, dateTimeLabel, dayKey, parisInputToIso, safeVisioUrl, studentName, trainerRequest, type TrainerAgenda, type TrainerAssignment } from "./data"

export default function Today() {
  const [today, setToday] = useState(() => dayKey(new Date()))
  const [students, setStudents] = useState<TrainerAssignment[]>([])
  const [agenda, setAgenda] = useState<TrainerAgenda | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    const refreshDay = () => setToday(dayKey(new Date()))
    const timer = setInterval(refreshDay, 60000)
    document.addEventListener("visibilitychange", refreshDay)
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refreshDay) }
  }, [])
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("")
    const from = parisInputToIso(`${today}T00:00`), to = parisInputToIso(`${shiftDay(today, 1)}T00:00`)
    Promise.all([trainerRequest<TrainerAssignment[]>("assignments", { signal: controller.signal }), trainerRequest<TrainerAgenda>(`agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal: controller.signal })])
      .then(([rows, data]) => { if (!controller.signal.aborted) { setStudents(rows); setAgenda(data) } })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Votre journée n’a pas pu être chargée.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [today])
  const sessions = (agenda?.sessions || []).filter(session => session.status === "PLANNED").sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const contact = students.filter(student => !student.contactDoneAt)
  const access = students.filter(student => !student.silaeAccessSentAt && dayKey(student.adminStartAt) <= today)
  return <div className="trainer-page">
    <header className="trainer-page-heading"><p className="lms-eyebrow">ESPACE FORMATRICE</p><h1>Aujourd’hui</h1><p>{dateLabel(`${today}T12:00:00Z`)} · heure de Paris.</p></header>
    {loading && <p className="trainer-empty" role="status">Chargement de votre journée…</p>}
    {error && <p className="trainer-error" role="alert">{error}</p>}
    {!loading && !error && <>
      <section className="trainer-detail-card trainer-card"><div className="trainer-section-heading"><h2>Mes visios du jour</h2><Link href="/trainer/agenda" className="trainer-button">Ouvrir l’agenda</Link></div>
        <div className="trainer-today-seances">{sessions.map(session => { const link = safeVisioUrl(session.visioUrl); return <article key={session.id} className="trainer-today-card trainer-card"><div className="trainer-section-heading"><Link href={`/trainer/eleves/${encodeURIComponent(session.assignmentId)}`}>{studentName(session.assignment)}</Link>{link ? <a href={link} className="trainer-button" target="_blank" rel="noopener noreferrer">Rejoindre</a> : <span className="trainer-muted">Lien visio à renseigner</span>}</div><strong>{dateTimeLabel(session.startsAt)} · {session.durationMinutes} min</strong><p className="trainer-muted">Rappel par mail 30 min avant, à l’élève et à vous.</p></article> })}</div>
        {!sessions.length && <p className="trainer-muted">Aucune visio planifiée sur cette journée.</p>}
      </section>
      <section className="trainer-detail-card trainer-card"><h2>Élèves à contacter</h2><p className="trainer-muted">Dès maintenant, pour convenir du planning avant leur démarrage.</p>{contact.map(student => <div className="trainer-session-row" key={student.id}><div><strong>{studentName(student)}</strong><span className="trainer-muted">Démarrage administratif : {dateLabel(student.adminStartAt)}</span></div><Link className="trainer-button" href={`/trainer/eleves/${encodeURIComponent(student.id)}`}>Ouvrir la fiche</Link></div>)}{!contact.length && <p className="trainer-muted">Le premier contact est enregistré pour tous vos élèves.</p>}</section>
      {!!access.length && <section className="trainer-detail-card trainer-card"><h2>Accès SILAE au démarrage</h2><p className="trainer-muted">Deuxième étape, distincte du premier contact.</p>{access.map(student => <div className="trainer-session-row" key={student.id}><strong>{studentName(student)}</strong><Link className="trainer-button" href={`/trainer/eleves/${encodeURIComponent(student.id)}`}>Consulter le suivi</Link></div>)}</section>}
    </>}
  </div>
}
