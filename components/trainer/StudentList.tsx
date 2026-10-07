"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Search, ChevronRight } from "lucide-react"
import { dateLabel, dayKey, planningConfirmed, studentName, trainerRequest, type TrainerAssignment } from "./data"
import StepChecklist from "./StepChecklist"
import Progress from "./Progress"

const filters = [
  { key: "all", label: "Tous", matches: (_student: TrainerAssignment) => true },
  { key: "contact", label: "À contacter", matches: (student: TrainerAssignment) => !student.contactDoneAt },
  { key: "silae", label: "SILAE à envoyer", matches: (student: TrainerAssignment) => !student.silaeAccessSentAt },
  { key: "planning", label: "Planning à fixer", matches: (student: TrainerAssignment) => !planningConfirmed(student) },
  { key: "bonus", label: "Avec bonus", matches: (student: TrainerAssignment) => student.hasElearning },
  { key: "visio", label: "Visio seule", matches: (student: TrainerAssignment) => !student.hasElearning },
]

export default function StudentList() {
  const [students, setStudents] = useState<TrainerAssignment[]>([])
  const [archived, setArchived] = useState(false)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [today] = useState(() => dayKey(new Date()))
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(""); setStudents([])
    trainerRequest<TrainerAssignment[]>(`assignments?archived=${archived}`, { signal: controller.signal })
      .then(setStudents).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Les élèves n’ont pas pu être chargés.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [archived])
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const searched = students.filter(student => normalize(`${studentName(student)} ${student.email} ${student.phone || ""}`).includes(normalize(query.trim())))
  const visible = searched.filter(filters.find(item => item.key === filter)!.matches)
  return <div className="trainer-page">
    <header className="trainer-page-heading"><p className="lms-eyebrow">ESPACE FORMATRICE</p><h1>Mes élèves</h1><p>Le contact, l’accès SILAE et le planning de vos élèves.</p></header>
    <div className="trainer-list-toolbar">
      <div className="trainer-view-tabs" role="group" aria-label="État des élèves">{[{ value: false, label: "En cours" }, { value: true, label: "Archivés" }].map(tab => <button key={tab.label} className={archived === tab.value ? "is-selected" : ""} aria-pressed={archived === tab.value} onClick={() => { setArchived(tab.value); setFilter("all") }}>{tab.label}</button>)}</div>
      <label className="trainer-search"><Search size={18} aria-hidden /><span className="sr-only">Rechercher un élève</span><input type="search" placeholder="Rechercher un élève…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <div className="trainer-filter-chips" role="group" aria-label="Filtrer les élèves">{filters.map(item => <button key={item.key} aria-pressed={filter === item.key} className={filter === item.key ? "is-selected" : ""} onClick={() => setFilter(item.key)}>{item.label}<span>{searched.filter(item.matches).length}</span></button>)}</div>
    {loading && <p className="trainer-empty" role="status">Chargement des élèves…</p>}
    {error && <p className="trainer-error" role="alert">{error}</p>}
    {!loading && !error && !visible.length && <div className="trainer-empty"><h2>{query || filter !== "all" ? "Aucun élève ne correspond" : archived ? "Aucun élève archivé" : "Aucun élève en cours"}</h2></div>}
    <div className="trainer-student-list">{visible.map(student => <article className="trainer-card trainer-student-card" key={student.id}>
      <Link className="trainer-student-link" href={`/trainer/eleves/${encodeURIComponent(student.id)}`}>
        <div className="trainer-card-heading"><h2>{studentName(student)}</h2><span className={`trainer-kind ${student.hasElearning ? "is-bonus" : "is-visio"}`}>{student.hasElearning ? "Visio + bonus" : "Visio seule"}</span>
          {!student.contactDoneAt && <span className="trainer-info-tag">À contacter dès maintenant</span>}
          {dayKey(student.adminStartAt) === today && <span className="trainer-info-tag">Démarrage administratif aujourd’hui</span>}
          <ChevronRight size={18} className="trainer-card-chevron" aria-hidden /></div>
        <p className="trainer-muted">{student.formationLabel}{student.visioHours != null && ` · ${student.visioHours} h de visio`}</p>
        <p className="trainer-dates">Admin {dateLabel(student.adminStartAt, true)} · {student.visioStartAt ? `Visios dès le ${dateLabel(student.visioStartAt, true)}` : "Visios à convenir"}{student.adminEndAt && ` · Fin ${dateLabel(student.adminEndAt, true)}`}</p>
      </Link>
      <StepChecklist student={student} compact />
      {student.hasElearning ? <Progress assignmentId={student.id} /> : <p className="trainer-muted trainer-no-bonus">Pas d’espace e-learning</p>}
    </article>)}</div>
  </div>
}
