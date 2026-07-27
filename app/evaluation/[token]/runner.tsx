"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type QuestionType = "QCM_SINGLE" | "QCM_MULTI" | "TEXTE" | "ECHELLE"

interface Choice { id: string; text: string }
interface Question {
  id: string
  text: string
  helpText: string | null
  type: QuestionType
  scaleMin: number | null
  scaleMax: number | null
  scaleMinLabel: string | null
  scaleMaxLabel: string | null
  choices: Choice[]
}
interface Payload {
  state: "ready" | "submitted" | "expired"
  candidateFirstName?: string | null
  candidateLastName?: string | null
  candidateEmail?: string | null
  expiresAt?: string | null
  assessment?: {
    id: string
    title: string
    description: string | null
    type: "POSITIONNEMENT" | "EVALUATION"
    timeLimitMinutes: number | null
    partner: { name: string; slug: string; primaryColor: string; logoUrl: string | null } | null
    questions: Question[]
  }
  result?: any
}

interface AnswerState {
  selectedChoiceIds: string[]
  responseText: string
  scaleValue: number | null
}

const DEFAULT_ACCENT = "#4F46E5"

export default function AssessmentRunner({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
  const [submitting, setSubmitting] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  // Le candidat s'identifie AVANT de voir les questions : un lien peut être
  // transféré, et c'est sa saisie qui dit de quel prospect il s'agit.
  const [identified, setIdentified] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/evaluation/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body?.error || "Lien invalide ou expiré")
        return body as Payload
      })
      .then((body) => { if (!cancelled) setData(body) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [token])

  const accent = data?.assessment?.partner?.primaryColor || DEFAULT_ACCENT
  const questions = data?.assessment?.questions ?? []

  const setAnswer = useCallback((qid: string, patch: Partial<AnswerState>) => {
    setAnswers((prev) => {
      const current: AnswerState = prev[qid] ?? { selectedChoiceIds: [], responseText: "", scaleValue: null }
      return { ...prev, [qid]: { ...current, ...patch } }
    })
  }, [])

  const missing = useMemo(
    () =>
      questions.filter((q) => {
        const a = answers[q.id]
        if (!a) return true
        if (q.type === "TEXTE") return !a.responseText.trim()
        if (q.type === "ECHELLE") return a.scaleValue === null
        return a.selectedChoiceIds.length === 0
      }),
    [questions, answers]
  )

  async function submit() {
    if (missing.length > 0) {
      setShowMissing(true)
      document.getElementById(`q-${missing[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/evaluation/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: questions.map((q) => ({
            questionId: q.id,
            selectedChoiceIds: answers[q.id]?.selectedChoiceIds ?? [],
            responseText: answers[q.id]?.responseText ?? "",
            scaleValue: answers[q.id]?.scaleValue ?? undefined,
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "L'envoi a échoué")
      setData((prev) => ({ ...(prev as Payload), state: "submitted", result: body.result }))
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !data) return <Shell accent={DEFAULT_ACCENT}><Message title="Lien indisponible" text={error} /></Shell>
  if (!data) return <Shell accent={DEFAULT_ACCENT}><p className="text-ink-50 text-sm">Chargement…</p></Shell>

  if (data.state === "expired") {
    return (
      <Shell accent={accent}>
        <Message
          title="Ce lien a expiré"
          text="La période de validité de cette évaluation est dépassée. Contactez votre interlocuteur pour recevoir un nouveau lien."
        />
      </Shell>
    )
  }

  if (data.state === "submitted") {
    return <Shell accent={accent} partner={data.assessment?.partner}><Result result={data.result} accent={accent} firstName={data.candidateFirstName} /></Shell>
  }

  const a = data.assessment!

  if (!identified) {
    return (
      <Shell accent={accent} partner={a.partner}>
        <IdentityForm
          token={token}
          accent={accent}
          assessment={a}
          defaults={{
            firstName: data.candidateFirstName ?? "",
            lastName: data.candidateLastName ?? "",
            email: data.candidateEmail ?? "",
          }}
          onDone={() => setIdentified(true)}
        />
      </Shell>
    )
  }

  return (
    <Shell accent={accent} partner={a.partner}>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: accent }}>
          {a.type === "POSITIONNEMENT" ? "Test de positionnement" : "Évaluation"}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink mb-3">{a.title}</h1>
        {data.candidateFirstName && (
          <p className="text-ink-70 mb-3">
            Bonjour {data.candidateFirstName}{data.candidateLastName ? ` ${data.candidateLastName}` : ""}.
          </p>
        )}
        {a.description && <p className="text-ink-50 whitespace-pre-line">{a.description}</p>}
        <p className="text-sm text-ink-50 mt-4">
          {questions.length} question{questions.length > 1 ? "s" : ""}
          {a.timeLimitMinutes ? ` · environ ${a.timeLimitMinutes} min` : ""}
          {" · une seule validation possible"}
        </p>
      </div>

      <div className="space-y-5">
        {questions.map((q, i) => {
          const state = answers[q.id]
          const isMissing = showMissing && missing.some((m) => m.id === q.id)
          return (
            <div
              key={q.id}
              id={`q-${q.id}`}
              className="card p-5 sm:p-6"
              style={isMissing ? { borderColor: "#DC2626" } : undefined}
            >
              <div className="flex gap-3 mb-4">
                <span
                  className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-semibold text-white"
                  style={{ backgroundColor: accent }}
                >
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium text-ink whitespace-pre-line">{q.text}</p>
                  {q.helpText && <p className="text-sm text-ink-50 mt-1 whitespace-pre-line">{q.helpText}</p>}
                  {q.type === "QCM_MULTI" && (
                    <p className="text-xs text-ink-50 mt-1">Plusieurs réponses possibles</p>
                  )}
                </div>
              </div>

              {(q.type === "QCM_SINGLE" || q.type === "QCM_MULTI") && (
                <div className="space-y-2">
                  {q.choices.map((c) => {
                    const checked = state?.selectedChoiceIds.includes(c.id) ?? false
                    return (
                      <label
                        key={c.id}
                        className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors min-h-[44px]"
                        style={{
                          borderColor: checked ? accent : "rgba(17,24,39,0.10)",
                          backgroundColor: checked ? `${accent}0F` : undefined,
                        }}
                      >
                        <input
                          type={q.type === "QCM_MULTI" ? "checkbox" : "radio"}
                          name={q.id}
                          checked={checked}
                          onChange={() => {
                            if (q.type === "QCM_SINGLE") {
                              setAnswer(q.id, { selectedChoiceIds: [c.id] })
                            } else {
                              const cur = state?.selectedChoiceIds ?? []
                              setAnswer(q.id, {
                                selectedChoiceIds: cur.includes(c.id)
                                  ? cur.filter((x) => x !== c.id)
                                  : [...cur, c.id],
                              })
                            }
                          }}
                          className="mt-0.5 w-4 h-4 shrink-0"
                          style={{ accentColor: accent }}
                        />
                        <span className="text-ink-70 text-[15px]">{c.text}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              {q.type === "TEXTE" && (
                <textarea
                  rows={4}
                  value={state?.responseText ?? ""}
                  onChange={(e) => setAnswer(q.id, { responseText: e.target.value })}
                  className="input-field"
                  placeholder="Votre réponse…"
                />
              )}

              {q.type === "ECHELLE" && (
                <ScaleInput
                  min={q.scaleMin ?? 1}
                  max={q.scaleMax ?? 5}
                  minLabel={q.scaleMinLabel}
                  maxLabel={q.scaleMaxLabel}
                  value={state?.scaleValue ?? null}
                  accent={accent}
                  onChange={(v) => setAnswer(q.id, { scaleValue: v })}
                />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mt-6 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
      )}
      {showMissing && missing.length > 0 && (
        <div className="mt-6 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {missing.length} question{missing.length > 1 ? "s" : ""} sans réponse.
        </div>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        className="btn-primary w-full mt-6 min-h-[48px] transition-all"
        style={{
          backgroundColor: accent,
          // Le bouton s'allume quand tout est rempli : jusque-là il restait
          // identique, sans indiquer au candidat qu'il lui manquait des réponses.
          opacity: missing.length === 0 ? 1 : 0.5,
          boxShadow: missing.length === 0 ? `0 3px 14px ${accent}66` : "none",
        }}
      >
        {submitting ? "Envoi en cours…" : "Valider mes réponses"}
      </button>
      <p className="text-xs text-ink-50 text-center mt-3">
        Une fois validées, vos réponses ne pourront plus être modifiées.
      </p>

      {/* Laisse passer la bannière fixée en bas sans masquer le texte. */}
      <div aria-hidden className="h-24" />
      <ProgressHud answered={questions.length - missing.length} total={questions.length} accent={accent} />
    </Shell>
  )
}

function IdentityForm({
  token, accent, assessment, defaults, onDone,
}: {
  token: string
  accent: string
  assessment: { title: string; description: string | null; type: string; questions: unknown[]; timeLimitMinutes: number | null }
  defaults: { firstName: string; lastName: string; email: string }
  onDone: () => void
}) {
  const [firstName, setFirstName] = useState(defaults.firstName)
  const [lastName, setLastName] = useState(defaults.lastName)
  const [email, setEmail] = useState(defaults.email)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const valid = firstName.trim() && lastName.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())

  async function start() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/evaluation/${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Impossible de démarrer")
      onDone()
    } catch (e: any) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="pb-10">
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: accent }}>
        {assessment.type === "POSITIONNEMENT" ? "Test de positionnement" : "Évaluation"}
      </p>
      <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink mb-3">{assessment.title}</h1>
      {assessment.description && (
        <p className="text-ink-50 whitespace-pre-line mb-2">{assessment.description}</p>
      )}
      <p className="text-sm text-ink-50 mb-8">
        {assessment.questions.length} question{assessment.questions.length > 1 ? "s" : ""}
        {assessment.timeLimitMinutes ? ` · environ ${assessment.timeLimitMinutes} min` : ""}
      </p>

      <div className="card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink mb-1">Avant de commencer</h2>
        <p className="text-sm text-ink-50 mb-5">
          Merci de renseigner vos coordonnées pour que nous puissions vous transmettre vos résultats.
        </p>

        {err && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">{err}</div>
        )}

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-ink-70">Prénom</label>
              <input className="input-field" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-ink-70">Nom</label>
              <input className="input-field" value={lastName} onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-ink-70">Adresse email</label>
            <input className="input-field" type="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
        </div>

        <button
          onClick={start}
          disabled={!valid || busy}
          className="btn-primary w-full mt-6 min-h-[48px]"
          style={{ backgroundColor: accent }}
        >
          {busy ? "Un instant…" : "Commencer"}
        </button>
      </div>
    </div>
  )
}

function ScaleInput({
  min, max, minLabel, maxLabel, value, accent, onChange,
}: {
  min: number; max: number; minLabel: string | null; maxLabel: string | null
  value: number | null; accent: string; onChange: (v: number) => void
}) {
  const steps = Array.from({ length: Math.max(2, max - min + 1) }, (_, i) => min + i)
  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {steps.map((s) => {
          const active = value === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="flex-1 min-w-[44px] min-h-[44px] rounded-xl border font-medium transition-colors"
              style={{
                borderColor: active ? accent : "rgba(17,24,39,0.10)",
                backgroundColor: active ? accent : undefined,
                color: active ? "#fff" : undefined,
              }}
            >
              {s}
            </button>
          )
        })}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-xs text-ink-50 mt-2">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  )
}

function Result({ result, accent, firstName }: { result: any; accent: string; firstName?: string | null }) {
  if (!result) return <Message title="Réponses enregistrées" text="Merci, vos réponses ont bien été transmises." />

  return (
    <div className="pb-10">
      <div className="text-center mb-8">
        <div
          className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-4"
          style={{ backgroundColor: `${accent}1A` }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink mb-2">
          {firstName ? `Merci ${firstName} !` : "Merci !"}
        </h1>
        <p className="text-ink-50">Vos réponses ont bien été enregistrées.</p>
      </div>

      {result.showScore && (
        <div className="card p-6 text-center mb-6">
          <p className="text-sm text-ink-50 mb-1">Votre résultat</p>
          <p className="font-display text-4xl font-semibold" style={{ color: accent }}>{result.percent}%</p>
          <p className="text-sm text-ink-50 mt-1">{result.score} / {result.maxScore} points</p>
          {result.passed !== null && result.passed !== undefined && (
            <p className="text-sm mt-3 font-medium" style={{ color: result.passed ? "#059669" : "#DC2626" }}>
              {result.passed ? "Seuil de réussite atteint" : `Seuil de réussite : ${result.passingScore}%`}
            </p>
          )}
          {result.needsManualReview && (
            <p className="text-xs text-ink-50 mt-3">
              Certaines réponses rédigées seront corrigées manuellement : votre score peut encore évoluer.
            </p>
          )}
        </div>
      )}

      {result.showCorrectAnswers && Array.isArray(result.corrections) && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Correction</h2>
          {result.corrections.map((q: any, i: number) => {
            const ans = q.answer
            const selected: string[] = ans?.selectedChoiceIds ?? []
            return (
              <div key={q.id} className="card p-5">
                <div className="flex items-start gap-3 mb-3">
                  <span className="shrink-0 text-xs font-semibold text-ink-50 mt-1">{i + 1}</span>
                  <p className="font-medium text-ink flex-1 whitespace-pre-line">{q.text}</p>
                  {ans?.isCorrect === true && <span className="text-sm shrink-0" style={{ color: "#059669" }}>✓</span>}
                  {ans?.isCorrect === false && <span className="text-sm shrink-0" style={{ color: "#DC2626" }}>✗</span>}
                </div>

                {q.type === "TEXTE" && (
                  <div className="pl-6">
                    <p className="text-sm text-ink-70 whitespace-pre-line">{ans?.responseText || "—"}</p>
                    <p className="text-xs text-ink-50 mt-2">Correction manuelle par le formateur.</p>
                  </div>
                )}

                {q.type === "ECHELLE" && (
                  <p className="pl-6 text-sm text-ink-70">Votre positionnement : {ans?.scaleValue ?? "—"}</p>
                )}

                {(q.type === "QCM_SINGLE" || q.type === "QCM_MULTI") && (
                  <div className="pl-6 space-y-1.5">
                    {q.choices.map((c: any) => {
                      const picked = selected.includes(c.id)
                      // Question déclarative : pas de vert/rouge, un choix
                      // personnel ne se corrige pas.
                      if (q.declarative) {
                        return (
                          <div key={c.id} className="flex items-center gap-2 text-sm"
                               style={{ color: picked ? "rgba(17,24,39,0.75)" : "rgba(17,24,39,0.35)" }}>
                            <span className="w-4 shrink-0">{picked ? "•" : "·"}</span>
                            <span className={picked ? "font-medium" : undefined}>{c.text}</span>
                          </div>
                        )
                      }
                      const color = c.isCorrect ? "#059669" : picked ? "#DC2626" : undefined
                      return (
                        <div key={c.id} className="flex items-center gap-2 text-sm" style={{ color: color || "rgba(17,24,39,0.55)" }}>
                          <span className="w-4 shrink-0">{c.isCorrect ? "✓" : picked ? "✗" : "·"}</span>
                          <span className={c.isCorrect ? "font-medium" : undefined}>{c.text}</span>
                          {picked && <span className="text-xs opacity-70">(votre réponse)</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="card p-8 text-center">
      <h1 className="font-display text-xl font-semibold text-ink mb-2">{title}</h1>
      <p className="text-ink-50">{text}</p>
    </div>
  )
}

/**
 * Bannière de progression, collée en bas pendant tout le test.
 *
 * Elle compte les questions RÉPONDUES, pas la position dans la page : un
 * candidat qui en saute une doit voir qu'il lui en reste, même arrivé en bas.
 */
function ProgressHud({ answered, total, accent }: { answered: number; total: number; accent: string }) {
  const ratio = total > 0 ? answered / total : 0
  const [pop, setPop] = useState(false)
  const lastMilestone = useRef(0)

  useEffect(() => {
    const m = ratio >= 1 ? 4 : ratio >= 0.75 ? 3 : ratio >= 0.5 ? 2 : ratio >= 0.25 ? 1 : 0
    if (m > lastMilestone.current) {
      lastMilestone.current = m
      setPop(true)
      // Android uniquement : iOS Safari n'expose pas l'API de vibration.
      try { navigator.vibrate?.(12) } catch {}
      const t = setTimeout(() => setPop(false), 1400)
      return () => clearTimeout(t)
    }
    lastMilestone.current = m
  }, [ratio])

  const left = total - answered
  // Formulations non chiffrées : « la moitié » à côté d'un compteur qui affiche
  // un autre ratio se contredirait à l'écran.
  const message =
    answered === 0
      ? `${total} questions — commencez quand vous voulez.`
      : answered >= total
      ? "Tout est rempli — vous pouvez valider vos réponses."
      : ratio >= 0.9
      ? `Plus que ${left} question${left > 1 ? "s" : ""}.`
      : ratio >= 0.75
      ? "La fin approche."
      : ratio >= 0.5
      ? "Vous avez passé la moitié."
      : ratio >= 0.25
      ? "Bien parti, continuez."
      : "C'est parti."

  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-40 border-t"
      style={{
        backgroundColor: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderColor: "rgba(17,24,39,0.07)",
        paddingBottom: "calc(11px + env(safe-area-inset-bottom))",
      }}
    >
      <div className="max-w-[720px] mx-auto px-5 pt-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(17,24,39,0.09)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${ratio * 100}%`,
                backgroundColor: accent,
                transition: "width .45s cubic-bezier(.34,1.4,.5,1)",
              }}
            />
          </div>
          <p className="text-[13px] font-semibold text-ink tabular-nums whitespace-nowrap">
            {answered}
            <span className="font-normal text-ink-50"> / {total}</span>
          </p>
        </div>
        <p
          className="text-[11.5px] mt-1.5 min-h-[15px] transition-colors"
          style={pop ? { color: accent, fontWeight: 600 } : { color: "rgba(17,24,39,0.52)" }}
        >
          {message}
        </p>
      </div>
    </div>
  )
}

function Shell({
  children, accent, partner,
}: {
  children: React.ReactNode
  accent: string
  partner?: { name: string; logoUrl: string | null } | null
}) {
  return (
    <div className="min-h-screen bg-surface-subtle">
      <div className="border-b bg-white" style={{ borderColor: "rgba(17,24,39,0.06)" }}>
        <div className="max-w-[720px] mx-auto px-5 py-4 flex items-center gap-3">
          {partner?.logoUrl ? (
            <img src={partner.logoUrl} alt={partner.name} className="max-h-[34px] max-w-[150px] object-contain" />
          ) : (
            <span className="font-display font-semibold" style={{ color: accent }}>{partner?.name || "Formation"}</span>
          )}
        </div>
      </div>
      <div className="max-w-[720px] mx-auto px-5 py-8">{children}</div>
    </div>
  )
}
