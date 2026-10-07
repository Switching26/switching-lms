"use client"
import { useCallback, useEffect, useState } from "react"
import { correctionLabels, type CorrectionContent } from "./content"
interface Submission { id: string; conversationId: string; createdAt: string;
  learner: { firstName: string; lastName: string }; correction: CorrectionContent }
export default function CorrectionsPanel() {
  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [commentId, setCommentId] = useState<string | null>(null)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetch("/api/messages/corrections", { cache: "no-store" }), data = await res.json()
    if (!res.ok) throw new Error(data.error || "Impossible de charger les corrections")
    setRows(data)
  }, [])
  useEffect(() => {
    void load().catch(e => setError(e.message)).finally(() => setLoading(false))
    const interval = setInterval(() => { void load().catch(e => setError(e.message)) }, 5000)
    return () => clearInterval(interval)
  }, [load])
  async function respond(row: Submission, status?: "corrected" | "revision") {
    if (busy) return
    setBusy(row.id); setError("")
    try {
      const res = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: row.conversationId, correctionId: row.id, status,
          content: commentId === row.id ? comment : "" }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Impossible d'enregistrer la correction")
      setCommentId(null); setComment(""); await load()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(null) }
  }
  return <section className="min-w-0 space-y-3">
    <h1 className="text-lg font-semibold">Corrections</h1>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm text-gray-500">Chargement…</p> : !rows.length && <p className="rounded-2xl border border-border bg-white p-5 text-sm text-gray-500">Aucun cas pratique déposé.</p>}
    {rows.map(row => <article key={row.id} className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{row.learner.firstName} {row.learner.lastName}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${row.correction.status === "corrected" ? "bg-green-50 text-green-700" : row.correction.status === "revision" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{correctionLabels[row.correction.status]}</span></div>
      {row.correction.text && <p className="mt-3 text-sm whitespace-pre-wrap break-words">{row.correction.text}</p>}
      <a className="mt-2 inline-flex min-h-11 items-center text-sm underline break-all" href={`/api/messages/conversations/${row.conversationId}/files/${row.id}`}>{row.correction.file?.name}</a>
      <p className="mt-1 text-xs text-gray-500">Fichier déposé le {new Date(row.createdAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={!!busy} className="min-h-11 rounded-full bg-green-50 px-4 text-sm text-green-700 disabled:opacity-40" onClick={() => respond(row, "corrected")}>Valider</button>
        <button disabled={!!busy} className="min-h-11 rounded-full bg-gray-100 px-4 text-sm disabled:opacity-40" onClick={() => { setCommentId(row.id); setComment("") }}>Commenter</button>
        <button disabled={!!busy} className="min-h-11 rounded-full bg-red-50 px-4 text-sm text-red-700 disabled:opacity-40" onClick={() => respond(row, "revision")}>À reprendre</button>
      </div>
      {commentId === row.id && <form className="mt-3 space-y-2" onSubmit={e => { e.preventDefault(); void respond(row) }}>
        <label className="block text-sm">Commentaire<textarea aria-label="Commentaire" autoFocus maxLength={20000} value={comment} onChange={e => setComment(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-border p-3" style={{ fontSize: 16 }} /></label>
        <button disabled={!!busy || !comment.trim()} className="min-h-11 rounded-full px-4 text-sm text-white disabled:opacity-40" style={{ background: "var(--lms-accent, #10ABAF)" }}>Envoyer</button>
      </form>}
    </article>)}
    <p className="text-xs text-gray-500">Le format exact des corrections dépendra de la mise en forme des cas pratiques.</p>
  </section>
}
