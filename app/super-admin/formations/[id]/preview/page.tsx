"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import FormationPlayer from "@/app/learner/formation/player"

export default function PreviewFormationPage() {
  const params = useParams()
  const router = useRouter()
  const formationId = params.id as string
  const [formation, setFormation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/formations/${formationId}/preview`)
      .then((r) => {
        if (!r.ok) throw new Error("Accès refusé")
        return r.json()
      })
      .then(setFormation)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [formationId])

  if (loading) {
    return (
      <div className="text-center py-20 text-sm text-gray-400">Chargement de l'aperçu...</div>
    )
  }

  if (error || !formation) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-red-500">{error || "Formation introuvable"}</p>
      </div>
    )
  }

  const chapters = formation.chapters.map((ch: any) => ({
    ...ch,
    completed: false,
    inProgress: false,
    lastPosition: 0,
  }))

  return (
    <div>
      {/* Preview banner */}
      <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between rounded-lg mb-6">
        <span className="text-sm font-medium">
          👁 Mode aperçu — Vue apprenant de &quot;{formation.title}&quot;
        </span>
        <button
          onClick={() => router.push("/super-admin/formations")}
          className="px-3 py-1 bg-white text-blue-600 text-sm rounded-lg hover:bg-blue-50 transition-colors"
        >
          Quitter l'aperçu
        </button>
      </div>

      <FormationPlayer
        formationTitle={formation.title}
        chapters={chapters}
        sections={formation.sections || []}
        formationAttachments={formation.attachments || []}
        userId="preview"
        preview
      />
    </div>
  )
}
