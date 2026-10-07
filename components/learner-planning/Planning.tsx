import { Bell, CalendarDays, Clock3, ExternalLink, Video } from "lucide-react"
import type { LearnerPlanningData, LearnerSession } from "./data"
import { durationLabel, sessionStatusLabel, splitSessions } from "./dates"

function JoinLink({ session, now }: { session: LearnerSession; now: number }) {
  if (session.status !== "PLANNED" || new Date(session.endsAt).getTime() <= now) return null
  if (!session.visioUrl) return <div className="lp-join-pending">
    <button className="lp-join" type="button" disabled><Video size={18} aria-hidden="true" /> Rejoindre la visio</button>
    <p className="lp-link-pending">Le lien visio sera ajouté par votre formatrice.</p>
  </div>
  return <a className="lp-join" href={session.visioUrl} target="_blank" rel="noopener noreferrer">
    <Video size={18} aria-hidden="true" /> Rejoindre la visio <ExternalLink size={15} aria-hidden="true" />
  </a>
}

function SessionDetails({ session }: { session: LearnerSession }) {
  return <>
    <p className="lp-date"><time dateTime={session.startsAt}>{session.dateLabel}</time></p>
    <p className="lp-trainer">Avec {session.trainer.firstName} {session.trainer.lastName}</p>
    <div className="lp-meta">
      <span><Clock3 size={15} aria-hidden="true" /> {durationLabel(session.durationMinutes)}</span>
      <span>{session.formationLabel}</span>
    </div>
  </>
}

function SessionList({ title, sessions, now, empty }: { title: string; sessions: LearnerSession[]; now: number; empty: string }) {
  return <section className="lp-section" aria-label={title}>
    <h2>{title} <span className="lp-count">{sessions.length}</span></h2>
    {sessions.length === 0 ? <p className="lp-empty-line">{empty}</p> : <ul className="lp-list">
      {sessions.map(session => <li key={session.id} className={`lp-session${session.status === "CANCELLED" ? " is-cancelled" : ""}`}>
        <div className="lp-session-info"><SessionDetails session={session} /></div>
        <div className="lp-session-side">
          <span className={`lp-status is-${session.status.toLowerCase()}`}>{sessionStatusLabel(session, now)}</span>
          <JoinLink session={session} now={now} />
        </div>
      </li>)}
    </ul>}
  </section>
}

export default function Planning({ data }: { data: LearnerPlanningData }) {
  const { now, upcoming, past, next } = splitSessions(data)
  return <div className="learner-planning">
    <header className="lp-heading">
      <p className="lms-eyebrow">Mes rendez-vous</p>
      <h1 className="font-display text-2xl font-semibold text-ink">Planning</h1>
      <p>Vos séances avec votre formatrice. Toutes les heures sont affichées à l’heure de Paris.</p>
    </header>
    <p className="lp-reminder"><Bell size={18} aria-hidden="true" /><span>Vous recevez un rappel par mail 30 minutes avant chaque séance.</span></p>
    {next ? <section className="lp-next" aria-label="Prochaine séance">
      <div className="lp-next-icon"><CalendarDays size={26} aria-hidden="true" /></div>
      <div className="lp-session-info">
        <h2>{new Date(next.startsAt).getTime() <= now ? "Séance en cours" : "Prochaine séance"}</h2>
        <SessionDetails session={next} />
      </div>
      <JoinLink session={next} now={now} />
    </section> : <div className="lp-no-next">
      <CalendarDays size={24} aria-hidden="true" />
      <div><h2>Aucune prochaine séance pour le moment</h2><p>Votre formatrice vous transmettra votre planning dès qu’il sera fixé.</p></div>
    </div>}
    <SessionList title="À venir" sessions={upcoming} now={now} empty="Aucune séance à venir." />
    <SessionList title="Passées" sessions={past} now={now} empty="Aucune séance passée pour le moment." />
  </div>
}
