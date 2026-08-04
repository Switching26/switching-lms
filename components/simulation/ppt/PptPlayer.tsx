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
import DemonstrationGeste from "../DemonstrationGeste"
import {
  useAideProgressive,
  useMesureZoneTravail,
  usePersistance,
  useProgression,
  useRetourVisuel,
  type RectCible,
} from "../hooks/useAtelier"
import PptSurface from "./PptSurface"
import type { SimulationScenario, SimulationStep } from "@/lib/simulation/types"
import { natureEtape } from "@/lib/simulation/attendu"
import { jugerEtape } from "@/lib/simulation/frappe"
import type { CibleDemo, PlanDemo } from "@/lib/simulation/demonstration"
import type { LearnerDocument } from "@/lib/learner-files"
import { adaptateurPpt } from "@/lib/simulation/ppt/adaptateur"
import type { PptAction, PptViewMode } from "@/lib/simulation/ppt/actions"
import type { PptChannel, PptObservation } from "@/lib/simulation/ppt/observations"
import {
  appliquerGeste,
  cibleDAuteur,
  deckDepuisDeclaration,
  diapoActive,
  trouverObjet,
  type DeclarationDeck,
  type DeckState,
  type GestePpt,
} from "@/lib/simulation/ppt/document"

type Mode = "LESSON" | "EXERCISE" | "EVALUATION"

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

  /* ── Noyau : aide progressive ── */
  const aide = useAideProgressive({
    mode,
    index,
    finished,
    aUneEtape: !!step,
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
    if (!s) return
    setDeck((d) => {
      let n = s.deck ? deckDepuisDeclaration(s.deck) : d
      if (s.slide !== undefined) n = { ...n, activeSlide: s.slide }
      if (s.selection) n = { ...n, selection: s.selection }
      if (s.view) n = { ...n, view: s.view }
      if (s.show) n = { ...n, show: { ...s.show } }
      return n
    })
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

  const resoudreDemo = useCallback(
    (cible: CibleDemo) => {
      if (cible.k === "dom") return rectDe(cible.sel)
      if (cible.k === "clavier") return null
      return null
    },
    [rectDe],
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
            lancerFx("ko", rectEtape(), j.message)
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
        lancerFx("ko", rectEtape(), j.message)
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
    if (!step || evaluationNotee) return null
    return adaptateurPpt.demonstration(step.action as unknown as Record<string, unknown> & { type: string }, {})
  }, [step, evaluationNotee])

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

  const demoPresser = useCallback((id: string) => {
    verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + 900)
    // On presse le VRAI bouton du DOM : c'est le seul moyen d'ouvrir un menu,
    // dont le contenu n'existe pas tant qu'il est fermé — donc de rendre
    // atteignable le bouton du geste suivant. Sur Excel, une démonstration qui
    // « désignait » l'onglet sans l'ouvrir jouait tout le reste à blanc.
    const el = zoneRef.current?.querySelector(`[data-control="${id}"]`)
    if (el instanceof HTMLElement) el.click()
  }, [])

  /* ─────────── FIN DE CHAPITRE ─────────── */
  progression.onTerminer.current = () => {
    void cloturer()
  }

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

  const nature = step ? natureEtape(step.action, mode) : "action"
  const attendu = step
    ? adaptateurPpt.attendu(step.action as unknown as Record<string, unknown> & { type: string })
    : null
  const reponse =
    step && !evaluationNotee
      ? adaptateurPpt.reponse(step.action as unknown as Record<string, unknown> & { type: string })
      : null
  const filModule = scenario.moduleTitle ?? ""

  return (
    <AtelierShell
      chapterId={chapterId}
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
        @keyframes ppt-fx-ok { 0%{opacity:0} 20%{opacity:1} 100%{opacity:0} }
        @keyframes ppt-fx-ko { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        @keyframes ppt-jalon { 0%{opacity:0;transform:scale(.94)} 12%{opacity:1;transform:scale(1)} 82%{opacity:1} 100%{opacity:0} }
        @media (prefers-reduced-motion: reduce) {
          [style*="ppt-fx-"],[style*="ppt-jalon"]{animation-duration:.01ms !important}
        }
      `}</style>

      {/* ── ÉCRAN D'OUVERTURE ── */}
      {!introVue && step ? (
        <div
          className="absolute inset-0 z-40 flex flex-col justify-center px-6 py-8 sm:px-10"
          style={{ background: "linear-gradient(180deg,#faf9f5 0%,#f2efe8 100%)" }}
        >
          <div style={{ maxWidth: 620 }}>
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
        fill: obj?.fill,
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
