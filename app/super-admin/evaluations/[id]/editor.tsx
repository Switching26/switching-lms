"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

type QType = "QCM_SINGLE" | "QCM_MULTI" | "TEXTE" | "ECHELLE"

interface Choice { id?: string; text: string; isCorrect: boolean }
interface Question {
  id?: string
  text: string
  helpText: string | null
  type: QType
  points: number
  scaleMin: number | null
  scaleMax: number | null
  scaleMinLabel: string | null
  scaleMaxLabel: string | null
  choices: Choice[]
}
interface Invitation {
  id: string
  candidateEmail: string
  candidateFirstName: string | null
  candidateLastName: string | null
  token: string
  sentAt: string | null
  openedAt: string | null
  submittedAt: string | null
  expiresAt: string | null
  score: number | null
  maxScore: number | null
  needsManualReview: boolean
}
interface Assessment {
  id: string
  title: string
  description: string | null
  type: "POSITIONNEMENT" | "EVALUATION"
  isPublished: boolean
  showScore: boolean
  showCorrectAnswers: boolean
  passingScore: number | null
  timeLimitMinutes: number | null
  validityDays: number
  partner: { id: string; name: string } | null
  questions: Question[]
  invitations: Invitation[]
}

const TYPE_LABELS: Record<QType, string> = {
  QCM_SINGLE: "Choix unique",
  QCM_MULTI: "Choix multiples",
  TEXTE: "Réponse libre",
  ECHELLE: "Échelle de niveau",
}

function emptyQuestion(): Question {
  return {
    text: "", helpText: null, type: "QCM_SINGLE", points: 1,
    scaleMin: 1, scaleMax: 5, scaleMinLabel: "Débutant", scaleMaxLabel: "Expert",
    choices: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }],
  }
}

export default function AssessmentEditor({ assessment }: { assessment: Assessment }) {
  const router = useRouter()
  const [tab, setTab] = useState<"questions" | "invitations" | "reglages">("questions")
  const [questions, setQuestions] = useState<Question[]>(assessment.questions)
  const [settings, setSettings] = useState({
    title: assessment.title,
    description: assessment.description ?? "",
    type: assessment.type,
    isPublished: assessment.isPublished,
    showScore: assessment.showScore,
    showCorrectAnswers: assessment.showCorrectAnswers,
    passingScore: assessment.passingScore,
    timeLimitMinutes: assessment.timeLimitMinutes,
    validityDays: assessment.validityDays,
  })
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const hasAnswers = assessment.invitations.some((i) => i.submittedAt)

  async function save(payload: any, okText: string) {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/assessments/${assessment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Enregistrement impossible")
      setMsg({ kind: "ok", text: okText })
      router.refresh()
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message })
    } finally {
      setBusy(false)
    }
  }

  function patchQuestion(i: number, patch: Partial<Question>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  }

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => router.push("/super-admin/evaluations")} className="text-sm text-ink-50 hover:text-ink mb-2">
          ← Évaluations
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-semibold text-ink">{settings.title}</h1>
          <span
            className="inline-flex px-2 py-1 rounded-md text-xs font-medium"
            style={
              settings.isPublished
                ? { backgroundColor: "#ECFDF5", color: "#059669" }
                : { backgroundColor: "rgba(17,24,39,0.05)", color: "rgba(17,24,39,0.55)" }
            }
          >
            {settings.isPublished ? "Publiée" : "Brouillon"}
          </span>
          {assessment.partner && <span className="text-sm text-ink-50">{assessment.partner.name}</span>}
        </div>
      </div>

      {msg && (
        <div
          className="text-sm rounded-xl px-4 py-3 border"
          style={
            msg.kind === "ok"
              ? { color: "#059669", backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }
              : { color: "#B91C1C", backgroundColor: "#FEF2F2", borderColor: "#FECACA" }
          }
        >
          {msg.text}
        </div>
      )}

      <div className="flex gap-1 border-b" style={{ borderColor: "rgba(17,24,39,0.08)" }}>
        {([
          ["questions", `Questions (${questions.length})`],
          ["invitations", `Invitations (${assessment.invitations.length})`],
          ["reglages", "Réglages"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2.5 text-sm font-medium min-h-[44px] border-b-2 -mb-px transition-colors"
            style={
              tab === key
                ? { borderColor: "#4F46E5", color: "#4F46E5" }
                : { borderColor: "transparent", color: "rgba(17,24,39,0.55)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "questions" && (
        <div className="space-y-4">
          {hasAnswers && (
            <div className="text-sm rounded-xl px-4 py-3 border" style={{ color: "#92400E", backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }}>
              Des candidats ont déjà répondu : les questions ne sont plus modifiables, afin de ne pas
              invalider les résultats déjà enregistrés. Dupliquez l'évaluation pour la faire évoluer.
            </div>
          )}

          {questions.map((q, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <span className="text-sm font-semibold text-ink-50">Question {i + 1}</span>
                {!hasAnswers && (
                  <div className="flex gap-2">
                    {i > 0 && (
                      <button
                        className="text-xs text-ink-50 hover:text-ink min-h-[32px] px-2"
                        onClick={() => setQuestions((qs) => {
                          const c = [...qs]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c
                        })}
                      >↑</button>
                    )}
                    {i < questions.length - 1 && (
                      <button
                        className="text-xs text-ink-50 hover:text-ink min-h-[32px] px-2"
                        onClick={() => setQuestions((qs) => {
                          const c = [...qs]; [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c
                        })}
                      >↓</button>
                    )}
                    <button
                      className="text-xs min-h-[32px] px-2"
                      style={{ color: "#DC2626" }}
                      onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))}
                    >Supprimer</button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Énoncé de la question"
                  value={q.text}
                  disabled={hasAnswers}
                  onChange={(e) => patchQuestion(i, { text: e.target.value })}
                />

                <div className="flex flex-wrap gap-3">
                  <select
                    className="input-field flex-1 min-w-[180px]"
                    value={q.type}
                    disabled={hasAnswers}
                    onChange={(e) => patchQuestion(i, { type: e.target.value as QType })}
                  >
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  {q.type !== "ECHELLE" && (
                    <div className="w-[120px]">
                      <input
                        type="number"
                        min={1}
                        className="input-field"
                        value={q.points}
                        disabled={hasAnswers}
                        onChange={(e) => patchQuestion(i, { points: Number(e.target.value) || 1 })}
                        placeholder="Points"
                      />
                    </div>
                  )}
                </div>

                {(q.type === "QCM_SINGLE" || q.type === "QCM_MULTI") && (
                  <div className="space-y-2">
                    <p className="text-xs text-ink-50">
                      Cochez la ou les bonnes réponses
                      {q.type === "QCM_MULTI" && " — la question n'est juste que si toutes sont trouvées"}
                    </p>
                    {q.choices.map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        <input
                          type={q.type === "QCM_MULTI" ? "checkbox" : "radio"}
                          name={`correct-${i}`}
                          checked={c.isCorrect}
                          disabled={hasAnswers}
                          onChange={() =>
                            patchQuestion(i, {
                              choices: q.choices.map((x, xi) =>
                                q.type === "QCM_MULTI"
                                  ? xi === ci ? { ...x, isCorrect: !x.isCorrect } : x
                                  : { ...x, isCorrect: xi === ci }
                              ),
                            })
                          }
                          className="w-4 h-4 shrink-0"
                        />
                        <input
                          className="input-field flex-1"
                          placeholder={`Réponse ${ci + 1}`}
                          value={c.text}
                          disabled={hasAnswers}
                          onChange={(e) =>
                            patchQuestion(i, {
                              choices: q.choices.map((x, xi) => (xi === ci ? { ...x, text: e.target.value } : x)),
                            })
                          }
                        />
                        {!hasAnswers && q.choices.length > 2 && (
                          <button
                            className="text-xs px-2 min-h-[32px]"
                            style={{ color: "#DC2626" }}
                            onClick={() => patchQuestion(i, { choices: q.choices.filter((_, xi) => xi !== ci) })}
                          >×</button>
                        )}
                      </div>
                    ))}
                    {!hasAnswers && (
                      <button
                        className="text-sm text-ink-50 hover:text-ink min-h-[36px]"
                        onClick={() => patchQuestion(i, { choices: [...q.choices, { text: "", isCorrect: false }] })}
                      >+ Ajouter une réponse</button>
                    )}
                  </div>
                )}

                {q.type === "ECHELLE" && (
                  <div className="grid grid-cols-2 gap-3">
                    <input className="input-field" type="number" placeholder="Min" value={q.scaleMin ?? 1}
                      disabled={hasAnswers} onChange={(e) => patchQuestion(i, { scaleMin: Number(e.target.value) })} />
                    <input className="input-field" type="number" placeholder="Max" value={q.scaleMax ?? 5}
                      disabled={hasAnswers} onChange={(e) => patchQuestion(i, { scaleMax: Number(e.target.value) })} />
                    <input className="input-field" placeholder="Libellé du minimum" value={q.scaleMinLabel ?? ""}
                      disabled={hasAnswers} onChange={(e) => patchQuestion(i, { scaleMinLabel: e.target.value })} />
                    <input className="input-field" placeholder="Libellé du maximum" value={q.scaleMaxLabel ?? ""}
                      disabled={hasAnswers} onChange={(e) => patchQuestion(i, { scaleMaxLabel: e.target.value })} />
                    <p className="col-span-2 text-xs text-ink-50">
                      Une échelle est déclarative : elle n'entre pas dans le score.
                    </p>
                  </div>
                )}

                {q.type === "TEXTE" && (
                  <p className="text-xs text-ink-50">
                    Réponse libre : elle n'est pas corrigée automatiquement, vous la relirez dans les résultats.
                  </p>
                )}
              </div>
            </div>
          ))}

          {!hasAnswers && (
            <div className="flex flex-wrap gap-3">
              <button
                className="min-h-[44px] px-4 rounded-xl border font-medium text-ink-70"
                style={{ borderColor: "rgba(17,24,39,0.10)" }}
                onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
              >+ Ajouter une question</button>
              <button
                className="btn-primary min-h-[44px]"
                disabled={busy}
                onClick={() => save({ questions }, "Questions enregistrées.")}
              >{busy ? "Enregistrement…" : "Enregistrer les questions"}</button>
            </div>
          )}
        </div>
      )}

      {tab === "invitations" && (
        <InvitationsPanel assessment={assessment} onChange={() => router.refresh()} />
      )}

      {tab === "reglages" && (
        <div className="card p-6 max-w-[640px] space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-ink-70">Titre</label>
            <input className="input-field" value={settings.title}
              onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-ink-70">Introduction pour le candidat</label>
            <textarea className="input-field" rows={3} value={settings.description}
              onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-ink-70">Type</label>
              <select className="input-field" value={settings.type}
                onChange={(e) => setSettings({ ...settings, type: e.target.value as any })}>
                <option value="POSITIONNEMENT">Test de positionnement</option>
                <option value="EVALUATION">Évaluation</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-ink-70">Validité du lien (jours)</label>
              <input className="input-field" type="number" min={1} value={settings.validityDays}
                onChange={(e) => setSettings({ ...settings, validityDays: Number(e.target.value) || 30 })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-ink-70">Durée indicative (min)</label>
              <input className="input-field" type="number" min={1} value={settings.timeLimitMinutes ?? ""}
                onChange={(e) => setSettings({ ...settings, timeLimitMinutes: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-ink-70">Seuil de réussite (%)</label>
              <input className="input-field" type="number" min={0} max={100} value={settings.passingScore ?? ""}
                onChange={(e) => setSettings({ ...settings, passingScore: e.target.value ? Number(e.target.value) : null })} />
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={settings.showScore} className="w-4 h-4"
                onChange={(e) => setSettings({ ...settings, showScore: e.target.checked })} />
              <span className="text-sm text-ink-70">Afficher son score au candidat</span>
            </label>
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={settings.showCorrectAnswers} className="w-4 h-4"
                onChange={(e) => setSettings({ ...settings, showCorrectAnswers: e.target.checked })} />
              <span className="text-sm text-ink-70">Afficher la correction détaillée au candidat</span>
            </label>
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={settings.isPublished} className="w-4 h-4"
                onChange={(e) => setSettings({ ...settings, isPublished: e.target.checked })} />
              <span className="text-sm text-ink-70">
                Publiée <span className="text-ink-50">— nécessaire pour pouvoir inviter des candidats</span>
              </span>
            </label>
          </div>

          <button className="btn-primary min-h-[44px]" disabled={busy}
            onClick={() => save(settings, "Réglages enregistrés.")}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      )}
    </div>
  )
}

function InvitationsPanel({ assessment, onChange }: { assessment: Assessment; onChange: () => void }) {
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [sendMail, setSendMail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [lastLink, setLastLink] = useState<string | null>(null)

  async function invite() {
    setBusy(true)
    setMsg(null)
    setLastLink(null)
    try {
      const res = await fetch(`/api/assessments/${assessment.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, firstName, lastName, sendMail }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Invitation impossible")
      setLastLink(body.url)
      setMsg({
        kind: "ok",
        text: sendMail
          ? body.emailSent
            ? `Invitation envoyée à ${email}.`
            : `Lien créé, mais l'email n'a pas pu être envoyé — copiez le lien ci-dessous.`
          : "Lien créé. Copiez-le pour l'envoyer vous-même.",
      })
      setEmail(""); setFirstName(""); setLastName("")
      onChange()
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"

  return (
    <div className="space-y-6">
      <div className="card p-5 max-w-[640px]">
        <h2 className="font-display font-semibold text-ink mb-4">Inviter un candidat</h2>
        {!assessment.isPublished && (
          <div className="text-sm rounded-xl px-4 py-3 border mb-4" style={{ color: "#92400E", backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }}>
            Publiez l'évaluation dans les réglages avant d'inviter.
          </div>
        )}
        {msg && (
          <div className="text-sm rounded-xl px-4 py-3 border mb-4"
            style={msg.kind === "ok"
              ? { color: "#059669", backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }
              : { color: "#B91C1C", backgroundColor: "#FEF2F2", borderColor: "#FECACA" }}>
            {msg.text}
          </div>
        )}
        {lastLink && (
          <div className="mb-4">
            <label className="block text-xs text-ink-50 mb-1.5">Lien du candidat</label>
            <div className="flex gap-2">
              <input className="input-field flex-1 text-xs" readOnly value={lastLink} onFocus={(e) => e.target.select()} />
              <button
                className="min-h-[44px] px-4 rounded-xl border font-medium text-sm text-ink-70 shrink-0"
                style={{ borderColor: "rgba(17,24,39,0.10)" }}
                onClick={() => navigator.clipboard?.writeText(lastLink)}
              >Copier</button>
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input className="input-field" placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input className="input-field" placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <input className="input-field mb-3" type="email" placeholder="Adresse email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer mb-3">
          <input type="checkbox" checked={sendMail} className="w-4 h-4" onChange={(e) => setSendMail(e.target.checked)} />
          <span className="text-sm text-ink-70">
            Envoyer l'email d'invitation <span className="text-ink-50">— sinon, seul le lien est généré</span>
          </span>
        </label>
        <button className="btn-primary min-h-[44px]" disabled={busy || !email.trim() || !assessment.isPublished} onClick={invite}>
          {busy ? "Création…" : "Inviter"}
        </button>
      </div>

      {assessment.invitations.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-50 border-b" style={{ borderColor: "rgba(17,24,39,0.06)" }}>
                  <th className="px-5 py-3 font-medium">Candidat</th>
                  <th className="px-5 py-3 font-medium">Envoyé</th>
                  <th className="px-5 py-3 font-medium">Ouvert</th>
                  <th className="px-5 py-3 font-medium">Répondu</th>
                  <th className="px-5 py-3 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {assessment.invitations.map((inv) => {
                  const percent = inv.maxScore && inv.score != null ? Math.round((inv.score / inv.maxScore) * 100) : null
                  return (
                    <tr key={inv.id} className="border-b" style={{ borderColor: "rgba(17,24,39,0.04)" }}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-ink">
                          {[inv.candidateFirstName, inv.candidateLastName].filter(Boolean).join(" ") || "—"}
                        </p>
                        <p className="text-xs text-ink-50">{inv.candidateEmail}</p>
                      </td>
                      <td className="px-5 py-4 text-ink-50">{fmt(inv.sentAt)}</td>
                      <td className="px-5 py-4 text-ink-50">{fmt(inv.openedAt)}</td>
                      <td className="px-5 py-4 text-ink-50">{fmt(inv.submittedAt)}</td>
                      <td className="px-5 py-4">
                        {inv.submittedAt ? (
                          <span className="font-medium text-ink">
                            {percent !== null ? `${percent}%` : "—"}
                            {inv.needsManualReview && (
                              <span className="text-xs font-normal text-ink-50 ml-1">(à corriger)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-ink-50">En attente</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
