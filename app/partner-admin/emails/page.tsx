"use client"

import { useState, useEffect } from "react"
import Badge from "@/components/ui/Badge"

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
}

// Espace admin partenaire : LECTURE SEULE. L'admin partenaire visualise les emails
// automatiques envoyés à ses apprenants (rendu final à ses couleurs), sans pouvoir
// créer, modifier, dupliquer ou tester — seul le super-admin gère les templates (07/07/2026).
export default function PartnerEmailsPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<{ name: string; subject: string; html: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchDefaults()
  }, [])

  const fetchDefaults = async () => {
    setLoading(true)
    const res = await fetch("/api/email-templates/defaults")
    if (res.ok) setTemplates(await res.json())
    setLoading(false)
  }

  const openPreview = async (t: Template) => {
    setError("")
    setPreviewLoading(t.id)
    try {
      const res = await fetch(`/api/email-templates/${t.id}/preview`)
      if (res.ok) {
        const data = await res.json()
        setPreview({ name: t.name, subject: data.subject, html: data.html })
      } else {
        setError("Impossible de charger l'aperçu.")
      }
    } catch {
      setError("Erreur réseau.")
    } finally {
      setPreviewLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Emails</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Emails automatiques envoyés à vos apprenants, affichés à vos couleurs. Lecture seule.
        </p>
      </div>

      {error && (
        <div className="text-sm rounded-lg px-4 py-3 bg-red-50 text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="text-center text-sm text-gray-400 py-12">Chargement...</div>
      ) : templates.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-12">Aucun template disponible.</div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const badge = EMAIL_TYPES[t.type] || { label: t.type, variant: "default" }
            return (
              <div key={t.id} className="bg-white rounded-xl border border-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-4 min-w-0">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-gray-400 truncate">{t.subject}</p>
                  </div>
                </div>
                <button
                  onClick={() => openPreview(t)}
                  disabled={previewLoading === t.id}
                  className="px-4 py-2 text-sm rounded-lg text-white disabled:opacity-50 transition-opacity sm:shrink-0"
                  style={{ backgroundColor: "var(--partner-primary, #111)", minHeight: 44 }}
                >
                  {previewLoading === t.id ? "Chargement..." : "Voir"}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-3 sm:p-8 overflow-y-auto" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-2 sm:my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{preview.name}</p>
                <p className="text-xs text-gray-400 truncate">Sujet : {preview.subject}</p>
              </div>
              <button onClick={() => setPreview(null)} aria-label="Fermer" className="w-9 h-9 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
            </div>
            <div className="px-4 pt-2 text-[11px] text-gray-400 text-center">Aperçu à vos couleurs (données d&apos;exemple)</div>
            <div className="p-2 sm:p-4 pt-2">
              <iframe srcDoc={preview.html} sandbox="" className="w-full h-[68vh] rounded-lg border border-border bg-white" title="Aperçu email" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
