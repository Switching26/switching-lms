"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Copy } from "lucide-react"
import Modal from "@/components/ui/Modal"
import styles from "./CopyLoginLink.module.css"

type LoginLink = { loginUrl: string; organisation: string; firstName: string; lastName: string; email: string; message: string }

export default function CopyLoginLink({ userId, initialMessage, onMessageChange, onClose, onBack }: { userId: string; initialMessage?: string; onMessageChange: (message: string) => void; onClose: () => void; onBack: () => void }) {
  const [data, setData] = useState<LoginLink | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [copying, setCopying] = useState(false)
  const link = useRef<HTMLTextAreaElement | null>(null)
  const linkObserver = useRef<ResizeObserver | null>(null)
  const setLink = useCallback((field: HTMLTextAreaElement | null) => {
    linkObserver.current?.disconnect()
    link.current = field
    if (!field) return
    const fit = () => {
      field.style.height = "auto"
      field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`
    }
    fit()
    let width = field.clientWidth
    linkObserver.current = new ResizeObserver(() => {
      if (field.clientWidth !== width) {
        width = field.clientWidth
        fit()
      }
    })
    linkObserver.current.observe(field)
    void document.fonts.ready.then(() => { if (link.current === field) fit() })
  }, [])
  const editor = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/user/${encodeURIComponent(userId)}/login-link`, { signal: controller.signal, cache: "no-store" })
      .then(async res => {
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || "Impossible de préparer le lien")
        setData(result); setMessage(initialMessage ?? result.message)
      })
      .catch(err => { if (err.name !== "AbortError") setError(err.message || "Erreur réseau") })
    return () => { controller.abort(); clearTimeout(timer.current) }
  }, [userId])

  async function copy(kind: "link" | "message") {
    if (!data || copying) return
    setCopying(true); setStatus(""); clearTimeout(timer.current)
    const text = kind === "link" ? data.loginUrl : message
    const field = kind === "link" ? link.current : editor.current
    const previous = document.activeElement as HTMLElement | null
    let copied = false
    try {
      await navigator.clipboard.writeText(text)
      copied = true
    } catch {
      // The native dialog makes document.body inert: keep the fallback inside it.
      const temporary = document.createElement("textarea")
      temporary.value = text
      temporary.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px;"
      temporary.setAttribute("readonly", "")
      const dialog = field?.closest("dialog")
      if (dialog) {
        dialog.appendChild(temporary)
        temporary.focus({ preventScroll: true }); temporary.select(); temporary.setSelectionRange(0, text.length)
        try { copied = document.execCommand("copy") } catch { /* Manual selection below. */ }
        temporary.remove()
      }
    }
    if (copied) {
      previous?.focus({ preventScroll: true })
      setStatus("Copié")
      timer.current = setTimeout(() => setStatus(""), 2500)
    } else {
      field?.focus({ preventScroll: true }); field?.select(); field?.setSelectionRange(0, text.length)
      setStatus("Copie automatique indisponible. Le texte est sélectionné : utilisez Copier dans le menu de votre appareil.")
    }
    setCopying(false)
  }

  return <Modal open onClose={onClose} title="Copier le lien de connexion" footer={data && <div className={styles.footer}>
    <p className={styles.status} role="status" aria-live="polite">{status || "\u00a0"}</p>
    <div className={styles.buttons}>
      <button className={styles.secondary} disabled={copying} onClick={() => copy("link")}><Copy size={16} aria-hidden="true" />Copier le lien</button>
      <button className={styles.primary} disabled={copying} onClick={() => copy("message")}><Copy size={16} aria-hidden="true" />Copier le message</button>
    </div>
  </div>}>
    <button className={styles.back} onClick={onBack}>← Actions de l’utilisateur</button>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Préparation du lien…</p> : <div className={styles.body}>
      <div><p className={styles.identity}>{data.firstName} {data.lastName.toLocaleUpperCase("fr-FR")} · {data.organisation}</p><p className={styles.email}>{data.email}</p></div>
      <div><label className={styles.label} htmlFor="copy-login-url">Lien de connexion</label>
        <textarea id="copy-login-url" ref={setLink} className={styles.link} readOnly value={data.loginUrl} rows={2} />
        <p className={styles.hint}>Ce lien n’expire pas. La connexion nécessite votre identifiant et votre mot de passe.</p>
      </div>
      <div><div className={styles.messageLabel}><label className={styles.label} htmlFor="copy-login-message">Message prêt à copier</label><span>Modifiable</span></div>
        <textarea id="copy-login-message" ref={editor} className={styles.editor} value={message} onChange={event => { setMessage(event.target.value); onMessageChange(event.target.value); setStatus("") }} spellCheck />
      </div>
    </div>}
  </Modal>
}
