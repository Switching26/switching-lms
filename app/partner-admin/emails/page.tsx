"use client"

import { useState } from "react"
import Badge from "@/components/ui/Badge"

const templates = [
  { id: "ACCOUNT_CREATED", label: "Création de compte", variant: "blue", description: "Envoyé quand un nouvel apprenant est créé" },
  { id: "FORMATION_ASSIGNED", label: "Formation attribuée", variant: "success", description: "Envoyé quand une formation est assignée" },
  { id: "CHAPTER_COMPLETED", label: "Chapitre terminé", variant: "purple", description: "Envoyé quand un chapitre est complété" },
  { id: "FORMATION_COMPLETED", label: "Formation terminée", variant: "warning", description: "Envoyé quand la formation est terminée" },
]

export default function PartnerEmailsPage() {
  const [active, setActive] = useState<Record<string, boolean>>({
    ACCOUNT_CREATED: true,
    FORMATION_ASSIGNED: true,
    CHAPTER_COMPLETED: false,
    FORMATION_COMPLETED: true,
  })

  const toggle = (id: string) => {
    setActive((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Templates emails</h1>

      <div className="space-y-3">
        {templates.map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-border p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant={t.variant}>{t.label}</Badge>
              <span className="text-sm text-gray-500">{t.description}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggle(t.id)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  active[t.id] ? "bg-primary" : "bg-gray-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    active[t.id] ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <button className="text-xs text-gray-400 hover:text-primary">Modifier</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
