"use client"

import { dateLabel, planningConfirmed, type TrainerAssignment } from "./data"

/** Facts are recorded in the dated history, never toggled away by a checkbox. */
export default function StepChecklist({ student, compact = false }: { student: TrainerAssignment; compact?: boolean }) {
  const planning = planningConfirmed(student)
  const summary = <div className="trainer-step-summary">
    <span className={student.contactDoneAt ? "is-done" : "is-todo"}>{student.contactDoneAt ? "Premier contact fait" : "À contacter dès maintenant"}</span>
    <span className={planning ? "is-done" : student.noAnswerAt ? "is-wait" : "is-todo"}>{planning ? "Planning validé" : student.noAnswerAt ? "Pas de retour · planning à fixer" : "Planning à fixer"}</span>
  </div>
  if (compact) return <div className="trainer-steps-overview">{summary}<div className="trainer-step-summary"><span className={student.silaeAccessSentAt ? "is-done" : "is-todo"}>{student.silaeAccessSentAt ? "Accès SILAE envoyé" : `Accès SILAE au démarrage · ${dateLabel(student.adminStartAt, true)}`}</span></div></div>
  return <div className="trainer-steps-overview">
    <section className="trainer-contact-stage"><h2>1. Premier contact et planning</h2><p>Dès l’attribution, avant le démarrage : contactez l’élève pour convenir des visios.</p>{summary}
      {student.contactDoneAt && <p className="trainer-muted">Premier contact : {dateLabel(student.contactDoneAt)}</p>}
    </section>
    <section className="trainer-contact-stage"><h2>2. Jour du démarrage : accès SILAE</h2><p>Le {dateLabel(student.adminStartAt)}, envoyez l’accès SILAE pour que l’élève puisse démarrer.</p><div className="trainer-step-summary"><span className={student.silaeAccessSentAt ? "is-done" : "is-todo"}>{student.silaeAccessSentAt ? `Accès envoyé le ${dateLabel(student.silaeAccessSentAt)}` : "Accès SILAE à envoyer au démarrage"}</span></div></section>
    {student.planningNote && <p className="trainer-session-note">Note de planning existante : {student.planningNote}</p>}
  </div>
}
