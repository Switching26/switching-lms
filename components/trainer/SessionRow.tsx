"use client"

import { dateLabel, timeLabel, type TrainerSession } from "./data"

export default function SessionRow({ session, onEdit, onCancel, busy = false, showDate = true }: {
  session: TrainerSession; onEdit: () => void; onCancel: () => void; busy?: boolean; showDate?: boolean
}) {
  const end = new Date(new Date(session.startsAt).getTime() + session.durationMinutes * 60000).toISOString()
  return <div className={`trainer-session-row ${session.status === "CANCELLED" ? "is-cancelled" : ""}`}>
    <div><strong>{showDate && `${dateLabel(session.startsAt)} · `}{timeLabel(session.startsAt)}–{timeLabel(end)}</strong>
      <span className="trainer-muted">{session.durationMinutes} min{session.status === "CANCELLED" ? " · Annulée" : ""}</span>
      {session.note && <p className="trainer-session-note">{session.note}</p>}
    </div>
    {session.status === "PLANNED" && <div className="trainer-session-actions"><button className="trainer-button" disabled={busy} onClick={onEdit}>Modifier</button><button className="trainer-button trainer-danger" disabled={busy} onClick={onCancel}>Annuler la séance</button></div>}
  </div>
}
