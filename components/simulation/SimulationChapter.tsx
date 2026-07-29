"use client"

/**
 * Point d'entrée d'un chapitre de simulation dans le player.
 *
 * Il ne fait qu'une chose : charger le scénario à la demande. Les scénarios ne
 * voyagent pas dans le payload de la page — une formation Excel complète en porte
 * plusieurs centaines, ce qui alourdirait chaque chargement de page pour rien.
 */

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import SimulationPlayer, { type EntreeSommaire } from "./SimulationPlayer"
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
  /** Sommaire de la formation, pour le panneau « Leçons » de l'atelier. */
  sommaire?: EntreeSommaire[]
  onNaviguer?: (chapterId: string) => void
  onQuitter?: () => void
  note?: string
  onNote?: (valeur: string) => void
  notesHref?: string
}

export default function SimulationChapter({
  chapterId,
  preview,
  onCompleted,
  sommaire,
  onNaviguer,
  onQuitter,
  note,
  onNote,
  notesHref,
}: Props) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [monte, setMonte] = useState(false)

  // Le portail n'existe qu'après l'hydratation : `document` n'est pas disponible
  // au rendu serveur.
  useEffect(() => setMonte(true), [])

  /**
   * Hors aperçu admin, l'atelier occupe TOUTE la fenêtre sous la navigation du
   * LMS, et la page cesse de défiler.
   *
   * Pourquoi un portail vers `document.body` plutôt qu'un simple `position:
   * fixed` : la page apprenant garde un `transform` résiduel (animation d'entrée
   * `animate-fade-in-up`), qui devient containing block et capture tout `fixed`
   * descendant — le piège qui avait fait échouer le mode immersif le 29/07. Un
   * portail sort du sous-arbre transformé, donc le positionnement ne dépend plus
   * d'aucun ancêtre.
   */
  const atelier = !preview
  useEffect(() => {
    if (!atelier) return
    const avant = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = avant
    }
  }, [atelier])

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

  const player = (
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
      pleinCadre={atelier}
      sommaire={sommaire}
      onNaviguer={onNaviguer}
      onQuitter={onQuitter}
      note={note}
      onNote={onNote}
      notesHref={notesHref}
    />
  )

  if (!atelier) return player
  if (!monte) return <div style={{ height: 420 }} />

  return createPortal(
    <div
      // Sous la navigation du LMS, qui reste visible pendant l'atelier — comme
      // OnlineFormaPro garde la sienne (choix Samuel du 29/07).
      style={{
        position: "fixed",
        top: "calc(var(--app-impersonation-offset, 0px) + var(--app-nav-height, 64px))",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        background: "#0B1512",
        overflow: "hidden",
      }}
    >
      {player}
    </div>,
    document.body,
  )
}
