"use client"

/**
 * Point d'entrée d'un chapitre de simulation dans le player.
 *
 * Il ne fait qu'une chose : charger le scénario à la demande. Les scénarios ne
 * voyagent pas dans le payload de la page — une formation Excel complète en porte
 * plusieurs centaines, ce qui alourdirait chaque chargement de page pour rien.
 */

import { useEffect, useState } from "react"
import SimulationPlayer from "./SimulationPlayer"
import type { SimulationScenario } from "@/lib/simulation/types"

type Payload = {
  mode: "LESSON" | "EXERCISE" | "EVALUATION"
  scenario: SimulationScenario
  stepCount: number
  attempt: { currentStep: number; completedAt: string | null } | null
}

type Props = {
  chapterId: string
  preview?: boolean
  onCompleted?: () => void
}

export default function SimulationChapter({ chapterId, preview, onCompleted }: Props) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    fetch(`/api/simulations/${chapterId}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null)
          throw new Error(body?.error ?? "Chargement impossible")
        }
        return r.json()
      })
      .then((json: Payload) => {
        if (!cancelled) setData(json)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [chapterId])

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6">
        <p className="text-[13px] text-warm-700">
          Cet atelier n'a pas pu être chargé : {error}
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-white">
        <p className="text-[13px] text-warm-500">Préparation de l'atelier…</p>
      </div>
    )
  }

  return (
    <SimulationPlayer
      // La clé garantit un état propre quand on passe d'un atelier à un autre :
      // l'étape courante et les compteurs ne doivent jamais fuiter entre chapitres.
      key={chapterId}
      chapterId={chapterId}
      mode={data.mode}
      scenario={data.scenario}
      initialStep={data.attempt?.currentStep ?? 0}
      preview={preview}
      onCompleted={onCompleted}
    />
  )
}
