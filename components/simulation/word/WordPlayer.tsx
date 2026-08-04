"use client"

/**
 * Le player de Word — un ADAPTATEUR du châssis commun, jamais un second player.
 *
 * POURQUOI CE FICHIER EST COURT, ET DOIT LE RESTER
 *
 * Tout ce qui n'est pas propre à Word vit dans le noyau : progression, aide
 * progressive, retour visuel, persistance, passage d'évaluation, ET LE CALCUL DE
 * NOTE. Dupliquer ce dernier, ce serait deux notes possibles pour un même
 * parcours, et la divergence serait SILENCIEUSE — la formation continuerait de
 * se jouer normalement avec des notes fausses. C'est la raison d'être du contrat
 * (D6), pas une préférence de style.
 *
 * Ce fichier ne porte donc que trois choses :
 *   1. poser l'état du document d'une étape (`appliquerEtape`) ;
 *   2. transformer une observation de la surface en jugement ;
 *   3. rendre la zone de travail — ruban + surface — dans `AtelierShell`.
 *
 * Si ce fichier dépasse 2 000 lignes, c'est qu'il réimplémente du générique :
 * le signaler au chef d'orchestre plutôt que de continuer (contrat §4.c).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"

import AtelierShell, {
  type ConsigneAtelier,
  type EntreeSommaire,
} from "../AtelierShell"
import {
  useAideProgressive,
  useMesureZoneTravail,
  usePersistance,
  useProgression,
  useRetourVisuel,
} from "../hooks/useAtelier"
import WordChrome, { type OngletWord } from "./WordChrome"
import WordPageLayout, { PAGE_PAR_DEFAUT, type EtatPage } from "./WordPageLayout"
import WordHeaderFooter, {
  CalqueHorsFlux,
  HORS_FLUX_PAR_DEFAUT,
  type EtatHorsFlux,
} from "./WordHeaderFooter"
import WordPrintPreview, { IMPRESSION_PAR_DEFAUT, type EtatImpression } from "./WordPrintPreview"
import WordRuler, { type EtatTaquets } from "./WordRuler"
import WordProofing, { type ReglagesCorrecteur } from "./WordProofing"
import WordImagePicker from "./WordImagePicker"
import WordLinkDialog from "./WordLinkDialog"
import type { WordApi } from "./WordSurface"

import { adaptateurWord } from "@/lib/simulation/word/adaptateur"
import type { WordObservation } from "@/lib/simulation/word/observations"

/** Le seul variant d'observation qui porte un état de document. */
type EtatDocumentLu = Extract<WordObservation, { kind: "w:docState" }>
import type { WordDocumentState, WordParagrapheDeclare } from "@/lib/simulation/word/document"
import { jugerEtape, type JugementEtape } from "@/lib/simulation/frappe"
import type { SimulationStep } from "@/lib/simulation/types"
import type { LearnerDocument } from "@/lib/learner-files"

/**
 * Univer n'est PAS importable côté serveur — son moteur de rendu casse à
 * l'import Node. Et son poids ne doit partir qu'à l'ouverture d'un atelier :
 * repère Excel, `/learner/formation` ne prend que +18 kB de First Load JS, les
 * gros morceaux restant dans des chunks séparés.
 */
const WordSurface = dynamic(() => import("./WordSurface"), { ssr: false })

/** Délai au-delà duquel on cesse d'attendre le juge serveur. */
const DELAI_VERDICT_MS = 8000

type EtapeWord = SimulationStep & {
  setup?: {
    document?: WordDocumentState
    selection?: string
    ribbon?: { activeTab?: OngletWord }
    /** Fautes et synonymes que le correcteur doit proposer sur ce chapitre. */
    correcteur?: ReglagesCorrecteur
  }
}

type ScenarioWord = {
  title?: string
  moduleTitle?: string
  mode?: string
  intro?: { title?: string; body?: string }
  outro?: string
  document?: WordDocumentState
  steps: EtapeWord[]
}

export type WordPlayerProps = {
  chapterId: string
  mode: "LESSON" | "EXERCISE" | "EVALUATION"
  scenario: ScenarioWord
  initialStep?: number
  repriseEvaluation?: boolean
  scorePrecedent?: number | null
  passagesPrecedents?: number
  validationLocale?: boolean
  nouveauPassage?: boolean
  onRejouer?: () => void
  preview?: boolean
  onCompleted?: () => void
  pleinCadre?: boolean
  sommaire?: EntreeSommaire[]
  onNaviguer?: (chapterId: string) => void
  onQuitter?: () => void
  note?: string
  onNote?: (valeur: string) => void
  notesHref?: string
  documentsChapitre?: LearnerDocument[]
  documentsFormation?: LearnerDocument[]
  afficherRessources?: boolean
  documentsHref?: string
  cleGuide?: string | null
}

export default function WordPlayer({
  chapterId,
  mode,
  scenario,
  initialStep = 0,
  validationLocale = true,
  nouveauPassage,
  preview,
  onCompleted,
  pleinCadre,
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
}: WordPlayerProps) {
  const steps = scenario.steps ?? []
  const evaluationNotee = mode === "EVALUATION"

  /* ═══════════ NOYAU COMMUN ═══════════ */

  const retour = useRetourVisuel()
  const { verdict, setVerdict, lancerFx, relais, relaisActif, marquerRelais, poserJalon } = retour

  /**
   * Le rappel de geste de la carte de franchissement vient de l'ADAPTATEUR, pas
   * d'un texte écrit à la main dans le scénario : une formulation dérivée suit
   * automatiquement toute correction de contenu, là où 1 872 phrases rédigées
   * une à une seraient ingérables.
   */
  const resumerEtape = useCallback(
    (i: number) => {
      const s = steps[i]
      return s ? adaptateurWord.fait(s.action as never) : null
    },
    [steps],
  )

  const progression = useProgression({
    total: steps.length,
    // Une ÉVALUATION repart toujours de la première question : les réussites au
    // premier essai ne sont pas persistées, et reprendre au milieu noterait
    // ~0 % un apprenant qui avait tout juste.
    departForce: evaluationNotee ? 0 : initialStep,
    mode,
    resumerEtape,
    retour,
  })
  const {
    index,
    indexRef,
    introVue,
    introVueRef,
    ouvrirLAtelier,
    finished,
    setFinished,
    goNext,
    reculPossible,
    reculer,
    onAvancer,
    onTerminer,
  } = progression

  const etape = steps[index] as EtapeWord | undefined
  const etapeRef = useRef<EtapeWord | undefined>(etape)
  etapeRef.current = etape

  const persistance = usePersistance({
    chapterId,
    mode,
    preview,
    nouveauPassage,
    onCompleted,
    indexRef,
    stepRef: etapeRef,
    goNextRef: useRef<(() => void) | null>(goNext),
  })
  const {
    pendingRef,
    runIdRef,
    persist,
    commencer,
    passerLaQuestion,
    passageEnCours,
    cloturer,
    pannneJuge,
    setPanneJuge,
  } = persistance

  const aide = useAideProgressive({
    mode,
    index,
    finished,
    aUneEtape: !!etape,
  })
  const {
    essais,
    tatonnements,
    tropLong,
    hintShown,
    montrerIndice,
    compterEssai,
    compterTatonnement,
    demonstration,
    demoFinie,
    demarrerDemonstration,
    rejouerDemonstration,
    reinitialiserPourEtape,
    reinitialiserAAlArrivee,
    ouvrirFenetreMiseEnPlace,
    dansFenetreMiseEnPlace,
  } = aide

  /* ═══════════ LA SURFACE ═══════════ */

  const zoneRef = useRef<HTMLDivElement | null>(null)
  const { hauteur } = useMesureZoneTravail(zoneRef, index)
  const apiRef = useRef<WordApi | null>(null)
  const [surfacePrete, setSurfacePrete] = useState(false)

  /*
   * ═══ MISE EN PAGE ═══
   *
   * Le moteur n'a AUCUNE commande de marges ni d'orientation, et muter son
   * modèle ne repeint pas (mesuré au spike, D5). L'état vit donc ICI, et c'est
   * le player qui le joint à l'observation d'état — la surface ne le connaît
   * pas. Même partage qu'entre `pagesetup.ts` et la grille côté Excel.
   */
  const [page, setPage] = useState<Required<EtatPage>>(PAGE_PAR_DEFAUT)
  const [panneauPage, setPanneauPage] = useState(false)
  const pageRef = useRef<Required<EtatPage>>(PAGE_PAR_DEFAUT)
  pageRef.current = page

  /*
   * ═══ EN-TÊTE, PIED, FILIGRANE ═══
   *
   * Hors du flux du document par nature : un en-tête se répète sur chaque page
   * et a son propre point d'insertion — une seconde surface d'édition, qu'un
   * document Univer unique ne porte pas. Même partage que la mise en page.
   */
  const [horsFlux, setHorsFlux] = useState<EtatHorsFlux>(HORS_FLUX_PAR_DEFAUT)
  const [panneauEntete, setPanneauEntete] = useState(false)
  const horsFluxRef = useRef<EtatHorsFlux>(HORS_FLUX_PAR_DEFAUT)
  horsFluxRef.current = horsFlux

  /* ═══ IMPRESSION ═══ Rien ne s'imprime : on enseigne l'écran et ses réglages. */
  const [impression, setImpression] = useState<EtatImpression>(IMPRESSION_PAR_DEFAUT)
  const [ecranImpression, setEcranImpression] = useState(false)
  const impressionRef = useRef<EtatImpression>(IMPRESSION_PAR_DEFAUT)
  impressionRef.current = impression

  /*
   * ═══ TAQUETS ═══
   *
   * Le moteur n'expose aucun taquet, ni au modèle ni aux commandes. Ils vivent
   * sur NOTRE règle. `paragrapheCourant` suit le curseur pour savoir à quel
   * paragraphe un taquet posé appartient.
   */
  /* ═══ CORRECTEUR ═══ Aucun correcteur dans le moteur : les fautes et les
     synonymes sont déclarés par le scénario, et la correction acceptée écrit
     dans le document — c'est donc `W_EXPECT_DOC` qui juge. */
  const [panneauVerif, setPanneauVerif] = useState(false)

  /*
   * ═══ IMAGES ═══
   *
   * `imageCourante` retient la dernière image posée : les boutons d'habillage
   * agissent sur ELLE. Dans le vrai Word on sélectionne l'image d'un clic ;
   * ici la sélection d'un dessin sur canvas n'est pas observable, alors la
   * dernière insérée fait office de sélection — un document de chapitre n'en
   * porte jamais deux à la fois.
   */
  const [galerieImages, setGalerieImages] = useState(false)
  /* ═══ LIENS ═══ Un lien s'applique à la SÉLECTION : on la retient pour
     l'afficher dans la boîte et refuser une pose sans texte visé. */
  const [boiteLien, setBoiteLien] = useState(false)
  const selectionCourante = useRef("")
  const imageCourante = useRef<string | null>(null)

  const [taquets, setTaquets] = useState<EtatTaquets>({})
  const [regleVisible, setRegleVisible] = useState(false)
  const [paragrapheCourant, setParagrapheCourant] = useState(0)
  const taquetsRef = useRef<EtatTaquets>({})
  taquetsRef.current = taquets

  /**
   * L'état d'un document, TEL QUE LE JUGE DOIT LE VOIR.
   *
   * La surface connaît les paragraphes ; le player connaît tout ce que le moteur
   * ne porte pas — page, en-tête, impression, taquets. Le juge, lui, attend un
   * seul objet. C'est ici que les deux moitiés se rejoignent, et nulle part
   * ailleurs : un relevé qui oublierait cette jonction laisserait une étape
   * `W_EXPECT_ENTETE` attendre indéfiniment un champ qui n'arriverait jamais.
   */
  const etatComplet = useCallback(
    (base: EtatDocumentLu): WordObservation => ({
      ...base,
      // ⚠️ `numeroPage` se RÈGLE dans le panneau en-tête — c'est là qu'il est
      // dans Word — mais se JUGE avec la mise en page, où il appartient
      // sémantiquement. La jonction se fait ici, une fois pour toutes.
      page: { ...pageRef.current, numeroPage: horsFluxRef.current.numeroPage },
      horsFlux: {
        entete: horsFluxRef.current.entete,
        pied: horsFluxRef.current.pied,
        filigrane: horsFluxRef.current.filigrane,
      },
      impression: impressionRef.current,
      taquets: taquetsRef.current,
    }),
    [],
  )

  /** Les zones que l'étape courante désigne : elles reçoivent leur ancre. */
  const zonesCibles = useMemo(() => {
    if (!etape) return []
    const c = adaptateurWord.cible(etape.action as never)
    return c.zone ? [c.zone] : []
  }, [etape])

  /**
   * L'état du document AU DÉBUT d'une étape, cumulé depuis le départ.
   *
   * 🔴 POURQUOI CUMULER PLUTÔT QUE POSER L'ÉTAT DE L'ÉTAPE SEULE.
   *
   * Un chapitre se construit d'étape en étape : le texte tapé à l'étape 3
   * n'existe dans le `setup` d'aucune autre. Poser le seul `setup` de l'étape
   * courante rendrait donc à l'apprenant qui reprend en cours de route un
   * document VIDE — et une consigne du type « complétez le devis » deviendrait
   * infaisable. C'est le défaut le plus grave qu'Excel ait connu, sur 136
   * chapitres de 246.
   *
   * On reconstitue donc le RÉSULTAT DÉCLARÉ des étapes précédentes :
   * `setup.document` remplace, `W_TYPE_TEXT` et `W_EXPECT_DOC` ajoutent ou
   * corrigent un paragraphe. C'est une reconstitution, pas le document exact de
   * l'apprenant — une étape à chemin libre qui ne déclare pas son résultat
   * laisse le paragraphe en l'état.
   */
  const documentAvant = useCallback(
    (jusqua: number): WordDocumentState => {
      const etat: WordDocumentState = {
        paragraphes: (scenario.document?.paragraphes ?? []).map((p) => ({ ...p })),
        page: scenario.document?.page,
      }
      const poser = (i: number, texte: string) => {
        while (etat.paragraphes.length <= i) etat.paragraphes.push({ texte: "" })
        etat.paragraphes[i] = { ...etat.paragraphes[i], texte }
      }
      for (let i = 0; i <= jusqua && i < steps.length; i++) {
        const s = steps[i]
        if (s.setup?.document) {
          etat.paragraphes = s.setup.document.paragraphes.map(
            (p: WordParagrapheDeclare) => ({ ...p }),
          )
          if (s.setup.document.page) etat.page = s.setup.document.page
        }
        // L'étape COURANTE ne voit pas son propre résultat : sinon la réponse
        // serait déjà écrite quand l'apprenant arrive dessus.
        if (i >= jusqua) continue
        const a = s.action as { type?: string; accept?: string[]; paragraphes?: Record<string, string[]> }
        if (a.type === "W_TYPE_TEXT" && a.accept?.[0]) {
          poser(etat.paragraphes.length, a.accept[0])
        }
        if (a.type === "W_EXPECT_DOC" && a.paragraphes) {
          for (const [cle, formes] of Object.entries(a.paragraphes)) {
            const n = Number(String(cle).replace(/^p/, ""))
            if (Number.isFinite(n) && formes[0] !== undefined) poser(n, formes[0])
          }
        }
      }
      return etat
    },
    [scenario.document, steps],
  )

  /**
   * Met la surface dans l'état de l'étape.
   *
   * Le document n'est REPOSÉ que si son contenu déclaré change : recréer
   * l'unité à chaque étape effacerait ce que l'apprenant vient de taper — la
   * façade d'Univer n'écrivant pas de texte, il n'y a aucun moyen de le
   * réinjecter ensuite.
   */
  const signatureDocRef = useRef<string>("")
  const appliquerEtape = useCallback(
    (i: number) => {
      const api = apiRef.current
      const s = steps[i] as EtapeWord | undefined
      if (!api || !s) return
      ouvrirFenetreMiseEnPlace()

      const etat = documentAvant(i)
      const signature = JSON.stringify(etat)
      if (signature !== signatureDocRef.current) {
        signatureDocRef.current = signature
        api.applyDocument(etat)
      }
      if (s.setup?.selection) {
        // Le document vient peut-être d'être recomposé : la sélection attend
        // que le squelette existe, sinon elle porte sur du vide.
        window.setTimeout(() => api.setSelection(s.setup!.selection!), 220)
      }
      window.setTimeout(() => api.focus(), 260)
    },
    [documentAvant, ouvrirFenetreMiseEnPlace, steps],
  )

  const surfacePreteRef = useRef(false)
  const surPret = useCallback(
    (api: WordApi) => {
      apiRef.current = api
      surfacePreteRef.current = true
      setSurfacePrete(true)
      /*
       * EN DÉVELOPPEMENT SEULEMENT : l'API du document, atteignable depuis le
       * banc. Sans elle, une sonde ne peut lire l'état qu'à travers l'écran, ce
       * qui est aveugle pour tout ce qui vit dans le modèle — l'intérieur d'un
       * tableau, par exemple. `next build` élimine la branche en production.
       */
      if (process.env.NODE_ENV === "development") {
        ;(window as unknown as { __wordApi?: WordApi }).__wordApi = api
      }
      // Reprise : on restitue le travail des étapes précédentes AVANT d'appliquer
      // celle qu'on rouvre.
      appliquerEtape(indexRef.current ?? 0)
    },
    [appliquerEtape, indexRef],
  )

  // Chaque changement d'étape repose le décor et remet les compteurs d'aide.
  useEffect(() => {
    if (!surfacePrete) return
    reinitialiserPourEtape()
    reinitialiserAAlArrivee()
    appliquerEtape(index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, surfacePrete])

  /**
   * 🔴 REDEMANDER L'ÉTAT À L'ARRIVÉE SUR UNE ÉTAPE QUI SE JUGE DESSUS.
   *
   * Sans cela, l'atelier se fige sur les étapes d'état, et le diagnostic n'est
   * pas évident : la surface n'émet `w:docState` que sur CHANGEMENT, avec une
   * temporisation de 320 ms — le temps que le moteur ait fini de composer.
   * L'avancée, elle, attend 550 ms pour que l'apprenant voie le résultat de son
   * geste. L'observation d'état arrive donc AVANT le changement d'étape et se
   * fait juger contre l'étape précédente ; la suivante, elle, n'en reçoit
   * jamais et attend indéfiniment un événement qui a déjà eu lieu.
   *
   * Mesuré au banc : le chapitre restait bloqué à 3/6, sans message et sans
   * erreur, sur une étape « le titre doit être en gras » que l'apprenant venait
   * précisément de satisfaire.
   *
   * Relire l'état ne peut RIEN coûter à l'apprenant : un état non satisfait
   * rend un verdict `no_…`, que le noyau classe en tâtonnement, jamais en faute.
   */
  useEffect(() => {
    if (!surfacePrete || finished || !etape) return
    if (!adaptateurWord.seJugeSurEtat(etape.action.type)) return
    const t = window.setTimeout(() => {
      const api = apiRef.current
      if (!api?.pret()) return
      surObservation(etatComplet(api.lireEtat(zonesCibles)))
    }, 420)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, surfacePrete, finished])

  onAvancer.current = useCallback(
    (i: number) => {
      marquerRelais()
      poserJalon(i, resumerEtape(i - 1))
    },
    [marquerRelais, poserJalon, resumerEtape],
  )

  onTerminer.current = useCallback(() => {
    setFinished(true)
    void cloturer()
  }, [cloturer, setFinished])

  /* ═══════════ LE JUGE ═══════════ */

  /**
   * Local en leçon et en exercice, SERVEUR en évaluation notée.
   *
   * En évaluation, le scénario servi n'a plus ses réponses (`publier()` de
   * l'adaptateur) : l'atelier ne PEUT plus corriger, et c'est le sens de
   * `clientValidation: false`. Un échec réseau renvoie `null` : on ne compte
   * alors ni réussite ni faute — retirer un point « premier essai » pour une
   * requête tombée serait la pire façon de noter.
   */
  const jugerObservation = useCallback(
    async (s: EtapeWord, rang: number, obs: WordObservation): Promise<JugementEtape | null> => {
      if (validationLocale) {
        return jugerEtape(s, obs as never, adaptateurWord)
      }
      if (!runIdRef.current) {
        // La mise en place émet une observation avant même que l'apprenant soit
        // entré : tant que l'écran d'ouverture est là, ce n'est pas une panne.
        if (introVueRef.current) setPanneJuge("passage")
        return null
      }
      const abandon = new AbortController()
      const minuterie = window.setTimeout(() => abandon.abort(), DELAI_VERDICT_MS)
      try {
        const r = await fetch(`/api/simulations/${chapterId}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: runIdRef.current,
            stepIndex: rang,
            stepId: s.id,
            observed: obs,
          }),
          signal: abandon.signal,
        })
        if (!r.ok) {
          setPanneJuge(r.status === 409 ? "passage" : "reseau")
          return null
        }
        setPanneJuge(null)
        return (await r.json()) as JugementEtape
      } catch {
        setPanneJuge("reseau")
        return null
      } finally {
        window.clearTimeout(minuterie)
      }
    },
    [chapterId, introVueRef, runIdRef, setPanneJuge, validationLocale],
  )

  /** Rectangle de la cible de l'étape, pour poser le retour visuel au bon endroit. */
  const rectDeLEtape = useCallback((): { left: number; top: number; width: number; height: number } | null => {
    const api = apiRef.current
    const z = zonesCibles[0]
    if (!api || !z) return null
    return api.getPlageRect(z)
  }, [zonesCibles])

  const attemptedRef = useRef<Set<string>>(new Set())
  const firstTryRef = useRef<Record<string, boolean>>({})

  const appliquerJugement = useCallback(
    (s: EtapeWord, jugement: JugementEtape) => {
      if (jugement.ok) {
        if (!attemptedRef.current.has(s.id)) firstTryRef.current[s.id] = true
        setVerdict({ ok: true })
        // « ✓ C'est exact » félicite une RÉUSSITE : sur un écran de lecture,
        // l'apprenant n'a rien fait d'exact, il a cliqué « J'ai compris ».
        if (s.action.type !== "READ") lancerFx("ok", rectDeLEtape())
        window.setTimeout(goNext, 550)
        return
      }

      // La classification vient du JUGE, jamais d'une reconstitution ici :
      // en évaluation l'atelier n'a ni les réponses ni le motif détaillé.
      if (jugement.compte === "rien") return
      if (jugement.compte === "faute") {
        attemptedRef.current.add(s.id)
        firstTryRef.current[s.id] = false
        pendingRef.current.errors += 1
        compterEssai()
        setVerdict({ ok: false, reason: jugement.reason ?? "", message: jugement.message ?? "" })
        lancerFx("ko", rectDeLEtape(), jugement.message)
        return
      }
      // Tâtonnement : ne pénalise jamais la note. Il n'ouvre que l'aide.
      if (!dansFenetreMiseEnPlace()) compterTatonnement()
    },
    [
      compterEssai,
      compterTatonnement,
      dansFenetreMiseEnPlace,
      goNext,
      lancerFx,
      pendingRef,
      rectDeLEtape,
      setVerdict,
    ],
  )

  /**
   * Une observation arrive de la surface.
   *
   * ⚠️ La file est SÉRIALISÉE sur le rang de l'étape : le juge serveur est
   * asynchrone, et une réponse qui reviendrait après un changement d'étape
   * s'appliquerait à la mauvaise.
   */
  const surObservation = useCallback(
    (obs: WordObservation) => {
      /*
       * Suivre le paragraphe où est le curseur : un taquet posé sur la règle
       * appartient AU PARAGRAPHE COURANT. Sans ce suivi, tous les taquets
       * tomberaient sur le premier paragraphe et l'apprenant verrait sa pose
       * refusée sans comprendre pourquoi.
       */
      if (obs.kind === "w:selection") selectionCourante.current = obs.texte ?? ""
      if (obs.kind === "w:cursor" || obs.kind === "w:selection") {
        const pos = obs.kind === "w:cursor" ? obs.position : obs.plage?.debut
        const api = apiRef.current
        if (typeof pos === "number" && api?.pret()) {
          const lu = api.lireEtat([]) as { paragraphes?: { texte: string }[] }
          const liste = lu.paragraphes ?? []
          let debut = 0
          let idx = 0
          for (let i = 0; i < liste.length; i++) {
            const fin = debut + liste[i].texte.length
            if (pos >= debut && pos <= fin) {
              idx = i
              break
            }
            // Le `\r` de fin de paragraphe occupe un caractère dans le flux.
            debut = fin + 1
          }
          setParagrapheCourant(idx)
        }
      }

      const rang = indexRef.current ?? 0
      const s = steps[rang] as EtapeWord | undefined
      if (!s || finished) return

      /*
       * ⚠️ UNE ÉTAPE NE SE VALIDE QU'UNE FOIS.
       *
       * `goNext` n'est pas idempotent (noyau gelé) : deux observations qui
       * valident la MÊME étape programment deux avancements, et l'étape
       * suivante n'est jamais affichée. En évaluation, elle n'est donc jamais
       * posée — et pourtant comptée comme non réussie au premier essai.
       *
       * Le cas se produit dès qu'un geste produit deux observations : une
       * correction suivie du relevé d'état que la surface programme de son
       * côté. La garde tient aussi pour le défaut connu des formes acceptées
       * dont l'une préfixe l'autre.
       */
      if (rangDejaValide.current === rang) return

      /*
       * ⚠️ UN ÉCRAN DE LECTURE NE SE FRANCHIT QUE PAR « Suivant ».
       *
       * Un relevé d'état tardif — celui que la surface programme après une
       * commande — arrivait pendant qu'un `READ` était affiché et le validait :
       * l'écran défilait sans avoir été lu. En évaluation, la question suivante
       * s'en trouvait décalée. Le cas s'est vu après une rafale de corrections,
       * mais il vaut pour toute commande dont l'état arrive en différé.
       */
      if (
        s.action?.type === "READ" &&
        !(obs.kind === "w:control" && obs.controle === "__suivant__")
      ) {
        return
      }
      void jugerObservation(s, rang, obs).then((jugement) => {
        if (!jugement) return
        if ((indexRef.current ?? 0) !== rang) return
        if (jugement.ok) rangDejaValide.current = rang
        appliquerJugement(s, jugement)
      })
    },
    [appliquerJugement, finished, indexRef, jugerObservation, steps],
  )

  /**
   * Relever l'état et le soumettre au juge.
   *
   * Tout réglage servi par un de NOS panneaux doit passer par ici : le moteur
   * n'émet rien quand on change une marge ou qu'on pose un taquet, donc sans ce
   * relevé explicite l'étape resterait suspendue sur un geste pourtant accompli.
   */
  /** Le rang déjà validé — voir la garde d'idempotence dans `surObservation`. */
  const rangDejaValide = useRef<number | null>(null)
  const releveEnAttente = useRef<number | null>(null)
  const relever = useCallback(() => {
    const api = apiRef.current
    if (api?.pret()) surObservation(etatComplet(api.lireEtat(zonesCibles)))
  }, [etatComplet, surObservation, zonesCibles])

  /**
   * Relever APRÈS que le moteur a recomposé, et UNE SEULE FOIS.
   *
   * ⚠️ Le second point est le vrai sujet. Corriger quatre mots d'affilée
   * programmait quatre relevés : le premier validait l'étape, les trois autres
   * arrivaient pendant que l'étape SUIVANTE était à l'écran et la validaient à
   * leur tour. Une étape de lecture était ainsi franchie sans avoir été lue —
   * en évaluation, elle aurait été notée sans avoir été posée.
   */
  const releverBientot = useCallback(
    (delai = 320) => {
      if (releveEnAttente.current !== null) window.clearTimeout(releveEnAttente.current)
      releveEnAttente.current = window.setTimeout(() => {
        releveEnAttente.current = null
        relever()
      }, delai)
    },
    [relever],
  )

  /** Les textes des paragraphes, pour la maquette de l'aperçu d'impression. */
  const lireTextes = useCallback((): string[] => {
    const api = apiRef.current
    if (!api?.pret()) return []
    const etat = api.lireEtat([]) as { paragraphes?: { texte: string }[] }
    return (etat.paragraphes ?? []).map((p) => p.texte)
  }, [])

  /* ═══════════ LE RUBAN ═══════════ */

  const surControle = useCallback(
    (id: string, argument?: string) => {
      const api = apiRef.current
      if (!api) return
      // Le bouton Mise en page n'exécute aucune commande de moteur : il ouvre
      // NOTRE panneau, qui porte l'état et l'aperçu.
      /*
       * Les quatre boutons qui ouvrent une de NOS surfaces.
       *
       * ⚠️ Ils DOIVENT émettre `w:control`. La règle « un bouton qui a agi
       * n'émet pas » vise les boutons qui exécutent une commande du moteur, dont
       * l'observation d'état suivrait — ici il n'y a aucune commande, donc aucun
       * ordre à respecter. Sans cette émission, une étape « ouvrez l'en-tête »
       * attend un signal qui ne vient jamais : le panneau s'ouvre à l'écran et
       * l'atelier reste bloqué sur la consigne.
       */
      const surfaces: Record<string, () => void> = {
        "w-mise-en-page": () => setPanneauPage(true),
        "w-entete-pied": () => setPanneauEntete(true),
        "w-imprimer": () => setEcranImpression(true),
        // La règle est un interrupteur : le second clic la referme, comme Word.
        "w-regle": () => setRegleVisible((v) => !v),
        "w-verification": () => setPanneauVerif(true),
        "w-inserer-image": () => setGalerieImages(true),
        "w-inserer-lien": () => setBoiteLien(true),
        "w-lien-fermer": () => setBoiteLien(false),
        "w-image-fermer": () => setGalerieImages(false),
        "w-verif-fermer": () => setPanneauVerif(false),
        // ⚠️ Les fermetures AUSSI. Le bouton « Fermer » d'un panneau est un
        // geste que l'apprenant fait et qu'une étape peut demander ; branché au
        // seul `onFermer` du composant, il n'émettait rien et l'étape qui le
        // demandait restait suspendue sur un panneau pourtant refermé.
        "w-mise-en-page-fermer": () => setPanneauPage(false),
        "w-entete-fermer": () => setPanneauEntete(false),
        "w-print-fermer": () => setEcranImpression(false),
      }
      if (surfaces[id]) {
        surfaces[id]()
        surObservation({ kind: "w:control", controle: id })
        return
      }
      // Les boutons d'habillage et de suppression visent l'image courante :
      // sans cet argument, la commande n'a aucun dessin à modifier.
      const arg =
        argument ??
        (/^w-(habillage-|supprimer-image)/.test(id) ? imageCourante.current ?? undefined : undefined)
      const agi = api.executer(id, arg)
      /*
       * ⚠️ Un bouton qui a AGI n'émet PAS `w:control` : l'observation du geste
       * arriverait avant celle de l'état et ferait échouer l'étape — c'est ce
       * qui cassait les étapes de tri côté Excel. Il n'émet que s'il n'a rien pu
       * faire, pour que l'apprenant reçoive un message au lieu d'un silence, ou
       * si l'étape courante juge précisément ce clic.
       */
      const s = steps[indexRef.current ?? 0] as EtapeWord | undefined
      const attenduIci =
        s?.action.type === "W_CLICK_CONTROL" &&
        (s.action as { controle?: string }).controle === id
      if (!agi || attenduIci) surObservation({ kind: "w:control", controle: id })
      window.setTimeout(() => api.focus(), 60)
    },
    [indexRef, steps, surObservation],
  )

  /* ═══════════ CE QUE LE CHÂSSIS AFFICHE ═══════════ */

  const consigne: ConsigneAtelier | null = useMemo(() => {
    if (!etape || finished || !introVue) return null
    const action = etape.action as never
    const lecture = etape.action.type === "READ"
    const aideTexte = (etape as { aide?: { text?: string } }).aide?.text ?? null
    return {
      texte: etape.consigne ?? "",
      nature: lecture ? "lecture" : evaluationNotee ? "evaluee" : "action",
      lecture,
      aDemonstration: !!adaptateurWord.demonstration(action, {}),
      attendu: adaptateurWord.attendu(action),
      // Jamais en évaluation : le noyau ne l'affiche pas, mais on ne la lui
      // fournit même pas — une réponse qui ne quitte pas le serveur ne peut pas
      // fuiter.
      reponse: evaluationNotee ? null : adaptateurWord.reponse(action),
      aide: aideTexte,
      aideVisible: hintShown && !!aideTexte,
      // Word ancre son aide sur la surface dès qu'une zone est désignée : sans
      // cette information, l'aide s'afficherait DEUX fois, mot pour mot.
      aideAncree: zonesCibles.length > 0 && hintShown,
      indiceDisponible: !hintShown && !!aideTexte && !evaluationNotee,
      evaluationNotee,
      relais,
      relaisActif,
      verdict,
      aplomb: null,
      panneJuge: pannneJuge,
      passageEnCours,
      aideProposee: essais >= 3 || tatonnements >= 6 || tropLong,
      demonstration,
      demoFinie,
      demoRejouable: demoFinie,
      index,
      total: steps.length,
      reculPossible,
      onMontrer: () => {
        if (evaluationNotee) void passerLaQuestion()
        else demarrerDemonstration()
      },
      onDebloquer: goNext,
      onRejouerDemo: rejouerDemonstration,
      onIndice: montrerIndice,
      onSuivant: () => surObservation({ kind: "w:control", controle: "__suivant__" }) ?? goNext(),
      onReculer: reculer,
    }
  }, [
    demoFinie,
    demonstration,
    demarrerDemonstration,
    essais,
    etape,
    evaluationNotee,
    finished,
    goNext,
    hintShown,
    index,
    introVue,
    montrerIndice,
    pannneJuge,
    passageEnCours,
    passerLaQuestion,
    reculPossible,
    reculer,
    rejouerDemonstration,
    relais,
    relaisActif,
    steps.length,
    surObservation,
    tatonnements,
    tropLong,
    verdict,
    zonesCibles.length,
  ])

  /* ═══════════ RENDU ═══════════ */

  const filModule = scenario.moduleTitle ?? ""
  // Fil d'Ariane dédoublonné : « Prise en main · Prise en main » s'affichait
  // quand le titre du chapitre reprend celui du module.
  const filChapitre = scenario.title && scenario.title !== filModule ? scenario.title : ""

  return (
    <AtelierShell
      chapterId={chapterId}
      mode={mode}
      evaluationNotee={evaluationNotee}
      filModule={filModule}
      filChapitre={filChapitre}
      index={index}
      total={steps.length}
      relais={relais}
      sommaire={sommaire}
      onNaviguer={onNaviguer}
      note={note}
      onNote={onNote}
      notesHref={notesHref}
      afficherRessources={afficherRessources}
      documentsChapitre={documentsChapitre}
      documentsFormation={documentsFormation}
      documentsHref={documentsHref}
      introVue={introVue}
      cleGuide={cleGuide}
      preview={preview}
      pleinCadre={pleinCadre}
      finished={finished}
      onQuitter={onQuitter}
      consigne={consigne}
    >
      {/*
        La zone de travail : le ruban, puis la surface.

        Structure en colonne, `overflow:hidden`, ruban en `flex-shrink:0`,
        surface en `flex-1 min-h-0`, hauteur MESURÉE et repassée au moteur.
        Jamais une soustraction du type `window.innerHeight - 305` : elle devient
        fausse dès qu'un élément change de taille, et c'est ainsi que la consigne
        du bas s'est retrouvée coupée côté Excel.
      */}
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
        <WordChrome
          onControle={surControle}
          ongletImpose={etape?.setup?.ribbon?.activeTab}
          titreDocument={scenario.title}
        />
        {/* La règle ne s'affiche que si l'apprenant l'a demandée — c'est le
            comportement de Word, et c'est aussi le geste que le module enseigne
            en premier. */}
        {regleVisible && (
          <WordRuler
            indexParagraphe={paragrapheCourant}
            taquets={taquets}
            onChange={(t) => {
              setTaquets(t)
              taquetsRef.current = t
              relever()
            }}
          />
        )}
        <div ref={zoneRef} data-zone-travail style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <WordSurface
            heightPx={hauteur}
            zonesCibles={zonesCibles}
            onReady={surPret}
            onObservation={surObservation}
          />
          {/* Ce que l'en-tête, le pied et le filigrane laissent voir sur la
              page, panneau refermé. */}
          <CalqueHorsFlux etat={horsFlux} />
          {panneauPage && (
            <WordPageLayout
              page={page}
              onChange={(p) => {
                setPage(p)
                pageRef.current = p
                /*
                 * ⚠️ L'observation part D'ICI, pas de la surface : elle seule
                 * connaît les paragraphes, nous seuls connaissons la page. Sans
                 * cette jonction, une étape `W_EXPECT_PAGE` attendrait
                 * indéfiniment un `w:docState` qui ne porterait jamais `page`.
                 */
                relever()
              }}
              onFermer={() => surControle("w-mise-en-page-fermer")}
            />
          )}
          {panneauEntete && (
            <WordHeaderFooter
              valeur={horsFlux}
              onChange={(v) => {
                setHorsFlux(v)
                horsFluxRef.current = v
                relever()
              }}
              onFermer={() => surControle("w-entete-fermer")}
            />
          )}
          {boiteLien && (
            <WordLinkDialog
              texteSelectionne={selectionCourante.current}
              onValider={(url) => {
                apiRef.current?.executer("w-inserer-lien", url)
                setBoiteLien(false)
                releverBientot(500)
              }}
              onFermer={() => surControle("w-lien-fermer")}
            />
          )}
          {galerieImages && (
            <WordImagePicker
              onChoisir={(id, source) => {
                imageCourante.current = id
                apiRef.current?.executer("w-inserer-image", `${id}|${source}`)
                setGalerieImages(false)
                // L'insertion est asynchrone (mesure de l'image puis commande) :
                // relever trop tôt rendrait un document sans le dessin.
                releverBientot(700)
              }}
              onFermer={() => surControle("w-image-fermer")}
            />
          )}
          {panneauVerif && (
            <WordProofing
              reglages={etape?.setup?.correcteur ?? {}}
              textes={lireTextes()}
              onCorriger={(mot, remplacement) => {
                apiRef.current?.executer("w-corriger-mot", `${mot}→${remplacement}`)
                // Le remplacement passe par le moteur : on laisse la
                // recomposition se faire, et on ne relève qu'une fois la
                // rafale de corrections terminée.
                releverBientot()
              }}
              onFermer={() => surControle("w-verif-fermer")}
              onControle={surControle}
            />
          )}
          {ecranImpression && (
            <WordPrintPreview
              valeur={impression}
              onChange={(v) => {
                setImpression(v)
                impressionRef.current = v
                relever()
              }}
              onFermer={() => surControle("w-print-fermer")}
              onControle={surControle}
              paragraphes={apiRef.current?.pret() ? lireTextes() : []}
              orientation={page.orientation}
              marges={{
                haut: page.margeHaut,
                bas: page.margeBas,
                gauche: page.margeGauche,
                droite: page.margeDroite,
              }}
            />
          )}
        </div>
      </div>

      {/* Écran d'ouverture — l'affiche du chapitre, par-dessus la zone de travail
          déjà montée : elle masque ainsi le chargement du moteur. */}
      {!introVue && !preview && (
        <Ouverture
          titre={scenario.intro?.title ?? scenario.title ?? ""}
          corps={scenario.intro?.body ?? ""}
          onCommencer={() => {
            ouvrirLAtelier()
            if (evaluationNotee) void commencer()
            // 🔴 Rendre le focus à la surface, sinon la PREMIÈRE frappe de
            // l'apprenant n'atteint jamais le document — le bouton le garde.
            window.setTimeout(() => apiRef.current?.focus(), 120)
          }}
        />
      )}
    </AtelierShell>
  )
}

/**
 * Écran d'ouverture du chapitre.
 *
 * ⚠️ Le bouton doit RENDRE LE FOCUS à la surface. Sans cela, la première frappe
 * de l'apprenant part dans le bouton et le document ne reçoit rien — même piège
 * que « Suivant » côté Excel.
 */
function Ouverture({
  titre,
  corps,
  onCommencer,
}: {
  titre: string
  corps: string
  onCommencer: () => void
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "#FAF9F7",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
        textAlign: "center",
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1b1a17", margin: 0, letterSpacing: 0.4 }}>
        {titre}
      </h2>
      <p style={{ maxWidth: 560, fontSize: 15, lineHeight: 1.5, color: "#4a453e", margin: 0 }}>
        {corps}
      </p>
      <button
        type="button"
        data-control="intro-commencer"
        onClick={onCommencer}
        style={{
          minHeight: 44,
          padding: "0 22px",
          borderRadius: 10,
          border: "none",
          background: "#1b5e3a",
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Commencer
      </button>
    </div>
  )
}
