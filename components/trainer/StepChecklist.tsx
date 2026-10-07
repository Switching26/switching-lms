"use client"

import { useEffect, useState } from "react"
import { updateSteps, type TrainerAssignment, type AssignmentSteps } from "./data"

export default function StepChecklist({ student, onChange, compact = false }: {
  student: TrainerAssignment; onChange: (student: TrainerAssignment) => void; compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [note, setNote] = useState(student.planningNote || "")
  useEffect(() => setNote(student.planningNote || ""), [student.id, student.planningNote])
  async function save(input: AssignmentSteps) {
    if (busy) return
    setBusy(true); setError(""); setNotice("")
    try { onChange(await updateSteps(student.id, input)); setNotice("Enregistré") }
    catch (error) { setError(error instanceof Error ? error.message : "L’étape n’a pas pu être enregistrée.") }
    finally { setBusy(false) }
  }
  const planning = student.planningAgreedAt ? "agreed" : student.noAnswerAt ? "noAnswer" : "todo"
  return <div className={`trainer-steps ${compact ? "trainer-steps-compact" : ""}`} aria-busy={busy}>
    <label className={`trainer-check ${student.contactDoneAt ? "is-done" : "is-todo"}`}>
      <input type="checkbox" checked={!!student.contactDoneAt} disabled={busy} onChange={event => save({ contactDone: event.target.checked })} />
      <span>{compact ? student.contactDoneAt ? "Contact fait" : "Contact à faire" : "Contact fait"}</span>
    </label>
    <label className={`trainer-check ${student.silaeAccessSentAt ? "is-done" : "is-todo"}`}>
      <input type="checkbox" checked={!!student.silaeAccessSentAt} disabled={busy} onChange={event => save({ silaeAccessSent: event.target.checked })} />
      <span>{compact ? student.silaeAccessSentAt ? "SILAE envoyé" : "SILAE à envoyer" : "Accès SILAE envoyé"}</span>
    </label>
    {compact ? <label className={`trainer-check ${planning === "agreed" ? "is-done" : planning === "noAnswer" ? "is-wait" : "is-todo"}`}>
      <input type="checkbox" checked={planning === "agreed"} disabled={busy} onChange={event => save({ planningAgreed: event.target.checked })} />
      <span>{planning === "agreed" ? "Planning convenu" : planning === "noAnswer" ? "Pas de réponse" : "Planning à fixer"}</span>
    </label> : <>
      <fieldset className="trainer-planning" disabled={busy}><legend>Planning des visios</legend>
        <div className="trainer-segment">
          {([{ value: "agreed", label: "Convenu" }, { value: "noAnswer", label: "Pas de réponse" }, { value: "todo", label: "À fixer" }] as const).map(option => <label key={option.value} className={planning === option.value ? `is-selected ${option.value}` : ""}>
            <input type="radio" name={`planning-${student.id}`} value={option.value} checked={planning === option.value} onChange={() => save({ planningAgreed: option.value === "agreed", noAnswer: option.value === "noAnswer" })} />{option.label}
          </label>)}
        </div>
      </fieldset>
      <label className="trainer-note"><span>Note privée · planning</span><small>Visible par vous et par Switching</small>
        <textarea rows={3} maxLength={20000} className="input-field" value={note} disabled={busy} placeholder="Précisions sur le planning…" onChange={event => setNote(event.target.value)} onBlur={() => { if (note !== (student.planningNote || "")) save({ planningNote: note || null }) }} />
      </label>
    </>}
    <span className="trainer-save-status" role="status">{busy ? "Enregistrement…" : notice}</span>
    {error && <p className="trainer-error" role="alert">{error}</p>}
  </div>
}
