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
import WordChrome, { WordFooter, type OngletWord } from "./WordChrome"
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
import DemonstrationGeste, { type Rect } from "../DemonstrationGeste"
import type { CibleDemo, PlanDemo } from "@/lib/simulation/demonstration"

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

/** Hauteur de la barre d'état, en pixels. Doit suivre `WordFooter`. */
const HAUTEUR_BARRE_ETAT = 26

type EtapeWord = SimulationStep & {
  setup?: {
    document?: WordDocumentState
    selection?: string
    ribbon?: { activeTab?: OngletWord }
    /** Fautes et synonymes que le correcteur doit proposer sur ce chapitre. */
    correcteur?: ReglagesCorrecteur
  }
  /**
   * Les gestes à MONTRER sur un écran de lecture (`W_MONTRER`).
   *
   * Retypé ici plutôt que de reprendre le `montrer?: SimulationAction[]` du
   * noyau : cette union est celle d'EXCEL, et elle ne connaît aucune action
   * `W_*`. La contrainte n'aurait donc rien contraint, elle aurait seulement
   * exigé une conversion à chaque lecture.
   */
  montrer?: ({ type: string } & Record<string, unknown>)[]
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
  // `fx` était le seul membre du retour visuel jamais déstructuré : `lancerFx`
  // était appelé depuis l'origine, son résultat n'atteignait donc AUCUN pixel.
  // Word était la seule des quatre applications sans le moindre signal ancré sur
  // sa surface de travail — ni flash, ni secousse, ni message.
  const { verdict, setVerdict, fx, lancerFx, relais, relaisActif, marquerRelais, poserJalon } = retour

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

  /**
   * Remettre le document d'aplomb AVANT de montrer quoi que ce soit.
   *
   * Sans ce rappel, l'apprenant qui abîme le document puis réclame « Montrez-
   * moi » reçoit la même explication fausse qu'au départ — la démonstration se
   * jouerait sur un document qui ne ressemble plus à celui dont elle parle. Le
   * rappel sert aussi au REJEU : « Revoir » doit repartir de l'état d'entrée,
   * sinon le second passage montre autre chose que le premier.
   *
   * Passé par une ref parce que `useAideProgressive` se déclare avant la surface
   * qu'il faudra piloter ; le noyau ne l'appelle de toute façon qu'au moment de
   * démarrer.
   */
  const rendreDocumentRef = useRef<() => void>(() => {})
  /**
   * L'onglet que réclame le PREMIER geste de la démonstration.
   *
   * Il ne peut pas venir du calque : celui-ci n'ouvre un onglet qu'en FIN de
   * geste, pour le suivant. Le premier n'a pas de prédécesseur, donc personne
   * ne l'ouvrirait — et la démonstration s'ouvrirait sur un bouton absent.
   */
  const ongletInitialRef = useRef<string | undefined>(undefined)
  const ouvrirOngletInitialRef = useRef<() => string | undefined>(() => undefined)

  const aide = useAideProgressive({
    mode,
    index,
    finished,
    aUneEtape: !!etape,
    avantDemonstration: () => {
      rendreDocumentRef.current()
      ongletInitialRef.current = ouvrirOngletInitialRef.current()
    },
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
    setDemoFinie,
    rejeu,
    demarrerDemonstration,
    rejouerDemonstration,
    reinitialiserPourEtape,
    reinitialiserAAlArrivee,
    ouvrirFenetreMiseEnPlace,
    dansFenetreMiseEnPlace,
  } = aide

  /* ═══════════ LA SURFACE ═══════════ */

  const zoneRef = useRef<HTMLDivElement | null>(null)
  /**
   * Le cadre du calque de démonstration : ruban COMPRIS.
   *
   * 🔴 Il ne peut pas être `zoneRef`, qui n'enveloppe que la surface d'édition.
   * La moitié des démonstrations désignent un bouton du ruban — gras, style,
   * alignement — et un calque posé sous le ruban ne peut ni le résoudre ni
   * dessiner dessus : le geste se jouerait à blanc. Excel a payé exactement ce
   * défaut, dans l'autre sens : son calque vivait dans la zone de grille, donc
   * une démonstration ne montrait RIEN quand le classeur n'était pas à l'écran.
   */
  const zoneAtelierRef = useRef<HTMLDivElement | null>(null)
  const { hauteur } = useMesureZoneTravail(zoneRef, index)
  const apiRef = useRef<WordApi | null>(null)
  const [surfacePrete, setSurfacePrete] = useState(false)
  /** Largeur du calque, pour garder bulles et étiquettes dans le champ. */
  const [largeurAtelier, setLargeurAtelier] = useState(0)
  /** Bord haut de la surface d'édition dans le repère du calque. */
  const [hautSurface, setHautSurface] = useState(0)

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

  /**
   * Les zones que l'étape courante désigne : elles reçoivent leur ancre.
   *
   * ⚠️ LES ZONES DE `montrer` EN FONT PARTIE, et c'est indispensable.
   *
   * Univer rend sur canvas : il n'existe aucun élément de DOM par paragraphe. La
   * surface pose une ancre invisible `[data-word-zone="…"]` pour les seules
   * zones qu'on lui passe, et c'est cette ancre que le calque de démonstration
   * résout. Une illustration qui viserait `p3` sans que `p3` soit dans cette
   * liste ne dessinerait donc RIEN — pendant que la minuterie tourne jusqu'à
   * « Revoir ». C'est le faux témoin le plus coûteux du chantier Excel : un
   * compteur qui arrive à `n/n` ne prouve pas qu'on a montré quelque chose.
   */
  const zonesCibles = useMemo(() => {
    if (!etape) return []
    const zones: string[] = []
    const c = adaptateurWord.cible(etape.action as never)
    if (c.zone) zones.push(c.zone)
    for (const m of etape.montrer ?? []) {
      // Seules les cibles de document ont une ancre : `ctrl:` et `dom:` visent
      // le châssis, qui est du vrai DOM et se résout tout seul.
      const brut = String((m as { cible?: string }).cible ?? "").trim()
      if (brut && !brut.startsWith("ctrl:") && !brut.startsWith("dom:") && brut !== "ecran") {
        zones.push(brut)
      }
      const ec = (m as { ecrire?: { zone?: string } }).ecrire?.zone
      if (ec) zones.push(ec)
    }
    // Dédoublonnage sans `Set` itérable : la cible de compilation du projet est
    // sous ES2015 et `[...new Set(x)]` y échoue en TS2802.
    return zones.filter((z, i) => zones.indexOf(z) === i)
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

  /**
   * 🔴 LA SURFACE N'ÉMET `w:docState` QUE SUR CHANGEMENT.
   *
   * La barre d'état ne se remplissait donc jamais à l'ouverture d'un chapitre :
   * elle annonçait « 0 mot · 0 caractère » devant un document de huit
   * paragraphes. Une barre d'état qui ment est pire qu'une barre absente — c'est
   * la première chose qu'un apprenant regarde pour savoir où il en est. On relit
   * l'état une fois par étape, après la recomposition.
   */
  useEffect(() => {
    if (!surfacePrete) return
    const t = window.setTimeout(() => {
      const api = apiRef.current
      if (!api?.pret()) return
      const textes = (api.lireEtat([]).paragraphes ?? []).map((x) => x.texte)
      setCompteursTexte({
        mots: textes.reduce((n, x) => n + (x.trim() ? x.trim().split(/\s+/).length : 0), 0),
        caracteres: textes.reduce((n, x) => n + x.length, 0),
      })
    }, 480)
    return () => window.clearTimeout(t)
  }, [index, surfacePrete])

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

  /**
   * Pendant une démonstration, l'atelier écrit LUI-MÊME dans le document.
   *
   * 🔴 C'est une ÉCHÉANCE, pas un booléen, et la différence a coûté cher côté
   * Excel : avec un booléen, deux effets qui se chevauchent laissent le second
   * remettre le verrou à faux pendant que le premier court encore. L'observation
   * passait alors au travers, l'étape se validait toute seule — bandeau
   * « C'est exact » en pleine explication — et comptait réussie du premier coup.
   * `Math.max` interdit à quiconque de RACCOURCIR un verrou déjà posé.
   */
  const verrouDemoRef = useRef(0)
  const verrouiller = useCallback((ms = 900) => {
    verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + ms)
  }, [])

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
        /*
         * ⚠️ LE HALO D'ERREUR NE S'ANCRE JAMAIS SUR LA CIBLE ATTENDUE.
         *
         * `rectDeLEtape()` rend le rectangle de `zonesCibles[0]`, c'est-à-dire
         * `adaptateurWord.cible(action).zone` : LA RÉPONSE. Tant que `fx` n'était
         * rendu nulle part, le passer ici était sans conséquence ; le rendre
         * aurait entouré d'un cadre rouge le bon paragraphe à chaque erreur — en
         * évaluation notée, une divulgation pure et simple. Outlook a payé
         * exactement ce défaut (« vu à l'écran, pas dans le code »), et l'aide
         * ancrée de Word se garde déjà de paraître en évaluation.
         *
         * Sans rectangle, le halo couvre la surface : il dit « ce geste ne
         * convient pas » sans désigner celui qui conviendrait. Le halo de
         * RÉUSSITE, lui, reste ancré : l'apprenant a déjà trouvé.
         */
        lancerFx("ko", null, jugement.message)
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
      if (obs.kind === "w:selection") {
        selectionCourante.current = obs.texte ?? ""
        setMotsSelection(compterMots(obs.texte ?? ""))
      }
      if (obs.kind === "w:docState") {
        const textes = (obs.paragraphes ?? []).map((x) => x.texte)
        setCompteursTexte({
          mots: textes.reduce((n, t) => n + compterMots(t), 0),
          caracteres: textes.reduce((n, t) => n + t.length, 0),
        })
      }
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
       * ⚠️ CE QUE LA DÉMONSTRATION ÉCRIT N'EST PAS UN GESTE DE L'APPRENANT.
       *
       * Sans cette porte, l'écriture de la démonstration valide l'étape et
       * l'atelier saute à la suivante au milieu de l'explication : la
       * démonstration se saborde elle-même.
       *
       * L'EXCEPTION est aussi importante que la règle. « J'ai compris,
       * continuer » exprime une INTENTION, pas une observation du document :
       * filtré comme le reste, il devenait mort juste après une démonstration —
       * l'apprenant cliquait et rien ne se passait, sans le moindre message.
       */
      const intention = obs.kind === "w:control" && obs.controle === "__suivant__"
      if (!intention && Date.now() < verrouDemoRef.current) return

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

  /**
   * Ce que la barre d'état affiche.
   *
   * Alimenté par les relevés d'état que la surface émet déjà — aucune lecture
   * supplémentaire du moteur, donc aucun coût : compter les mots à chaque frappe
   * en interrogeant Univer serait le genre de détail qui rend une saisie
   * poussive sans que personne comprenne pourquoi.
   */
  const [compteursTexte, setCompteursTexte] = useState({ mots: 0, caracteres: 0 })
  const [motsSelection, setMotsSelection] = useState(0)
  const compterMots = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)

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

  /* ═══════════════════════════════════════════════════════════════════════
     « MONTREZ-MOI » — la démonstration animée du geste
     ═══════════════════════════════════════════════════════════════════════

     L'adaptateur CALCULAIT déjà le plan complet de chaque geste ; il ne
     manquait que de le jouer. Le bouton « Montrez-moi » existait, basculait
     bien l'état d'aide — et rien n'apparaissait à l'écran. Un apprenant bloqué
     obtenait au mieux la réponse écrite, jamais l'endroit ni le mouvement. */

  /**
   * Le calque couvre le ruban ET la surface, donc les rectangles se mesurent
   * dans SON repère, pas dans celui du document.
   */
  useEffect(() => {
    const cadre = zoneAtelierRef.current
    if (!cadre || typeof ResizeObserver === "undefined") return
    const mesurer = () => {
      const c = cadre.getBoundingClientRect()
      setLargeurAtelier(c.width)
      const s = zoneRef.current?.getBoundingClientRect()
      setHautSurface(s ? s.top - c.top : 0)
    }
    mesurer()
    const ro = new ResizeObserver(mesurer)
    ro.observe(cadre)
    if (zoneRef.current) ro.observe(zoneRef.current)
    return () => ro.disconnect()
  }, [])

  /** Décalage de la surface d'édition dans le repère du calque. */
  const decalageSurface = useCallback(() => {
    const c = zoneAtelierRef.current?.getBoundingClientRect()
    const s = zoneRef.current?.getBoundingClientRect()
    if (!c || !s) return { x: 0, y: 0 }
    return { x: s.left - c.left, y: s.top - c.top }
  }, [])

  /**
   * Rectangle d'un élément du châssis, dans le repère du calque.
   *
   * 🔴 ON AMÈNE LA CIBLE DANS LE CHAMP AVANT DE LA MESURER.
   *
   * Le ruban défile horizontalement, et c'est TOUT le sujet sur téléphone :
   * mesuré à 390 px, l'onglet Accueil rend 25 boutons dont 17 hors champ, avec
   * 1 189 px de défilement. Un bouton hors cadre se « résout » parfaitement —
   * l'élément existe, son rectangle est valide — et la démonstration dessine
   * son repère à côté de l'écran. Compteur qui avance, « Revoir » qui apparaît,
   * et rien de visible : le faux témoin exact que l'audit d'Excel décrit.
   */
  const rectDuDom = useCallback((selecteur: string): Rect | null => {
    const cadre = zoneAtelierRef.current
    if (!cadre) return null
    const el = cadre.querySelector(selecteur)
    if (!(el instanceof HTMLElement)) return null
    let r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return null
    const c = cadre.getBoundingClientRect()
    const dehors = r.right > c.right || r.left < c.left || r.bottom > c.bottom || r.top < c.top
    if (dehors) {
      // `nearest` sur les deux axes : `center` ferait aussi défiler la PAGE, et
      // l'atelier est un écran unique qui ne défile jamais.
      el.scrollIntoView({ block: "nearest", inline: "center" })
      r = el.getBoundingClientRect()
    }
    return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height }
  }, [])

  /**
   * Résout une cible du plan.
   *
   * ⚠️ Deux chemins, et il faut les deux. Un bouton du ruban EST du DOM et se
   * mesure directement ; une zone du document ne l'est pas — Univer rend sur
   * canvas — et passe par l'ancre invisible, avec repli sur la géométrie du
   * squelette de composition quand l'ancre n'est pas encore posée.
   */
  const resoudreDemo = useCallback(
    (cible: CibleDemo): Rect | null => {
      /*
       * 🔴 UN RACCOURCI N'A PAS DE LIEU — mais il lui faut un CADRE.
       *
       * Rendre `null` ici paraissait juste : « Ctrl + S » ne se produit nulle
       * part à l'écran. Sauf que le calque ne dessine sa bulle qu'à l'intérieur
       * d'un rectangle : sans cadre réservé, la phrase ne s'affichait PAS DU
       * TOUT. Mesuré au balayage : six écrans annonçaient deux désignations et
       * n'en montraient qu'une, sans la moindre erreur. On réserve donc un
       * cadre au centre, où le composant pose les touches sans curseur de
       * souris — montrer une flèche pour « Ctrl + S » serait faux.
       */
      if (cible.k === "clavier") {
        const c = zoneAtelierRef.current?.getBoundingClientRect()
        if (!c) return null
        return { left: c.width / 2 - 90, top: c.height / 2 - 34, width: 180, height: 68 }
      }
      if (cible.k !== "dom") return null
      const direct = rectDuDom(cible.sel)
      if (direct) return direct
      const m = /^\[data-word-zone="(.+)"\]$/.exec(cible.sel)
      if (!m) return null
      const r = apiRef.current?.getPlageRect(m[1])
      // ⚠️ Un rectangle DÉGÉNÉRÉ n'est pas un rectangle. Le squelette de
      // composition n'existe pas au premier rendu et la façade rend alors des
      // zéros, parfaitement truthy : le repère se posait dans le coin haut
      // gauche et paraissait « résolu ». C'est la variante géométrique du faux
      // témoin — un compteur qui avance ne prouve pas qu'on a montré quelque
      // chose, un rectangle non nul non plus.
      if (!r || (r.width === 0 && r.height === 0)) return null
      const d = decalageSurface()
      return { left: r.left + d.x, top: r.top + d.y, width: r.width, height: r.height }
    },
    [decalageSurface, rectDuDom],
  )

  /**
   * Le plan à jouer.
   *
   * Sur un écran de lecture, il vient de `montrer` — la SÉQUENCE d'illustrations
   * que le scénario déclare, jouées à la suite. Sur une étape d'action, de
   * l'adaptateur. Jamais en évaluation notée : montrer le geste y reviendrait à
   * souffler la réponse.
   */
  const plan: PlanDemo | null = useMemo(() => {
    if (!etape) return null
    /*
     * ⚠️ L'ÉCRAN DE LECTURE EST TRAITÉ AVANT LA GARDE D'ÉVALUATION.
     *
     * Un énoncé d'ouverture n'est pas une question : il pose le décor, et son
     * `montrer` est écrit pour désigner le CONTEXTE — où est l'anomalie, quel
     * bloc fait quoi — jamais la méthode. `check-montrer-word` refuse la
     * divulgation, et l'expurgation du noyau ne laisse d'un geste que sa cible
     * et sa phrase. C'est la règle retenue côté Excel pour ses 26 énoncés.
     *
     * 🔴 LIMITE CONNUE, DANS LE NOYAU : `expurge.ts` n'accepte `montrer` que si
     * TOUS les gestes portent le type Excel `MONTRER`. Un `W_MONTRER` est donc
     * jeté à l'expurgation, et les dix énoncés d'évaluation de Word restent
     * muets en évaluation NOTÉE tant que ce fichier gelé n'accepte pas les
     * types préfixés. Le plan est prêt côté client ; il jouera le jour où le
     * noyau le laissera passer.
     */
    if (etape.action.type === "READ") {
      const plans = (etape.montrer ?? [])
        .map((m) => adaptateurWord.demonstration(m as never, {}))
        .filter((p): p is PlanDemo => !!p)
      if (plans.length === 0) return null
      const gestes = plans.flatMap((p) => p.gestes)
      /*
       * 🔴 `onglet` S'APPLIQUE À LA FIN D'UN GESTE, DONC IL OUVRE L'ONGLET DU
       * GESTE SUIVANT — et pas du sien.
       *
       * Le calque exécute `onOnglet` dans sa phase de validation, juste avant de
       * passer au geste d'après : c'est voulu, c'est ce qui met le bouton du
       * SUIVANT dans la page. Un auteur, lui, écrit naturellement l'onglet sur
       * le geste qui en a besoin — et ce geste-là se joue alors à blanc, sur un
       * bouton que le ruban ne rend pas encore.
       *
       * Mesuré au balayage : 8 écrans sur 64 n'affichaient qu'une désignation
       * sur deux, et `m01-l01-06` — qui promène l'apprenant sur trois onglets —
       * n'en affichait AUCUNE. Zéro erreur de console, compteur qui avance : le
       * faux témoin exact décrit par l'audit d'Excel.
       *
       * On décale donc d'un cran, et le tout premier onglet est ouvert avant que
       * le calque ne démarre (`ongletInitial`).
       */
      const decales = gestes.map((g, k) => {
        const suivant = gestes[k + 1]
        const { onglet: _sien, ...reste } = g
        return suivant?.onglet ? { ...reste, onglet: suivant.onglet } : reste
      })
      return { gestes: decales, pas: plans.flatMap((p) => p.pas) }
    }
    // Sur une étape d'ACTION en revanche, montrer le geste reviendrait à
    // souffler la réponse : le renoncement se fait d'un clic (« Passer »).
    if (evaluationNotee) return null
    return adaptateurWord.demonstration(etape.action as never, {})
  }, [etape, evaluationNotee])

  /** Onglet ouvert par la démonstration, le temps qu'elle dure. */
  const [ongletDemo, setOngletDemo] = useState<OngletWord | null>(null)

  // Ouvre l'onglet du premier geste et rend sa valeur, pour la trace d'audit.
  ouvrirOngletInitialRef.current = () => {
    const premier = (etape?.montrer ?? [])[0] as { onglet?: string } | undefined
    if (premier?.onglet) setOngletDemo(premier.onglet as OngletWord)
    return premier?.onglet
  }

  /**
   * Écrire POUR DE VRAI le résultat du geste.
   *
   * ⚠️ Le document est reposé en ENTIER, comme le fait déjà `appliquerEtape` à
   * chaque changement d'étape : c'est le seul canal d'écriture que la façade
   * expose. La mise en forme de caractère posée à l'intérieur d'un paragraphe
   * n'y survit pas — limite connue et ANCIENNE, pas une régression de ce lot —
   * tandis que style, alignement et liste sont relus et reposés.
   */
  const demoEcrire = useCallback(
    (ref: string, valeur: string) => {
      verrouiller(1400)
      const api = apiRef.current
      if (!api?.pret()) return
      const lu = api.lireEtat([])
      /*
       * `"fin"` = à la suite, dans un nouveau paragraphe. C'est la règle que
       * suit `documentAvant` pour toute saisie, donc la seule qui garantisse que
       * ce que la démonstration montre survive au changement d'étape.
       */
      const m = ref.trim() === "fin" ? null : /^p(\d+)/.exec(ref.trim())
      if (!m && ref.trim() !== "fin") return
      const i = m ? Number(m[1]) : (lu.paragraphes ?? []).length
      const paragraphes: WordParagrapheDeclare[] = (lu.paragraphes ?? []).map((p) => ({
        texte: p.texte,
        style: p.style,
        alignement: p.alignement,
        liste: p.liste,
      }))
      while (paragraphes.length <= i) paragraphes.push({ texte: "" })
      paragraphes[i] = { ...paragraphes[i], texte: valeur }
      api.applyDocument({ paragraphes })
      // La signature doit redevenir fausse, sinon la repose de l'étape suivante
      // se croirait déjà faite et laisserait le document tel que la
      // démonstration l'a laissé.
      signatureDocRef.current = ""
    },
    [verrouiller],
  )

  const demoSelectionner = useCallback(
    (ref: string) => {
      verrouiller()
      apiRef.current?.setSelection(ref)
    },
    [verrouiller],
  )

  /**
   * Presser le VRAI bouton du châssis.
   *
   * Désigner ne suffit pas : un bouton qui ouvre un panneau ou une boîte doit
   * être pressé, sans quoi le geste SUIVANT vise un élément qui n'existe pas
   * encore et se joue à blanc — repère, curseur et bulle absents — pendant que
   * le compteur avance jusqu'à « Revoir ».
   */
  const demoPresser = useCallback(
    (id: string, arg?: string) => {
      verrouiller(1200)
      const el = zoneAtelierRef.current?.querySelector(`[data-control="${id}"]`)
      if (el instanceof HTMLElement && !(el instanceof HTMLSelectElement)) {
        el.click()
        return
      }
      // Les listes déroulantes du ruban (police, taille, couleur) ne se
      // « cliquent » pas : elles portent une valeur, qu'on leur donne.
      surControle(id, arg)
    },
    [surControle, verrouiller],
  )

  const demoOnglet = useCallback(
    (onglet: string) => {
      verrouiller(600)
      setOngletDemo(onglet as OngletWord)
    },
    [verrouiller],
  )

  /**
   * Remettre le document tel que l'étape le déclare.
   *
   * Appelé AVANT chaque démonstration (y compris un rejeu) et, sur un écran de
   * lecture, à la fin : une lecture ne modifie jamais le document de l'étape
   * suivante. Sur une étape d'action, ce que la démonstration a écrit RESTE —
   * c'est la réponse, et l'apprenant reprend la main avec « J'ai compris ».
   */
  const rendreDocument = useCallback(() => {
    verrouiller(1400)
    signatureDocRef.current = ""
    appliquerEtape(indexRef.current ?? 0)
  }, [appliquerEtape, indexRef, verrouiller])
  rendreDocumentRef.current = rendreDocument

  const estLecture = etape?.action.type === "READ"

  /** La démonstration se termine : on range ce qu'elle a ouvert. */
  const finDemo = useCallback(() => {
    setDemoFinie(true)
    setOngletDemo(null)
    if (estLecture) rendreDocument()
  }, [estLecture, rendreDocument, setDemoFinie])

  /**
   * Sur un écran de lecture, la démonstration part D'ELLE-MÊME.
   *
   * Le délai laisse le temps de lire la consigne et à la surface de se poser :
   * un repère demandé avant que le squelette de composition existe se résout à
   * `null`, et le geste se joue à blanc.
   */
  useEffect(() => {
    if (!estLecture || !plan || !surfacePrete || finished || !introVue) return
    if (demonstration) return
    const t = window.setTimeout(() => demarrerDemonstration(), 1200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, estLecture, !!plan, surfacePrete, finished, introVue])

  /* ═══════════ L'AIDE, ANCRÉE SUR CE DONT ELLE PARLE ═══════════ */

  /**
   * 🔴 `aideAncree` PROMETTAIT une bulle que personne ne rendait.
   *
   * Le châssis masque sa ligne d'aide dès qu'on lui dit qu'elle est ancrée sur
   * la surface — c'est ce qui évite de l'afficher deux fois, mot pour mot. Word
   * le lui disait dès qu'une zone était désignée… sans jamais rendre la bulle.
   * Mesuré : 118 aides de la formation ne s'affichaient NULLE PART, et comme
   * `hintShown` vaut vrai d'emblée en leçon, elles étaient invisibles dès le
   * premier écran.
   */
  const [haloAide, setHaloAide] = useState<Rect | null>(null)
  const texteAide = (etape as { aide?: { text?: string } } | undefined)?.aide?.text ?? null
  const aideAffichable =
    !!texteAide && hintShown && !evaluationNotee && !demonstration && zonesCibles.length > 0

  useEffect(() => {
    if (!aideAffichable || !surfacePrete) {
      setHaloAide(null)
      return
    }
    /*
     * 🔴 LE RECTANGLE ARRIVE EN DEUX TEMPS, ET LE PREMIER EST FAUX.
     *
     * Le document est reposé à chaque étape, puis le moteur recompose : tant
     * que le squelette n'existe pas, la façade rend `{0,0,0,0}` — un objet
     * parfaitement truthy. Une seule tentative « et on garde ce qu'on a »
     * posait donc le halo dans le coin haut gauche, sur le ruban, avec une
     * taille nulle : l'aide désignait le presse-papiers au lieu du paragraphe
     * dont elle parle. Mesuré au banc avant correction.
     *
     * On réessaie donc jusqu'à obtenir une surface NON NULLE, sur la fenêtre
     * qui couvre la recomposition (320 ms) et la pose de la sélection (220 ms).
     */
    const essais = [0, 200, 450, 800, 1300]
    const minuteries: number[] = []
    for (const attente of essais) {
      minuteries.push(
        window.setTimeout(() => {
          const r = apiRef.current?.getPlageRect(zonesCibles[0])
          if (!r || (r.width === 0 && r.height === 0)) return
          const d = decalageSurface()
          setHaloAide({ left: r.left + d.x, top: r.top + d.y, width: r.width, height: r.height })
        }, attente),
      )
    }
    return () => minuteries.forEach((t) => window.clearTimeout(t))
  }, [aideAffichable, surfacePrete, zonesCibles, index, decalageSurface])

  /* ═══════════ CROCHETS D'AUDIT — HORS PRODUCTION ═══════════
   *
   * Même rôle que `__SIM_GRID` et `__SIM_FORCE_DEMO` côté Excel. Sans eux,
   * « pourquoi cette démonstration ne montre-t-elle rien ? » ne se diagnostique
   * pas : il faudrait provoquer trois vraies erreurs de saisie pour seulement
   * voir apparaître le bouton. Le remplacement de `process.env.NODE_ENV` les
   * retire du bundle livré — un banc construit par erreur en production les perd
   * aussi, et l'on croit alors à une régression du produit.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return
    const w = window as unknown as Record<string, unknown>
    w.__WORD_ETAPE = etape?.id
    w.__WORD_PLAN = plan
    w.__WORD_COMPTEURS = { essais, tatonnements, demonstration, demoFinie }
    w.__WORD_FORCE_DEMO = () => demarrerDemonstration()
  })

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
      aDemonstration: !!plan,
      attendu: adaptateurWord.attendu(action),
      // Jamais en évaluation : le noyau ne l'affiche pas, mais on ne la lui
      // fournit même pas — une réponse qui ne quitte pas le serveur ne peut pas
      // fuiter.
      reponse: evaluationNotee ? null : adaptateurWord.reponse(action),
      aide: aideTexte,
      aideVisible: hintShown && !!aideTexte,
      // Word ancre son aide sur la surface dès qu'une zone est désignée : sans
      // cette information, l'aide s'afficherait DEUX fois, mot pour mot.
      aideAncree: aideAffichable,
      indiceDisponible: !hintShown && !!aideTexte && !evaluationNotee,
      evaluationNotee,
      relais,
      relaisActif,
      verdict,
      /* WORD ANNONCE SES VERDICTS SUR SA SURFACE — déclaration CONSTANTE,
       * établie par la mesure et non par analogie avec Excel.
       *
       * Un seul chemin pose ici un verdict `ok: false` : la branche « faute »,
       * qui appelle TOUJOURS `lancerFx("ko", …, jugement.message)` juste après,
       * avec le même message. Le bandeau de la surface le dit donc déjà, et le
       * répéter sous la consigne le ferait lire deux fois.
       *
       * Rien n'est perdu au passage, contrairement à Outlook :
       *  — le tâtonnement n'appelle PAS `setVerdict` (il ne fait que compter),
       *    donc aucun message de tâtonnement ne meurt ici ;
       *  — un écran de lecture ne juge aucune observation hors « Suivant »
       *    (garde de `surObservation`), donc son verdict ne vaut jamais faux.
       * C'est la différence exacte avec Outlook, dont la branche tâtonnement
       * porte un message SANS lancer d'effet : lui ne peut pas déclarer ce
       * drapeau en constante sans redevenir muet sur 127 étapes.
       */
      verdictAncre: true,
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
    plan,
    aideAffichable,
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
      <div
        ref={zoneAtelierRef}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          // Repère du calque de démonstration, qui se pose en `absolute` dessus.
          position: "relative",
        }}
      >
        <WordChrome
          onControle={surControle}
          // L'onglet vient de l'étape, ou de la démonstration quand elle a
          // besoin d'un bouton rangé ailleurs.
          ongletImpose={ongletDemo ?? etape?.setup?.ribbon?.activeTab}
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

          {/* ═══ RETOUR VISUEL DANS LA SURFACE ═══
              `lancerFx` était appelé depuis l'origine (réussite et faute) sans
              que rien ne soit rendu : Word était la SEULE des quatre
              applications sans flash, sans secousse et sans message sur sa zone
              de travail. Même idiome qu'Outlook et Excel — un halo sur la cible
              quand elle est mesurable, un bandeau qui porte le mot — et non un
              troisième.

              Le calque vit DANS `zoneRef`, donc dans le repère où
              `getPlageRect` rend déjà ses rectangles : aucun `decalageSurface`
              ici, contrairement à l'aide et à la démonstration qui, elles,
              couvrent le ruban.

              `pointer-events: none` est NON NÉGOCIABLE : une surface décorative
              qui avale les clics fait échouer l'étape suivante — le défaut le
              plus coûteux du lecteur d'Excel.

              Au-dessus des panneaux de Word (40) et de l'aperçu avant impression
              (45) : une faute commise panneau ouvert doit rester lisible. */}
          {fx && (
            <div
              key={fx.k}
              aria-hidden
              style={{
                position: "absolute",
                pointerEvents: "none",
                zIndex: 46,
                ...(fx.rect
                  ? { left: fx.rect.left, top: fx.rect.top, width: fx.rect.width, height: fx.rect.height }
                  : { inset: 0 }),
                outline: fx.kind === "ok" ? "3px solid #2E9E63" : "3px solid #C0392B",
                background: fx.kind === "ok" ? "rgba(46,158,99,.14)" : "rgba(192,57,43,.10)",
                borderRadius: 6,
                animation: fx.kind === "ok" ? "w-fx-ok 1.4s ease both" : "w-fx-ko .45s ease both",
              }}
            />
          )}

          {/* LE MOT QUI ACCOMPAGNE LE GESTE.
              Un flash muet fait douter l'apprenant de son geste, même quand il
              était bon. Le repli générique est indispensable : le juge rend un
              message vide quand l'observation n'est pas du type attendu, et le
              point du premier essai est pourtant bien perdu. */}
          {fx && (
            <div
              aria-live="polite"
              key={`m${fx.k}`}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 12,
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
                zIndex: 47,
                padding: "0 12px",
              }}
            >
              <span
                style={{
                  maxWidth: 470,
                  padding: "9px 15px",
                  borderRadius: 10,
                  background: fx.kind === "ok" ? "rgba(16,74,45,.95)" : "rgba(122,32,24,.95)",
                  color: "#fff",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  textAlign: "center",
                  animation: "w-fx-mot .34s ease both",
                }}
              >
                {fx.kind === "ok"
                  ? "✓ C'est exact"
                  : fx.message || "Ce n'est pas encore ça — réessayez."}
              </span>
            </div>
          )}
          <style>{`
            @keyframes w-fx-ok { 0% { opacity: 0 } 18% { opacity: 1 } 100% { opacity: 0 } }
            @keyframes w-fx-ko { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-5px) } 75% { transform: translateX(5px) } }
            @keyframes w-fx-mot { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
            @media (prefers-reduced-motion: reduce) {
              [style*="w-fx-"] { animation-duration: .01ms !important }
            }
          `}</style>
        </div>

        {/* ═══ L'AIDE, POSÉE SUR CE DONT ELLE PARLE ═══
            Halo ambre sur la zone visée et bulle à côté. Le châssis a masqué sa
            propre ligne d'aide (`aideAncree`) : sans ce bloc, l'aide n'existe
            nulle part — ce qui était le cas de 118 aides de la formation. */}
        {aideAffichable && haloAide && (
          <>
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: haloAide.left - 3,
                top: haloAide.top - 3,
                width: haloAide.width + 6,
                height: haloAide.height + 6,
                border: "2px solid #C8860D",
                borderRadius: 5,
                background: "rgba(200,134,13,.10)",
                // Une surface décorative qui avale les clics fait échouer
                // l'étape suivante : la règle vaut pour tout calque.
                pointerEvents: "none",
                zIndex: 38,
              }}
            />
            <p
              data-aide-ancree
              style={{
                position: "absolute",
                left: Math.max(
                  8,
                  Math.min(haloAide.left, Math.max(8, largeurAtelier - 268)),
                ),
                // Sous la zone si la place existe, au-dessus sinon — mais jamais
                // au-dessus du bord haut de la surface : une aide posée sur le
                // ruban masque les repères qui servent à s'en servir.
                top: Math.max(hautSurface + 4, haloAide.top + haloAide.height + 8),
                maxWidth: 260,
                margin: 0,
                padding: "8px 10px",
                borderRadius: 8,
                background: "#FFF8E8",
                border: "1px solid #E7D3A2",
                color: "#5A4413",
                fontSize: 12.5,
                lineHeight: 1.45,
                boxShadow: "0 6px 18px rgba(16,24,32,.12)",
                pointerEvents: "none",
                zIndex: 39,
              }}
            >
              <span aria-hidden>👉 </span>
              {texteAide}
            </p>
          </>
        )}

        {/* La barre d'état vient APRÈS la surface : c'est ce qui la place SOUS
            le document, comme Word. Rendue par le châssis, elle s'affichait
            au-dessus — l'inverse. */}
        <WordFooter
          mots={compteursTexte.mots}
          caracteres={compteursTexte.caracteres}
          motsSelection={motsSelection}
        />

        {/* ═══ « MONTREZ-MOI » ═══
            Le calque couvre le ruban ET la surface : c'est la seule position
            depuis laquelle il peut désigner un bouton comme un paragraphe. */}
        {/* Le calque s'arrête AU-DESSUS de la barre d'état : sans cette borne,
            son compteur de gestes se posait exactement sur le compteur de mots,
            et les deux devenaient illisibles. Le repère reste positionné dans le
            même repère qu'avant — seul le bord bas change. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: HAUTEUR_BARRE_ETAT,
            pointerEvents: "none",
            zIndex: 40,
          }}
        >
        {demonstration && plan && (
          <DemonstrationGeste
            // Clé sur l'étape ET sur le rejeu : sans elle, React réutilise le
            // nœud et la séquence ne repart jamais du premier geste.
            key={`demo-${index}-${rejeu}`}
            plan={plan}
            resoudre={resoudreDemo}
            largeur={largeurAtelier}
            hautFeuille={hautSurface}
            onEcrire={demoEcrire}
            onSelectionner={demoSelectionner}
            onPresser={demoPresser}
            onOnglet={demoOnglet}
            lecture={estLecture}
            onFini={finDemo}
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
