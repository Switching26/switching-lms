"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import Modal from "@/components/ui/Modal"
import ActionConfirmation from "./ActionConfirmation"
import { contactKinds, dateTimeLabel, parisInput, parisInputToIso, trainerRequest, type ContactEvent, type ContactKind } from "./data"

type Input = { kind: ContactKind; occurredAt: string; note: string | null }
export default function ContactHistory({ assignmentId, hasContact, onSaved }: { assignmentId: string; hasContact: boolean; onSaved: () => void }) {
  const [events, setEvents] = useState<ContactEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ContactKind>("CONTACT")
  const [occurredAt, setOccurredAt] = useState("")
  const [note, setNote] = useState("")
  const [review, setReview] = useState<Input | null>(null)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const rows = await trainerRequest<ContactEvent[]>(`assignments/${encodeURIComponent(assignmentId)}/contacts`, { signal })
      if (!signal?.aborted) { setEvents(rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt))); setError("") }
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "Historique indisponible.") }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [assignmentId])
  useEffect(() => { const controller = new AbortController(); setLoading(true); setEvents([]); void load(controller.signal); return () => controller.abort() }, [load])
  function begin() { setKind(hasContact ? "RELANCE" : "CONTACT"); setOccurredAt(parisInput(new Date())); setNote(""); setReview(null); setError(""); setOpen(true) }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("")
    try { setReview({ kind, occurredAt: parisInputToIso(occurredAt), note: note.trim() || null }) }
    catch (error) { setError(error instanceof Error ? error.message : "Vérifiez la date du contact.") }
  }
  async function confirm() {
    if (!review || saving.current) return
    saving.current = true; setBusy(true); setError("")
    try {
      await trainerRequest(`assignments/${encodeURIComponent(assignmentId)}/contacts`, { method: "POST", body: JSON.stringify(review) })
      setOpen(false); setReview(null); await load(); onSaved()
    } catch (error) { setError(error instanceof Error ? error.message : "Le contact n’a pas pu être enregistré.") }
    finally { saving.current = false; setBusy(false) }
  }
  return <section className="trainer-card trainer-detail-card">
    <div className="trainer-section-heading"><h2>Historique des contacts</h2><button className="trainer-button" onClick={begin}>Ajouter un contact</button></div>
    <p className="trainer-muted">Chaque contact, relance ou réponse reste daté. Visible par vous et par Switching.</p>
    {loading && <p className="trainer-muted" role="status">Chargement de l’historique…</p>}
    {error && !open && <p className="trainer-error" role="alert">{error}</p>}
    {!loading && !events.length && !error && <p className="trainer-muted">Aucun contact enregistré.</p>}
    <ol className="trainer-contact-timeline">{events.map(event => <li key={event.id}><strong>{contactKinds.find(item => item.value === event.kind)?.label || event.kind}</strong><time dateTime={event.occurredAt}>{dateTimeLabel(event.occurredAt)}</time>{event.note && <p>{event.note}</p>}</li>)}</ol>
    {review ? <ActionConfirmation open={open} title="Confirmer le contact" busy={busy} error={error} onClose={() => { setReview(null); setError("") }} onConfirm={() => { void confirm() }} mailNotice="Aucun mail ne sera envoyé. Cet événement sera ajouté au suivi partagé avec Switching.">
      <h3>{contactKinds.find(item => item.value === review.kind)?.label}</h3><p>{dateTimeLabel(review.occurredAt)}</p>{review.note && <p>{review.note}</p>}
    </ActionConfirmation> : <Modal open={open} title="Ajouter un contact" onClose={() => setOpen(false)}>
      <form className="trainer-session-form" onSubmit={submit}>
        <label>Type de contact<select aria-label="Type de contact" className="input-field" value={kind} onChange={e => setKind(e.target.value as ContactKind)}>{contactKinds.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Date et heure du contact <small>Heure de Paris</small><input className="input-field" type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} required /></label>
        <label>Note du contact<textarea className="input-field" rows={3} maxLength={20000} value={note} onChange={e => setNote(e.target.value)} /></label>
        {error && <p className="trainer-error" role="alert">{error}</p>}
        <div className="trainer-form-actions"><button className="trainer-button" type="button" onClick={() => setOpen(false)}>Fermer</button><button className="lms-primary" type="submit">Vérifier le contact</button></div>
      </form>
    </Modal>}
  </section>
}
