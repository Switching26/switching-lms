"use client"

import { useEffect, useRef, useState } from "react"
import { updateSteps, type TrainerAssignment, type AssignmentSteps } from "./data"

const stepState = (student: TrainerAssignment) => ({ contactDone: !!student.contactDoneAt, silaeAccessSent: !!student.silaeAccessSentAt, planningAgreed: !!student.planningAgreedAt, noAnswer: !!student.noAnswerAt })

export default function StepChecklist({ student, onChange, compact = false }: {
  student: TrainerAssignment; onChange: (student: TrainerAssignment) => void; compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [note, setNote] = useState(student.planningNote || "")
  const [steps, setSteps] = useState(() => stepState(student))
  const saving = useRef(false)
  useEffect(() => setNote(student.planningNote || ""), [student.id, student.planningNote])
  useEffect(() => setSteps(stepState(student)), [student.id, student.contactDoneAt, student.silaeAccessSentAt, student.planningAgreedAt, student.noAnswerAt])
  async function save(input: AssignmentSteps) {
    if (saving.current) return
    saving.current = true
    // Keep the user's selection stable during the request; roll back on failure.
    setSteps(previous => ({
      contactDone: input.contactDone ?? previous.contactDone,
      silaeAccessSent: input.silaeAccessSent ?? previous.silaeAccessSent,
      planningAgreed: input.noAnswer ? false : input.planningAgreed ?? previous.planningAgreed,
      noAnswer: input.planningAgreed ? false : input.noAnswer ?? previous.noAnswer,
    }))
    setBusy(true); setError(""); setNotice("")
    try { const updated = await updateSteps(student.id, input); setSteps(stepState(updated)); onChange(updated); setNotice("Enregistré") }
    catch (error) { setSteps(stepState(student)); setError(error instanceof Error ? error.message : "L’étape n’a pas pu être enregistrée.") }
    finally { saving.current = false; setBusy(false) }
  }
  const planning = steps.planningAgreed ? "agreed" : steps.noAnswer ? "noAnswer" : "todo"
  return <div className={`trainer-steps ${compact ? "trainer-steps-compact" : ""}`} aria-busy={busy}>
    <label className={`trainer-check ${steps.contactDone ? "is-done" : "is-todo"}`}>
      <input type="checkbox" checked={steps.contactDone} disabled={busy} onChange={event => save({ contactDone: event.target.checked })} />
      <span>{compact ? steps.contactDone ? "Contact fait" : "Contact à faire" : "Contact fait"}</span>
    </label>
    <label className={`trainer-check ${steps.silaeAccessSent ? "is-done" : "is-todo"}`}>
      <input type="checkbox" checked={steps.silaeAccessSent} disabled={busy} onChange={event => save({ silaeAccessSent: event.target.checked })} />
      <span>{compact ? steps.silaeAccessSent ? "SILAE envoyé" : "SILAE à envoyer" : "Accès SILAE envoyé"}</span>
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
        <textarea aria-label="Note privée du planning" rows={3} maxLength={20000} className="input-field" value={note} disabled={busy} placeholder="Précisions sur le planning…" onChange={event => setNote(event.target.value)} onBlur={() => { if (note !== (student.planningNote || "")) save({ planningNote: note || null }) }} />
      </label>
    </>}
    <span className="trainer-save-status" role="status">{busy ? "Enregistrement…" : notice}</span>
    {error && <p className="trainer-error" role="alert">{error}</p>}
  </div>
}
