"use client"

/**
 * PowerPoint — le player de l'application.
 *
 * Il monte le NOYAU commun (`AtelierShell` + les hooks d'`useAtelier`) et
 * fournit sa surface. Il ne réimplémente ni la progression, ni l'aide
 * progressive, ni la persistance, ni le calcul de note : deux implémentations du
 * score pour un même parcours sont indéfendables en contrôle Qualiopi, et une
 * divergence y serait SILENCIEUSE — la formation continuerait de se jouer
 * normalement avec des notes fausses (décision D6).
 *
 * ═══ CE QUE CE FICHIER NE FAIT PAS, ET C'EST VOLONTAIRE ═══
 *
 * Il ne dessine ni le cockpit, ni les panneaux, ni la bande de consigne, ni les
 * paliers d'aide : tout cela appartient au châssis depuis l'extraction du socle
 * v2. PowerPoint DÉCRIT son étape (`consigne={…}`) et fournit sa surface ; il ne
 * décide d'aucun geste, le châssis les déclenche.
 *
 * Ce qui reste ici est propre à PowerPoint, et rien d'autre : l'état de la
 * présentation, la traduction geste → observation, la géométrie des cibles, et
 * le branchement de la démonstration.
 *
 * ⚠️ Si ce fichier repasse au-dessus de ~1 200 lignes, c'est le signe qu'il
 * réimplémente du générique — le signaler au chef d'orchestre plutôt que de
 * continuer (contrat §4.c).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import AtelierShell, { type EntreeSommaire } from "../AtelierShell"
import AfficheModule, { numeroModule } from "../AfficheModule"
import DemonstrationGeste from "../DemonstrationGeste"
import {
  useAideProgressive,
  useClicheEtape,
  useMesureZoneTravail,
  usePersistance,
  useProgression,
  useRetourVisuel,
  type RectCible,
} from "../hooks/useAtelier"
import PptSurface, { type ApiEtatSurface, type EtatUiPpt } from "./PptSurface"
import type { SimulationScenario, SimulationStep } from "@/lib/simulation/types"
import { natureEtape } from "@/lib/simulation/attendu"
import { jugerEtape } from "@/lib/simulation/frappe"
import { annoterBulleDAuteur, type CibleDemo, type PlanDemo } from "@/lib/simulation/demonstration"
import { avecDureesDeVoix, useVoixDemo } from "../hooks/useVoixDemo"
import type { LearnerDocument } from "@/lib/learner-files"
import { adaptateurPpt } from "@/lib/simulation/ppt/adaptateur"
import type { PptAction, PptViewMode } from "@/lib/simulation/ppt/actions"
import type { PptChannel, PptObservation } from "@/lib/simulation/ppt/observations"
import {
  appliquerGeste,
  cibleDAuteur,
  CONTROLES_PPT,
  deckDepuisDeclaration,
  diapoActive,
  ongletDuControle,
  trouverObjet,
  type DeclarationDeck,
  type DeckState,
  type GestePpt,
} from "@/lib/simulation/ppt/document"

type Mode = "LESSON" | "EXERCISE" | "EVALUATION"

/**
 * Le bouton qu'un geste de démonstration DÉSIGNE — pressé ou seulement montré.
 *
 * Une démonstration qui se contente de pointer un bouton est la règle et non
 * l'exception : on ne presse pas à la place de l'apprenant ce qui n'est pas
 * idempotent (supprimer, dupliquer) ni ce qui l'engage (lancer le diaporama).
 * Lire `presser` seul revenait donc à ignorer la moitié des cibles de ruban.
 *
 * L'identifiant se relit dans le sélecteur parce que c'est ainsi que
 * l'adaptateur désigne ses cibles — la surface étant du DOM, il n'y a pas de
 * champ séparé à tenir en parallèle, donc rien qui puisse diverger.
 */
function controleDuGeste(g: PlanDemo["gestes"][number]): string | null {
  if (g.presser?.id) return g.presser.id
  if (g.cible.k !== "dom") return null
  const m = /^\[data-control="([^"]+)"\]$/.exec(g.cible.sel)
  return m ? m[1] : null
}

/**
 * Ce qu'un scénario PowerPoint déclare EN PLUS de `SimulationScenario`.
 *
 * ⚠️ DETTE ASSUMÉE, signalée au chef d'orchestre. `SimulationScenario` exige
 * `workbook: WorkbookState` et `ribbon: RibbonTab[]`, tous deux Excel — l'audit
 * du socle le signalait déjà comme « le premier défaut à corriger », et il ne
 * l'a pas été. En attendant, un scénario PowerPoint déclare un classeur vide et
 * porte SES données dans deux champs que le type ne connaît pas encore. Le
 * scénario voyage en JSON et n'est jamais reconstruit à partir du type : ces
 * champs survivent donc parfaitement au trajet base → API → navigateur.
 *
 * Ce n'est pas une bonne solution, c'est une solution qui ne bloque pas. La
 * bonne est de rendre `workbook` et `ribbon` optionnels dans `types.ts`.
 */
type SetupPpt = {
  /** Présentation à poser au début de l'étape, en remplacement de l'état courant. */
  deck?: DeclarationDeck
  /** Diapositive active imposée. */
  slide?: number
  /** Objets sélectionnés imposés. */
  selection?: string[]
  /** Mode d'affichage imposé. */
  view?: PptViewMode
  /**
   * État du diaporama imposé — indispensable, et découvert en JOUANT.
   *
   * `setupPpt.deck` REMPLACE la présentation, et une présentation reconstruite
   * repart diaporama éteint. Une étape « avancez d'une diapositive » précédée
   * d'un état déclaré voyait donc le diaporama se fermer sous elle : la
   * consigne parlait d'un écran qui n'existait plus. Le même manque rendait la
   * reprise impossible sur ces étapes, puisque rien ne pouvait redire que la
   * projection était en cours.
   */
  show?: { actif: boolean; index: number; depuis?: "debut" | "courante"; ecran?: "normal" | "noir" | "blanc" }
}

type EtapePpt = SimulationStep & { setupPpt?: SetupPpt }
type ScenarioPpt = SimulationScenario & { ppt?: DeclarationDeck; steps: EtapePpt[] }

type Props = {
  chapterId: string
  mode: Mode
  scenario: SimulationScenario
  initialStep?: number
  repriseEvaluation?: boolean
  scorePrecedent?: number | null
  passagesPrecedents?: number
  onRejouer?: () => void
  nouveauPassage?: boolean
  validationLocale?: boolean
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

/* ═══════════ PLAYER ═══════════ */

/*
 * Le rendu du balisage `**gras**` / `==action==` appartient au CHÂSSIS, qui
 * porte désormais la bande de consigne. La copie qui vivait ici — écrite pour
 * que le pilote soit jouable avant l'extraction — a été retirée : deux moteurs
 * de balisage finiraient par diverger, et l'un des deux perdrait le piège des
 * quantificateurs non greedy que le premier avait payé.
 */


export default function PptPlayer({
  chapterId,
  mode,
  scenario: scenarioBrut,
  initialStep = 0,
  repriseEvaluation = false,
  scorePrecedent = null,
  validationLocale = true,
  onRejouer,
  nouveauPassage = false,
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
  afficherRessources = false,
  documentsHref,
  cleGuide,
}: Props) {
  const scenario = scenarioBrut as ScenarioPpt
  const steps = scenario.steps
  const total = steps.length
  const evaluationNotee = mode === "EVALUATION"

  /**
   * Une ÉVALUATION ne reprend JAMAIS au milieu.
   *
   * Les réussites au premier essai vivent en mémoire de session : terminer en
   * deux fois calculerait la note sur la seule dernière session — « 0 % » pour
   * un apprenant qui avait tout réussi la veille. Le garde vit ICI et pas
   * seulement chez l'appelant, pour valoir quel que soit le chemin d'appel
   * (page apprenant, banc, usage futur).
   */
  const departForce = evaluationNotee ? 0 : initialStep

  /* ── Présentation ── */
  const [deck, setDeck] = useState<DeckState>(() => deckDepuisDeclaration(scenario.ppt))
  const deckRef = useRef(deck)
  deckRef.current = deck

  /**
   * L'état d'interface, prêté par la surface — voir `PptSurface.registre`.
   *
   * Onglet de ruban, menu ouvert, éditeur de texte, tiroir des miniatures et
   * volet de notes vivent dans les composants d'affichage. Le player ne pouvait
   * ni les lire ni les reposer : son reset ne remettait donc QUE le document.
   */
  const uiApiRef = useRef<ApiEtatSurface | null>(null)

  /**
   * L'étape dont le décor est POSÉ — le drapeau `prete` du contrat de reset.
   *
   * 🔴 SANS LUI, LA PHOTO EST PRISE UNE ÉTAPE TROP TÔT.
   *
   * `useClicheEtape` doit être appelé AVANT `useAideProgressive`, à qui il
   * fournit `avantDemonstration`. Son effet de photographie s'exécute donc avant
   * celui qui applique `setupPpt`, plus bas dans ce fichier — React exécute les
   * effets dans l'ordre où ils sont déclarés. Photographier à ce moment-là
   * figerait la présentation de l'étape PRÉCÉDENTE, et chaque « Revoir »
   * rembobinerait l'apprenant d'une étape.
   *
   * Le décor pose ce drapeau en dernier ; le socle n'attend rien d'autre.
   */
  const [etapeDecoree, setEtapeDecoree] = useState<string | null>(null)

  const zoneRef = useRef<HTMLDivElement | null>(null)
  const { hauteur: hauteurZone, largeur: largeurZone } = useMesureZoneTravail(zoneRef)

  /* ── Noyau : retour visuel ── */
  const { verdict, setVerdict, fx, lancerFx, relais, relaisActif, marquerRelais, jalon, poserJalon } =
    useRetourVisuel()

  const resumerEtapeCourante = useCallback(
    (i: number) => {
      const a = steps[i]?.action
      return a ? adaptateurPpt.fait(a as unknown as Record<string, unknown> & { type: string }) : null
    },
    [steps],
  )

  /* ── Noyau : progression ── */
  /**
   * LA VOIX DES BULLES, lue par RÉFÉRENCE — jamais en dépendance.
   *
   * Le plan de démonstration est mémoïsé et volontairement figé : l'ajouter aux
   * dépendances le recalculerait quand le manifeste arrive, changerait la
   * référence des gestes en pleine séquence, et figerait la démonstration sur
   * son premier geste. Ce qui compte est l'état au DÉMARRAGE.
   */
  const voix = useVoixDemo()
  const voixRef = useRef(voix)
  voixRef.current = voix

  const progression = useProgression({
    total,
    departForce,
    mode,
    resumerEtape: resumerEtapeCourante,
    retour: { marquerRelais, poserJalon },
  })
  const { index, introVue, ouvrirLAtelier, finished, goNext, reculPossible, reculer, indexRef } = progression

  const step = steps[index] as EtapePpt | undefined
  const stepRef = useRef<{ id: string } | undefined>(step)
  stepRef.current = step
  const goNextRef = useRef<(() => void) | null>(null)
  goNextRef.current = goNext

  /* ── Noyau : persistance et note ── */
  const persistance = usePersistance({
    chapterId,
    mode,
    preview,
    nouveauPassage,
    onCompleted,
    indexRef,
    stepRef,
    goNextRef,
  })
  const { pendingRef, persist, commencer, ouvertureEnCours, passerLaQuestion, passageEnCours, cloturer, bilan } =
    persistance

  /* ─────────── LE « VRAI RESET » ───────────
   *
   * Une démonstration est une RECONSTITUTION, pas la poursuite du travail en
   * cours : on repose l'écran du début de l'étape avant chaque passage, le
   * premier comme les « Revoir ».
   *
   * 🔴 CE QUI MANQUAIT, ET QUE SAMUEL A FILMÉ LE 07/08/2026.
   *
   * Ce reset ne reposait que `deck` — le DOCUMENT. L'INTERFACE restait celle que
   * l'apprenant avait laissée, et d'abord son onglet de ruban. Mesuré au banc
   * sur les 73 écrans « À comprendre » qui désignent un bouton de ruban : après
   * un simple clic sur un autre onglet, le bouton désigné n'est plus dans la
   * page, aucun repère n'est dessiné — et le compteur va jusqu'à `n/n` sans
   * lever la moindre erreur. Sur `M01-L02-13`, les trois repères disparaissent :
   * la démonstration se joue ENTIÈREMENT à blanc.
   *
   * Le cliché couvre donc maintenant le document ET l'interface. Deux états
   * n'y entrent délibérément pas :
   *  · `apercu` — l'ombre d'un objet pendant un glissé, effacée dès le relâché.
   *    On ne peut pas cliquer « Revoir » en plein glissé : le photographier
   *    reviendrait à conserver une valeur qui est toujours nulle à cet instant ;
   *  · `ouvrirEnCours` — l'attente du bouton d'ouverture du chapitre, qui vit
   *    AVANT que la première étape existe. Le reposer au milieu d'un atelier
   *    rouvrirait un écran que l'apprenant a déjà quitté.
   */
  const cliche = useClicheEtape<{ deck: DeckState; ui: EtatUiPpt | null }>({
    etapeId: step?.id,
    prete: !!step && etapeDecoree === step.id,
    relever: () => ({ deck: deckRef.current, ui: uiApiRef.current?.relever() ?? null }),
    reposer: (e) => {
      // Les REFS d'abord : le plan de démonstration est calculé aussitôt après,
      // sans attendre le rendu, et il lit `deckRef` — pas l'état React.
      deckRef.current = e.deck
      setDeck(e.deck)
      if (e.ui) uiApiRef.current?.reposer(e.ui)
    },
  })

  /* ── Noyau : aide progressive ── */
  const aide = useAideProgressive({
    mode,
    index,
    finished,
    aUneEtape: !!step,
    avantDemonstration: cliche.avantDemonstration,
  })

  /* ─────────── MISE EN PLACE D'UNE ÉTAPE ───────────
   *
   * `setupPpt` est appliqué à CHAQUE changement d'étape, y compris en reculant :
   * c'est ce qui remet le point de départ de l'étape visée sans rejouer la leçon
   * entière. Ce que l'apprenant a produit aux étapes précédentes ne vient
   * d'aucun `setup` et serait perdu — l'étape suivante deviendrait injouable. */
  useEffect(() => {
    if (!step) return
    aide.reinitialiserPourEtape()
    aide.reinitialiserAAlArrivee()
    setVerdict(null)
    // La mise en place produit elle-même des observations (sélection posée,
    // état réécrit) : sans cette fenêtre, elles compteraient comme des gestes de
    // l'apprenant et l'aide arriverait un cran trop tôt sur TOUTES les étapes.
    aide.ouvrirFenetreMiseEnPlace()

    const s = step.setupPpt
    if (!s) {
      // Aucun décor à poser : le point de départ est l'écran tel que l'étape
      // précédente l'a laissé. Il faut quand même le photographier, sinon les
      // étapes sans `setupPpt` n'auraient rien à restaurer.
      setEtapeDecoree(step.id)
      return
    }
    // Idiome du fichier : on lit la ref, on calcule, on repose la ref, puis on
    // rend. Passer par un rappel de `setDeck` empêcherait de retenir le
    // résultat pour la photo sans écrire dans une ref au milieu d'un calcul
    // que React peut rejouer.
    let n = s.deck ? deckDepuisDeclaration(s.deck) : deckRef.current
    if (s.slide !== undefined) n = { ...n, activeSlide: s.slide }
    if (s.selection) n = { ...n, selection: s.selection }
    if (s.view) n = { ...n, view: s.view }
    if (s.show) n = { ...n, show: { ...s.show } }
    deckRef.current = n
    setDeck(n)
    // EN DERNIER : le décor est posé, le socle peut photographier.
    setEtapeDecoree(step.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step?.id])

  /* ─────────── GÉOMÉTRIE ───────────
   *
   * Une cible est un SÉLECTEUR : `querySelector` suffit. C'est tout le bénéfice
   * du rendu DOM — Excel a dû reconstruire `getCellRect` depuis les métriques
   * internes du squelette Univer, parce qu'un canvas n'a pas d'élément par
   * cellule. */
  const rectDe = useCallback((selecteur: string): RectCible | null => {
    const zone = zoneRef.current
    if (!zone) return null
    const el = zone.querySelector(selecteur)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const z = zone.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return null
    return { left: r.left - z.left, top: r.top - z.top, width: r.width, height: r.height }
  }, [])

  /**
   * Rectangle d'une cible, APRÈS l'avoir amenée dans le champ.
   *
   * 🔴 UN BOUTON HORS CHAMP SE RÉSOUT PARFAITEMENT — ET NE SE VOIT PAS.
   *
   * Le ruban défile horizontalement, et c'est tout le sujet sur téléphone.
   * Mesuré à 390 px : l'onglet Accueil rend 13 boutons sur 997 px de contenu
   * pour 390 px de fenêtre, donc 10 hors champ. L'élément existe, son rectangle
   * est valide, `DemonstrationGeste` dessine son cadre — à côté de l'écran.
   * Relevé sur `m02-l01#10` : le repère de « Monter : un cran vers le haut »
   * était peint à left = 394 dans une zone large de 390. L'apprenant lit la
   * phrase et ne voit jamais ce qu'elle désigne, pendant que le compteur va
   * jusqu'à `n/n` et que la phase atteint « fini » sans lever la moindre
   * erreur : le faux témoin exact que l'audit d'Excel décrit.
   *
   * ⚠️ C'est LE REMÈDE DE WORD (`rectDuDom`), pas une troisième solution — on
   * amène la cible dans le champ, puis on REMESURE. Le choix a été tranché par
   * la mesure, pas par analogie : sur les 13 boutons de l'onglet Accueil, 10
   * sont hors champ et **0 le reste** après cette amenée. Le défilement suffit
   * donc ici. Le tiroir des groupes que Word a dû ajouter en plus répond à un
   * autre besoin — trouver un bouton AU DOIGT — et son ruban est deux fois plus
   * long que celui-ci (25 boutons, 1 189 px de défilement, contre 13 et 607).
   *
   * ⚠️ `block: "nearest"` : `center` ferait aussi défiler la PAGE, et l'atelier
   * est un écran unique qui ne défile jamais. Vérifié sur les 13 boutons —
   * `window.scrollY` reste à 0.
   *
   * Le calque appelle `resoudre` à CHAQUE rendu : c'est sans effet de bord, une
   * fois la cible dans le champ `dehors` est faux et plus rien ne bouge. Le
   * défilement est instantané (jamais `smooth`), sinon la remesure qui suit
   * lirait la position d'avant.
   */
  const rectDeVisible = useCallback(
    (selecteur: string): RectCible | null => {
      const zone = zoneRef.current
      if (!zone) return null
      const el = zone.querySelector(selecteur)
      if (!(el instanceof HTMLElement)) return null
      let r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return null
      let z = zone.getBoundingClientRect()
      const dehors = r.right > z.right || r.left < z.left || r.bottom > z.bottom || r.top < z.top
      if (dehors) {
        el.scrollIntoView({ block: "nearest", inline: "center" })
        r = el.getBoundingClientRect()
        z = zone.getBoundingClientRect()
        /* Crochet d'audit — hors production, même idiome que
           `__PPT_REPLI_UTILISE`. Il sert à PROUVER la symétrie au lieu de
           l'argumenter : si l'amenée ne se déclenche jamais sur grand écran, le
           comportement y est identique à celui d'avant le correctif. */
        if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
          const w = window as unknown as Record<string, unknown>
          const j = (w.__PPT_AMENE_DANS_CHAMP as string[] | undefined) ?? []
          j.push(selecteur)
          w.__PPT_AMENE_DANS_CHAMP = j
        }
      }
      return { left: r.left - z.left, top: r.top - z.top, width: r.width, height: r.height }
    },
    [],
  )

  /**
   * ⚠️ CE QU'UN PETIT ÉCRAN REPLIE, ET LE BOUTON QUI LE ROUVRE.
   *
   * Un contrôle logé dans un panneau replié n'est pas « caché » : il est ABSENT
   * DU DOM. `rectDe` rend alors `null`, `DemonstrationGeste` ne rend son cadre
   * que sous `{rect && …}` — et la bulle ne dessine RIEN, pendant que le
   * compteur va jusqu'à `n/n` et que la phase atteint `fini`. L'apprenant croit
   * avoir vu la démonstration ; il n'a rien vu. Mesuré à 390 px : 23 bulles
   * muettes sur 12 chapitres, desktop parfait sur les mêmes.
   *
   * Le remède existait déjà pour `zone:volet`, posé dans l'adaptateur. Il vit
   * ici pour les deux autres cas, et c'est sa place : quel panneau est replié
   * dépend de la LARGEUR RENDUE, une chose que l'adaptateur — pur et sans
   * surface — ne peut pas connaître. Le contenu n'a donc rien à déclarer.
   *
   * Trois replis, dérivés de `CONTROLES_PPT` et non de littéraux recopiés :
   *  · le champ de notes → le bouton qui ouvre le panneau des notes ;
   *  · une miniature `vol-diapo-N` → le bouton du tiroir des miniatures ;
   *  · la ZONE des notes → le champ de notes, puis le bouton qui l'ouvre.
   *
   * ⚠️ On résout DANS L'ORDRE, jamais par un sélecteur composé `A, B` :
   * `querySelector` rend le premier nœud en ORDRE DE DOCUMENT, pas le premier
   * sélecteur satisfait. Or à l'étroit, panneau OUVERT, le bouton précède son
   * panneau dans le DOM — un sélecteur composé désignerait le bouton alors que
   * la vraie cible est là, sous les yeux de l'apprenant.
   *
   * ⚠️ C'est une CHAÎNE et non un repli unique, pour la même raison qu'Outlook :
   * `zone:notes` n'existe à AUCUNE taille par défaut — au large les notes sont un
   * simple champ (`vol-notes`) sans conteneur nommé, à l'étroit un panneau qui
   * n'est rendu qu'ouvert. Un repli à cible unique laisserait donc muette la
   * bulle de `M13-L04-11` sur les DEUX tailles, ce que la mesure confirme.
   */
  const repliPetitEcran = useCallback((selecteur: string): string[] => {
    const zone = /^\[data-zone="([^"]+)"\]$/.exec(selecteur)
    if (zone) return zone[1] === "notes" ? [CONTROLES_PPT.notes, CONTROLES_PPT.notesBascule] : []
    const m = /^\[data-control="([^"]+)"\]$/.exec(selecteur)
    if (!m) return []
    const id = m[1]
    if (id === CONTROLES_PPT.notes) return [CONTROLES_PPT.notesBascule]
    const n = Number(id.slice(id.lastIndexOf("-") + 1))
    if (Number.isFinite(n) && CONTROLES_PPT.miniature(n) === id) return [CONTROLES_PPT.voletBascule]
    return []
  }, [])

  const resoudreDemo = useCallback(
    (cible: CibleDemo) => {
      if (cible.k === "dom") {
        const direct = rectDeVisible(cible.sel)
        if (direct) return direct
        for (const repli of repliPetitEcran(cible.sel)) {
          const r = rectDeVisible(`[data-control="${repli}"]`)
          if (!r) continue
          /* Crochet d'audit — hors production, même idiome que
             `__PPT_BOUTONS_PRESSES`. Il sert à PROUVER la non-régression au lieu
             de l'argumenter : si le repli ne se déclenche jamais sur grand écran,
             le comportement y est identique à celui d'avant le correctif. */
          if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
            const w = window as unknown as Record<string, unknown>
            const j = (w.__PPT_REPLI_UTILISE as string[] | undefined) ?? []
            j.push(`${cible.sel} → ${repli}`)
            w.__PPT_REPLI_UTILISE = j
          }
          return r
        }
        return null
      }
      if (cible.k === "clavier") return null
      return null
    },
    [rectDeVisible, repliPetitEcran],
  )

  /** Rectangle de la cible de l'étape courante, pour l'effet ancré. */
  const rectEtape = useCallback((): RectCible | null => {
    if (!step) return null
    const c = adaptateurPpt.cible(step.action as unknown as Record<string, unknown> & { type: string })
    if (c.dom) return rectDe(c.dom)
    if (c.controle) return rectDe(`[data-control="${c.controle}"]`)
    return null
  }, [step, rectDe])

  /** Identifiants d'objets à mettre en halo — jamais en évaluation notée. */
  const halo = useMemo(() => {
    if (!step || evaluationNotee || !aide.hintShown) return []
    const c = adaptateurPpt.cible(step.action as unknown as Record<string, unknown> & { type: string })
    const zone = c.zone
    if (!zone || zone === "scene") return []
    const slide = diapoActive(deckRef.current)
    const obj = slide ? trouverObjet(slide, zone) : null
    return obj ? [obj.id] : []
  }, [step, evaluationNotee, aide.hintShown, deck])

  /* ─────────── JUGEMENT ─────────── */

  const verrouDemoRef = useRef(0)

  /**
   * Confronte une observation à l'étape courante, puis en tire les conséquences.
   *
   * Le juge est `jugerEtape`, avec l'ADAPTATEUR PowerPoint — exactement celui
   * qui tournera côté serveur sur la route de correction. Aucun second juge :
   * c'est la règle qui rend une note défendable.
   */
  const appliquerObservation = useCallback(
    /**
     * `{ kind: "next" }` est l'observation du NOYAU, sans préfixe : un écran de
     * lecture est une action générique (`READ`), jugée par le juge d'Excel, qui
     * n'attend que `next`.
     *
     * 🔴 Défaut trouvé en JOUANT le pilote, invisible autrement : le bouton
     * « J'ai compris, continuer » émettait un `p:deckChange`. L'étape ne
     * passait donc jamais — le chapitre se bloquait à la première lecture, et
     * les huit étapes suivantes échouaient en cascade avec le message de
     * l'étape 4. Aucun typecheck, aucun contrôle statique ne pouvait le voir :
     * les deux observations sont parfaitement valides, elles ne s'adressent
     * simplement pas au même juge.
     */
    async (obs: PptObservation | { kind: "next" }) => {
      const s = stepRef.current as EtapePpt | undefined
      if (!s || finished) return
      // Pendant une démonstration, l'atelier écrit lui-même dans la surface : les
      // observations qui en découlent ne sont pas des gestes de l'apprenant, et
      // les juger ferait passer l'étape au milieu de l'explication.
      if (Date.now() < verrouDemoRef.current) return

      const miseEnPlace = aide.dansFenetreMiseEnPlace()

      if (!validationLocale) {
        /* ÉVALUATION NOTÉE : le navigateur n'a plus les réponses, et ne DÉCLARE
           rien. Il envoie ce que l'apprenant a fait et reçoit le seul verdict —
           c'est ce qui rend la note infalsifiable. */
        try {
          const r = await fetch(`/api/simulations/${chapterId}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              runId: persistance.runIdRef.current,
              stepIndex: indexRef.current,
              stepId: s.id,
              observed: obs,
            }),
          })
          if (!r.ok) {
            persistance.setPanneJuge(r.status === 409 ? "passage" : "reseau")
            return
          }
          const j = (await r.json()) as { ok?: boolean; message?: string; compte?: string }
          if (j.ok) {
            setVerdict({ ok: true })
            lancerFx("ok", rectEtape())
            void persist({ step: indexRef.current + 1 })
            goNext()
          } else if (j.compte === "faute" && !miseEnPlace) {
            pendingRef.current.errors += 1
            aide.compterEssai()
            setVerdict({ ok: false, reason: "ko", message: j.message ?? "" })
            // JAMAIS `rectEtape()` sur un « ko » : ce rectangle est celui de la
            // CIBLE ATTENDUE, donc de la réponse. L'encadrer en rouge la désigne
            // — en évaluation notée, c'est la donner. Word portait exactement ce
            // défaut et l'a fermé de la même façon (`WordPlayer:733`).
            // Le message survit sans rectangle : le rendu le pose alors en pied
            // de zone au lieu de l'ancrer sous la cible (voir plus bas).
            lancerFx("ko", null, j.message)
          } else if (!miseEnPlace) {
            aide.compterTatonnement()
          }
        } catch {
          persistance.setPanneJuge("reseau")
        }
        return
      }

      const j = jugerEtape(
        s as unknown as SimulationStep,
        obs as unknown as Parameters<typeof jugerEtape>[1],
        adaptateurPpt,
      )
      if (j.ok) {
        setVerdict({ ok: true })
        lancerFx("ok", rectEtape())
        void persist({ step: indexRef.current + 1 })
        goNext()
        return
      }
      if (miseEnPlace) return
      if (j.compte === "faute") {
        pendingRef.current.errors += 1
        aide.compterEssai()
        setVerdict({ ok: false, reason: j.reason ?? "ko", message: j.message ?? "" })
        // Même règle que dans le chemin serveur ci-dessus : un halo d'erreur ne
        // s'ancre jamais sur la cible attendue, sous peine de la révéler.
        lancerFx("ko", null, j.message)
      } else if (j.compte === "tatonnement") {
        aide.compterTatonnement()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapterId, finished, validationLocale, goNext, persist, lancerFx, rectEtape],
  )

  /* ─────────── GESTES DE LA SURFACE ───────────
   *
   * DEUX observations par geste, et c'est voulu : l'observation SPÉCIFIQUE, qui
   * dit ce que l'apprenant a fait et sert au classement, puis `p:deckChange`,
   * qui porte l'état complet et sert aux étapes à chemin libre. C'est le modèle
   * d'Excel (`typed` puis `stateChange`), sans le débounce de 350 ms dont Excel
   * avait besoin parce que son moteur recalculait après coup. */
  const surGeste = useCallback(
    (geste: GestePpt, canal?: string) => {
      const channel = (canal ?? "unknown") as PptChannel
      const avant = deckRef.current
      const apres = appliquerGeste(avant, geste)
      deckRef.current = apres
      setDeck(apres)

      const specifique = observationDuGeste(geste, apres, channel)
      if (specifique) void appliquerObservation(specifique)
      void appliquerObservation({ kind: "p:deckChange", deck: apres, channel })
    },
    [appliquerObservation],
  )

  /* ─────────── DÉMONSTRATION ─────────── */

  const plan: PlanDemo | null = useMemo(() => {
    if (!step) return null
    /**
     * UN ÉCRAN DE LECTURE MONTRE CE QU'IL RACONTE.
     *
     * Les 191 écrans « À comprendre » de la formation n'avaient aucun moyen de
     * le faire : le plan se déduisait de `step.action`, et l'action d'un écran
     * de lecture est `READ` — qui ne produit aucun geste. Un scénario pouvait
     * donc déclarer un `montrer` complet, il était purement et simplement
     * ignoré. C'est le même manque qu'Excel avait sur ses 187 écrans avant de
     * recevoir `MONTRER`, et il est bien plus coûteux qu'il n'en a l'air :
     * l'écran affirme « le volet des miniatures liste vos diapositives » et
     * rien à l'écran ne le désigne.
     *
     * Les plans s'enchaînent : les gestes bout à bout, les repères de suivi à
     * la file, pour un compteur « i / n » qui court sur toute la séquence.
     *
     * Y COMPRIS EN ÉVALUATION NOTÉE — et ce n'est pas une aide sur une question :
     * un énoncé d'ouverture qui désigne où lire les consignes ne souffle aucune
     * réponse, c'est le contenu lui-même. Même règle que sur Excel.
     */
    if (step.montrer?.length) {
      /* Le rang de la bulle d'auteur est pris sur l'index de l'ACTION, avant le
         `filter` : une action sans plan décalerait sinon toutes les suivantes,
         en silence. Voir `annoterBulleDAuteur`. */
      const plans = step.montrer
        .map((a, rang) => {
          const p = adaptateurPpt.demonstration(a as unknown as Record<string, unknown> & { type: string }, {})
          return p ? annoterBulleDAuteur(p, rang) : null
        })
        .filter(Boolean) as PlanDemo[]
      if (plans.length === 0) return null
      return avecDureesDeVoix(
        { gestes: plans.flatMap((p) => p.gestes), pas: plans.flatMap((p) => p.pas) },
        step?.id,
        voixRef.current,
      )
    }
    if (evaluationNotee) return null
    return adaptateurPpt.demonstration(step.action as unknown as Record<string, unknown> & { type: string }, {})
  }, [step, evaluationNotee])

  /**
   * L'onglet du ruban que l'étape courante rend nécessaire.
   *
   * Déduit du plan de démonstration, donc de la MÊME source que le reste : le
   * premier bouton que l'étape fait presser décide de l'onglet à ouvrir. Une
   * seconde table à tenir à jour à la main dériverait, et un bouton oublié
   * deviendrait injoignable — l'étape qui le demande, infranchissable.
   *
   * C'est ce qui permet d'ajouter les onglets sans rendre injouable une seule
   * des 1 348 étapes déjà écrites : aucune ne déclarait d'onglet, puisqu'il n'y
   * en avait pas.
   *
   * ⚠️ Un écran de LECTURE n'attend aucun geste : son action ne presse rien, et
   * l'onglet resterait donc celui de l'étape précédente. Une bulle qui désigne
   * « le groupe Transitions » pointerait alors un bouton absent du DOM, et
   * montrerait du vide — exactement le défaut que les onglets rouvrent. On prend
   * donc l'onglet du premier bouton de ruban que la démonstration DÉSIGNE : le
   * ruban est déjà ouvert au bon endroit quand l'illustration démarre.
   *
   * 🔴 LE DÉFAUT CORRIGÉ LE 06/08/2026, mesuré sur les deux balayages exhaustifs.
   *
   * Cette déduction lisait le premier geste qui PRESSE, et s'arrêtait là :
   *
   *     const presse = p?.gestes.find((g) => g.presser?.id)?.presser?.id
   *     if (presse) return ongletDuControle(presse)
   *
   * Deux fautes dans ces deux lignes, et 60 gestes joués à blanc :
   *
   *  1. `ongletDuControle` rend `null` pour une MINIATURE. Or `P_MOVE_SLIDE` et
   *     `P_DELETE_SLIDE` commencent par presser la miniature de la diapositive
   *     visée : `presse` était vrai, la fonction sortait sur `null`, et le bouton
   *     de ruban des gestes SUIVANTS n'était jamais amené à l'écran ;
   *  2. un bouton peut être DÉSIGNÉ sans être pressé — c'est délibéré partout où
   *     le geste n'est pas idempotent (`P_DELETE_SLIDE`), engage l'apprenant à la
   *     place de l'apprenant (`P_EXPECT_SHOW` : on ne lance pas le diaporama pour
   *     lui) ou attend un état (`P_EXPECT_FORMAT`, `P_ADD_OBJECT`). Ces plans-là
   *     n'ont AUCUN `presser` sur leur bouton de ruban : `presse` restait
   *     `undefined` et aucun onglet n'était proposé.
   *
   * On parcourt donc tous les gestes, et on lit la cible autant que le `presser`.
   * Le premier qui vit dans le ruban décide — un plan PowerPoint ne traverse
   * aujourd'hui jamais deux onglets, et si cela arrivait, c'est l'adaptateur qui
   * insère la bascule au bon endroit de la séquence.
   */
  const ongletSuggere = useMemo(() => {
    if (!step) return null
    const p = adaptateurPpt.demonstration(
      step.action as unknown as Record<string, unknown> & { type: string },
      {},
    )
    for (const g of p?.gestes ?? []) {
      const id = controleDuGeste(g)
      const o = id ? ongletDuControle(id) : null
      if (o) return o
    }
    for (const a of step.montrer ?? []) {
      const c = (a as unknown as { cible?: string }).cible ?? ""
      if (!c.startsWith("ctrl:")) continue
      const o = ongletDuControle(c.slice(5))
      if (o) return o
    }
    return null
  }, [step])

  const demoEcrire = useCallback((ref: string, valeur: string) => {
    // La démonstration écrit POUR DE VRAI, sous verrou : sans écriture, elle
    // montrerait un geste sans résultat — la définition même d'une démonstration
    // incomplète. Sans verrou, l'écriture validerait l'étape en pleine
    // explication et la séquence se saborderait.
    verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + 900)
    const d = deckRef.current
    const slide = diapoActive(d)
    const obj = slide ? trouverObjet(slide, ref) : null
    if (!obj) return
    const n = appliquerGeste(d, { type: "editText", objectId: obj.id, paragraphe: 0, text: valeur })
    deckRef.current = n
    setDeck(n)
  }, [])

  const demoSelectionner = useCallback((ref: string) => {
    verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + 900)
    const d = deckRef.current
    const slide = diapoActive(d)
    const obj = slide ? trouverObjet(slide, ref) : null
    if (!obj) return
    const n = appliquerGeste(d, { type: "selectObject", objectId: obj.id })
    deckRef.current = n
    setDeck(n)
  }, [])

  /**
   * Presser un vrai bouton de la surface — en ROUVRANT d'abord ce qui le cache.
   *
   * 🔴 LE SECOND DÉFAUT DU 06/08/2026, propre au téléphone et invisible au large.
   *
   * `resoudreDemo` savait déjà qu'un panneau replié rend sa cible ABSENTE du DOM,
   * et retombait sur le bouton qui le rouvre. `demoPresser`, lui, n'avait aucun
   * repli : il interrogeait le DOM, ne trouvait rien, et ne faisait RIEN — en
   * silence. Mesuré à 390 px : 188 `P_SELECT_SLIDE` agissaient à 1440 et pas à
   * 390, donc toute la suite du chapitre se jouait sur la mauvaise diapositive,
   * et 85 gestes de plus devenaient muets faute d'objets à désigner.
   *
   * ⚠️ C'est le MÊME schéma qu'Outlook cette nuit — le repli existait pour
   * RÉSOUDRE la cible, jamais pour AGIR dessus — mais PAS la même cause, et le
   * remède ne se recopie pas : là-bas les cibles sortaient du DOM parce que la
   * vue changeait (`voletMobile` bascule liste ↔ lecture), ici parce que le volet
   * des miniatures est un TIROIR rendu seulement s'il est ouvert.
   *
   * On rouvre, PUIS on re-cherche : le tiroir se referme de lui-même au clic sur
   * une miniature (`PptSurface`, `setTiroirOuvert(false)` dans son `onClick`),
   * donc l'écran revient à l'état où l'apprenant le reprend.
   *
   * 🔴 ET LA RE-RECHERCHE NE PEUT PAS ÊTRE SYNCHRONE — mesuré, pas supposé.
   *
   * Première version : rouvrir puis interroger le DOM dans la foulée, au motif
   * qu'un clic est un événement discret que React traite sur-le-champ. Faux
   * depuis React 18 : les mises à jour d'un événement discret sont vidées dans
   * une MICROTÂCHE, donc le tiroir n'existe pas encore quand `click()` rend la
   * main. Mesuré au banc à 390 px : le repli se déclenchait bien (172 fois) et la
   * diapositive active ne bougeait pas plus qu'avant sur 24 étapes. Un correctif
   * qui « s'exécute » sans rien changer est le pire des deux mondes : il ferme le
   * dossier en laissant le défaut.
   *
   * On repasse donc la main au navigateur, et l'on réessaie brièvement. Le geste
   * dure ~850 ms, les tentatives couvrent 240 ms : le budget est large.
   *
   * ⚠️ Ce chemin est INATTEIGNABLE sur grand écran, par construction : le bouton
   * y est présent, `cliquer()` réussit du premier coup et rien n'est différé.
   * C'est ce qui rend la symétrie desktop démontrable au lieu d'argumentable.
   */
  const demoPresser = useCallback(
    (id: string) => {
      const sel = `[data-control="${id}"]`
      const verrouiller = () => {
        verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + 900)
      }
      verrouiller()

      // On presse le VRAI bouton du DOM : c'est le seul moyen d'ouvrir un menu,
      // dont le contenu n'existe pas tant qu'il est fermé — donc de rendre
      // atteignable le bouton du geste suivant. Sur Excel, une démonstration qui
      // « désignait » l'onglet sans l'ouvrir jouait tout le reste à blanc.
      const cliquer = () => {
        const el = zoneRef.current?.querySelector(sel)
        /* 🔴 LE TROISIÈME DÉFAUT — un témoin qui journalisait un bouton JAMAIS
           pressé. Ce relevé vivait HORS de cette garde : à 390 px il enregistrait
           `vol-diapo-1/2/3` alors que `querySelector` n'avait rien trouvé et que
           rien n'avait bougé. Or `check-couverture-ppt` n'accepte que cette
           source, précisément parce qu'un journal de clics réels « ne peut pas
           mentir » : il mentait. Le relevé appartient au clic, pas à l'intention. */
        if (!(el instanceof HTMLElement)) return false
        el.click()
        if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
          const w = window as unknown as Record<string, unknown>
          const j = (w.__PPT_BOUTONS_PRESSES as string[] | undefined) ?? []
          if (!j.includes(id)) j.push(id)
          w.__PPT_BOUTONS_PRESSES = j
        }
        return true
      }

      if (cliquer()) return

      let rouvert = false
      for (const repli of repliPetitEcran(sel)) {
        const b = zoneRef.current?.querySelector(`[data-control="${repli}"]`)
        if (!(b instanceof HTMLElement)) continue
        b.click()
        if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
          const w = window as unknown as Record<string, unknown>
          const j = (w.__PPT_REPLI_PRESSE as string[] | undefined) ?? []
          j.push(`${id} → ${repli}`)
          w.__PPT_REPLI_PRESSE = j
        }
        rouvert = true
        break
      }
      if (!rouvert) return

      let restant = 6
      const reessayer = () => {
        verrouiller()
        if (cliquer() || (restant -= 1) <= 0) return
        window.setTimeout(reessayer, 40)
      }
      window.setTimeout(reessayer, 0)
    },
    [repliPetitEcran],
  )

  /* ─────────── FIN DE CHAPITRE ─────────── */
  progression.onTerminer.current = () => {
    void cloturer()
  }

  /* ─────────── UN ÉCRAN DE LECTURE SE JOUE TOUT SEUL ───────────
   *
   * Sur un écran « À comprendre », l'apprenant n'a aucun geste à faire : rien ne
   * déclencherait donc la démonstration, et le bouton « Montrez-moi » n'y
   * apparaît pas — il est gouverné par les seuils d'erreur. Sans démarrage
   * automatique, les 191 écrans resteraient muets même une fois équipés.
   *
   * Le délai laisse le temps de lire la consigne avant que ça bouge, et laisse
   * la surface finir de se poser. La page de garde doit être passée : sur Excel,
   * la démonstration se jouait PAR-DESSUS « Commencer la leçon », bulles et
   * curseur compris, avant même que l'apprenant ait ouvert le chapitre.
   */
  useEffect(() => {
    if (!step || finished || !introVue) return
    if (step.action.type !== "READ" || !step.montrer?.length) return
    const t = window.setTimeout(() => aide.demarrerDemonstration(), 1200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, index, finished, introVue])

  /**
   * Forcer la démonstration sans passer par les seuils de l'apprenant.
   *
   * HORS PRODUCTION, et seulement si l'auditeur l'a demandé. Sans ce crochet, la
   * démonstration d'une étape d'action n'est atteignable qu'après trois erreurs,
   * six tâtonnements ou quarante-cinq secondes : un audit qui doit relever les
   * boutons réellement pressés sur 130 chapitres ne peut pas les simuler. Le
   * mécanisme est repris d'Excel, où l'absence d'équivalent avait fait conclure
   * à tort que rien ne se pressait.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (typeof window === "undefined" || !(window as unknown as Record<string, unknown>).__PPT_FORCE_DEMO) return
    if (!step || finished || !introVue) return
    const t = window.setTimeout(() => aide.demarrerDemonstration(), 900)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, index, finished, introVue])

  /* ─────────── UNE LECTURE NE MODIFIE PAS LA PRÉSENTATION ───────────
   *
   * Une illustration peut poser un contre-exemple (`ecrire`) pour montrer ce
   * qu'il ne faut pas faire. Si on le laissait en place, l'étape suivante
   * partirait d'une présentation que l'apprenant n'a pas produite — et une étape
   * jugée sur l'état deviendrait infranchissable.
   *
   * Le deck est donc photographié à l'ouverture de la démonstration et remis à
   * l'identique à la fin, exactement comme Excel restaure son classeur. Rien
   * n'est restauré sur une étape d'action : là, la démonstration écrit POUR DE
   * VRAI, c'est tout son intérêt.
   */
  const avantDemoRef = useRef<DeckState | null>(null)
  useEffect(() => {
    const lecture = step?.action.type === "READ"
    if (!lecture) return
    if (aide.demonstration && !aide.demoFinie && !avantDemoRef.current) {
      avantDemoRef.current = deckRef.current
      return
    }
    if (aide.demoFinie && avantDemoRef.current) {
      const avant = avantDemoRef.current
      avantDemoRef.current = null
      deckRef.current = avant
      setDeck(avant)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aide.demonstration, aide.demoFinie, step?.id])

  /* Une nouvelle étape efface la photo : la garder ferait restaurer, à la fin
     d'une démonstration ultérieure, l'état d'un écran déjà quitté. */
  useEffect(() => {
    avantDemoRef.current = null
  }, [index])

  /* ─────────── CROCHETS D'AUDIT — HORS PRODUCTION ───────────
   *
   * Même rôle que `__SIM_GRID` et `__SIM_FAUTES` côté Excel : sans eux, « pourquoi
   * cette étape ne passe-t-elle pas ? » ne se diagnostique pas — on en est réduit
   * à supposer, et une supposition coûte plus cher qu'un crochet.
   *
   * ⚠️ `NODE_ENV !== "production"` : ils disparaissent du bundle livré. Un banc
   * construit par erreur en production les perd aussi, et on croit alors à une
   * régression du produit — c'est arrivé sur Excel.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return
    const w = window as unknown as Record<string, unknown>
    w.__PPT_ETAPE = step?.id
    w.__PPT_DECK = deck
    w.__PPT_VERDICT = verdict
    w.__PPT_COMPTEURS = { essais: aide.essais, tatonnements: aide.tatonnements }
  })

  /* ─────────── OUVERTURE ─────────── */
  const [ouvrirEnCours, setOuvrirEnCours] = useState(false)
  const ouvrir = useCallback(async () => {
    setOuvrirEnCours(true)
    const ok = await commencer()
    setOuvrirEnCours(false)
    if (ok) ouvrirLAtelier()
  }, [commencer, ouvrirLAtelier])

  /* ═══════════ RENDU ═══════════ */

  // `step.points` : une étape hors barème n'est pas « évaluée ». PowerPoint n'a
  // aucune étape à `points: 0`, ce rendu est donc inchangé — mesuré, pas supposé.
  const nature = step ? natureEtape(step.action, mode, step.points) : "action"
  const attendu = step
    ? adaptateurPpt.attendu(step.action as unknown as Record<string, unknown> & { type: string })
    : null
  const reponse =
    step && !evaluationNotee
      ? adaptateurPpt.reponse(step.action as unknown as Record<string, unknown> & { type: string })
      : null
  const filModule = scenario.moduleTitle ?? ""
  /*
   * Le module a-t-il une affiche ? On teste le NUMÉRO, jamais l'élément JSX :
   * `<AfficheModule/>` est toujours truthy même quand il rend `null`, et le
   * repli n'aurait jamais lieu — Excel a payé exactement ce piège.
   *
   * 🔴 `app` n'est PAS facultatif ici. Le module 1 de PowerPoint s'appelle
   * « Prise en main », exactement comme celui d'Excel : sans l'application, la
   * résolution part dans l'ordre de préférence, tombe sur Excel et affiche une
   * grille de tableur légendée « la grille » en tête d'un chapitre PowerPoint.
   */
  const afficheModule = numeroModule(scenario.moduleTitle, "POWERPOINT") !== null

  return (
    <AtelierShell
      chapterId={chapterId}
      etapeId={step?.id ?? null}
      mode={mode}
      evaluationNotee={evaluationNotee}
      filModule={filModule}
      filChapitre={scenario.title}
      index={index}
      total={total}
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
      /**
       * LA BANDE DE CONSIGNE EST RENDUE PAR LE CHÂSSIS.
       *
       * PowerPoint ne décrit que son étape ; il ne dessine rien et ne décide
       * d'aucun geste — le châssis les déclenche. C'est ce qui garantit qu'un
       * apprenant retrouve exactement la même bande, les mêmes paliers d'aide et
       * les mêmes libellés dans les quatre applications, au lieu de trois
       * variantes qui divergeront.
       */
      consigne={
        finished || !step
          ? null
          : {
              texte: step.consigne,
              nature,
              lecture: step.action.type === "READ",
              aDemonstration: !!step.montrer?.length,
              /*
               * ⚠️ C'EST LE PLAN QU'ON TESTE, JAMAIS `montrer`.
               *
               * `aDemonstration` juste au-dessus vaut `!!step.montrer?.length`,
               * et **aucune** des 939 étapes d'action de PowerPoint ne porte de
               * `montrer` : s'y gater retirerait « Montrez-moi » à 863 étapes
               * qui ont pourtant une vraie démonstration. Sur un écran `READ`
               * les deux coïncident — le plan y est justement bâti depuis
               * `montrer` —, mais sur une étape d'action seul `plan` sait.
               *
               * Absent ⇒ `true` côté châssis : renseigner le champ est donc la
               * seule chose qui rende son correctif actif ici.
               */
              demoJouable: !!plan,
              attendu,
              // Jamais servie en évaluation : le bloc qui l'affiche y est déjà
              // inatteignable, et la calculer serait la faire transiter pour rien.
              reponse,

              aide: step.aide?.text ?? null,
              aideVisible: aide.hintShown,
              // Un repère est ancré sur la diapositive : la ligne ferait doublon.
              // Ne jamais retirer la ligne SANS cette condition — sans repère
              // ancré, l'aide disparaîtrait complètement.
              aideAncree: halo.length > 0,
              indiceDisponible: mode === "EXERCISE" && !aide.hintShown && !!step.aide?.text,

              evaluationNotee,
              relais,
              relaisActif,
              verdict,
              /**
               * La phrase de refus est ANCRÉE à la diapositive, juste au-dessous.
               *
               * Même raison que `aideAncree` : un message ne se lit qu'à UN
               * endroit. Vérifié dans les deux seuls chemins qui posent un
               * verdict porteur d'un message — juge local et juge serveur — :
               * chacun lance `lancerFx("ko", …, message)` avec EXACTEMENT la
               * même phrase, donc rien n'est perdu en retirant la ligne.
               *
               * ⚠️ Le drapeau ne vaut que pour les étapes d'action : le châssis
               * garde sa ligne sur un écran de lecture (`c.lecture || …`), où
               * aucun effet n'est lancé. Et le TÂTONNEMENT ne pose ici aucun
               * verdict — il n'y a donc pas de message à faire disparaître.
               */
              verdictAncre: true,
              // PowerPoint n'a pas encore de remise d'aplomb : `ppt/aplomb.ts`
              // est un lot à part. Le dire par `null` plutôt que d'inventer un
              // message qui laisserait croire à une réparation.
              aplomb: null,
              panneJuge: persistance.pannneJuge,
              passageEnCours,

              aideProposee: aide.essais >= 3 || aide.tatonnements >= 6 || aide.tropLong,
              demonstration: aide.demonstration,
              demoFinie: aide.demoFinie,
              demoRejouable: !!plan && aide.demoFinie,

              index,
              total,
              reculPossible,

              onMontrer: evaluationNotee ? passerLaQuestion : aide.demarrerDemonstration,
              onDebloquer: goNext,
              onRejouerDemo: aide.rejouerDemonstration,
              onIndice: aide.montrerIndice,
              onSuivant: () => void appliquerObservation({ kind: "next" }),
              onReculer: () => progression.setReculDemande(true),
            }
      }
    >
      <style>{`
        @keyframes ppt-intro-monte { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ppt-fx-ok { 0%{opacity:0} 20%{opacity:1} 100%{opacity:0} }
        @keyframes ppt-fx-ko { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        @keyframes ppt-fx-msg { 0%{opacity:0;transform:translateY(-4px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes ppt-jalon { 0%{opacity:0;transform:scale(.94)} 12%{opacity:1;transform:scale(1)} 82%{opacity:1} 100%{opacity:0} }
        @media (prefers-reduced-motion: reduce) {
          [style*="ppt-fx-"],[style*="ppt-jalon"]{animation-duration:.01ms !important}
        }
      `}</style>

      {/* ── ÉCRAN D'OUVERTURE ──
          L'affiche du module occupe la colonne de droite, comme sur Excel, et
          disparaît sous `lg`. Elle est posée DANS LE FLUX et non en absolu :
          l'absolu d'Excel peut recouvrir le texte autour de 1024 px, et le seul
          moyen de garantir qu'aucune largeur ne fasse se chevaucher les deux
          est de leur faire partager une rangée. */}
      {!introVue && step ? (
        <div
          className="absolute inset-0 z-40 flex flex-col justify-center px-6 py-8 sm:px-10"
          style={{ background: "linear-gradient(180deg,#faf9f5 0%,#f2efe8 100%)" }}
        >
        <div className="flex w-full items-center" style={{ gap: 40 }}>
          <div style={{ maxWidth: 620, flex: "1 1 auto", minWidth: 0 }}>
            <p
              className="uppercase"
              style={{ fontSize: 12, fontWeight: 800, letterSpacing: "2.2px", color: "#8C3520", marginBottom: 12 }}
            >
              {mode === "LESSON" ? "Leçon" : mode === "EXERCISE" ? "Exercice" : "Évaluation"}
              {filModule && filModule !== scenario.title ? ` — ${filModule}` : ""}
            </p>
            <h2 style={{ fontSize: "clamp(24px,4.5vw,38px)", lineHeight: 1.08, fontWeight: 850, color: "#171a18" }}>
              {scenario.intro?.title ?? scenario.title}
            </h2>
            {scenario.intro?.body ? (
              <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.6, color: "#4A4640" }}>{scenario.intro.body}</p>
            ) : null}
            {evaluationNotee ? (
              <p style={{ marginTop: 14, fontSize: 13, color: "#8A5A12" }}>
                {repriseEvaluation
                  ? "Cette évaluation reprend depuis le début, sur une présentation remise à neuf."
                  : "Évaluation notée — à faire d'une traite."}
                {scorePrecedent !== null
                  ? ` Meilleure note retenue : ${Math.round(scorePrecedent * 100)} %. Seule la meilleure est conservée.`
                  : ""}
              </p>
            ) : null}
            <button
              type="button"
              data-control="sim-commencer"
              onClick={() => void ouvrir()}
              disabled={ouvrirEnCours || ouvertureEnCours}
              style={{
                marginTop: 22,
                minHeight: 44,
                padding: "0 22px",
                borderRadius: 10,
                border: "none",
                background: "#171a18",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {ouvrirEnCours || ouvertureEnCours ? "Ouverture…" : "Commencer"}
            </button>
            {persistance.pannneJuge === "passage" ? (
              <p style={{ marginTop: 10, fontSize: 12.5, color: "#8C3520" }}>
                L&apos;évaluation n&apos;a pas pu être ouverte. Rien n&apos;est perdu : réessayez.
              </p>
            ) : null}
          </div>
          {/* Pas de repli quand le module n'a pas encore d'affiche : le
              mini-classeur vert d'Excel dessine une grille de tableur, et
              inventer ici une seconde langue visuelle par application
              reviendrait à poser trois jeux d'illustrations dans les players,
              que l'affiche remplacera. Rien vaut mieux qu'à peu près. */}
          {afficheModule ? (
            <div
              aria-hidden
              className="hidden shrink-0 select-none lg:block"
              style={{ width: 372, animation: "ppt-intro-monte .9s .35s ease both" }}
            >
              <AfficheModule moduleTitle={scenario.moduleTitle} app="POWERPOINT" />
            </div>
          ) : null}
        </div>
        </div>
      ) : null}

      {/* ── ZONE DE TRAVAIL ──
          Enfant DIRECT du châssis : un conteneur intermédiaire romprait la
          colonne flex, et le défilement reviendrait sans qu'aucun compteur ne
          s'en aperçoive. */}
      <div ref={zoneRef} data-zone-travail="" style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <PptSurface
          deck={deck}
          onGeste={surGeste}
          halo={halo}
          lecture={!!preview || finished}
          largeurZone={largeurZone}
          ongletSuggere={ongletSuggere}
          cleEtape={step?.id}
          registre={(api) => {
            uiApiRef.current = api
          }}
        />

        {/* Effet ancré à la cible : le guidage doit être visible DANS la zone de
            travail — un message sous l'écran ne suffit pas, l'apprenant regarde
            sa diapositive (retour Samuel du 28/07). `pointer-events: none` :
            une surface décorative qui avale les clics est le défaut le plus
            coûteux du lecteur d'Excel (invariant §6.4). */}
        {fx ? (
          <div
            key={fx.k}
            aria-hidden
            style={{
              position: "absolute",
              pointerEvents: "none",
              zIndex: 45,
              ...(fx.rect
                ? { left: fx.rect.left, top: fx.rect.top, width: fx.rect.width, height: fx.rect.height }
                : { inset: 0 }),
              outline: fx.kind === "ok" ? "3px solid #2E9E63" : "3px solid #C0392B",
              background: fx.kind === "ok" ? "rgba(46,158,99,.14)" : "rgba(192,57,43,.10)",
              borderRadius: 4,
              animation: fx.kind === "ok" ? "ppt-fx-ok 1.4s ease both" : "ppt-fx-ko .4s ease both",
            }}
          />
        ) : null}

        {/* LA PHRASE, ET PAS SEULEMENT LE CONTOUR.
         *
         * `lancerFx` recevait déjà le message ; il était JETÉ. PowerPoint
         * refusait donc le geste en secouant un cadre rouge, muet, alors que le
         * juge avait écrit pourquoi — « Ce n'est pas la bonne diapositive. »
         * Un contour ne dit pas ce qui manque : c'est le retour de Samuel du
         * 28/07, l'apprenant regarde sa diapositive, pas le texte sous l'écran.
         *
         * Le cadre reste `aria-hidden` — il est décoratif ; la phrase, elle,
         * doit être ANNONCÉE, d'où le `role="status"` sur un élément distinct.
         *
         * Durée : le `fx` « ko » vit 2 800 ms. Mesuré en interrogeant le juge
         * sur les 1 157 étapes d'action, ses messages font 50 signes au plus
         * (médiane 33) — soit 18 signes/s, sous le seuil de lisibilité de 22.
         * Aucune échéance propre n'est donc nécessaire ici, contrairement au
         * message d'aplomb d'Excel qui, lui, était effacé avant d'être lu.
         *
         * `pointer-events: none` : une surface décorative qui avale les clics
         * est le défaut le plus coûteux du lecteur d'Excel (invariant §6.4). */}
        {fx?.kind === "ko" && fx.message ? (
          <div
            key={`fxmsg${fx.k}`}
            role="status"
            style={{
              position: "absolute",
              pointerEvents: "none",
              zIndex: 46,
              /* Sous la cible quand elle est mesurable, sinon en pied de zone :
                 un message centré sur une cible inconnue se poserait au milieu
                 de la diapositive, par-dessus ce que l'apprenant doit regarder.
                 ⚠️ Et il REMONTE au-dessus de la cible quand il n'y a plus la
                 place dessous : à 390 px une cible basse le pousserait hors du
                 cadre, où il serait aussi absent que la phrase jetée. */
              left: 8,
              right: 8,
              ...(fx.rect
                ? hauteurZone > 0 && fx.rect.top + fx.rect.height + 8 > hauteurZone - 40
                  ? { top: Math.max(4, fx.rect.top - 40) }
                  : { top: Math.max(4, fx.rect.top + fx.rect.height + 8) }
                : { bottom: 12 }),
              display: "flex",
              justifyContent: "center",
              animation: "ppt-fx-msg .2s ease both",
            }}
          >
            <span
              style={{
                maxWidth: "100%",
                padding: "7px 12px",
                borderRadius: 8,
                background: "#7F1D1D",
                color: "#fff",
                fontSize: 12.5,
                lineHeight: 1.35,
                fontWeight: 600,
                textAlign: "center",
                boxShadow: "0 4px 14px rgba(16,24,32,.28)",
              }}
            >
              {fx.message}
            </span>
          </div>
        ) : null}

        {jalon ? (
          <div
            key={`jalon${jalon.n}`}
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              zIndex: 46,
              animation: "ppt-jalon 1.15s ease both",
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: "14px 20px",
                boxShadow: "0 12px 30px rgba(16,24,32,.18)",
                maxWidth: 340,
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 14.5, fontWeight: 700, color: "#171a18" }}>Étape {jalon.n} franchie</p>
              {jalon.texte ? <p style={{ marginTop: 3, fontSize: 12, color: "#6E6A62" }}>{jalon.texte}</p> : null}
            </div>
          </div>
        ) : null}

        {aide.demonstration && plan ? (
          <DemonstrationGeste
            key={`demo${index}-${aide.rejeu}`}
            plan={plan}
            resoudre={resoudreDemo}
            largeur={largeurZone}
            hautFeuille={0}
            onEcrire={demoEcrire}
            onSelectionner={demoSelectionner}
            onPresser={demoPresser}
            lecture={nature === "lecture"}
            // La bulle entre en scène : la voix la dit. Rien n'est attendu en
            // retour — la minuterie du calque est déjà partie.
            onBulle={(rang) => voixRef.current?.jouerBulle(step?.id, rang)}
            onArreterVoix={() => voixRef.current?.arreter()}
            onFini={() => aide.setDemoFinie(true)}
          />
        ) : null}
      </div>

      {/* La bande de consigne appartient désormais au CHÂSSIS : elle est rendue
          par `AtelierShell` à partir de l'objet `consigne` construit plus haut.
          Les 120 lignes provisoires qui vivaient ici ont été retirées — elles
          n'avaient d'autre raison d'être que de rendre le pilote jouable avant
          l'extraction. */}
      {/* ── RETOUR À L'ÉTAPE PRÉCÉDENTE ──
          Le châssis rend le BOUTON et appelle `onReculer` ; la confirmation,
          elle, est restée dans `SimulationPlayer`. Sans elle, le bouton du
          châssis est mort : l'apprenant clique et rien ne se passe.
          ⚠️ `confirm()` natif proscrit dans le LMS — modale maison, qui NOMME
          l'étape de destination et dit ce qui est conservé : ce que l'apprenant
          a saisi reste en place, seul le geste de l'étape est à refaire. */}
      {progression.reculDemande ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Revenir à l'étape précédente"
          className="absolute inset-0 grid place-items-center"
          style={{ background: "rgba(8,17,14,.5)", zIndex: 80 }}
        >
          <div style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: 380, margin: 16 }}>
            <p style={{ fontSize: 14.5, fontWeight: 700, color: "#171a18" }}>
              Revenir à l&apos;étape {index} ?
            </p>
            <p style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.55, color: "#4A4640" }}>
              Ce que vous avez déjà saisi reste en place. Seul le geste de cette étape-là sera à refaire.
            </p>
            <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                data-control="sim-reculer-annuler"
                onClick={() => progression.setReculDemande(false)}
                style={boutonSecondaire}
              >
                Rester ici
              </button>
              <button type="button" data-control="sim-reculer-confirmer" onClick={reculer} style={boutonPrincipal}>
                Revenir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── ÉCRAN DE FIN — minimal, provisoire ── */}
      {finished ? (
        <div style={{ flexShrink: 0, borderTop: "1px solid #E4E0D8", background: "#fff", padding: 18 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#171a18" }}>Chapitre terminé.</p>
          {scenario.outro?.body ? (
            <p style={{ marginTop: 6, fontSize: 13.5, color: "#4A4640" }}>{scenario.outro.body}</p>
          ) : null}
          {evaluationNotee && bilan?.score !== undefined ? (
            <p style={{ marginTop: 8, fontSize: 13.5, color: "#22302B" }}>
              Note de ce passage : <b>{Math.round((bilan.score ?? 0) * 100)} %</b>. Seule la meilleure est conservée.
            </p>
          ) : null}
          {evaluationNotee && onRejouer ? (
            <button type="button" data-control="sim-repasser" onClick={onRejouer} style={{ ...boutonPrincipal, marginTop: 12 }}>
              Repasser l&apos;évaluation
            </button>
          ) : null}
        </div>
      ) : null}
    </AtelierShell>
  )
}

/* ═══════════ STYLES DE BOUTON ═══════════ */

const boutonBase: React.CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 9,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
}
const boutonPrincipal: React.CSSProperties = { ...boutonBase, background: "#171a18", color: "#fff", border: "none" }
const boutonSecondaire: React.CSSProperties = {
  ...boutonBase,
  background: "#fff",
  color: "#22302B",
  border: "1px solid #D6DBE1",
}

/* ═══════════ GESTE → OBSERVATION ═══════════ */

/**
 * L'observation SPÉCIFIQUE d'un geste : ce que l'apprenant vient de faire.
 *
 * Elle est distincte de `p:deckChange`, qui porte l'état : la première sert au
 * classement (réussite / faute / tâtonnement) et au journal pédagogique, la
 * seconde aux étapes à chemin libre. Confondre les deux reviendrait à ne plus
 * pouvoir distinguer « il a cliqué le mauvais bouton » de « ce n'est pas encore
 * fait » — et c'est cette distinction qui décide si l'apprenant perd un point.
 *
 * `null` quand le geste n'a pas d'observation propre : la surface a bougé, mais
 * rien de nommable ne s'est produit.
 */
function observationDuGeste(geste: GestePpt, apres: DeckState, channel: PptChannel): PptObservation | null {
  const i = apres.activeSlide ?? 0
  switch (geste.type) {
    case "selectSlide":
      return { kind: "p:slideSelect", index: geste.index, channel }
    case "addSlide":
      return { kind: "p:slideAdd", index: i, layout: apres.slides[i]?.layout ?? "titre-et-contenu", channel }
    case "deleteSlide":
      return { kind: "p:slideDelete", index: geste.index, channel }
    case "duplicateSlide":
      return { kind: "p:slideDuplicate", index: geste.index, channel }
    case "moveSlide":
      return { kind: "p:slideMove", from: geste.from, to: geste.to, channel }
    case "setLayout":
      return { kind: "p:layoutChange", index: geste.index, layout: geste.layout, channel }
    case "setView":
      return { kind: "p:viewChange", view: geste.view, channel }
    case "selectObject":
      return geste.objectId ? { kind: "p:objectSelect", objectId: geste.objectId, channel } : null
    case "addObject": {
      const slide = apres.slides[i]
      const obj = slide?.objects[slide.objects.length - 1]
      return obj
        ? { kind: "p:objectAdd", objectId: obj.id, objectType: obj.type, shape: obj.shape, channel }
        : null
    }
    case "deleteObject":
      return { kind: "p:objectDelete", objectId: geste.objectId, channel }
    case "moveObject":
      return { kind: "p:objectMove", objectId: geste.objectId, rect: geste.rect, resize: !!geste.resize, channel }
    case "editText": {
      const slide = apres.slides[i]
      const obj = slide?.objects.find((o) => o.id === geste.objectId)
      // `cible` porte la forme d'AUTEUR (`ph:titre`) : un scénario désigne « le
      // titre », quand le moteur ne connaît que des identifiants générés. Le
      // rang (`ph:contenu#2`) distingue les espaces réservés en double des
      // dispositions à deux colonnes.
      const cible = (slide ? cibleDAuteur(slide, geste.objectId) : null) ?? geste.objectId
      return {
        kind: "p:typed",
        cible,
        objectId: geste.objectId,
        paragraphe: geste.paragraphe,
        text: geste.text,
        channel,
      }
    }
    case "format": {
      const slide = apres.slides[i]
      const obj = slide?.objects.find((o) => o.id === geste.objectId)
      return {
        kind: "p:formatChange",
        objectId: geste.objectId,
        style: (obj?.style ?? {}) as Record<string, unknown>,
        // Ce que CE geste vient de poser, distinct de l'état fusionné : c'est la
        // seule lecture qui permette de dire si l'apprenant a contredit la
        // consigne ou s'il n'y est simplement pas encore venu.
        applique: (geste.style ?? {}) as Record<string, unknown>,
        fill: obj?.fill,
        fillApplique: geste.fill,
        channel,
      }
    }
    case "setTransition":
      return { kind: "p:transitionChange", index: geste.index, transition: geste.transition, channel }
    case "addAnimation":
      return {
        kind: "p:animationChange",
        index: i,
        animations: (apres.slides[i]?.animations ?? []) as unknown as Array<{
          objectId: string
          kind: string
          ordre: number
        }>,
        channel,
      }
    case "setNotes":
      return { kind: "p:notesChange", index: geste.index, notes: geste.notes, channel }
    case "startShow":
    case "showNext":
    case "showPrev":
    case "endShow":
      return { kind: "p:showChange", show: apres.show ?? { actif: false, index: 0 }, channel }
    case "toggleMasquee":
      return null
    default:
      return null
  }
}

/** Réexporté pour les contrôles statiques, qui doivent juger le MÊME code. */
export { observationDuGeste }
export type { PptAction }
