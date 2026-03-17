"use client"

import { useState, useEffect, useRef } from "react"
import Badge from "@/components/ui/Badge"
import { TEMPLATE_VARIABLES } from "@/lib/email-template-engine"

const EMAIL_TYPES = [
  { value: "ACCOUNT_CREATED", label: "Création de compte" },
  { value: "FORMATION_ASSIGNED", label: "Formation attribuée" },
  { value: "CHAPTER_COMPLETED", label: "Chapitre terminé" },
  { value: "FORMATION_COMPLETED", label: "Formation terminée" },
  { value: "ACTIVATION_LINK", label: "Lien d'activation" },
  { value: "PASSWORD_RESET", label: "Réinitialisation mot de passe" },
  { value: "CUSTOM", label: "Personnalisé" },
]

const emailTypeBadge: Record<string, { label: string; variant: string }> = {
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

interface Log {
  id: string
  type: string
  subject: string | null
  success: boolean
  error: string | null
  sentAt: string
  user: { firstName: string; lastName: string; email: string }
}

export default function EmailManager({ logs }: { logs: Log[] }) {
  const [tab, setTab] = useState<"templates" | "logs">("templates")
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [showPreview, setShowPreview] = useState(false)
  const [testing, setTesting] = useState(false)

  // Form state
  const [formName, setFormName] = useState("")
  const [formSubject, setFormSubject] = useState("")
  const [formHtml, setFormHtml] = useState("")
  const [formType, setFormType] = useState("ACCOUNT_CREATED")
  const [formIsDefault, setFormIsDefault] = useState(true)
  const [formIsActive, setFormIsActive] = useState(true)

  const htmlRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    const res = await fetch("/api/email-templates")
    if (res.ok) setTemplates(await res.json())
    setLoading(false)
  }

  const flash = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 4000)
  }

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    setFormName("")
    setFormSubject("")
    setFormHtml("")
    setFormType("ACCOUNT_CREATED")
    setFormIsDefault(true)
    setFormIsActive(true)
    setShowPreview(false)
  }

  const openEdit = (t: Template) => {
    setCreating(false)
    setEditing(t)
    setFormName(t.name)
    setFormSubject(t.subject)
    setFormHtml(t.htmlContent)
    setFormType(t.type)
    setFormIsDefault(t.isDefault)
    setFormIsActive(t.isActive)
    setShowPreview(false)
  }

  const closeEditor = () => {
    setEditing(null)
    setCreating(false)
  }

  const handleSave = async () => {
    if (!formName || !formSubject || !formHtml || !formType) {
      flash("Tous les champs sont requis")
      return
    }
    setSaving(true)
    try {
      const body = { name: formName, subject: formSubject, htmlContent: formHtml, type: formType, isDefault: formIsDefault, isActive: formIsActive }
      const url = editing ? `/api/email-templates/${editing.id}` : "/api/email-templates"
      const method = editing ? "PUT" : "POST"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (res.ok) {
        flash(editing ? "Template modifié" : "Template créé")
        closeEditor()
        fetchTemplates()
      } else {
        const data = await res.json()
        flash("Erreur : " + (data.error || "Échec"))
      }
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce template ?")) return
    const res = await fetch(`/api/email-templates/${id}`, { method: "DELETE" })
    if (res.ok) {
      flash("Template supprimé")
      if (editing?.id === id) closeEditor()
      fetchTemplates()
    } else flash("Erreur lors de la suppression")
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

  const isEditorOpen = editing || creating

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Emails</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("templates")}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${tab === "templates" ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            Templates
          </button>
          <button
            onClick={() => setTab("logs")}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${tab === "logs" ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            Logs
          </button>
        </div>
      </div>

      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 ${message.includes("Erreur") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {message}
        </div>
      )}

      {tab === "templates" && (
        <>
          {isEditorOpen ? (
            <div className="bg-white rounded-xl border border-border p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{creating ? "Nouveau template" : "Modifier le template"}</h2>
                <button onClick={closeEditor} className="text-sm text-gray-500 hover:text-black">
                  Fermer
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nom</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Nom du template"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white"
                  >
                    {EMAIL_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Sujet</label>
                <input
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="Sujet de l'email (variables possibles : {{prenom}}, {{nom}}...)"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                />
              </div>

              {/* Variable toolbar */}
              <div>
                <label className="block text-sm font-medium mb-2">Variables disponibles</label>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors font-mono"
                      title={`${v.label} (${v.category})`}
                    >
                      {`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Contenu HTML</label>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="text-xs text-gray-500 hover:text-black"
                  >
                    {showPreview ? "Éditeur" : "Prévisualiser"}
                  </button>
                </div>
                {showPreview ? (
                  <div className="border border-border rounded-lg overflow-hidden bg-gray-50">
                    <iframe
                      srcDoc={formHtml}
                      className="w-full h-[400px]"
                      sandbox=""
                      title="Prévisualisation"
                    />
                  </div>
                ) : (
                  <textarea
                    ref={htmlRef}
                    value={formHtml}
                    onChange={(e) => setFormHtml(e.target.value)}
                    rows={16}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black font-mono"
                    placeholder="<html>..."
                  />
                )}
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="rounded"
                  />
                  Template par défaut
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded"
                  />
                  Actif
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Enregistrement..." : creating ? "Créer" : "Enregistrer"}
                </button>
                {editing && (
                  <button
                    onClick={() => handleTest(editing.id)}
                    disabled={testing}
                    className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    {testing ? "Envoi..." : "Envoyer un test"}
                  </button>
                )}
                <button onClick={closeEditor} className="px-4 py-2 text-sm text-gray-500 hover:text-black">
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <button
                  onClick={openCreate}
                  className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:opacity-90"
                >
                  + Nouveau template
                </button>
              </div>

              {loading ? (
                <div className="text-center text-sm text-gray-400 py-12">Chargement...</div>
              ) : templates.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-12">
                  Aucun template. Créez-en un ou lancez le seed.
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((t) => {
                    const badge = emailTypeBadge[t.type] || { label: t.type, variant: "default" }
                    return (
                      <div key={t.id} className="bg-white rounded-xl border border-border p-4 sm:p-5 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 min-w-0">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{t.name}</p>
                            <p className="text-xs text-gray-400 truncate">{t.subject}</p>
                          </div>
                          {!t.isActive && <Badge variant="default">Inactif</Badge>}
                          {t.isDefault && <Badge variant="blue">Défaut</Badge>}
                        </div>
                        <div className="flex items-center gap-2 sm:ml-4 shrink-0">
                          <button onClick={() => handleTest(t.id)} disabled={testing} className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" style={{ minHeight: 44 }}>Tester</button>
                          <button onClick={() => openEdit(t)} className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" style={{ minHeight: 44 }}>Modifier</button>
                          <button onClick={() => handleDelete(t.id)} className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" style={{ minHeight: 44 }}>Supprimer</button>
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

      {tab === "logs" && (
        <div className="bg-white rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Type</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Destinataire</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Sujet</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Date</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const badge = emailTypeBadge[log.type] || { label: log.type, variant: "default" }
                return (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {log.user.firstName} {log.user.lastName}
                      <span className="text-gray-400 ml-2">{log.user.email}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[200px]">
                      {log.subject || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(log.sentAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={log.success ? "success" : "error"}>
                        {log.success ? "Envoyé" : "Échec"}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    Aucun email envoyé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
