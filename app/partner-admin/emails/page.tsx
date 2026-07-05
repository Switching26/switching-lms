"use client"

import { useState, useEffect, useRef } from "react"
import Badge from "@/components/ui/Badge"
import Modal from "@/components/ui/Modal"
import { TEMPLATE_VARIABLES } from "@/lib/email-template-engine"

const EMAIL_TYPES: Record<string, { label: string; variant: string }> = {
  ACCOUNT_CREATED: { label: "Création compte", variant: "blue" },
  FORMATION_ASSIGNED: { label: "Formation attribuée", variant: "success" },
  CHAPTER_COMPLETED: { label: "Chapitre terminé", variant: "purple" },
  FORMATION_COMPLETED: { label: "Formation terminée", variant: "warning" },
  ACTIVATION_LINK: { label: "Lien activation", variant: "blue" },
  PASSWORD_RESET: { label: "Reset MDP", variant: "error" },
  CUSTOM: { label: "Personnalisé", variant: "default" },
}

interface Template {
  id: string
  name: string
  subject: string
  htmlContent: string
  type: string
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function PartnerEmailsPage() {
  const [tab, setTab] = useState<"mine" | "defaults">("mine")
  const [myTemplates, setMyTemplates] = useState<Template[]>([])
  const [defaultTemplates, setDefaultTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [showPreview, setShowPreview] = useState(false)
  const [testing, setTesting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [formName, setFormName] = useState("")
  const [formSubject, setFormSubject] = useState("")
  const [formHtml, setFormHtml] = useState("")
  const [formIsActive, setFormIsActive] = useState(true)

  const htmlRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [myRes, defRes] = await Promise.all([
      fetch("/api/email-templates"),
      fetch("/api/email-templates/defaults"),
    ])
    if (myRes.ok) setMyTemplates(await myRes.json())
    if (defRes.ok) setDefaultTemplates(await defRes.json())
    setLoading(false)
  }

  const flash = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 4000)
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setFormName(t.name)
    setFormSubject(t.subject)
    setFormHtml(t.htmlContent)
    setFormIsActive(t.isActive)
    setShowPreview(false)
  }

  const closeEditor = () => setEditing(null)

  const handleSave = async () => {
    if (!editing || !formName || !formSubject || !formHtml) {
      flash("Tous les champs sont requis")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/email-templates/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, subject: formSubject, htmlContent: formHtml, isActive: formIsActive }),
      })
      if (res.ok) {
        flash("Template modifié")
        closeEditor()
        fetchAll()
      } else {
        const data = await res.json()
        flash("Erreur : " + (data.error || "Échec"))
      }
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/email-templates/${deleteId}`, { method: "DELETE" })
      if (res.ok) {
        flash("Template supprimé")
        if (editing?.id === deleteId) closeEditor()
        fetchAll()
      } else flash("Erreur lors de la suppression")
    } catch { flash("Erreur réseau") }
    finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const handleDuplicate = async (id: string) => {
    setDuplicating(true)
    try {
      const res = await fetch(`/api/email-templates/${id}/duplicate`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        flash("Template dupliqué dans vos templates")
        setTab("mine")
        fetchAll()
      } else flash("Erreur : " + (data.error || "Échec"))
    } catch { flash("Erreur réseau") }
    finally { setDuplicating(false) }
  }

  const handleTest = async (id: string) => {
    setTesting(true)
    try {
      const res = await fetch(`/api/email-templates/${id}/test`, { method: "POST" })
      const data = await res.json()
      if (data.success) flash(`Email de test envoyé à ${data.sentTo}`)
      else flash("Erreur : " + (data.error || "Échec"))
    } catch { flash("Erreur réseau") }
    finally { setTesting(false) }
  }

  const insertVariable = (key: string) => {
    const ta = htmlRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = `{{${key}}}`
    const newVal = formHtml.substring(0, start) + text + formHtml.substring(end)
    setFormHtml(newVal)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + text.length, start + text.length)
    }, 0)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-semibold">Emails</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setTab("mine"); closeEditor() }}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${tab === "mine" ? "bg-[var(--partner-primary,#111)] text-white" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            Mes templates
          </button>
          <button
            onClick={() => { setTab("defaults"); closeEditor() }}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${tab === "defaults" ? "bg-[var(--partner-primary,#111)] text-white" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            Templates par défaut
          </button>
        </div>
      </div>

      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 ${message.includes("Erreur") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {message}
        </div>
      )}

      {/* ───── MY TEMPLATES TAB ───── */}
      {tab === "mine" && (
        <>
          {editing ? (
            <div className="bg-white rounded-xl border border-border p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Modifier le template</h2>
                <button onClick={closeEditor} className="text-sm text-gray-500 hover:text-black">Fermer</button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Nom</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-[var(--partner-primary,#111)]" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Sujet</label>
                <input type="text" value={formSubject} onChange={(e) => setFormSubject(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-[var(--partner-primary,#111)]" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Variables disponibles</label>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button key={v.key} onClick={() => insertVariable(v.key)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors font-mono" title={`${v.label} (${v.category})`}>
                      {`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Contenu HTML</label>
                  <button onClick={() => setShowPreview(!showPreview)} className="text-xs text-gray-500 hover:text-black">
                    {showPreview ? "Éditeur" : "Prévisualiser"}
                  </button>
                </div>
                {showPreview ? (
                  <div className="border border-border rounded-lg overflow-hidden bg-gray-50">
                    <iframe srcDoc={formHtml} className="w-full h-[400px]" sandbox="" title="Prévisualisation" />
                  </div>
                ) : (
                  <textarea ref={htmlRef} value={formHtml} onChange={(e) => setFormHtml(e.target.value)} rows={14} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-[var(--partner-primary,#111)] font-mono" />
                )}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} className="rounded" />
                Actif
              </label>

              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[var(--partner-primary,#111)] text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button onClick={() => handleTest(editing.id)} disabled={testing} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
                  {testing ? "Envoi..." : "Envoyer un test"}
                </button>
                <button onClick={closeEditor} className="px-4 py-2 text-sm text-gray-500 hover:text-black">Annuler</button>
              </div>
            </div>
          ) : (
            <>
              {loading ? (
                <div className="text-center text-sm text-gray-400 py-12">Chargement...</div>
              ) : myTemplates.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-12">
                  Aucun template personnalisé. Dupliquez un template par défaut depuis l'onglet "Templates par défaut".
                </div>
              ) : (
                <div className="space-y-3">
                  {myTemplates.map((t) => {
                    const badge = EMAIL_TYPES[t.type] || { label: t.type, variant: "default" }
                    return (
                      <div key={t.id} className="bg-white rounded-xl border border-border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-start gap-4 min-w-0">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{t.name}</p>
                            <p className="text-xs text-gray-400 truncate">{t.subject}</p>
                          </div>
                          {!t.isActive && <Badge variant="default">Inactif</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:ml-4 sm:shrink-0">
                          <button onClick={() => handleTest(t.id)} disabled={testing} className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Tester</button>
                          <button onClick={() => openEdit(t)} className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Modifier</button>
                          <button onClick={() => setDeleteId(t.id)} className="px-3 py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">Supprimer</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ───── DEFAULT TEMPLATES TAB ───── */}
      {tab === "defaults" && (
        <>
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-12">Chargement...</div>
          ) : defaultTemplates.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-12">
              Aucun template par défaut disponible.
            </div>
          ) : (
            <div className="space-y-3">
              {defaultTemplates.map((t) => {
                const badge = EMAIL_TYPES[t.type] || { label: t.type, variant: "default" }
                const alreadyHas = myTemplates.some((m) => m.type === t.type)
                return (
                  <div key={t.id} className="bg-white rounded-xl border border-border p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                      <div className="flex items-start gap-4 min-w-0">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <p className="text-xs text-gray-400 truncate">{t.subject}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDuplicate(t.id)}
                        disabled={duplicating || alreadyHas}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors sm:shrink-0 ${
                          alreadyHas
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-[var(--partner-primary,#111)] text-white hover:opacity-90 disabled:opacity-50"
                        }`}
                      >
                        {alreadyHas ? "Déjà dupliqué" : "Utiliser ce template"}
                      </button>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden bg-gray-50">
                      <iframe srcDoc={t.htmlContent} className="w-full h-[200px]" sandbox="" title={t.name} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Confirmation suppression */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Supprimer ce template ?">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Cette action est irréversible. Le template sera définitivement supprimé.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition-colors">Annuler</button>
            <button onClick={confirmDelete} disabled={deleting} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
              {deleting ? "Suppression..." : "Supprimer"}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
