"use client"

import Modal from "@/components/ui/Modal"

/** A review step shared by trainer mutations, before any API write. */
export default function ActionConfirmation({ open, title, children, mailNotice, confirmLabel = "Confirmer", busy = false, error, onClose, onConfirm }: {
  open: boolean; title: string; children: React.ReactNode; mailNotice: string
  confirmLabel?: string; busy?: boolean; error?: string; onClose: () => void; onConfirm: () => void
}) {
  return <Modal open={open} title={title} onClose={() => { if (!busy) onClose() }}>
    <div className="trainer-confirmation" aria-busy={busy}>
      <div className="trainer-confirm-summary">{children}</div>
      <p className="trainer-callout">{mailNotice}</p>
      {error && <p className="trainer-error" role="alert">{error}</p>}
      <div className="trainer-form-actions">
        <button className="trainer-button" disabled={busy} onClick={onClose}>Retour</button>
        <button className="lms-primary" disabled={busy} onClick={onConfirm}>{busy ? "Enregistrement…" : confirmLabel}</button>
      </div>
    </div>
  </Modal>
}
