"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

interface Assessment {
  id: string
  title: string
  type: "POSITIONNEMENT" | "EVALUATION"
  isPublished: boolean
  createdAt: string
  partner: { name: string } | null
  _count: { questions: number; invitations: number }
  submittedCount: number
}

export default function AssessmentsList({
  assessments,
  partners,
}: {
  assessments: Assessment[]
  partners: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<"POSITIONNEMENT" | "EVALUATION">("POSITIONNEMENT")
  const [partnerId, setPartnerId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, partnerId: partnerId || null }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || "Création impossible")
      router.push(`/super-admin/evaluations/${body.id}`)
    } catch (e: any) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Évaluations</h1>
          <p className="text-sm text-ink-50 mt-1">
            Tests de positionnement et évaluations, envoyés par lien — y compris à des candidats sans compte.
          </p>
        </div>
        <button className="btn-primary min-h-[44px]" onClick={() => setCreating(true)}>
          Nouvelle évaluation
        </button>
      </div>

      {assessments.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-ink-70 font-medium mb-1">Aucune évaluation pour le moment</p>
          <p className="text-sm text-ink-50">
            Créez un test de positionnement pour l'envoyer à vos prospects avant leur entrée en formation.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-50 border-b" style={{ borderColor: "rgba(17,24,39,0.06)" }}>
                  <th className="px-5 py-3 font-medium">Titre</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Organisme</th>
                  <th className="px-5 py-3 font-medium">Questions</th>
                  <th className="px-5 py-3 font-medium">Réponses</th>
                  <th className="px-5 py-3 font-medium">État</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/super-admin/evaluations/${a.id}`)}
                    className="border-b cursor-pointer hover:bg-surface-subtle transition-colors"
                    style={{ borderColor: "rgba(17,24,39,0.04)" }}
                  >
                    <td className="px-5 py-4 font-medium text-ink">{a.title}</td>
                    <td className="px-5 py-4 text-ink-70">
                      {a.type === "POSITIONNEMENT" ? "Positionnement" : "Évaluation"}
                    </td>
                    <td className="px-5 py-4 text-ink-50">{a.partner?.name || "—"}</td>
                    <td className="px-5 py-4 text-ink-70">{a._count.questions}</td>
                    <td className="px-5 py-4 text-ink-70">
                      {a.submittedCount} / {a._count.invitations}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex px-2 py-1 rounded-md text-xs font-medium"
                        style={
                          a.isPublished
                            ? { backgroundColor: "#ECFDF5", color: "#059669" }
                            : { backgroundColor: "rgba(17,24,39,0.05)", color: "rgba(17,24,39,0.55)" }
                        }
                      >
                        {a.isPublished ? "Publiée" : "Brouillon"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && (
        <div className="app-modal-overlay" onClick={() => !busy && setCreating(false)}>
          <div className="app-modal-panel max-w-[480px] w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink mb-4">Nouvelle évaluation</h2>
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-ink-70">Titre</label>
                <input
                  className="input-field"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Test de positionnement Anglais"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-ink-70">Type</label>
                <select className="input-field" value={type} onChange={(e) => setType(e.target.value as any)}>
                  <option value="POSITIONNEMENT">Test de positionnement</option>
                  <option value="EVALUATION">Évaluation</option>
                </select>
              </div>
              {partners.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-ink-70">Organisme</label>
                  <select className="input-field" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                    <option value="">Aucun (visible du super-admin seul)</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-ink-50 mt-1.5">
                    Détermine qui peut voir et utiliser cette évaluation, ainsi que son habillage pour le candidat.
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                className="flex-1 min-h-[44px] rounded-xl border text-ink-70 font-medium"
                style={{ borderColor: "rgba(17,24,39,0.10)" }}
                onClick={() => setCreating(false)}
                disabled={busy}
              >
                Annuler
              </button>
              <button className="btn-primary flex-1 min-h-[44px]" onClick={create} disabled={busy || !title.trim()}>
                {busy ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
