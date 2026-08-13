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
import dynamic from "next/dynamic"
import SimulationPlayer, { type EntreeSommaire } from "./SimulationPlayer"

/*
 * Les players d'application sont chargés À LA DEMANDE.
 *
 * Un import statique enverrait les trois surfaces — Univer Docs pour Word, la
 * scène SVG de PowerPoint, le client de messagerie d'Outlook — dans le bundle
 * de TOUS les chapitres, Excel compris. Mesuré : les trois codes occupent
 * aujourd'hui 0 des 130 chunks client, et `/learner/formation` ne doit pas
 * grossir pour des applications qu'un chapitre Excel n'ouvrira jamais.
 *
 * `ssr: false` est obligatoire pour Word : Univer n'est pas importable côté
 * serveur (`opentype.js` casse). Les trois suivent la même règle par cohérence.
 */
const WordPlayer = dynamic(() => import("./word/WordPlayer"), { ssr: false })
const PptPlayer = dynamic(() => import("./ppt/PptPlayer"), { ssr: false })
const OutlookPlayer = dynamic(() => import("./outlook/OutlookPlayer"), { ssr: false })
import type { SimulationScenario } from "@/lib/simulation/types"
import type { LearnerDocument } from "@/lib/learner-files"
import { variablesCouleur, C } from "@/lib/simulation/couleurs"
import { FournisseurVoixDemo } from "./hooks/useVoixDemo"

type Payload = {
  /**
   * Application simulée par ce chapitre.
   *
   * `Simulation.app` existait en base depuis le 28/07/2026, était chargé par
   * `lib/data/formations.ts` et SERVI par `route.ts` — mais ce type ne le
   * déclarait pas, donc personne ne le lisait. Le fil était tendu et jamais
   * raccordé ; le voici branché.
   *
   * Optionnel à dessein : un déploiement où l'API serait momentanément plus
   * ancienne que le client ne doit pas casser un atelier Excel.
   */
  app?: "EXCEL" | "WORD" | "POWERPOINT" | "OUTLOOK"
  mode: "LESSON" | "EXERCISE" | "EVALUATION"
  scenario: SimulationScenario
  stepCount: number
  /**
   * Faux en évaluation notée : le scénario servi n'a plus ses réponses, et la
   * correction passe par `POST /api/simulations/[chapterId]/verify`.
   */
  clientValidation?: boolean
  attempt: {
    currentStep: number
    completedAt: string | null
    /** Meilleur score déjà obtenu (0..1), en évaluation seulement. */
    bestScore: number | null
    attemptCount: number
  } | null
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
  /**
   * Documents déjà chargés par la page apprenant, pour le panneau « Ressource
   * pédagogique téléchargeable » du cockpit. Simple passe-plat, comme
   * `notesHref` : l'atelier ne va jamais les chercher lui-même.
   */
  documentsChapitre?: LearnerDocument[]
  documentsFormation?: LearnerDocument[]
  afficherRessources?: boolean
  documentsHref?: string
  /** Identifiant apprenant, transmis au guide pour sa mémoire de première visite. */
  cleGuide?: string | null
}

/**
 * LE CANAL DE LA VOIX EST MONTÉ AU-DESSUS DU CHARGEMENT DU SCÉNARIO.
 *
 * 🔴 LE DÉFAUT CORRIGÉ LE 14/08/2026, trouvé en mesurant PowerPoint.
 *
 * Le canal vivait à l'INTÉRIEUR, autour du player — donc sa requête de manifeste
 * ne partait qu'une fois le scénario reçu, au moment même où le player se monte.
 * PowerPoint construit son plan de démonstration dès l'arrivée sur l'étape (Excel
 * attend le démarrage de la démonstration, 1,2 s plus tard) : son plan était donc
 * bâti AVANT que la moindre durée soit connue. Mesuré : la voix parlait, l'écran
 * gardait le rythme d'avant, et la deuxième phrase était coupée à 58 %.
 *
 * Ici, les deux requêtes partent ensemble et le manifeste — bien plus petit que
 * le scénario — est arrivé avant que le player n'existe.
 *
 * ⚠️ Ce composant ne rend AUCUN élément : c'est un fournisseur de contexte. Le
 * portail, les variables de couleur et la structure sont inchangés.
 */
export default function SimulationChapter(props: Props) {
  return (
    <FournisseurVoixDemo chapterId={props.chapterId} actif={!props.preview}>
      <ChapitreCharge {...props} />
    </FournisseurVoixDemo>
  )
}

function ChapitreCharge({
  chapterId,
  preview,
  onCompleted,
  sommaire,
  onNaviguer,
  onQuitter,
  note,
  onNote,
  notesHref,
  documentsChapitre,
  documentsFormation,
  afficherRessources,
  documentsHref,
  cleGuide,
}: Props) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [monte, setMonte] = useState(false)
  /**
   * Compteur de passages, incrémenté par « Repasser l'évaluation ».
   *
   * Il sert à DEUX choses, et les deux sont nécessaires : relancer le
   * chargement du scénario — la meilleure note vient de changer — et faire
   * varier la clé du player, donc le remonter. Une réinitialisation en place
   * devrait défaire à la main le classeur, ses graphiques, ses tableaux croisés
   * et ses macros ; le montage, lui, est le chemin déjà éprouvé.
   */
  const [passage, setPassage] = useState(0)

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
  }, [chapterId, passage])

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

  /*
   * ROUTAGE PAR APPLICATION.
   *
   * Une entrée par application, ajoutée quand son player est livré (phase 2).
   * Elles sont absentes aujourd'hui : livrer des entrées factices donnerait un
   * aiguillage qui « marche » contre du vide.
   *
   * Le REPLI SUR EXCEL est explicite et volontaire : c'est ce qui garantit que
   * les 246 chapitres publiés empruntent exactement le chemin d'avant, y compris
   * si `app` est absent du payload.
   *
   * ⚠️ Un player d'application se monte PAR CE COMPOSANT, jamais en `position:
   * fixed` dans le flux de la page : la page apprenant garde un `transform`
   * résiduel (`animate-fade-in-up`) qui devient containing block et capture tout
   * `fixed` descendant. C'est le piège qui avait fait échouer le mode immersif le
   * 29/07/2026, et c'est pour cela que le rendu passe par un portail vers
   * `document.body`, plus bas dans ce fichier.
   */
  const PLAYERS: Partial<Record<NonNullable<Payload["app"]>, typeof SimulationPlayer>> = {
    EXCEL: SimulationPlayer,
    WORD: WordPlayer as unknown as typeof SimulationPlayer,
    POWERPOINT: PptPlayer as unknown as typeof SimulationPlayer,
    OUTLOOK: OutlookPlayer as unknown as typeof SimulationPlayer,
  }
  const Player = PLAYERS[data.app ?? "EXCEL"] ?? SimulationPlayer

  /*
   * LA COULEUR DE LA FORMATION — posée ICI, et nulle part ailleurs.
   *
   * Le châssis, le chrome de l'application, l'écran d'ouverture et le guide
   * sont tous descendants de ce point : une seule déclaration de variables CSS
   * les atteint tous. Le châssis les lit en `var(--sim-…, <valeur d'Excel>)`,
   * donc un chapitre sans `app` — ou servi par une version antérieure de l'API —
   * retombe exactement sur l'écran d'avant.
   *
   * Ce composant est aussi le SEUL portail du simulateur (vérifié : un unique
   * `createPortal` dans tout `components/simulation/`). Rien ne s'échappe donc
   * de la portée des variables.
   */
  const couleurs = variablesCouleur(data.app)

  /*
   * LA VOIX DES BULLES — montée ICI, pour la même raison que les couleurs.
   *
   * Le player construit le plan de démonstration et a besoin des durées audio ;
   * le châssis, lui, est son ENFANT. L'information descend, elle ne remonte pas.
   * Ce composant est le seul parent commun aux quatre applications, donc le seul
   * point d'où les deux peuvent lire la même source.
   *
   * Inerte quand le chapitre n'a pas de voix : aucune durée n'est imposée, et la
   * démonstration garde exactement son rythme d'avant.
   */
  const player = (
    <Player
      // La clé garantit un état propre quand on passe d'un atelier à un autre :
      // l'étape courante et les compteurs ne doivent jamais fuiter entre chapitres.
      key={`${chapterId}#${passage}`}
      chapterId={chapterId}
      mode={data.mode}
      scenario={data.scenario}
      // Une ÉVALUATION entamée repart de la première question : les réussites
      // au premier essai ne sont pas persistées, reprendre au milieu notait
      // ~0 % un apprenant qui avait tout juste (choix Samuel du 02/08/2026).
      // Leçons et exercices, eux, reprennent où l'apprenant s'était arrêté et
      // `rejouerAvant` restitue son travail — ne pas toucher à ce chemin-là.
      initialStep={data.mode === "EVALUATION" ? 0 : (data.attempt?.currentStep ?? 0)}
      repriseEvaluation={
      data.mode === "EVALUATION" &&
      (data.attempt?.currentStep ?? 0) > 0 &&
      !data.attempt?.completedAt
      }
      // Une évaluation TERMINÉE ne rentrait dans aucun de ces cas : elle
      // rouvrait sur un écran d'intro vierge, sans la moindre trace du passage
      // précédent — d'où l'impression que rien n'avait été enregistré alors que
      // le score était bien en base.
      scorePrecedent={data.mode === "EVALUATION" ? data.attempt?.bestScore ?? null : null}
      passagesPrecedents={data.attempt?.attemptCount ?? 0}
      // Passe-plat strict : c'est l'API qui décide qui corrige, pas l'atelier.
      validationLocale={data.clientValidation !== false}
      // Au-delà du premier montage, l'atelier a été remonté par « Repasser » :
      // il doit ouvrir un passage NEUF côté serveur, sans hériter des verdicts
      // du précédent — sinon l'ancienne note survivrait à la nouvelle tentative.
      nouveauPassage={passage > 0}
      onRejouer={() => setPassage((n) => n + 1)}
      preview={preview}
      onCompleted={onCompleted}
      pleinCadre={atelier}
      sommaire={sommaire}
      onNaviguer={onNaviguer}
      onQuitter={onQuitter}
      note={note}
      onNote={onNote}
      notesHref={notesHref}
      documentsChapitre={documentsChapitre}
      documentsFormation={documentsFormation}
      afficherRessources={afficherRessources}
      documentsHref={documentsHref}
      cleGuide={cleGuide}
    />
  )

  // Aperçu admin et rendu en carte : le player reste dans le flux de la page,
  // mais il lui faut quand même sa palette — d'où cette enveloppe.
  if (!atelier) return <div style={couleurs}>{player}</div>
  if (!monte) return <div style={{ height: 420 }} />

  return createPortal(
    <div
      // Sous la navigation du LMS, qui reste visible pendant l'atelier — comme
      // OnlineFormaPro garde la sienne (choix Samuel du 29/07).
      style={{
        ...couleurs,
        position: "fixed",
        top: "calc(var(--app-impersonation-offset, 0px) + var(--app-nav-height, 64px))",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        // Le fond du cadre : un noir teinté de l'application, comme le cockpit.
        background: C.fond,
        overflow: "hidden",
      }}
    >
      {player}
    </div>,
    document.body,
  )
}
