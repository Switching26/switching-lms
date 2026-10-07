"use client"

import { useEffect, useRef, useState } from "react"
import ActionConfirmation from "./ActionConfirmation"
import { dateTimeLabel, notificationWarning, trainerRequest, type TrainerSession } from "./data"

export type SessionAction = { session: TrainerSession; studentName: string; kind: "cancel" | "delete" }

export default function SessionActionDialog({ action, onClose, onSaved }: { action: SessionAction | null; onClose: () => void; onSaved: (warning?: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const saving = useRef(false)
  useEffect(() => setError(""), [action])
  if (!action) return null
  async function confirm() {
    if (!action || saving.current) return
    saving.current = true; setBusy(true); setError("")
    try {
      const result = await trainerRequest(`sessions/${encodeURIComponent(action.session.id)}`, {
        method: action.kind === "delete" ? "DELETE" : "PATCH",
        ...(action.kind === "cancel" ? { body: JSON.stringify({ status: "CANCELLED" }) } : {}),
      })
      onSaved(notificationWarning(result)); onClose()
    } catch (error) { setError(error instanceof Error ? error.message : "L’action n’a pas pu être enregistrée.") }
    finally { saving.current = false; setBusy(false) }
  }
  return <ActionConfirmation open title={action.kind === "cancel" ? "Confirmer l’annulation" : "Confirmer la suppression"} busy={busy} error={error} onClose={onClose} onConfirm={() => { void confirm() }} confirmLabel={action.kind === "cancel" ? "Annuler la séance" : "Supprimer la séance"} mailNotice={`Un mail sera envoyé à ${action.studentName} et à vous. Aucune copie à Switching.`}>
    <h3>{action.studentName}</h3><p>{dateTimeLabel(action.session.startsAt)} · {action.session.durationMinutes} min</p>
    <p>{action.kind === "cancel" ? "La séance restera dans l’historique avec le statut Annulée. Son rappel sera désactivé." : "La séance sera retirée du planning. Son rappel sera supprimé."}</p>
  </ActionConfirmation>
}
