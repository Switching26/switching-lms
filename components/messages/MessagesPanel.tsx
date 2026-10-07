"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import MessageBody from "./MessageBody"
interface Person { id: string; firstName: string; lastName: string; email: string; role?: string }
interface Conversation { id: string; learner: Person; admin: Person; isRead: boolean; lastMessage?: { content: string } }
interface Message { id: string; content: string; senderId: string; createdAt: string; sender: Person }
const fullName = (p: Person) => `${p.firstName} ${p.lastName}`
async function json(res: Response) {
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Impossible de charger les messages")
  return data
}
export default function MessagesPanel({ trainer = false }: { trainer?: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [recipients, setRecipients] = useState<Person[]>([])
  const [active, setActive] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const bottom = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const currentId = useRef<string | null>(null)
  const version = useRef(0)
  const loadList = useCallback(async () => {
    const list: Conversation[] = await json(await fetch("/api/messages/conversations", { cache: "no-store" }))
    setConversations(list); return list
  }, [])
  const choose = useCallback(async (target: { conversationId?: string; trainerId?: string; learnerId?: string }) => {
    const operation = ++version.current
    currentId.current = null
    setActive(null); setMessages([]); setText(""); setFile(null); setError("")
    if (fileInput.current) fileInput.current.value = ""
    try {
      let id = target.conversationId
      if (!id) id = (await json(await fetch("/api/messages/conversations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target),
      }))).id
      const list = await loadList(), selected = list.find(c => c.id === id)
      if (!selected) throw new Error("Conversation indisponible")
      const rows = await json(await fetch(`/api/messages/conversations/${id}`, { cache: "no-store" }))
      if (version.current !== operation) return
      currentId.current = selected.id; setActive(selected); setMessages(rows)
      await json(await fetch(`/api/messages/conversations/${id}/read`, { method: "PUT" }))
      await loadList()
    } catch (e) { if (version.current === operation) setError((e as Error).message) }
  }, [loadList])
  useEffect(() => {
    let alive = true
    async function init() {
      try {
        const [list, people] = await Promise.all([loadList(), json(await fetch("/api/messages/recipients"))])
        if (!alive) return
        setRecipients(people)
        const query = new URLSearchParams(window.location.search)
        const id = query.get("conversation"), learnerId = query.get("learnerId") || query.get("learner")
        if (trainer && learnerId) await choose({ learnerId })
        else if (id && list.some(c => c.id === id)) await choose({ conversationId: id })
        else if (!trainer) await choose({})
      } catch (e) { if (alive) setError((e as Error).message) }
      finally { if (alive) setLoading(false) }
    }
    void init()
    return () => { alive = false; ++version.current; currentId.current = null }
  }, [choose, loadList, trainer])
  useEffect(() => {
    const controller = new AbortController(); let running = false
    const interval = setInterval(async () => {
      if (running) return
      running = true
      const id = currentId.current
      try {
        await loadList()
        if (id) {
          const rows = await json(await fetch(`/api/messages/conversations/${id}`, { signal: controller.signal, cache: "no-store" }))
          if (currentId.current !== id) return
          setMessages(rows)
          await json(await fetch(`/api/messages/conversations/${id}/read`, { method: "PUT", signal: controller.signal }))
        }
      } catch (e) { if (!controller.signal.aborted && currentId.current === id) setError((e as Error).message) }
      finally { running = false }
    }, 3000)
    return () => { clearInterval(interval); controller.abort() }
  }, [loadList])
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }) }, [messages.length, active?.id])
  async function send() {
    if (!active || sending || (!text.trim() && !file)) return
    const id = active.id; setSending(true); setError("")
    try {
      let init: RequestInit
      if (file) {
        const form = new FormData(); form.set("conversationId", id); form.set("content", text); form.set("file", file)
        init = { method: "POST", body: form }
      } else init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: id, content: text }) }
      const row: Message = await json(await fetch("/api/messages", init))
      if (currentId.current === id) {
        setMessages(previous => previous.some(m => m.id === row.id) ? previous : [...previous, row])
        setText(""); setFile(null); if (fileInput.current) fileInput.current.value = ""
      }
      await loadList()
    } catch (e) { setError((e as Error).message) }
    finally { setSending(false) }
  }
  const label = active ? trainer ? fullName(active.learner) : active.admin.role === "TRAINER" ? `Votre formatrice — ${fullName(active.admin)}` : recipients.length ? "Équipe Switching" : "Messages" : "Messages"
  const rows = recipients.map(person => ({ person, conversation: conversations.find(c => c.learner.id === person.id) }))
    .sort((a, b) => Number(a.conversation?.isRead ?? true) - Number(b.conversation?.isRead ?? true))
  const trainerThread = !trainer && active?.admin.role === "TRAINER"
  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement…</p>
  return <div className="lms-messages flex min-w-0 min-h-[320px] h-[calc(100dvh-220px)] md:h-[calc(100dvh-150px)] flex-col overflow-hidden rounded-2xl border border-border bg-white">
    {error && <p role="alert" className="p-3 text-sm text-red-700 bg-red-50">{error}</p>}
    {!trainer && recipients.length > 0 && <nav aria-label="Destinataires" className="flex shrink-0 gap-2 overflow-x-auto border-b border-border p-3">
      <button className="min-h-11 shrink-0 rounded-xl border border-border px-3 text-sm" aria-pressed={active?.admin.role !== "TRAINER"} onClick={() => choose({})}>Équipe Switching</button>
      {recipients.map(p => <button key={p.id} aria-pressed={active?.admin.id === p.id} onClick={() => choose({ trainerId: p.id })} className="min-h-11 shrink-0 rounded-xl border border-border px-3 text-sm">Votre formatrice — {fullName(p)}</button>)}
    </nav>}
    <div className="flex min-h-0 flex-1 min-w-0">
      {trainer && <aside className={`${active ? "hidden md:flex" : "flex"} w-full md:w-64 shrink-0 flex-col border-r border-border overflow-y-auto`}>
        <h1 className="px-4 py-3 text-sm font-semibold">Messages</h1>
        {rows.length === 0 && <p className="p-4 text-sm text-gray-500">Aucun élève avec bonus.</p>}
        {rows.map(({ person, conversation }) => <button key={person.id} onClick={() => choose({ learnerId: person.id })} className="min-h-14 border-t border-border p-4 text-left hover:bg-gray-50" style={{ background: active?.learner.id === person.id ? "var(--lms-sunk, #F5F5F7)" : undefined }}>
          <span className="flex items-center justify-between gap-2 text-sm font-medium">{fullName(person)}{conversation && !conversation.isRead && <span aria-label="Message non lu" className="h-2 w-2 rounded-full bg-red-500" />}</span>
          <span className="block truncate mt-1 text-xs text-gray-500">{conversation?.lastMessage?.content || "—"}</span>
        </button>)}
      </aside>}
      <section className={`${trainer && !active ? "hidden md:flex" : "flex"} min-w-0 min-h-0 flex-1 flex-col`}>
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          {trainer && active && <button aria-label="Retour aux conversations" className="md:hidden min-h-11 min-w-11 rounded-lg" onClick={() => { ++version.current; currentId.current = null; setActive(null); setMessages([]) }}>‹</button>}
          <div className="min-w-0"><h2 className="text-sm font-semibold">{label}</h2><p className="text-xs text-gray-500 mt-1">{trainer ? active?.learner.email : trainerThread ? "Échangez avec votre formatrice" : "Échangez avec votre administrateur"}</p></div>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite">
          {!active && <p className="text-center text-sm text-gray-500 mt-8">Sélectionnez un élève.</p>}
          {active && !messages.length && <p className="text-center text-sm text-gray-500 mt-8">Aucun message. Envoyez le premier !</p>}
          {messages.map(m => { const mine = trainer ? m.sender.role === "TRAINER" : m.sender.role === "LEARNER"
            return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className="max-w-[88%] sm:max-w-[75%] min-w-0">
              <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed" style={{ background: mine ? "var(--lms-accent, #10ABAF)" : "var(--lms-sunk, #F5F5F7)", color: mine ? "white" : "#111111" }}><MessageBody content={m.content} conversationId={active!.id} messageId={m.id} /></div>
              <p className="mt-1 text-[10px] text-gray-500">{new Date(m.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
            </div></div>})}<div ref={bottom} />
        </div>
        {active && <form onSubmit={e => { e.preventDefault(); void send() }} className="shrink-0 border-t border-border p-3">
          {trainerThread && <label className="block mb-2 text-xs text-gray-500">Cas pratique terminé<input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" disabled={sending} className="mt-1 block w-full min-w-0 text-xs file:min-h-11 file:rounded-lg file:border file:border-border file:bg-white file:px-3 file:mr-2" onChange={e => setFile(e.target.files?.[0] || null)} /></label>}
          <div className="flex min-w-0 gap-2"><textarea aria-label="Message" maxLength={20000} value={text} rows={1} disabled={sending} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send() } }} placeholder="Écrire un message…" className="min-w-0 flex-1 resize-none rounded-2xl border border-border px-3 py-3 outline-none focus:border-gray-400" style={{ fontSize: 16, minHeight: 44 }} />
            <button disabled={sending || (!text.trim() && !file)} className="min-h-11 self-end rounded-full px-4 py-3 text-sm font-medium text-white disabled:opacity-40" style={{ background: "var(--lms-accent, #10ABAF)" }}>Envoyer</button></div>
        </form>}
      </section>
    </div>
  </div>
}
