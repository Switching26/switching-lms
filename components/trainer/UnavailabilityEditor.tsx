"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Modal from "@/components/ui/Modal"
import ActionConfirmation from "./ActionConfirmation"
import { dateTimeLabel, parisInput, parisInputToIso, trainerRequest, type TrainerUnavailability } from "./data"

type Input = { startsAt: string; endsAt: string; note: string | null }
export default function UnavailabilityEditor({ open, item, initialStartsAt, onClose, onSaved }: {
  open: boolean; item?: TrainerUnavailability | null; initialStartsAt?: string; onClose: () => void; onSaved: () => void
}) {
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [note, setNote] = useState("")
  const [review, setReview] = useState<{ kind: "save" | "delete"; input: Input } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const saving = useRef(false)
  useEffect(() => {
    if (!open) return
    setStartsAt(item ? parisInput(item.startsAt) : initialStartsAt || "")
    setEndsAt(item ? parisInput(item.endsAt) : ""); setNote(item?.note || "")
    setReview(null); setError("")
  }, [open, item, initialStartsAt])
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("")
    try {
      const input = { startsAt: parisInputToIso(startsAt), endsAt: parisInputToIso(endsAt), note: note.trim() || null }
      if (input.endsAt <= input.startsAt) throw new Error("La fin doit être après le début de l’indisponibilité.")
      setReview({ kind: "save", input })
    } catch (error) { setError(error instanceof Error ? error.message : "Vérifiez les dates.") }
  }
  async function confirm() {
    if (!review || saving.current) return
    saving.current = true; setBusy(true); setError("")
    try {
      await trainerRequest(item ? `unavailability/${encodeURIComponent(item.id)}` : "unavailability", {
        method: review.kind === "delete" ? "DELETE" : item ? "PATCH" : "POST",
        ...(review.kind === "save" ? { body: JSON.stringify(review.input) } : {}),
      })
      onSaved(); onClose()
    } catch (error) { setError(error instanceof Error ? error.message : "L’indisponibilité n’a pas pu être enregistrée.") }
    finally { saving.current = false; setBusy(false) }
  }
  if (review) return <ActionConfirmation open={open} title={review.kind === "delete" ? "Supprimer l’indisponibilité" : item ? "Modifier l’indisponibilité" : "Confirmer l’indisponibilité"} busy={busy} error={error} onClose={() => { setReview(null); setError("") }} onConfirm={() => { void confirm() }} mailNotice="Aucun mail ne sera envoyé. Cette plage est personnelle et sera grisée dans votre agenda.">
    <dl><dt>Du</dt><dd>{dateTimeLabel(review.input.startsAt)}</dd><dt>Au</dt><dd>{dateTimeLabel(review.input.endsAt)}</dd>{review.input.note && <><dt>Note</dt><dd>{review.input.note}</dd></>}</dl>
    {review.kind === "delete" && <p>Cette plage sera retirée : le créneau redeviendra disponible.</p>}
  </ActionConfirmation>
  return <Modal open={open} title={item ? "Indisponibilité" : "Ajouter une indisponibilité"} onClose={onClose}>
    <form className="trainer-session-form" onSubmit={submit}>
      <label>Début <small>Heure de Paris</small><input className="input-field" type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} required /></label>
      <label>Fin <small>Heure de Paris</small><input className="input-field" type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} required /></label>
      <label>Note d’indisponibilité<textarea className="input-field" rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={20000} /></label>
      {error && <p className="trainer-error" role="alert">{error}</p>}
      <div className="trainer-form-actions">{item && <button className="trainer-button trainer-danger" type="button" onClick={() => setReview({ kind: "delete", input: { startsAt: item.startsAt, endsAt: item.endsAt, note: item.note } })}>Supprimer</button>}<button className="trainer-button" type="button" onClick={onClose}>Fermer</button><button className="lms-primary" type="submit">Vérifier</button></div>
    </form>
  </Modal>
}
