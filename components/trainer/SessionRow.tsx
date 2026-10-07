"use client"

import { dateTimeLabel, safeVisioUrl, timeLabel, type TrainerSession } from "./data"

export default function SessionRow({ session, onEdit, onCancel, onDelete, busy = false }: {
  session: TrainerSession; onEdit: () => void; onCancel: () => void; onDelete: () => void; busy?: boolean
}) {
  const end = new Date(new Date(session.startsAt).getTime() + session.durationMinutes * 60000).toISOString()
  const link = safeVisioUrl(session.visioUrl)
  return <div className={`trainer-session-row ${session.status === "CANCELLED" ? "is-cancelled" : ""}`}>
    <div><strong>{dateTimeLabel(session.startsAt)}–{timeLabel(end)}</strong>
      <span className="trainer-muted">{session.durationMinutes} min{session.status === "CANCELLED" ? " · Annulée" : session.status === "DONE" ? " · Réalisée" : ""}</span>
      {session.note && <p className="trainer-session-note">{session.note}</p>}
      <p className="trainer-muted">{session.status === "CANCELLED" ? "Rappel désactivé · séance annulée" : session.reminderSentAt ? "Rappel envoyé par mail 30 min avant, à l’élève et à vous" : "Rappel par mail 30 min avant, à l’élève et à vous"}</p>
    </div>
    <div className="trainer-session-actions">
      {link && session.status !== "CANCELLED" && <a className="trainer-button" href={link} target="_blank" rel="noopener noreferrer">Rejoindre</a>}
      {session.status !== "CANCELLED" && <button className="trainer-button" disabled={busy} onClick={onEdit}>Modifier / déplacer</button>}
      {session.status === "PLANNED" && <button className="trainer-button trainer-danger" disabled={busy} onClick={onCancel}>Annuler la séance</button>}
      <button className="trainer-button trainer-danger" disabled={busy} onClick={onDelete}>Supprimer</button>
    </div>
  </div>
}
