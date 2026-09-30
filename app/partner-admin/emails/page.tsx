"use client"

import { useState, useEffect } from "react"
import Badge from "@/components/ui/Badge"
import Modal from "@/components/ui/Modal"
import { emailTypeLabel } from "@/lib/email-type-labels"

const EMAIL_TYPES: Record<string, { label: string; variant: string }> = {
  ACCOUNT_CREATED: { label: "Création compte", variant: "blue" },
  FORMATION_ASSIGNED: { label: "Formation attribuée", variant: "success" },
  CHAPTER_COMPLETED: { label: "Chapitre terminé", variant: "purple" },
  FORMATION_COMPLETED: { label: "Formation terminée", variant: "warning" },
  ACTIVATION_LINK: { label: "Lien activation", variant: "blue" },
  PASSWORD_RESET: { label: "Reset MDP", variant: "error" },
  LOGIN_LINK: { label: "Lien connexion", variant: "blue" },
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
// Objet affiché dans la liste : les variables deviennent des repères lisibles
// (« Activez votre compte [nom de la plateforme] ») au lieu de « {{plateforme_nom}} ».
const LIBELLES_VARIABLES: Record<string, string> = {
  plateforme_nom: "[nom de la plateforme]",
  partenaire_nom: "[nom de l'organisme]",
  prenom: "[prénom]",
  nom: "[nom]",
  formation_titre: "[formation]",
  chapitre_titre: "[chapitre]",
}
function objetLisible(sujet: string) {
  return sujet.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, v: string) => LIBELLES_VARIABLES[v] ?? `[${v.replace(/_/g, " ")}]`)
}

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
        <div className="lms-email-list">
          {templates.map((t) => {
            const badge = EMAIL_TYPES[t.type] || { label: emailTypeLabel(t.type), variant: "default" }
            return (
              <div key={t.id} className="lms-email-row bg-white rounded-xl border border-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-4 min-w-0">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-gray-400 truncate">{objetLisible(t.subject)}</p>
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
        <Modal open onClose={() => setPreview(null)} title={preview.name} wide>
            <p className="text-xs text-gray-400">Sujet : {preview.subject}</p>
            <div className="shrink-0 px-4 pt-2 text-[11px] text-gray-400 text-center">Aperçu à vos couleurs (données d&apos;exemple)</div>
            <div className="min-h-0 p-2 sm:p-4 pt-2">
              <iframe srcDoc={preview.html} sandbox="" className="app-email-preview-frame w-full rounded-lg border border-border bg-white" title="Aperçu email" />
            </div>
        </Modal>
      )}
    </div>
  )
}
