"use client"

/**
 * Le simulateur, vu par l'apprenant.
 *
 * Il assemble l'habillage Excel, la grille, la barre de consigne, et surtout il
 * arbitre : à chaque geste il demande à `validateStep` si c'était le bon, avance
 * ou signale l'erreur, et fait remonter la progression au serveur.
 *
 * Trois choix pédagogiques sont câblés ici, et ils viennent de l'analyse des
 * 2 748 étapes de la formation de référence :
 *
 *  - En LEÇON, la cible est montrée d'emblée (halo). En EXERCICE, l'aide existe
 *    mais se demande. En ÉVALUATION, il n'y a pas d'aide.
 *  - Une mauvaise action ne fait pas perdre l'étape : on explique et on laisse
 *    réessayer. Seule la réussite AU PREMIER ESSAI compte pour la note, ce qui
 *    distingue une évaluation d'un exercice.
 *  - Le nombre d'erreurs et d'aides ouvertes est journalisé. C'est ce qui donne au
 *    formateur une vision réelle des difficultés, là où une vidéo ne dit rien.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { GridApi } from "./ExcelGrid"
import SimulationChrome, { SimulationFooter } from "./SimulationChrome"
import {
  cibleDemonstration,
  natureEtape,
  reponseAttendue,
  resumerAttendu,
  resumerFait,
} from "@/lib/simulation/attendu"
import DesktopLayer from "./DesktopLayer"
import AfficheModule, { numeroModule } from "./AfficheModule"
import DemonstrationGeste, { type Rect } from "./DemonstrationGeste"

/**
 * Clé stable d'une cible de démonstration, pour la trace d'audit hors
 * production. Deux gestes qui visent le même endroit partagent la même clé :
 * c'est voulu, la question posée est « ce repère a-t-il été dessiné ? ».
 */
function cleCible(c: CibleDemo): string {
  return c.k === "cellule" || c.k === "plage" ? `${c.k}:${c.ref}`
    : c.k === "enteteColonne" ? `col:${c.col}`
    : c.k === "enteteLigne" ? `ligne:${c.ligne}`
    : c.k === "dom" ? `dom:${c.sel}`
    : "clavier"
}
import { planDemonstration, type CibleDemo, type PlanDemo } from "@/lib/simulation/demonstration"
import { CONTROLES_POSTE, appliquerGeste, posteInitial } from "@/lib/simulation/poste"
import ChartLayer from "./ChartLayer"
import PivotLayer from "./PivotLayer"
import PageLayoutLayer from "./PageLayoutLayer"
import MacroPanel from "./MacroPanel"
import { dureeLisible, estimatedSimulationMinutes } from "@/lib/simulation/duree"
import type {
  CellState,
  ChartState,
  ChartType,
  GestePoste,
  MacroState,
  PageSetupState,
  PivotAgg,
  PosteState,
  SimulationScenario,
  SimulationStep,
  RibbonTab,
} from "@/lib/simulation/types"
import { cellsOf, columnIndexToLetter, formatRange, parseRange } from "@/lib/simulation/grid"
import {
  CADRE_DEFAUT,
  creerDepuisPlage,
  creerGraphique,
  modifierGraphique,
  selectionnerElement,
  type PatchGraphique,
} from "@/lib/simulation/chart"
import {
  aggParDefaut,
  calculerTcd,
  champsDisponibles,
  creerTcd,
  lecturesTcd,
  modifierTcd,
  posterTcd,
  sourceAChange,
  type EtatTcd,
  type PatchTcd,
  type PosePivot,
  type TableauCroise,
  type ZoneTcd,
} from "@/lib/simulation/pivot"
import {
  REGLAGES_PAR_DEFAUT,
  appliquerReglages,
  calculerPages,
  type Pagination,
} from "@/lib/simulation/pagesetup"
import {
  analyserCode,
  arreterEnregistrement,
  demarrerEnregistrement,
  executerMacro,
  genererCode,
  gesteDepuisControle,
  gesteDepuisSaisie,
  transcrire,
  type EtatEnregistrement,
  type GesteMacro,
  type OptionsMacro,
  type PiloteMacro,
} from "@/lib/simulation/macro"
import { validateStep, computeScore, type ObservedAction, type Verdict } from "@/lib/simulation/validate"

// Univer casse à l'import côté serveur : le chargement différé est obligatoire,
// pas une optimisation.
const ExcelGrid = dynamic(() => import("./ExcelGrid"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[13px] text-neutral-500">
      Chargement du classeur…
    </div>
  ),
})

type Mode = "LESSON" | "EXERCISE" | "EVALUATION"

/** Une entrée du sommaire, telle que l'atelier l'affiche dans son panneau « Leçons ». */
export type EntreeSommaire = {
  id: string
  titre: string
  /** Module d'appartenance ; null pour un chapitre hors section. */
  module: string | null
  genre: "lecon" | "exercice" | "evaluation" | "autre"
  termine: boolean
  /** Nombre d'étapes du chapitre. 0 quand ce n'est pas une simulation. */
  etapes?: number
  /** Temps estimé, en secondes — même source que l'écran d'ouverture. */
  secondes?: number
}

type Props = {
  chapterId: string
  mode: Mode
  scenario: SimulationScenario
  /** Étape de reprise, fournie par l'API. */
  initialStep?: number
  /** Aperçu admin : aucune écriture de progression. */
  preview?: boolean
  onCompleted?: () => void
  /**
   * Atelier plein cadre : l'écran occupe toute la hauteur de son conteneur et
   * ne défile jamais. Faux en aperçu admin, où le player reste une carte dans
   * le flux de la page.
   */
  pleinCadre?: boolean
  /** Sommaire de la formation, pour le panneau « Leçons ». */
  sommaire?: EntreeSommaire[]
  onNaviguer?: (chapterId: string) => void
  /** Sortie de l'atelier : retour à la liste des chapitres. */
  onQuitter?: () => void
  /** Prise de notes du chapitre, tenue par la page apprenant. */
  note?: string
  onNote?: (valeur: string) => void
  notesHref?: string
}

/**
 * Rend une consigne : `**gras**` pour le vocabulaire métier, `==action==` pour le
 * geste à effectuer, et `` `code` `` pour les formules et références.
 *
 * Les quantificateurs sont NON GREEDY et acceptent n'importe quel caractère à
 * l'intérieur. Une version antérieure utilisait `==[^=]+==`, ce qui échouait dès
 * qu'une consigne contenait un signe égal — donc sur toutes les consignes citant
 * une formule, c'est-à-dire les plus importantes. Le balisage s'affichait alors en
 * clair à l'écran.
 */
const CONSIGNE_RE = /(\*\*[\s\S]+?\*\*|==[\s\S]+?==|`[^`]+`)/g

/**
 * Rendu RÉCURSIF du balisage : une action mise en évidence contient presque
 * toujours une formule ou une référence entre accents graves
 * (« ==saisissez `=3+2`== »). Un découpage à un seul niveau affichait les accents
 * graves en clair à l'intérieur des blocs.
 */
function renderConsigne(text: string, depth = 0): React.ReactNode[] {
  if (depth > 3) return [text]
  return text
    .split(CONSIGNE_RE)
    .filter(Boolean)
    .map((p, i) => {
      if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-neutral-900">
            {renderConsigne(p.slice(2, -2), depth + 1)}
          </strong>
        )
      }
      if (p.length > 4 && p.startsWith("==") && p.endsWith("==")) {
        return (
          <span key={i} className="font-medium text-emerald-700">
            {renderConsigne(p.slice(2, -2), depth + 1)}
          </span>
        )
      }
      if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) {
        return (
          <code
            key={i}
            className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[12.5px] text-neutral-900"
          >
            {p.slice(1, -1)}
          </code>
        )
      }
      return <span key={i}>{p}</span>
    })
}

function Consigne({ text }: { text: string }) {
  const nodes = useMemo(() => renderConsigne(text), [text])
  return <p className="text-[13.5px] leading-relaxed text-neutral-800">{nodes}</p>
}

/* ═══════════ COUCHES MONTÉES À LA DEMANDE ═══════════ */

type Besoins = { graphique: boolean; tcd: boolean; miseEnPage: boolean; macros: boolean }

/**
 * De quelles couches ce scénario a-t-il besoin ?
 *
 * On le déduit de TROIS sources — le classeur de départ, les onglets déclarés et
 * ce que les étapes demandent — plutôt que de monter les quatre couches partout.
 * Un module qui n'enseigne que des formules ne doit voir ni volet de champs, ni
 * feuille de papier : les 78 chapitres écrits avant ces couches doivent rendre
 * exactement comme avant.
 *
 * L'onglet `affichage` est volontairement ABSENT de la liste : il sert aussi à
 * figer les volets, et trois anciens chapitres le déclarent sans avoir la moindre
 * mise en page à montrer.
 */
function besoinsDe(scenario: SimulationScenario): Besoins {
  const b: Besoins = {
    graphique: Boolean(scenario.workbook.charts?.length),
    tcd: Boolean(scenario.workbook.pivots?.length),
    miseEnPage: Boolean(scenario.workbook.pageSetup),
    macros: Boolean(scenario.workbook.macros?.length),
  }
  for (const t of scenario.ribbon) {
    if (t === "graph-creation" || t === "graph-mise-en-forme" || t === "graph-analyse") b.graphique = true
    if (t === "tableau-creation") b.tcd = true
    if (t === "mise-en-page" || t === "entete-pied") b.miseEnPage = true
    if (t === "developpeur") b.macros = true
  }
  for (const s of scenario.steps) {
    if (s.setup?.chart || s.setup?.chartEdit) b.graphique = true
    if (s.setup?.pivot || s.setup?.pivotEdit) b.tcd = true
    if (s.setup?.pageSetup) b.miseEnPage = true
    if (s.setup?.macro) b.macros = true
    const t = s.action.type
    if (t === "EXPECT_CHART" || t === "SELECT_CHART_ELEMENT") b.graphique = true
    if (t === "EXPECT_PIVOT") b.tcd = true
    if (t === "EXPECT_PAGE_SETUP") b.miseEnPage = true
    if (t === "EXPECT_MACRO" || t === "RECORD_MACRO") b.macros = true
  }
  return b
}

/**
 * Étendue réellement occupée par la feuille active, en A1. La pagination en a
 * besoin pour savoir où le tableau s'arrête : sans elle, elle paginerait le
 * million de lignes qu'Univer offre et annoncerait des milliers de pages.
 */
function etendueUtile(scenario: SimulationScenario): string {
  const feuille = scenario.workbook.sheets[scenario.workbook.activeSheetIndex ?? 0]
  let maxRow = 0
  let maxCol = 0
  for (const ref of Object.keys(feuille?.cells ?? {})) {
    const p = parseRange(ref)
    if (!p) continue
    maxRow = Math.max(maxRow, p.endRow)
    maxCol = Math.max(maxCol, p.endCol)
  }
  return formatRange({ startRow: 0, startCol: 0, endRow: maxRow, endCol: maxCol })
}

/** Type de graphique attaché à un bouton de la galerie du ruban. */
const TYPE_PAR_CONTROLE: Record<string, ChartType> = {
  "ins-graph-histogramme": "histogramme",
  "ins-graph-barres": "barres",
  "ins-graph-courbes": "courbes",
  "ins-graph-secteurs": "secteurs",
  "ins-graph-aires": "aires",
  "ins-graph-nuage": "nuage",
}

/** Élément du graphique que chaque bouton « Ajouter un élément » fait basculer. */
const ELEMENT_PAR_CONTROLE: Record<string, keyof NonNullable<ChartState["elements"]>> = {
  "ins-graph-element-titre": "titre",
  "ins-graph-element-titres-axes": "titresAxes",
  "ins-graph-element-legende": "legende",
  "ins-graph-element-etiquettes": "etiquettes",
  "ins-graph-element-quadrillage": "quadrillage",
}

/** Index de la série sélectionnée, quand la sélection porte bien sur une série. */
function serieSelectionnee(chart: ChartState | null): number | null {
  const m = /^(?:serie|point):(\d+)/.exec(chart?.selectedElement ?? "")
  return m ? Number(m[1]) : null
}

/**
 * Cadre d'un graphique créé sans position déclarée : juste à DROITE de la plage
 * source. Le cadre par défaut du modèle recouvre les premières colonnes, donc les
 * données elles-mêmes — et un exercice qui demande « créez maintenant un second
 * graphique sur la même plage » devenait injouable, la plage étant sous le
 * graphique. Un scénario qui déclare son propre cadre garde le dernier mot.
 */
function cadreHorsSource(grid: GridApi, source: string): NonNullable<ChartState["frame"]> {
  const aire = parseRange(source)
  if (!aire) return { ...CADRE_DEFAUT }
  const apres = grid.getCellRect(`${columnIndexToLetter(aire.endCol + 1)}1`)
  const x = apres ? Math.round(apres.left) + 8 : CADRE_DEFAUT.x
  return { ...CADRE_DEFAUT, x, y: CADRE_DEFAUT.y }
}

export default function SimulationPlayer({
  chapterId,
  mode,
  scenario,
  initialStep = 0,
  preview,
  onCompleted,
  pleinCadre,
  sommaire,
  onNaviguer,
  onQuitter,
  note,
  onNote,
  notesHref,
}: Props) {
  const steps = scenario.steps
  const total = steps.length

  const [index, setIndex] = useState(() => Math.min(Math.max(initialStep, 0), Math.max(total - 1, 0)))
  const [gridReady, setGridReady] = useState(false)
  // Écran d'ouverture éditorial (Direction B validée par Samuel le 28/07) :
  // affiché seulement en DÉBUT de chapitre — une reprise en cours saute
  // l'intro. La grille se monte derrière pendant la lecture, ce qui masque le
  // temps de chargement d'Univer.
  const [introVue, setIntroVue] = useState(initialStep > 0)
  const carteRef = useRef<HTMLDivElement>(null)
  /**
   * Dimensions de la feuille — MESURÉES, jamais calculées par soustraction.
   *
   * Le plein écran navigateur a été retiré (choix Samuel du 29/07 : on reste
   * dans l'onglet, comme OnlineFormaPro, la barre du navigateur et la navigation
   * du LMS restent visibles). L'atelier occupe simplement toute la hauteur que
   * son conteneur lui donne, et la feuille prend ce qui reste une fois le
   * cockpit et la bande de consigne posés.
   *
   * L'ancienne formule « hauteur de l'écran moins 305 px » devenait fausse dès
   * qu'un élément changeait de taille : la consigne se retrouvait coupée et une
   * barre de défilement apparaissait — exactement ce que la vidéo montrait.
   * Un observateur de taille supprime la classe entière de ce défaut.
   */
  const zoneGrilleRef = useRef<HTMLDivElement>(null)
  /**
   * Conteneur de TOUT l'atelier — bureau compris.
   *
   * Le calque de démonstration vivait dans la zone de grille, que `DesktopLayer`
   * masque (`display:none`) tant que le classeur n'est pas ouvert : sur les
   * écrans du module 1 où l'on démarre Excel, la démonstration tournait
   * entièrement invisible. Elle se pose désormais ici, au-dessus du bureau comme
   * de la feuille.
   */
  const zoneAtelierRef = useRef<HTMLDivElement>(null)
  const [hauteurGrille, setHauteurGrille] = useState(380)
  const [largeurGrille, setLargeurGrille] = useState(0)
  useEffect(() => {
    const el = zoneGrilleRef.current
    if (!el) return
    const mesurer = () => {
      const r = el.getBoundingClientRect()
      if (r.height > 40) setHauteurGrille(Math.round(r.height))
      setLargeurGrille(Math.round(r.width))
    }
    mesurer()
    const obs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(mesurer) : null
    obs?.observe(el)
    window.addEventListener("resize", mesurer)
    return () => {
      obs?.disconnect()
      window.removeEventListener("resize", mesurer)
    }
  }, [introVue])
  useEffect(() => {
    // Univer ne réagit qu'au resize de la fenêtre : sans cela son canvas garde
    // l'ancienne hauteur et la feuille flotte dans un cadre trop grand.
    const t = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 90)
    return () => window.clearTimeout(t)
  }, [hauteurGrille])
  /**
   * Relais de consigne (traitement « A », choix Samuel du 29/07).
   *
   * Le passage d'étape se voyait « à peine » : la consigne était remplacée sans
   * transition, on pouvait franchir une étape sans s'en apercevoir. À chaque
   * avancée, la bande verdit brièvement, une coche remplace le numéro d'étape et
   * la nouvelle consigne entre par le bas.
   *
   * Rien de tout cela ne retarde la saisie : `applyStep` rend le focus à la
   * feuille immédiatement, l'animation se joue par-dessus.
   */
  /**
   * Essais ratés sur l'étape courante, et aide qui monte en puissance.
   *
   * Le nombre d'erreurs était déjà compté — mais seulement pour l'enregistrer.
   * Après une erreur ou après dix, l'apprenant voyait le même message rouge, et
   * 174 étapes d'action n'ont même pas d'indice à demander : celui qui bloque ne
   * pouvait ni comprendre, ni passer. Paliers retenus avec Samuel : 2 / 3 / 5.
   */
  const [essais, setEssais] = useState(0)
  const [demonstration, setDemonstration] = useState(false)
  /**
   * Gestes faits sans succès sur une étape jugée sur l'ÉTAT du classeur.
   *
   * Sur ces étapes — 466 au total : EXPECT_STATE, EXPECT_FORMAT, mise en page,
   * graphiques, tableaux croisés, macros, poste — le chemin est libre et un
   * geste faux n'est PAS compté comme erreur, à dessein. Conséquence non voulue :
   * `essais` restait à zéro, donc « Montrez-moi » n'apparaissait jamais. C'est
   * la cause du « des fois c'est absent » signalé par Samuel. Ce compteur-ci
   * n'entre pas dans le score : il ne sert qu'à proposer l'aide.
   */
  const [tatonnements, setTatonnements] = useState(0)
  /**
   * L'apprenant est-il resté longtemps sur l'étape sans la franchir ? Dernier
   * filet : certains blocages ne produisent AUCUN geste — on ne sait pas quoi
   * faire, donc on ne fait rien, et aucun compteur ne bouge. Au bout de 45 s,
   * l'aide se propose d'elle-même.
   */
  const [tropLong, setTropLong] = useState(false)
  /** Compteur de rejeux : sert de clé au calque, pour le faire repartir du début. */
  const [rejeu, setRejeu] = useState(0)
  /** La démonstration est-elle allée à son terme ? Conditionne « Revoir ». */
  const [demoFinie, setDemoFinie] = useState(false)
  const [relais, setRelais] = useState(0)
  const [relaisActif, setRelaisActif] = useState(false)
  useEffect(() => {
    if (!relais) return
    setRelaisActif(true)
    const t = window.setTimeout(() => setRelaisActif(false), 760)
    return () => window.clearTimeout(t)
  }, [relais])
  /** Carte « Étape franchie », affichée par-dessus la feuille à chaque avancée. */
  const [jalon, setJalon] = useState<{ n: number; texte: string | null } | null>(null)
  useEffect(() => {
    if (!jalon) return
    const t = window.setTimeout(() => setJalon(null), 1150)
    return () => window.clearTimeout(t)
  }, [jalon])
  /**
   * Poste de travail (direction C). Absent du scénario — le cas des 243
   * chapitres existants — l'atelier s'ouvre directement dans le classeur.
   */
  const posteActif = !!scenario.poste
  const [poste, setPoste] = useState<PosteState>(() =>
    posteInitial({
      excelOuvert: scenario.poste?.excelOuvert,
      classeur: scenario.poste?.classeur ?? null,
      fichiers: scenario.poste?.fichiers,
      modeles: scenario.poste?.modeles,
    }),
  )
  const posteRef = useRef(poste)
  posteRef.current = poste
  useEffect(() => {
    // Univer ne se rend pas dans un conteneur masqué : au retour dans le
    // classeur, il faut le prévenir que sa surface existe à nouveau. Plusieurs
    // rappels échelonnés, et non un seul : mesuré au banc, un unique resize à
    // 90 ms pouvait tomber avant que la fenêtre n'ait fini son animation
    // d'ouverture — le canvas restait alors à zéro et la grille invisible.
    if (poste.excel !== "classeur") return
    const t = [90, 320, 700].map((d) =>
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), d),
    )
    return () => t.forEach(window.clearTimeout)
  }, [poste.excel])
  /** Panneau latéral ouvert dans l'atelier : sommaire des leçons ou prise de notes. */
  const [panneau, setPanneau] = useState<"lecons" | "notes" | null>(null)
  useEffect(() => {
    if (!panneau) return
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanneau(null)
    }
    window.addEventListener("keydown", echap)
    return () => window.removeEventListener("keydown", echap)
  }, [panneau])
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  // Retour visuel DANS la grille (flash de réussite, secousse d'erreur, toast) :
  // le texte sous l'écran ne suffit pas, l'apprenant regarde la feuille.
  const [fx, setFx] = useState<{
    kind: "ok" | "ko"
    rect: { left: number; top: number; width: number; height: number } | null
    message?: string
    k: number
  } | null>(null)
  const fxTimerRef = useRef<number | null>(null)
  const [hintShown, setHintShown] = useState(mode === "LESSON")
  const [selection, setSelection] = useState(scenario.workbook.selection ?? "A1")
  const [formulaText, setFormulaText] = useState("")
  // Agrégats de la sélection, rafraîchis à chaque geste : c'est ce que la barre
  // d'état d'Excel affiche, et la leçon « calculs à la volée » repose dessus.
  const [stats, setStats] = useState<ReturnType<GridApi["getSelectionStats"]>>(null)
  const [finished, setFinished] = useState(false)
  // Saisie en cours dans la zone Nom. null = on y affiche la sélection courante.
  const [nameBoxDraft, setNameBoxDraft] = useState<string | null>(null)
  const [sheets, setSheets] = useState<Array<{ name: string; active: boolean }>>([])

  /* ── Modèles des modules 13, 17, 18, 20 et 27 ──────────────────────────── */

  const besoins = useMemo(() => besoinsDe(scenario), [scenario])
  const etendue = useMemo(() => etendueUtile(scenario), [scenario])

  // Chaque modèle est doublé d'une référence. `handleControl` et les rappels des
  // couches sont mémoïsés sur `handleAction` seul : sans ces références ils
  // liraient l'état du premier rendu, et le deuxième clic repartirait du premier
  // graphique. Le même schéma que `stepRef`, pour la même raison.
  const [graphique, setGraphique] = useState<ChartState | null>(null)
  const graphiqueRef = useRef<ChartState | null>(null)
  const poserGraphique = useCallback((g: ChartState | null) => {
    graphiqueRef.current = g
    setGraphique(g)
  }, [])

  const [tcd, setTcd] = useState<EtatTcd | null>(null)
  const tcdRef = useRef<EtatTcd | null>(null)
  // Plage occupée par la pose précédente : `posterTcd` s'en sert pour effacer ce
  // que le nouveau tableau n'occupe plus. Sans elle, un tableau qui rétrécit
  // laisse des chiffres fantômes dans la feuille.
  const posePivotRef = useRef<PosePivot | null>(null)

  const [reglages, setReglages] = useState<PageSetupState>(() =>
    appliquerReglages(REGLAGES_PAR_DEFAUT, scenario.workbook.pageSetup ?? {}),
  )
  const reglagesRef = useRef<PageSetupState>(reglages)
  const poserReglages = useCallback((r: PageSetupState) => {
    reglagesRef.current = r
    setReglages(r)
  }, [])

  const [macros, setMacros] = useState<MacroState[]>(() =>
    (scenario.workbook.macros ?? []).map((m) => ({ ...m, statements: [...m.statements] })),
  )
  const macrosRef = useRef<MacroState[]>(macros)
  const [macroCourante, setMacroCourante] = useState<string | null>(
    () => scenario.workbook.macros?.[0]?.name ?? null,
  )
  const macroCouranteRef = useRef<string | null>(macroCourante)
  // Code affiché dans l'éditeur. Il vit à part du modèle : l'apprenant le
  // modifie librement, et ce n'est qu'à l'exécution qu'on le relit.
  const [codeMacro, setCodeMacro] = useState("")
  const codeMacroRef = useRef("")
  const [enregistrement, setEnregistrement] = useState<EtatEnregistrement | null>(null)
  const enregistrementRef = useRef<EtatEnregistrement | null>(null)
  // Relais ruban → panneau des macros (voir la prop `commande` de MacroPanel).
  const [commandeMacro, setCommandeMacro] = useState<{ nonce: number; controle: string } | null>(null)

  const gridRef = useRef<GridApi | null>(null)
  // Compteurs à envoyer au serveur : cumulés puis remis à zéro à chaque envoi.
  const sessionSignaleeRef = useRef(false)
  const pendingRef = useRef({ errors: 0, hints: 0, seconds: 0 })
  // Réussite au premier essai, par étape : c'est la base du score d'évaluation.
  const firstTryRef = useRef<Record<string, boolean>>({})
  const attemptedRef = useRef<Set<string>>(new Set())
  /**
   * Étape déjà réussie, en attente du changement d'écran. Un même geste produit
   * parfois DEUX observations — un clic de panneau signale le bouton puis le
   * réglage obtenu — et la seconde, arrivant après la réussite, comptait une
   * faute sur une étape pourtant validée.
   */
  const resoluRef = useRef(false)
  /**
   * ÉCHÉANCE du verrou de démonstration, en millisecondes.
   *
   * Pendant que la démonstration agit — écriture de cellules, pression d'un
   * bouton, création d'un nom de plage — les observations du classeur sont
   * ignorées : sans cela, poser la réponse validerait l'étape et ferait sauter à
   * la suivante en pleine explication.
   *
   * C'était un simple booléen, et cela ne tenait pas dès que deux effets se
   * chevauchaient : la minuterie du premier remettait le verrou à faux alors que
   * le second était encore en cours, et l'observation retardée du bouton (220 ms
   * après le clic, le temps qu'Univer applique le style) passait au travers.
   * L'étape se validait toute seule — bandeau « C'est exact » au milieu de la
   * démonstration, et une étape comptée réussie du premier coup sans que
   * l'apprenant ait rien fait. Une échéance ne peut pas être raccourcie par
   * quelqu'un d'autre.
   */
  const verrouDemoRef = useRef(0)
  const verrouillerDemo = useCallback((ms: number) => {
    verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + ms)
  }, [])
  /**
   * Cellules touchées par une démonstration jouée sur un écran de LECTURE, avec
   * leur valeur d'avant. Une lecture illustre : elle ne doit pas laisser le
   * classeur modifié pour l'étape suivante.
   */
  const avantDemoRef = useRef<Record<string, string>>({})

  const step: SimulationStep | undefined = steps[index]
  /**
   * Le décor du poste (bureau, corbeille, barre des tâches) n'est montré que
   * quand l'étape en cours s'en sert. Sur les leçons du module 1, seules les
   * premières et les dernières étapes sortent du classeur : garder le bureau
   * visible pendant la saisie ne montrait rien et brouillait la lecture.
   */
  const decorPoste =
    posteActif &&
    (poste.excel !== "classeur" ||
      poste.boite !== "aucune" ||
      poste.menu ||
      step?.action.type === "EXPECT_POSTE" ||
      (!!step?.setup?.poste && step.setup.poste.excel !== undefined && step.setup.poste.excel !== "classeur"))
  const stepRef = useRef<SimulationStep | undefined>(step)
  stepRef.current = step

  /* ── Lecture du classeur pour les modèles ──────────────────────────────── */

  /** Lecture d'une cellule, signature attendue par le moteur de tableaux croisés. */
  const lireCellule = useCallback((ref: string): unknown => gridRef.current?.getValue(ref) ?? null, [])

  /** Lecture d'une plage à plat, ligne par ligne : ce qu'attend le modèle graphique. */
  const lirePlage = useCallback(
    (ref: string): unknown[] => cellsOf(ref).map((c) => gridRef.current?.getValue(c) ?? null),
    [],
  )

  /**
   * Pose le tableau croisé dans la feuille. `effacer` est OBLIGATOIRE : poser un
   * filtre de rapport décale le tableau de deux lignes comme dans Excel, et sans
   * effacement la pose précédente laisserait des chiffres fantômes.
   */
  const poserTcdDansFeuille = useCallback((etat: EtatTcd | null) => {
    tcdRef.current = etat
    setTcd(etat)
    const grid = gridRef.current
    if (!etat || !grid) return
    const pose = posterTcd(etat, calculerTcd(etat), { effacer: posePivotRef.current?.range })
    posePivotRef.current = pose
    grid.applyCells(pose.cells)
  }, [])

  // Onglet du ruban : l'étape peut en imposer un, mais l'apprenant doit pouvoir
  // en changer librement. Explorer le ruban n'est pas une faute.
  const [onglet, setOnglet] = useState<RibbonTab>(
    step?.setup?.ribbon?.activeTab ?? scenario.ribbon[0] ?? "accueil"
  )
  /** Onglet courant, lisible sans créer de dépendance — voir le plan de démonstration. */
  const ongletRef = useRef(onglet)
  ongletRef.current = onglet

  /* ── Mise en place de l'étape ──────────────────────────────────────────── */

  /**
   * Pose les modèles déclarés par une étape : graphique, tableau croisé, mise
   * en page, macro.
   *
   * `passe` distingue les deux usages. Sur l'étape COURANTE, un modèle que
   * l'étape va justement juger ne doit pas être posé — elle serait répondue
   * avant que l'apprenant ne fasse quoi que ce soit. Sur une étape DÉJÀ FAITE
   * qu'on rejoue, c'est l'inverse : son résultat fait partie du décor, il faut
   * le poser.
   */
  const appliquerModeles = useCallback(
    (s: SimulationStep, passe: boolean) => {
      const juge = passe ? "" : s.action.type
      if (s.setup?.chart && juge !== "EXPECT_CHART" && juge !== "CLICK_CONTROL") {
        poserGraphique(creerGraphique(s.setup.chart))
      }
      if (s.setup?.chartEdit && graphiqueRef.current && juge !== "EXPECT_CHART" && juge !== "CLICK_CONTROL") {
        poserGraphique(modifierGraphique(graphiqueRef.current, s.setup.chartEdit))
      }
      if (s.setup?.pivot && juge !== "EXPECT_PIVOT") {
        poserTcdDansFeuille(creerTcd(s.setup.pivot, lireCellule))
      }
      if (s.setup?.pivotEdit && tcdRef.current && juge !== "EXPECT_PIVOT") {
        poserTcdDansFeuille(modifierTcd(tcdRef.current, s.setup.pivotEdit, lireCellule))
      }
      if (s.setup?.pageSetup && juge !== "EXPECT_PAGE_SETUP") {
        poserReglages(appliquerReglages(reglagesRef.current, s.setup.pageSetup))
      }
      if (s.setup?.macro && juge !== "EXPECT_MACRO") {
        const m = s.setup.macro
        const suite = macrosRef.current.some((x) => x.name === m.name)
          ? macrosRef.current.map((x) => (x.name === m.name ? { ...x, ...m, statements: m.statements ?? x.statements } : x))
          : [...macrosRef.current, { statements: [], ...m }]
        macrosRef.current = suite
        setMacros(suite)
        macroCouranteRef.current = m.name
        setMacroCourante(m.name)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const applyStep = useCallback(
    (s: SimulationStep | undefined) => {
      const grid = gridRef.current
      if (!grid || !s) return
      // Une étape qui exige un onglet précis le reprend ; sinon on laisse
      // l'apprenant sur celui qu'il consultait.
      if (s.setup?.ribbon?.activeTab) setOnglet(s.setup.ribbon.activeTab)
      if (s.setup?.cells) grid.applyCells(s.setup.cells)
      if (s.setup?.selection) {
        grid.setSelection(s.setup.selection)
        setSelection(s.setup.selection)
      }

      /* Modèles graphique / tableau croisé / impression / macro.
       *
       * Un `setup` de modèle décrit le RÉSULTAT du geste de l'étape — comme
       * `setup.cf` décrit la règle que le bouton de mise en forme
       * conditionnelle appliquera. On ne l'applique donc PAS à l'ouverture de
       * l'étape quand c'est ce modèle qui sera jugé : l'étape serait répondue
       * avant que l'apprenant n'ait rien fait, et n'importe quel réglage sans
       * rapport la validerait ensuite. C'est exactement l'avertissement de la
       * couche de mise en page : `onChange` propose, l'étape n'est satisfaite
       * que par le geste attendu.
       *
       * Le cas inverse — un `setup` de modèle sur une étape qui juge autre
       * chose — sert à planter le décor, et là on applique tout de suite.
       */
      appliquerModeles(s, false)
      resoluRef.current = false
      // Verrou d'édition, calibré selon ce que l'étape demande :
      //  - saisie ciblée : seule la cellule attendue est modifiable, ce qui évite
      //    qu'un apprenant remplisse une cellule hors sujet et casse la suite ;
      //  - validation par l'état : AUCUNE restriction, sinon l'apprenant ne peut
      //    ni tirer la poignée de recopie ni coller — donc l'étape est injouable.
      //    C'est tout l'intérêt de ce mode : le chemin est libre ;
      //  - lecture ou clic : rien à saisir, on verrouille par précaution.
      if (s.action.type === "TYPE" && s.action.target !== "formula-bar") {
        grid.setEditableCells([s.action.target])
      } else if (
        s.action.type === "EXPECT_STATE" ||
        s.action.type === "EXPECT_FORMAT" ||
        s.action.type === "SORT_RANGE" ||
        s.action.type === "FILTER_COLUMN"
      ) {
        // Trier ou filtrer réécrit des lignes entières : le verrou de cellules
        // faisait échouer la commande en silence, l'étape restait injouable.
        grid.setEditableCells(null)
      } else {
        grid.setEditableCells([])
      }
      // La barre de formule reflète la cellule sélectionnée, comme dans Excel.
      // Elle était systématiquement vidée à chaque étape : une leçon qui dit
      // « la barre de formule affiche toujours =3+2 » la montrait vide, et
      // l'illustration qui la désigne pointait sur du néant.
      const refFormule = s.setup?.selection
      setFormulaText(refFormule ? (grid.getFormula(refFormule) ?? "") : "")
      // Les cellules que l'étape vient de poser ne sont lisibles qu'après le
      // recalcul d'Univer (60-120 ms mesurés) : on relit une fois.
      if (refFormule) {
        window.setTimeout(() => {
          const g = gridRef.current
          if (g && stepRef.current?.id === s.id) setFormulaText(g.getFormula(refFormule) ?? "")
        }, 320)
      }
      setVerdict(null)
      avantDemoRef.current = {}
      setHintShown(mode === "LESSON")
      // Chaque étape repart d'une ardoise vierge : l'aide progressive se
      // rejoue depuis le premier palier.
      setEssais(0)
      setDemonstration(false)
      // Le focus revient à la grille : sans cela, après un clic sur « Suivant »
      // ou sur un bouton du ruban, l'apprenant tape dans le vide jusqu'à ce qu'il
      // pense à recliquer dans une cellule.
      grid.focus()
      if (s.setup?.selection) setStats(grid.getSelectionStats(s.setup.selection))
      setNameBoxDraft(null)
      setSheets(grid.getSheets())
    },
    [mode, lireCellule, poserGraphique, poserReglages, poserTcdDansFeuille, appliquerModeles],
  )

  /**
   * REPRISE D'UN CHAPITRE EN COURS : reconstituer le travail déjà fait.
   *
   * Le player rouvre à `attempt.currentStep`, mais `applyStep` ne pose que le
   * `setup` de CETTE étape-là. Tout ce que l'apprenant avait saisi aux étapes
   * précédentes n'existe dans aucun `setup` : il retombait sur le classeur
   * initial. L'exercice « Créer un classeur de zéro » repris à l'étape 4
   * demandait ainsi le total des inscriptions sur une feuille VIDE — étape
   * impossible, et aucune valeur ne pouvait la valider. Mesuré sur le corpus :
   * 136 chapitres sur 246 ont au moins une étape dans ce cas.
   *
   * On rejoue donc le RÉSULTAT déclaré des étapes déjà franchies. C'est une
   * reconstitution, pas la copie exacte du classeur de l'apprenant : quand une
   * étape laisse le chemin libre sans déclarer de valeur, la cellule reste
   * vide. Elle suffit à rendre l'étape courante jouable et cohérente.
   *
   * Le rejeu doit être INVISIBLE : aucune animation, aucune démonstration,
   * aucune validation. Les écritures passent par `applyCells`, qui ne fait
   * qu'écrire ; le verrou d'observation couvre le `stateChange` que la grille
   * émet 350 ms plus tard, sinon l'étape courante se croirait franchie.
   */
  const rejouerAvant = useCallback(
    (jusqua: number) => {
      const grid = gridRef.current
      if (!grid || jusqua <= 0) return
      // Large : le débounce de la grille est à 350 ms, et les modèles posés
      // ci-dessous écrivent eux aussi dans la feuille.
      verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + 2000)
      for (let k = 0; k < jusqua && k < steps.length; k++) {
        const s = steps[k]
        if (!s) continue
        if (s.setup?.cells) grid.applyCells(s.setup.cells)
        const a = s.action
        const ecrites: Record<string, CellState> = {}
        if (a.type === "TYPE" && a.target !== "formula-bar" && a.accept?.length) {
          // La première écriture acceptée est la réponse de référence : c'est
          // celle que la démonstration montre déjà quand l'apprenant bloque.
          const rep = a.accept[0]
          ecrites[a.target] = rep.trim().startsWith("=") ? { f: rep } : { v: rep }
        }
        if (a.type === "EXPECT_STATE") {
          for (const [ref, att] of Object.entries(a.cells)) {
            const formule = att.f ?? att.anyOf?.[0]
            if (formule && formule.trim().startsWith("=")) ecrites[ref] = { f: formule }
            else if (formule !== undefined) ecrites[ref] = { v: formule }
            else if (att.v !== undefined) ecrites[ref] = { v: att.v }
            // Attente vide = l'étape effaçait la cellule : on l'efface aussi.
            else ecrites[ref] = { v: "" }
          }
        }
        if (Object.keys(ecrites).length) grid.applyCells(ecrites)
        if (a.type === "DEFINE_NAME" && a.ref) grid.defineName(a.name, a.ref)
        // Une étape déjà faite a produit son modèle : on le pose.
        appliquerModeles(s, true)
      }
    },
    [steps, appliquerModeles],
  )

  const handleReady = useCallback(
    (api: GridApi) => {
      gridRef.current = api
      api.applyWorkbook(scenario.workbook)
      // Les modèles déclarés dans le classeur existent AVANT la première étape :
      // le module 17 ouvre sa première leçon sur un graphique déjà posé, et le
      // module 20 sur un tableau croisé déjà calculé.
      const g = scenario.workbook.charts?.[0]
      if (g) poserGraphique(creerGraphique(g))
      const p = scenario.workbook.pivots?.[0]
      if (p) poserTcdDansFeuille(creerTcd(p, (ref) => api.getValue(ref)))
      const m = scenario.workbook.macros?.[0]
      if (m) {
        codeMacroRef.current = genererCode(m)
        setCodeMacro(codeMacroRef.current)
      }
      setGridReady(true)
      // D'abord le travail des étapes déjà franchies, ensuite la mise en place
      // de l'étape courante — dont le `setup` doit primer sur la reconstitution.
      rejouerAvant(index)
      applyStep(steps[index])
    },
    // Volontairement figé sur le montage : la grille se monte une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    // L'état du poste imposé par l'étape s'applique AUSSI hors `applyStep` :
    // celui-ci attend que la grille soit prête, or une leçon qui démarre Excel
    // fermé n'a pas encore de grille montée au moment de la reprise.
    const impose = step?.setup?.poste
    if (posteActif && impose) setPoste((p) => ({ ...p, ...impose }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, posteActif])

  useEffect(() => {
    // Le verrou de résolution se lève à CHAQUE étape, que la grille soit prête
    // ou non. Il ne vivait que dans `applyStep`, appelé seulement une fois
    // `gridReady` vrai : sur un chapitre qui démarre Excel fermé, la grille
    // n'est pas encore montée et le player se figeait après la première étape,
    // toutes les observations suivantes étant ignorées en silence.
    resoluRef.current = false
    // La trace d'audit des repères repart à zéro : hors production seulement.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined")
      (window as any).__SIM_DEMO_VUS = {}
    setRejeu(0)
    setDemoFinie(false)
    setTatonnements(0)
    setTropLong(false)
    if (gridReady) applyStep(step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, gridReady])

  useEffect(() => {
    if (!step || finished || mode === "EVALUATION") return
    const t = window.setTimeout(() => setTropLong(true), 45_000)
    return () => window.clearTimeout(t)
  }, [step, index, finished, mode])

  /**
   * Un écran « À lire » joue sa démonstration TOUT SEUL.
   *
   * Elle attendait un clic sur « ▶ Voir le geste », que personne ne voyait :
   * l'apprenant lisait un paragraphe devant un écran figé, et sur la plupart des
   * écrans il n'y avait même rien à cliquer. Elle démarre maintenant à
   * l'ouverture de l'étape, et le bouton « ↻ Revoir » reste disponible ensuite.
   *
   * Le délai laisse le temps de lire la consigne avant que ça bouge, et laisse
   * la grille finir de se poser — un démarrage immédiat jouerait sur un écran
   * pas encore mesuré.
   */
  useEffect(() => {
    if (!step || finished) return
    // La page de garde est encore là : la démonstration se jouait PAR-DESSUS
    // « Commencer la leçon », bulles et curseur compris, avant que l'apprenant
    // ait seulement ouvert le chapitre (retour Samuel du 30/07/2026).
    if (!introVue) return
    if (step.action.type !== "READ" || !step.montrer?.length) return
    const t = window.setTimeout(() => {
      setDemoFinie(false)
      setDemonstration(true)
    }, 1200)
    return () => window.clearTimeout(t)
  }, [step, index, finished, introVue])

  /**
   * Audit : forcer la démonstration sans passer par les seuils de l'apprenant.
   * Hors production seulement, et seulement si l'auditeur l'a demandé — voir la
   * note sur les crochets d'audit plus bas. `applyStep` remet `demonstration` à
   * faux à chaque étape, donc le forçage se rejoue ici, après lui.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (typeof window === "undefined" || !(window as any).__SIM_FORCE_DEMO) return
    if (!step || finished || !gridReady) return
    // Volontairement TARDIF. À 60 ms, certains services d'Univer — le collage en
    // particulier — ne sont pas encore prêts et la commande échoue en silence :
    // l'audit voyait un défaut là où il n'y en avait pas. Un apprenant, lui,
    // n'atteint jamais l'aide avant 3 erreurs, 6 tâtonnements ou 45 secondes.
    const t = window.setTimeout(() => setDemonstration(true), 1500)
    return () => window.clearTimeout(t)
  }, [step, index, finished, gridReady])

  /* ── Persistance ───────────────────────────────────────────────────────── */

  const persist = useCallback(
    async (opts: { step: number; finish?: boolean; score?: number }) => {
      if (preview) return
      const p = pendingRef.current
      pendingRef.current = { errors: 0, hints: 0, seconds: 0 }
      // Une seule remontée par session porte `newSession` : sans ce marqueur le
      // serveur ne peut pas distinguer l'ouverture d'un atelier d'un simple
      // enregistrement d'étape, et comptait donc toujours une seule session.
      const premiere = !sessionSignaleeRef.current
      sessionSignaleeRef.current = true
      try {
        await fetch(`/api/simulations/${chapterId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentStep: opts.step,
            errorDelta: p.errors,
            hintDelta: p.hints,
            timeDeltaSeconds: p.seconds,
            finish: opts.finish ?? false,
            score: opts.score,
            newSession: premiere,
          }),
          keepalive: true,
        })
      } catch {
        // Une progression non enregistrée ne doit jamais bloquer l'apprenant :
        // il continue, et le prochain envoi rattrapera l'écart.
      }
    },
    [chapterId, preview],
  )

  // Temps réellement passé, pour les preuves de parcours. Compté seulement quand
  // l'onglet est visible, comme le tracker vidéo du LMS.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") pendingRef.current.seconds += 5
    }, 5000)
    return () => window.clearInterval(id)
  }, [])

  /* ── Avancement ────────────────────────────────────────────────────────── */

  const goNext = useCallback(() => {
    const next = index + 1
    if (next >= total) {
      const score = mode === "EVALUATION" ? computeScore(steps, firstTryRef.current) : undefined
      setFinished(true)
      void persist({ step: index, finish: true, score })
      onCompleted?.()
      return
    }
    // Le relais ne se joue qu'en AVANÇANT : reculer n'est pas une réussite.
    setRelais((r) => r + 1)
    // Jalon d'étape franchie (choix Samuel : à CHAQUE étape, pas seulement en
    // fin de chapitre). Le rappel du geste est déduit de l'action — écrire une
    // phrase sur mesure aurait voulu dire en rédiger 1 872.
    const courante = steps[index]
    setJalon({ n: index + 1, texte: courante ? resumerFait(courante.action) : null })
    setIndex(next)
    void persist({ step: next })
  }, [index, total, mode, steps, persist, onCompleted])

  /**
   * Retour à l'étape précédente (choix Samuel du 29/07 : « oui, avec un
   * avertissement »).
   *
   * `applyStep` étant rejoué à chaque changement d'index, reculer suffit à
   * remettre en place le point de départ de l'étape visée — sa sélection, son
   * onglet de ruban et ses éventuelles cellules de départ. Le reste du classeur
   * est laissé intact : on ne rejoue PAS la leçon depuis le début, car les
   * cellules écrites par l'apprenant aux étapes précédentes ne viennent d'aucun
   * `setup` et seraient perdues — l'étape suivante deviendrait injouable.
   *
   * Interdit en évaluation notée : le barème compte les réussites au premier
   * essai, et OnlineFormaPro ne propose pas non plus de pager en évaluation.
   */
  const reculPossible = index > 0 && mode !== "EVALUATION" && !finished
  const [reculDemande, setReculDemande] = useState(false)
  const reculer = useCallback(() => {
    const cible = index - 1
    if (cible < 0) return
    setReculDemande(false)
    setIndex(cible)
    void persist({ step: cible })
  }, [index, persist])

  /**
   * Retour visuel ancré à la cible de l'étape : flash vert à la réussite,
   * secousse rouge + message à l'erreur. Le rectangle vient des métriques
   * réelles de la grille (même mécanique que le halo d'aide) ; sans cible
   * mesurable, seul le toast centré s'affiche.
   */
  const lancerFx = useCallback((s: SimulationStep, kind: "ok" | "ko", message?: string) => {
    const grid = gridRef.current
    const a = s.action as Record<string, unknown> & { type: string }
    const refs: string[] =
      a.type === "EXPECT_STATE"
        ? Object.keys((a.cells as Record<string, unknown>) ?? {})
        : (() => {
            const cible =
              a.type === "TYPE" ? (a.target === "formula-bar" ? null : ((a.target as string) ?? null))
              : a.type === "CLICK_CELL" ? (a.cell as string)
              : a.type === "GOTO_REF" ? (a.ref as string)
              : a.type === "DRAG_RANGE" ? (a.range as string)
              : a.type === "DEFINE_NAME" ? ((a.ref as string) ?? null)
              : null
            return cible ? cible.split(":") : []
          })()
    let rect: { left: number; top: number; width: number; height: number } | null = null
    if (grid && refs.length) {
      const rects = refs
        .map((r) => grid.getCellRect(r))
        .filter(Boolean) as { left: number; top: number; width: number; height: number }[]
      if (rects.length) {
        const left = Math.min(...rects.map((r) => r.left))
        const top = Math.min(...rects.map((r) => r.top))
        rect = {
          left,
          top,
          width: Math.max(...rects.map((r) => r.left + r.width)) - left,
          height: Math.max(...rects.map((r) => r.top + r.height)) - top,
        }
      }
    }
    if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current)
    setFx({ kind, rect, message, k: Date.now() })
    fxTimerRef.current = window.setTimeout(() => setFx(null), kind === "ok" ? 1400 : 2800)
  }, [])

  const handleAction = useCallback(
    (observed: ObservedAction) => {
      if (!step || finished || resoluRef.current) return
      // Le verrou de démonstration ne concerne QUE les observations du classeur :
      // il évite qu'un geste joué à la place de l'apprenant valide l'étape. Un
      // « suivant » est au contraire une intention explicite de l'apprenant.
      // Sans cette exception, le bouton « J'ai compris, continuer » d'un écran de
      // lecture était mort pendant toute la durée du verrou — et comme la remise
      // en place du classeur en repose un à la fin de la démonstration, le clic
      // qui suit immédiatement une démonstration ne faisait rien du tout.
      if (observed.kind !== "next" && Date.now() < verrouDemoRef.current) return

      // L'enregistreur de macros écoute les gestes RÉELS, ceux que la grille
      // signale déjà. Un second chemin d'observation finirait par transcrire
      // autre chose que ce que l'apprenant a fait.
      const enreg = enregistrementRef.current
      if (enreg?.actif) {
        let geste: GesteMacro | null = null
        if (observed.kind === "typed") geste = gesteDepuisSaisie(observed.target, observed.text)
        else if (observed.kind === "cellClick") geste = { kind: "select", ref: observed.cell }
        else if (observed.kind === "dragRange") geste = { kind: "select", ref: observed.range }
        if (geste) {
          const suite = transcrire(enreg, geste)
          enregistrementRef.current = suite
          setEnregistrement(suite)
        }
      }

      // Un tableau croisé ne se recalcule pas tout seul : dès que l'apprenant
      // corrige une cellule de la plage source, le tableau devient PÉRIMÉ et
      // garde ses anciens chiffres, comme dans Excel. C'est ce qui donne son sens
      // à la leçon « cliquez sur Actualiser » — sans cela le bandeau d'alerte
      // n'apparaît jamais et l'étape reste injouable.
      const tcdCourant = tcdRef.current
      if (tcdCourant && !tcdCourant.stale && (observed.kind === "typed" || observed.kind === "stateChange")) {
        if (sourceAChange(tcdCourant, lireCellule)) {
          const perime = { ...tcdCourant, stale: true }
          tcdRef.current = perime
          setTcd(perime)
        }
      }

      // Reflet immédiat de la sélection dans la zone Nom et la barre de formule.
      if (observed.kind === "cellClick") {
        setSelection(observed.cell)
        setFormulaText(gridRef.current?.getFormula(observed.cell) ?? "")
        setStats(gridRef.current?.getSelectionStats(observed.cell) ?? null)
      } else if (observed.kind === "dragRange") {
        setSelection(observed.range)
        setStats(gridRef.current?.getSelectionStats(observed.range) ?? null)
      } else if (observed.kind === "stateChange") {
        setStats(gridRef.current?.getSelectionStats() ?? null)
      } else if (observed.kind === "typed") {
        // Après validation, Excel descend d'une cellule : la zone Nom et la barre
        // de formule doivent suivre, sinon elles affichent la cellule précédente.
        const now = gridRef.current?.getSelection()
        if (now) {
          setSelection(now)
          setFormulaText(gridRef.current?.getFormula(now) ?? "")
          setStats(gridRef.current?.getSelectionStats(now) ?? null)
        }
      }

      // Pour une étape validée sur l'état du classeur, c'est ici qu'on lit les
      // cellules attendues : `validateStep` reste pur et réutilisable côté serveur.
      let enriched = observed
      if (observed.kind === "stateChange" && step.action.type === "EXPECT_STATE") {
        const grid = gridRef.current
        const readings: Record<string, { formula: string; value: unknown }> = {}
        if (grid) {
          for (const ref of Object.keys(step.action.cells)) {
            readings[ref] = { formula: grid.getFormula(ref), value: grid.getValue(ref) }
          }
        }
        enriched = { kind: "stateChange", readings }
      }

      const v = validateStep(step, enriched)
      if (v.ok) {
        if (!attemptedRef.current.has(step.id)) firstTryRef.current[step.id] = true
        resoluRef.current = true
        setVerdict({ ok: true })
        // « ✓ C'est exact » félicite une RÉUSSITE. Sur un écran « À comprendre »
        // l'apprenant n'a rien fait d'exact : il a cliqué « J'ai compris ». Le
        // bandeau vert et son flash s'affichaient quand même, et félicitaient un
        // geste qui n'existe pas (retour Samuel du 30/07/2026).
        if (step.action.type !== "READ") lancerFx(step, "ok")
        // Petite pause pour que l'apprenant voie le résultat de son action avant
        // que l'écran ne change.
        window.setTimeout(goNext, 550)
        return
      }

      // Une action qui n'est simplement pas encore celle attendue (un clic de
      // repérage, par exemple) ne doit pas être comptée comme une faute.
      //
      // Les modèles des modules 13, 17, 18, 20 et 27 se valident sur leur ÉTAT,
      // exactement comme `EXPECT_STATE` : un réglage se construit souvent en
      // plusieurs gestes — centrer horizontalement PUIS verticalement, poser un
      // champ en Filtres PUIS choisir sa valeur — et compter une faute à chaque
      // état intermédiaire punirait un apprenant qui fait juste. On explique tout
      // de même ce qui manque, quand le juge sait le dire.
      const surEtat =
        observed.kind === "stateChange" ||
        observed.kind === "chartChange" ||
        observed.kind === "pivotChange" ||
        observed.kind === "pageSetupChange" ||
        observed.kind === "macroChange"
      // Se déplacer n'est pas se tromper : cliquer une cellule, sélectionner une
      // plage ou sauter par la zone Nom ne compte comme faute que si l'étape
      // jugeait précisément ce geste. Sans cela, l'apprenant qui atteint par la
      // zone Nom une plage située hors de l'écran — le seul chemin praticable sur
      // un tableau long — écopait d'une erreur pour s'être déplacé.
      const navigation =
        observed.kind === "cellClick" || observed.kind === "dragRange" || observed.kind === "gotoRef"
      // Une étape de LECTURE ne peut pas être ratée : il n'y a rien à y faire.
      // Taper ou cliquer par réflexe y comptait une faute — au score, et avec
      // un verdict rouge « ce n'est pas bon » sous les yeux de l'apprenant.
      const isRealMistake =
        step.action.type === "READ"
          ? false
          : !navigation && !surEtat
          ? true
          : (observed.kind === "cellClick" && step.action.type === "CLICK_CELL") ||
            (observed.kind === "dragRange" && step.action.type === "DRAG_RANGE") ||
            (observed.kind === "gotoRef" && step.action.type === "GOTO_REF")
      if (isRealMistake) {
        attemptedRef.current.add(step.id)
        firstTryRef.current[step.id] = false
        pendingRef.current.errors += 1
        setEssais((n) => {
          const suivant = n + 1
          // Palier 2 : l'indice s'affiche de lui-même, y compris en exercice où
          // il se demande d'ordinaire. Palier 5 : la démonstration se déclenche.
          if (suivant >= 2) setHintShown(true)
          if (suivant >= 5) setDemonstration(true)
          return suivant
        })
        setVerdict(v)
        lancerFx(step, "ko", v.message)
      } else if (step.action.type === "READ") {
        // Rappel neutre, sans verdict rouge ni secousse : on indique juste où
        // cliquer pour continuer. Réservé aux gestes VOLONTAIRES : la mise en
        // place de l'étape émet un `stateChange` qui affichait le rappel avant
        // même que l'apprenant ait touché quoi que ce soit.
        if (observed.kind !== "stateChange") {
          setVerdict({ ok: false, reason: "read_step_action", message: v.message })
        }
      } else {
        // TOUT geste qui n'a pas fait avancer l'étape compte comme tâtonnement,
        // qu'il s'agisse d'un déplacement ou d'un réglage intermédiaire. Il ne
        // pénalise pas le score — il sert uniquement à savoir quand proposer
        // l'aide. Sans ce compteur, sur une étape jugée sur l'état ou sur un
        // simple clic de repérage, `essais` restait à zéro et « Montrez-moi »
        // n'apparaissait JAMAIS : c'est ce que Samuel voyait comme une
        // démonstration « absente ».
        setTatonnements((n) => {
          const suivant = n + 1
          if (suivant >= 3) setHintShown(true)
          return suivant
        })
        if (surEtat && observed.kind !== "stateChange" && v.message) setVerdict(v)
      }
    },
    [step, finished, goNext, lireCellule, lancerFx],
  )

  /* ── Observations des modèles ──────────────────────────────────────────── */

  /**
   * Un geste sur un modèle produit DEUX observations possibles, et il faut
   * n'émettre que celle que l'étape attend : quand elle juge le bouton, un
   * `chartChange` la ferait échouer ; quand elle juge l'état, un `control`
   * parasite en ferait autant. C'est la règle que suit déjà le tri.
   */
  const emisPourControle = useCallback(
    (controlId: string | undefined): boolean => {
      if (!controlId) return false
      if (stepRef.current?.action.type !== "CLICK_CONTROL") return false
      handleAction({ kind: "control", control: controlId, channel: "ribbon" })
      return true
    },
    [handleAction],
  )

  const emettreGraphique = useCallback(
    (controlId?: string) => {
      if (emisPourControle(controlId)) return
      handleAction({ kind: "chartChange", chart: graphiqueRef.current })
    },
    [emisPourControle, handleAction],
  )

  const emettreReglages = useCallback(
    (controlId?: string) => {
      if (emisPourControle(controlId)) return
      handleAction({ kind: "pageSetupChange", pageSetup: reglagesRef.current })
    },
    [emisPourControle, handleAction],
  )

  const emettreTcd = useCallback(
    (controlId?: string) => {
      if (emisPourControle(controlId)) return
      // Les cellules du tableau passent par les commandes d'Univer, qui
      // s'appliquent de façon asynchrone : les relire tout de suite renvoie les
      // chiffres d'avant la pose.
      window.setTimeout(() => {
        const attendu = stepRef.current?.action
        const cells = attendu?.type === "EXPECT_PIVOT" ? attendu.pivot.cells : undefined
        handleAction({
          kind: "pivotChange",
          pivot: tcdRef.current,
          readings: cells ? lecturesTcd(Object.keys(cells), lireCellule) : {},
        })
      }, 260)
    },
    [emisPourControle, handleAction, lireCellule],
  )

  const emettreMacro = useCallback(
    (controlId?: string) => {
      if (emisPourControle(controlId)) return
      window.setTimeout(() => {
        const attendu = stepRef.current?.action
        const veut = attendu?.type === "EXPECT_MACRO" ? attendu.macro : undefined
        const liste = macrosRef.current
        // Le juge compare un nom : sur un classeur à plusieurs macros, présenter
        // la dernière touchée ferait échouer une étape qui parle de l'autre.
        const nomme = veut?.name ? liste.find((m) => m.name.trim() === veut.name?.trim()) : undefined
        const cible = nomme ?? liste.find((m) => m.name === macroCouranteRef.current) ?? liste[0] ?? null
        const edite = cible && cible.name === macroCouranteRef.current && codeMacroRef.current
        const readings: Record<string, { value: unknown }> = {}
        for (const ref of Object.keys(veut?.effet ?? {})) readings[ref] = { value: lireCellule(ref) }
        handleAction({
          kind: "macroChange",
          macro: cible,
          code: edite ? codeMacroRef.current : cible ? genererCode(cible) : "",
          readings,
        })
      }, 340)
    },
    [emisPourControle, handleAction, lireCellule],
  )

  /* ── Macros : enregistrement, exécution, options ───────────────────────── */

  const demarrerMacro = useCallback(
    (nom: string, options: OptionsMacro) => {
      const r = demarrerEnregistrement(nom, {
        ...options,
        // La sélection au démarrage donne leur sens aux références relatives :
        // c'est elle qui fait qu'une macro relative clôt le tableau de juillet
        // ou celui d'août selon l'endroit où on la lance.
        ancre: gridRef.current?.getSelection() || "A1",
        existantes: macrosRef.current,
      })
      if (!r.ok) return
      enregistrementRef.current = r.etat
      setEnregistrement(r.etat)
      handleAction({ kind: "recorder", state: "started" })
    },
    [handleAction],
  )

  const arreterMacro = useCallback(() => {
    const e = enregistrementRef.current
    if (!e) return
    const macro = arreterEnregistrement(e)
    enregistrementRef.current = null
    setEnregistrement(null)
    const suite = [...macrosRef.current.filter((m) => m.name !== macro.name), macro]
    macrosRef.current = suite
    setMacros(suite)
    macroCouranteRef.current = macro.name
    setMacroCourante(macro.name)
    codeMacroRef.current = genererCode(macro)
    setCodeMacro(codeMacroRef.current)
    handleAction({ kind: "recorder", state: "stopped" })
  }, [handleAction])

  const executerMacroNommee = useCallback(
    (nom: string) => {
      const grid = gridRef.current
      if (!grid) return
      let macro = macrosRef.current.find((m) => m.name === nom)
      // Le code de l'éditeur fait foi quand il porte sur cette macro : « visualiser
      // et modifier une macro » n'aurait aucun sens si l'exécution ignorait la
      // modification qu'on vient de faire lire à l'apprenant.
      if (nom === macroCouranteRef.current && codeMacroRef.current) {
        const relu = analyserCode(codeMacroRef.current)
        if (relu.ok) {
          macro = { ...relu.macro, name: macro?.name ?? relu.macro.name, shortcut: macro?.shortcut, relative: macro?.relative }
          const cible = macro
          const suite = macrosRef.current.map((m) => (m.name === nom ? cible : m))
          macrosRef.current = suite
          setMacros(suite)
        }
      }
      if (!macro) return
      const pilote: PiloteMacro = {
        select: (ref) => grid.setSelection(ref),
        setValue: (ref, value) => grid.applyCells({ [ref]: { v: value } }),
        setFormula: (ref, formuleFr) => grid.applyCells({ [ref]: { f: formuleFr } }),
        setFont: (ref, st) => {
          grid.setSelection(ref)
          if (st.bold !== undefined) grid.toggleBold(st.bold)
          if (st.italic !== undefined) grid.setItalic(st.italic)
          if (st.size !== undefined) grid.setFontSize(st.size)
          if (st.color !== undefined) grid.setFontColor(st.color)
        },
        setInterior: (ref, color) => {
          grid.setSelection(ref)
          grid.setBackground(color)
        },
        setNumberFormat: (ref, pattern) => grid.setNumberFormat(cellsOf(ref), pattern),
      }
      executerMacro(macro, pilote, { ancre: grid.getSelection() || "A1" })
      macroCouranteRef.current = nom
      setMacroCourante(nom)
      emettreMacro()
    },
    [emettreMacro],
  )

  const changerRaccourci = useCallback(
    (nom: string, raccourci: string) => {
      const suite = macrosRef.current.map((m) => (m.name === nom ? { ...m, shortcut: raccourci } : m))
      macrosRef.current = suite
      setMacros(suite)
      macroCouranteRef.current = nom
      setMacroCourante(nom)
      const cible = suite.find((m) => m.name === nom)
      if (cible) {
        codeMacroRef.current = genererCode(cible)
        setCodeMacro(codeMacroRef.current)
      }
      emettreMacro()
    },
    [emettreMacro],
  )

  const supprimerMacro = useCallback(
    (nom: string) => {
      const suite = macrosRef.current.filter((m) => m.name !== nom)
      macrosRef.current = suite
      setMacros(suite)
      macroCouranteRef.current = suite[0]?.name ?? null
      setMacroCourante(macroCouranteRef.current)
      codeMacroRef.current = suite[0] ? genererCode(suite[0]) : ""
      setCodeMacro(codeMacroRef.current)
      emettreMacro()
    },
    [emettreMacro],
  )

  /* ── Contrôles des modules 13, 17, 18, 20 et 27 ────────────────────────── */

  /**
   * Rend `true` quand le contrôle appartient à l'un de ces modules : l'effet est
   * appliqué et l'observation déjà émise, `handleControl` n'a plus rien à faire.
   *
   * Principe, le même que pour `setup.cf` : quand un bouton remplace une boîte de
   * dialogue dont les paramètres ne peuvent venir que de l'auteur — la couleur
   * d'une série, la série à masquer, le nouveau type — c'est le `setup` de
   * l'étape qui fait foi. Quand le bouton se suffit à lui-même, on applique son
   * effet propre, ce qui laisse l'apprenant explorer hors des étapes.
   */
  const effetModele = useCallback(
    (controlId: string): boolean => {
      const grid = gridRef.current
      const s = stepRef.current

      /* Graphiques (modules 17, 18 et graphiques croisés du module 20) */
      if (controlId.startsWith("ins-graph-")) {
        const type = TYPE_PAR_CONTROLE[controlId]
        if (type || controlId === "ins-graph-recommande") {
          const spec = s?.setup?.chart
          if (spec) poserGraphique(creerGraphique({ ...spec, type: type ?? spec.type }))
          else if (grid) {
            // Sans déclaration, on devine comme Excel : la plage sélectionnée
            // porte ses en-têtes, ses libellés d'axe et ses séries.
            const sel = grid.getSelection()
            const devine = sel ? creerDepuisPlage(sel, type ?? "histogramme", lirePlage, { frame: cadreHorsSource(grid, sel) }) : null
            if (devine) poserGraphique(devine)
          }
          emettreGraphique(controlId)
          return true
        }
        const courant = graphiqueRef.current
        const patch = s?.setup?.chartEdit
        if (courant && patch) poserGraphique(modifierGraphique(courant, patch))
        else if (courant) {
          const el = ELEMENT_PAR_CONTROLE[controlId]
          const style = /^ins-graph-style-(\d+)$/.exec(controlId)
          const i = serieSelectionnee(courant)
          const nom = i !== null ? courant.series[i]?.name : undefined
          let libre: PatchGraphique | null = null
          if (el) libre = { elements: { [el]: !(courant.elements?.[el] ?? false) } }
          else if (style) libre = { style: Number(style[1]) }
          else if (controlId === "ins-graph-legende-droite") libre = { legendPosition: "droite", elements: { legende: true } }
          else if (controlId === "ins-graph-legende-bas") libre = { legendPosition: "bas", elements: { legende: true } }
          else if (nom && i !== null) {
            if (controlId === "ins-graph-tendance-lineaire") libre = { editSeries: [{ name: nom, trendline: "lineaire" }] }
            else if (controlId === "ins-graph-tendance-moyenne-mobile") libre = { editSeries: [{ name: nom, trendline: "moyenne-mobile" }] }
            else if (controlId === "ins-graph-tendance-supprimer") libre = { editSeries: [{ name: nom, trendline: undefined }] }
            else if (controlId === "ins-graph-filtre-serie") libre = { editSeries: [{ name: nom, hidden: !courant.series[i].hidden }] }
            else if (controlId === "ins-graph-supprimer-serie") libre = { removeSeries: [nom] }
          }
          if (libre) poserGraphique(modifierGraphique(courant, libre))
        }
        emettreGraphique(controlId)
        return true
      }

      /* Tableaux croisés (module 20) */
      if (controlId === "ins-tcd") {
        const spec = s?.setup?.pivot
        if (spec) poserTcdDansFeuille(creerTcd(spec, lireCellule))
        else {
          // Excel pose le tableau vide à côté du tableau source, et c'est
          // l'apprenant qui y dépose ensuite ses champs.
          const aire = parseRange(etendue)
          const cible = aire ? `${columnIndexToLetter(aire.endCol + 2)}3` : "H3"
          poserTcdDansFeuille(
            creerTcd({ source: etendue, target: cible, rows: [], cols: [], values: [], filters: [] }, lireCellule),
          )
        }
        emettreTcd(controlId)
        return true
      }
      if (controlId.startsWith("tcd-")) {
        const courant = tcdRef.current
        const patch = s?.setup?.pivotEdit
        if (courant) {
          if (controlId === "tcd-actualiser") poserTcdDansFeuille(modifierTcd(courant, patch ?? { refresh: true }, lireCellule))
          else if (controlId === "tcd-source" && patch) poserTcdDansFeuille(modifierTcd(courant, patch, lireCellule))
        }
        emettreTcd(controlId)
        return true
      }

      /* Mise en page (module 13) : les quatre boutons du ruban qui dépendent de
         la sélection. Tout le reste des réglages passe par le panneau du calque. */
      if (
        controlId === "mep-zone-impression-definir" ||
        controlId === "mep-imprimer-titres" ||
        controlId === "mep-saut-inserer" ||
        controlId === "mep-saut-supprimer"
      ) {
        const sel = grid?.getSelection() ?? ""
        const aire = parseRange(sel)
        const etat = reglagesRef.current
        let patch: PageSetupState | null = null
        if (controlId === "mep-zone-impression-definir") {
          patch = { printArea: sel }
        } else if (controlId === "mep-imprimer-titres") {
          // Excel ouvre ici une boîte de dialogue ; à défaut, la sélection dit
          // quelles lignes ou colonnes répéter, et le scénario tranche s'il l'a
          // déclaré.
          patch = s?.setup?.pageSetup ?? (aire
            ? { repeatRows: `$${aire.startRow + 1}:$${aire.endRow + 1}` }
            : null)
        } else if (aire) {
          const lignes = new Set(etat.pageBreakRows ?? [])
          const colonnes = new Set(etat.pageBreakCols ?? [])
          if (controlId === "mep-saut-inserer") {
            if (aire.startRow > 0) lignes.add(aire.startRow)
            if (aire.startCol > 0) colonnes.add(aire.startCol)
          } else {
            lignes.delete(aire.startRow)
            colonnes.delete(aire.startCol)
          }
          patch = { pageBreakRows: Array.from(lignes), pageBreakCols: Array.from(colonnes) }
        }
        if (patch) poserReglages(appliquerReglages(etat, patch))
        emettreReglages(controlId)
        return true
      }

      /* Macros (module 27). Le ruban et le panneau portent les mêmes commandes :
         celles qui touchent l'état des boîtes de dialogue sont relayées au
         panneau, pour qu'il n'y ait jamais deux vérités. */
      if (controlId.startsWith("dev-")) {
        if (controlId === "dev-arreter-enregistrement") {
          if (enregistrementRef.current) arreterMacro()
          else handleAction({ kind: "control", control: controlId, channel: "ribbon" })
          return true
        }
        setCommandeMacro({ nonce: Date.now(), controle: controlId })
        handleAction({ kind: "control", control: controlId, channel: "ribbon" })
        return true
      }

      return false
    },
    [
      arreterMacro,
      emettreGraphique,
      emettreReglages,
      emettreTcd,
      etendue,
      handleAction,
      lireCellule,
      lirePlage,
      poserGraphique,
      poserReglages,
      poserTcdDansFeuille,
    ],
  )

  /**
   * Les boutons du ruban doivent AGIR, pas seulement signaler un clic. Sans cela
   * l'apprenant clique « Insérer » et rien ne bouge — il croirait à une panne.
   * L'effet est appliqué d'abord, la validation ensuite : l'étape peut donc être
   * validée sur l'état du classeur qui en résulte.
   */
  /**
   * Gestes du poste de travail. Comme le tri ou le graphique, ils ont leur
   * propre effet et leur propre observation : le clic ne remonte pas comme un
   * simple `control`, sinon une étape qui juge l'ÉTAT du poste échouerait sur
   * l'observation du bouton, arrivée la première.
   */
  const gestePoste = useCallback(
    (controlId: string, nom?: string): boolean => {
      if (!posteActif || !controlId.startsWith("poste-")) return false
      const C = CONTROLES_POSTE
      let geste: GestePoste | null = null
      if (controlId === C.demarrer) geste = { type: "menu" }
      else if (controlId === C.fermer) geste = { type: "fermer" }
      else if (controlId === C.reduire) geste = { type: "reduire" }
      else if (controlId === C.nouveau) geste = { type: "nouveau" }
      else if (controlId === C.enregistrer) geste = { type: "ouvrirBoite", boite: "enregistrer" }
      else if (controlId === C.enregistrerSous) geste = { type: "ouvrirBoite", boite: "enregistrer", forcer: true }
      else if (controlId === C.enregistrerAnnuler) geste = { type: "fermerBoite" }
      else if (controlId === C.enregistrerValider) geste = { type: "enregistrer", nom: nom ?? "" }
      else if (controlId === C.ouvrir) geste = { type: "ouvrirBoite", boite: "ouvrir" }
      else if (controlId === C.ouvrirAnnuler) geste = { type: "fermerBoite" }
      else if (controlId === C.ouvrirValider) geste = { type: "ouvrirFichier", nom: nom ?? "" }
      else if (controlId.startsWith("poste-app-")) geste = { type: "lancer", app: controlId.slice("poste-app-".length) }
      else if (controlId.startsWith("poste-modele-")) geste = { type: "ouvrirModele", modele: controlId.slice("poste-modele-".length) }
      else if (controlId.startsWith("poste-fichier-")) {
        const cle = controlId.slice("poste-fichier-".length)
        const f = posteRef.current.fichiers.find((x) => CONTROLES_POSTE.fichier(x.nom).endsWith(cle))
        if (f) geste = { type: "ouvrirFichier", nom: f.nom }
      }
      if (!geste) return false
      const suivant = appliquerGeste(posteRef.current, geste)
      setPoste(suivant)
      handleAction({ kind: "posteChange", poste: suivant })
      return true
    },
    // L'état du poste est lu dans une REF, jamais capturé : `handleControl` est
    // mémoïsé et gardait sinon une version figée de ce callback, qui jugeait le
    // geste contre l'étape précédente — le clic sur Démarrer passait, les
    // suivants non.
    [posteActif, handleAction],
  )

  const handleControl = useCallback(
    (controlId: string) => {
      const grid = gridRef.current
      // Le poste de travail a ses propres transitions et sa propre observation.
      if (gestePoste(controlId)) return
      // Graphiques, tableaux croisés, mise en page et macros ont leurs propres
      // effets et leur propre observation : ils sortent d'ici.
      if (effetModele(controlId)) return
      // L'enregistreur transcrit les boutons de mise en forme, comme Excel. Le
      // geste est lu AVANT l'effet : la sélection ne doit pas avoir bougé.
      const enreg = enregistrementRef.current
      if (enreg?.actif && grid) {
        const geste = gesteDepuisControle(controlId, grid.getSelection() || "A1")
        if (geste) {
          const suite = transcrire(enreg, geste)
          enregistrementRef.current = suite
          setEnregistrement(suite)
        }
      }
      // Un tri réussi est signalé par l'événement Univer, pas par le clic : on
      // évite d'émettre une observation « control » qui ferait échouer l'étape.
      let trie = false
      let triFait = false
      if (grid) {
        const info = grid.getSelectionKind()
        switch (controlId) {
          case "acc-inserer":
            if (info?.kind === "column") grid.insertColumnBefore(info.index)
            else if (info?.kind === "row") grid.insertRowBefore(info.index)
            break
          case "acc-supprimer":
            if (info?.kind === "column") grid.deleteColumn(info.index)
            else if (info?.kind === "row") grid.deleteRow(info.index)
            break
          case "acc-format-largeur":
            if (info?.kind === "column") grid.setColumnWidth(info.index, 160)
            break
          case "acc-format-masquer":
            if (info?.kind === "column") grid.hideColumn(info.index)
            else if (info?.kind === "row") grid.hideRow(info.index)
            break
          case "acc-gras":
            grid.toggleBold(true)
            break
          case "acc-mfc-regle": {
            // Les paramètres viennent du scénario, faute de boîte de dialogue :
            // le geste évalué est le choix du type de règle et de la plage.
            const cf = stepRef.current?.setup?.cf
            if (cf) grid.addConditionalRule(cf.range, cf.rule)
            break
          }
          case "acc-mfc-effacer": {
            const cf = stepRef.current?.setup?.cf
            grid.clearConditionalRules(cf?.range ?? grid.getSelection() ?? "A1")
            break
          }
          case "acc-coller": {
            // Un collage passe par Univer et rend une promesse : on valide après.
            const coll = stepRef.current?.setup?.paste
            if (coll) {
              void grid.pasteText(coll.texte).then(() => {
                handleAction({ kind: "control", control: controlId, channel: "ribbon" })
              })
              return
            }
            break
          }
          case "don-convertir": {
            const sp = stepRef.current?.setup?.split
            if (sp) grid.splitToColumns(sp.range, sp.separateur, sp.fusionnerSeparateurs)
            break
          }
          case "acc-format-monetaire":
            // Deux décimales, séparateur de milliers et symbole € : le format
            // « Monétaire » d'Excel. La localisation numfmt le rend en français.
            grid.setNumberFormatOnSelection('#,##0.00" €"')
            break
          case "acc-pourcentage":
            grid.setNumberFormatOnSelection("0.00%")
            break
          case "acc-format-date":
            grid.setNumberFormatOnSelection("dd/mm/yyyy")
            break
          case "acc-format-nombre":
            grid.setNumberFormatOnSelection("#,##0.00")
            break
          case "acc-italique":
            grid.setItalic(true)
            break
          case "acc-souligne":
            grid.setUnderline(true)
            break
          case "acc-taille-plus":
            grid.setFontSize(14)
            break
          case "acc-taille-moins":
            grid.setFontSize(9)
            break
          case "acc-couleur-police":
            grid.setFontColor("#b91c1c")
            break
          case "acc-remplissage":
            grid.setBackground("#fde68a")
            break
          case "acc-bordures":
            grid.setBorderAll(true)
            break
          case "acc-aligner-gauche":
            grid.setAlign("left")
            break
          case "acc-aligner-centre":
            grid.setAlign("center")
            break
          case "acc-aligner-droite":
            grid.setAlign("right")
            break
          case "acc-fusionner":
            grid.mergeCells()
            break
          case "acc-renvoyer-ligne":
            grid.setWrap(true)
            break
          case "ui-nouvelle-feuille":
            grid.insertSheet()
            setSheets(grid.getSheets())
            break
          case "don-tri-croissant":
          case "don-tri-decroissant": {
            trie = true
            // Excel devine la plage et repère la ligne d'en-tête ; Univer non.
            // La plage à trier vient donc du scénario, et la colonne du clic de
            // l'apprenant — c'est bien son choix de colonne qu'on évalue.
            const attendu = stepRef.current?.action
            const plage = attendu?.type === "SORT_RANGE" ? attendu.range : ""
            const sel = grid.getSelection()
            if (plage && sel) {
              // Découper à la main les lettres d'une référence donnait « AC »
              // pour « A2:C6 » : on passe par les analyseurs de plage.
              const aire = parseRange(plage)
              const clic = parseRange(sel)
              // Univer attend un indice RELATIF au premier champ de la plage,
              // pas un indice absolu de feuille : vérifié au banc, une plage
              // qui ne commence pas en colonne A triait sinon la mauvaise.
              if (aire && clic) {
                const relatif = clic.startCol - aire.startCol
                if (relatif >= 0 && clic.startCol <= aire.endCol) {
                  triFait = grid.sortRange(plage, relatif, controlId === "don-tri-croissant")
                }
              }
            }
            break
          }
          case "don-filtrer": {
            // La plage à filtrer décrit le tableau de la feuille, pas l'étape :
            // au moment du clic, l'étape courante est encore le CLICK_CONTROL.
            const plage = scenario.workbook.filterRange ?? ""
            if (plage) grid.createFilter(plage)
            break
          }
          case "don-effacer-filtre":
            grid.removeFilter()
            break
          case "don-validation": {
            const dv = stepRef.current?.setup?.dv
            if (dv) grid.addValidation(dv.range, dv.rule)
            break
          }
          case "ins-image-cellule": {
            // L'insertion est asynchrone : l'étape se valide une fois l'image
            // réellement posée, sinon on validerait un geste sans effet.
            const img = stepRef.current?.setup?.image
            if (img) {
              void grid.insertCellImage(img.ref, img.source).then(() => {
                handleAction({ kind: "control", control: controlId, channel: "ribbon" })
              })
              return
            }
            break
          }
          case "rev-commentaire": {
            const n = stepRef.current?.setup?.note
            if (n) grid.setNote(n.ref, n.texte)
            break
          }
          case "rev-supprimer-commentaire": {
            const n = stepRef.current?.setup?.note
            grid.deleteNote(n?.ref ?? grid.getSelection() ?? "A1")
            break
          }
          case "aff-figer-volets": {
            const f = stepRef.current?.setup?.freeze
            grid.setFreeze(f?.rows ?? 1, f?.cols ?? 0)
            break
          }
          case "aff-liberer-volets":
            grid.cancelFreeze()
            break
          case "don-effacer-validation": {
            const dv = stepRef.current?.setup?.dv
            grid.clearValidation(dv?.range ?? grid.getSelection() ?? "A1")
            break
          }
        }
      }
      if (trie && triFait) return

      // La valeur cible itère sur le classeur : le résultat n'est connu qu'après
      // plusieurs recalculs, donc on valide l'étape à la fin de la recherche.
      const cible = stepRef.current?.setup?.goalSeek
      if (controlId === "don-valeur-cible" && cible && grid) {
        void grid
          .goalSeek(cible.formulaRef, cible.target, cible.inputRef)
          .then(() => {
            setSelection(grid.getSelection() ?? cible.inputRef)
            setStats(grid.getSelectionStats() ?? null)
            handleAction({ kind: "control", control: controlId, channel: "ribbon" })
          })
        return
      }

      // Une étape validée sur la MISE EN FORME lit l'état après le clic : la
      // mise en forme ne déclenche aucun événement de valeur, et laisser passer
      // une observation « control » ferait échouer l'étape.
      const attenduFmt = stepRef.current?.action
      if (attenduFmt?.type === "EXPECT_FORMAT" && grid) {
        const refs = Object.keys(attenduFmt.cells)
        // Les commandes Univer s'appliquent de façon asynchrone : lire tout de
        // suite renvoie l'ancien style.
        window.setTimeout(() => {
          const readings: Record<
            string,
            {
              background: string
              fontSize: number | null
              hAlign: string
              vAlign: string
              wrap: boolean | null
              numberFormat: string
            }
          > = {}
          for (const ref of refs) readings[ref] = grid.getFormat(ref)
          handleAction({ kind: "formatChange", readings })
        }, 220)
        return
      }

      handleAction({ kind: "control", control: controlId, channel: "ribbon" })
    },
    [effetModele, handleAction, gestePoste],
  )

  /**
   * Presse un contrôle PENDANT la démonstration : l'effet est appliqué, la
   * validation neutralisée.
   *
   * C'est le chemin exact de l'apprenant — `handleControl` pour le ruban et les
   * panneaux, `gestePoste` pour les boîtes du bureau, qui prennent le nom du
   * fichier en argument. Aucun effet n'est réécrit ici : la démonstration
   * emprunte le code qui marche déjà, et le verrou empêche seulement l'étape de
   * se valider toute seule au milieu de l'explication.
   */
  const presserDemo = useCallback(
    (id: string, arg?: string) => {
      // Un écran de LECTURE illustre, il ne modifie pas le classeur : ses
      // cellules sont remises en place à la fin (`rendreClasseur`), mais un tri,
      // un format ou un nom de plage ne le seraient pas. On montre alors le
      // geste sans l'exécuter.
      if (stepRef.current?.action.type === "READ") return
      // Les commandes d'Univer et les couches s'appliquent de façon asynchrone,
      // et l'observation de mise en forme est relue 220 ms après le clic : le
      // verrou doit couvrir tout cela.
      verrouillerDemo(1400)
      // Trace d'audit : quels boutons la démonstration a réellement pressés.
      if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
        const w = window as any
        w.__SIM_DEMO_PRESSES = [...(w.__SIM_DEMO_PRESSES ?? []), id]
      }
      // Les boutons du poste qui prennent un nom de fichier n'ont pas d'équivalent
      // cliquable sans saisie : on passe par la transition directement.
      if (arg !== undefined && id.startsWith("poste-")) {
        gestePoste(id, arg)
        return
      }
      // CLIQUER LE VRAI ÉLÉMENT quand il est là, exactement comme l'apprenant.
      //
      // Appeler `handleControl` semblait équivalent, et ça l'est pour le ruban —
      // mais pas pour les panneaux. Les options du panneau Mise en page
      // (`aff-mode-*`, orientation, marges) sont des boutons de choix dont
      // l'effet passe par leur propre `onChange`, jamais par `handleControl` :
      // la pression ne faisait donc rien, le mode d'affichage ne changeait pas,
      // et l'étape suivante visait la zone d'en-tête qui n'existe QUE dans ce
      // mode — geste invisible en cascade (modules 13). Le clic DOM couvre les
      // deux familles d'un seul geste.
      const el = document.querySelector<HTMLElement>(`[data-control="${id}"]`)
      if (el && typeof el.click === "function") el.click()
      else handleControl(id)
    },
    [gestePoste, handleControl, verrouillerDemo],
  )

  /** Sélectionne pour de vrai pendant la démonstration, sans rien valider. */
  const selectionnerDemo = useCallback((ref: string) => {
    const grid = gridRef.current
    if (!grid) return
    grid.setSelection(ref)
    setSelection(ref)
    setStats(grid.getSelectionStats(ref))
  }, [])

  /** Validation de la zone Nom : on va à la référence, et on le signale. */
  const commitNameBox = useCallback(() => {
    const grid = gridRef.current
    const raw = (nameBoxDraft ?? "").trim()
    setNameBoxDraft(null)
    if (!grid || !raw) return

    // La zone Nom d'Excel a deux usages selon ce qu'on y tape : une référence
    // déplace la sélection, un nom inédit nomme la sélection courante.
    const estReference = /^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(:\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?$/.test(raw)
    const defini = grid.getDefinedNames().find((n) => n.name.toUpperCase() === raw.toUpperCase())

    if (!estReference && !defini) {
      const portee = grid.getSelection()
      if (!portee) return
      const pose = grid.defineName(raw, portee)
      grid.focus()
      if (pose) handleAction({ kind: "defineName", name: raw, ref: portee })
      return
    }

    // Univer ne résout pas un nom défini : il lirait « Prix_HT » comme une
    // référence de colonne et lèverait une erreur. On traduit donc le nom en
    // plage nous-mêmes, en retirant l'éventuel préfixe de feuille.
    const cible = estReference ? raw.toUpperCase() : (defini?.ref ?? "").split("!").pop() || ""
    if (!cible) return
    grid.setSelection(cible)
    grid.focus()
    const now = grid.getSelection()
    if (now) {
      setSelection(now)
      setStats(grid.getSelectionStats(now))
    }
    handleAction({ kind: "gotoRef", ref: now || cible })
  }, [nameBoxDraft, handleAction])

  const handleSheet = useCallback(
    (name: string) => {
      const grid = gridRef.current
      if (grid) {
        grid.activateSheet(name)
        setSheets(grid.getSheets())
        grid.focus()
      }
      handleAction({ kind: "selectSheet", name })
    },
    [handleAction],
  )

  const revealHint = useCallback(() => {
    if (hintShown) return
    setHintShown(true)
    pendingRef.current.hints += 1
  }, [hintShown])

  /* ── Gestes dans les couches ───────────────────────────────────────────── */

  /** Clic sur un élément DU graphique : titre, légende, axe, série, point. */
  const choisirElementGraphique = useCallback(
    (element: string) => {
      const courant = graphiqueRef.current
      if (!courant) return
      poserGraphique(selectionnerElement(courant, element))
      handleAction({ kind: "chartElement", element })
    },
    [handleAction, poserGraphique],
  )

  const deplacerGraphique = useCallback(
    (frame: NonNullable<ChartState["frame"]>) => {
      const courant = graphiqueRef.current
      if (courant) poserGraphique({ ...courant, frame })
    },
    [poserGraphique],
  )

  /**
   * Dépôt d'un champ dans une zone du volet.
   *
   * Le geste de l'apprenant est ce qui compte : c'est lui qui construit le patch,
   * donc un champ déposé dans la mauvaise zone donne bien un tableau faux et
   * l'étape refuse. Quand le scénario a déclaré CE dépôt-là, on prend sa version
   * — elle porte ce que le volet ne sait pas dire, par exemple la valeur du
   * filtre de rapport qui accompagne le champ.
   */
  const deposerChamp = useCallback(
    (champ: string, zone: ZoneTcd) => {
      const courant = tcdRef.current
      if (!courant) return
      const declare = stepRef.current?.setup?.pivotEdit
      const cle = ({ rows: "addRows", cols: "addCols", values: "addValues", filters: "addFilters" } as const)[zone]
      const memeGeste =
        declare &&
        ((declare[cle] ?? []).some((f) => f.name === champ) ||
          ((declare[zone] as typeof declare.rows | undefined) ?? []).some((f) => f.name === champ))
      const patch: PatchTcd = memeGeste ? declare! : { [cle]: [{ name: champ }] }
      poserTcdDansFeuille(modifierTcd(courant, patch, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  const changerAgregat = useCallback(
    (champ: string, agg: PivotAgg) => {
      const courant = tcdRef.current
      if (!courant) return
      const declare = stepRef.current?.setup?.pivotEdit
      const memeGeste = declare?.values?.some((f) => f.name === champ && f.agg === agg)
      const patch: PatchTcd = memeGeste ? declare! : { addValues: [{ name: champ, agg }] }
      poserTcdDansFeuille(modifierTcd(courant, patch, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  const retirerChamp = useCallback(
    (champ: string) => {
      const courant = tcdRef.current
      if (!courant) return
      const declare = stepRef.current?.setup?.pivotEdit
      const memeGeste = declare?.removeFields?.includes(champ)
      poserTcdDansFeuille(modifierTcd(courant, memeGeste ? declare! : { removeFields: [champ] }, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  const changerStyleTcd = useCallback(
    (styleId: number) => {
      const courant = tcdRef.current
      if (!courant) return
      poserTcdDansFeuille(modifierTcd(courant, { styleId }, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  const actualiserTcd = useCallback(() => {
    const courant = tcdRef.current
    if (!courant) return
    const declare = stepRef.current?.setup?.pivotEdit
    poserTcdDansFeuille(modifierTcd(courant, declare?.refresh ? declare : { refresh: true }, lireCellule))
    emettreTcd()
  }, [emettreTcd, lireCellule, poserTcdDansFeuille])

  const changerValeursFiltre = useCallback(
    (champ: string, valeurs: string[]) => {
      const courant = tcdRef.current
      if (!courant) return
      const suivant = { ...(courant.filterValues ?? {}) }
      if (valeurs.length === 0) delete suivant[champ]
      else suivant[champ] = valeurs
      poserTcdDansFeuille(modifierTcd(courant, { filterValues: suivant }, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  /**
   * Réglage proposé par le calque de mise en page. On l'applique TEL QUEL : c'est
   * le seul moyen qu'un apprenant qui choisit Portrait alors qu'on demandait
   * Paysage voie son geste refusé. Le `setup` de l'étape, qui décrit le même
   * réglage, sert de référence au juge — pas de valeur de substitution.
   */
  const changerReglages = useCallback(
    (patch: PageSetupState) => {
      poserReglages(appliquerReglages(reglagesRef.current, patch))
      emettreReglages()
    },
    [emettreReglages, poserReglages],
  )

  /**
   * Relais d'observation pour les contrôles qui vivent DANS les couches.
   *
   * Les couches n'ont pas de rappel « un bouton a été cliqué » — elles remontent
   * des intentions métier, et c'est très bien ainsi. Mais deux étapes du module 13
   * jugent l'ouverture de la boîte En-tête et pied de page, un geste sans autre
   * effet observable. On lit donc le `data-control` au vol, et UNIQUEMENT quand
   * l'étape juge un clic de bouton : sinon on émettrait une observation parasite
   * en plus de celle que la couche vient de produire.
   */
  const relaisControleCouche = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const cible = (e.target as HTMLElement | null)?.closest?.("[data-control]")
      const id = cible?.getAttribute("data-control")
      if (!id) return
      // Le panneau garde pour lui la macro choisie : ce clic est le seul moyen de
      // savoir laquelle, et donc d'afficher le bon code dans l'éditeur.
      if (id.startsWith("mac-choix-")) {
        const nom = id.slice("mac-choix-".length)
        const m = macrosRef.current.find((x) => x.name === nom)
        if (m) {
          macroCouranteRef.current = nom
          setMacroCourante(nom)
          codeMacroRef.current = genererCode(m)
          setCodeMacro(codeMacroRef.current)
        }
        return
      }
      if (stepRef.current?.action.type !== "CLICK_CONTROL") return
      handleAction({ kind: "control", control: id, channel: "ribbon" })
    },
    [handleAction],
  )

  /* ── Données à peindre par les couches ─────────────────────────────────── */

  /** Valeurs des plages du graphique, relues à chaque étape. */
  const valeursGraphique = useMemo(() => {
    const out: Record<string, unknown[]> = {}
    if (!graphique || !gridReady) return out
    const plages = [graphique.categories, ...graphique.series.map((s) => s.values)]
    for (const p of plages) if (p) out[p] = lirePlage(p)
    return out
    // `index` fait partie des dépendances : une étape qui modifie les cellules
    // sources doit redessiner le graphique.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphique, gridReady, index, lirePlage])

  const tableauTcd = useMemo(() => (tcd ? calculerTcd(tcd) : null), [tcd])
  const champsTcd = useMemo(() => (tcd ? champsDisponibles(tcd.instantane) : []), [tcd])
  const valeursFiltre = useCallback(
    (champ: string) => {
      const source = tcdRef.current?.instantane
      if (!source) return []
      const vues = new Set<string>()
      for (const l of source.lignes) {
        const v = l[champ]
        if (v !== null && v !== undefined && String(v).trim() !== "") vues.add(String(v).trim())
      }
      return Array.from(vues).sort((a, b) => a.localeCompare(b, "fr-FR", { numeric: true }))
    },
    [],
  )
  /** Excel envoie un champ numérique en Valeurs, les autres en Lignes. */
  const zoneParDefautTcd = useCallback(
    (champ: string): ZoneTcd => {
      const source = tcdRef.current?.instantane
      if (!source) return "rows"
      return aggParDefaut(champ, source) === "nombre" ? "rows" : "values"
    },
    [],
  )

  /**
   * Dimensions réelles de la grille, pour que les feuilles de papier tombent
   * exactement sur les bonnes bandes de lignes et de colonnes.
   */
  const metrique = useMemo(() => {
    const grid = gridRef.current
    const aire = parseRange(etendue)
    const nbCols = (aire?.endCol ?? 9) + 4
    const nbLignes = (aire?.endRow ?? 40) + 4
    const colonnes: number[] = []
    const lignes: number[] = []
    for (let c = 0; c < nbCols; c++) colonnes.push(grid?.getColumnWidth(c) ?? 88)
    for (let r = 0; r < nbLignes; r++) lignes.push(grid?.getRowHeight(r) ?? 24)
    // En-têtes d'Univer : 46 px de large pour les numéros de ligne, 20 px de haut
    // pour les lettres de colonne.
    return { colonnes, lignes, offsetX: 46, offsetY: 20 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etendue, gridReady, index])

  const pagination: Pagination = useMemo(
    () => calculerPages(reglages, metrique.colonnes, metrique.lignes, etendue),
    [reglages, metrique, etendue],
  )

  /* ── Halo d'aide ───────────────────────────────────────────────────────── */

  // En leçon on montre la cible tout de suite ; en exercice sur demande ; jamais
  // en évaluation.
  const highlightedControl = useMemo(() => {
    if (!step) return null
    // Le bouton attendu s'allume aussi dès le deuxième essai raté, hors
    // évaluation : c'est le pendant du halo sur la cellule.
    const forcer = (essais >= 2 || tatonnements >= 4 || tropLong || demonstration) && mode !== "EVALUATION"
    if (!forcer && (mode === "EVALUATION" || !hintShown)) return null
    return cibleDemonstration(step.action).controle ?? null
  }, [mode, hintShown, step, essais, tatonnements, tropLong, demonstration])

  // `showTarget` était déclaré dans 150 aides et n'affichait rien : l'apprenant
  // bloqué demandait une aide censée pointer la cellule et ne voyait aucun
  // repère. On calcule le rectangle de la cible avec les métriques d'Univer.
  const [halo, setHalo] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const grid = gridRef.current
    if (!grid || !step) {
      setHalo(null)
      return
    }
    // À partir du deuxième essai raté, la cible s'allume même si l'étape n'a pas
    // d'aide rédigée — c'était le cas de deux tiers des étapes. Jamais en
    // évaluation notée : montrer la cible reviendrait à souffler la réponse.
    const forcer = (essais >= 2 || tatonnements >= 4 || tropLong || demonstration) && mode !== "EVALUATION"
    if (!forcer && (mode === "EVALUATION" || !hintShown || !step.aide?.showTarget)) {
      setHalo(null)
      return
    }
    const a = step.action
    // `cibleDemonstration` couvre plus de gestes que l'ancien calcul : il ignorait
    // notamment `EXPECT_STATE` et `EXPECT_FORMAT`, les deux modes de validation
    // les plus fréquents après la saisie.
    const cible =
      cibleDemonstration(a).cellule ??
      (a.type === "DEFINE_NAME" ? (a.ref ?? null) : null)
    if (!cible) {
      setHalo(null)
      return
    }
    // Une plage se surligne d'un coin à l'autre ; une cellule seule suffit.
    const bornes = cible.split(":")
    const calculer = () => {
      const premier = grid.getCellRect(bornes[0])
      const dernier = grid.getCellRect(bornes[bornes.length - 1])
      if (!premier || !dernier) return false
      const left = Math.min(premier.left, dernier.left)
      const top = Math.min(premier.top, dernier.top)
      setHalo({
        left,
        top,
        width: Math.max(premier.left + premier.width, dernier.left + dernier.width) - left,
        height: Math.max(premier.top + premier.height, dernier.top + dernier.height) - top,
      })
      return true
    }
    // Au tout premier montage le squelette de rendu d'Univer n'existe pas encore
    // et la géométrie n'est pas calculable : la première étape de chaque leçon
    // restait alors sans repère. On retente une fois, peu après.
    if (!calculer()) {
      const t = window.setTimeout(calculer, 350)
      return () => window.clearTimeout(t)
    }
    // `gridReady` est indispensable : au premier montage la grille n'existe pas
    // encore, l'effet calculait un halo nul et ne se rejouait jamais — la
    // première étape de chaque leçon restait sans repère.
  }, [mode, hintShown, step, index, gridReady, essais, tatonnements, tropLong, demonstration])

  /**
   * Géométrie de la démonstration animée. Recalculée comme le halo, à partir des
   * métriques d'Univer — la grille est un canvas, il n'existe aucun élément DOM
   * par cellule. `null` tant que le geste ne se montre pas honnêtement : on garde
   * alors la réponse écrite.
   */
  /**
   * Plan de démonstration, MÉMOÏSÉ sur l'étape.
   *
   * Il vivait dans un state recalculé par un effet : chaque écriture de la
   * démonstration provoquait un rendu, donc un nouvel objet `plan`, donc une
   * nouvelle référence de `gestes` — et la minuterie du calque repartait de
   * zéro à l'infini. La démonstration restait bloquée sur son premier geste,
   * compteur figé à « 1 / 8 ». C'est le « des fois elle se finit pas ».
   */
  const demo = useMemo(() => {
    if (!demonstration || !step) return null
    // L'onglet est lu par une RÉFÉRENCE, pas par une dépendance : la
    // démonstration ouvre elle-même l'onglet dont elle a besoin, donc en faire
    // une dépendance recalculerait le plan en pleine séquence, changerait la
    // référence des gestes et relancerait la minuterie du calque à zéro — la
    // démonstration se figerait sur son premier geste. Ce qui compte est
    // l'onglet ouvert au DÉMARRAGE.
    const depart = { onglet: ongletRef.current, boitePoste: posteRef.current?.boite }
    if (step.montrer?.length) {
      // Un écran de lecture montre le geste qu'il décrit, y compris pendant une
      // évaluation : ce n'est pas une aide sur une question notée, c'est le
      // contenu lui-même. Partout ailleurs, l'évaluation reste sans
      // démonstration.
      // Les plans s'enchaînent : les gestes bout à bout, les repères de suivi
      // à la file, pour un compteur « i / n » qui court sur toute la séquence.
      const plans = step.montrer.map((a) => planDemonstration(a, depart)).filter(Boolean) as PlanDemo[]
      if (plans.length === 0) return null
      return { gestes: plans.flatMap((p) => p.gestes), pas: plans.flatMap((p) => p.pas) }
    }
    if (mode === "EVALUATION") return null
    return planDemonstration(step.action, depart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demonstration, index, mode])

  /**
   * Résout une cible de démonstration en rectangle, dans le repère du calque.
   * Les cellules passent par les métriques d'Univer (la grille est un canvas,
   * aucun élément DOM par cellule) ; le châssis passe par le DOM.
   */
  const resoudreCible = useCallback((cible: CibleDemo): Rect | null => {
    const r = resoudreCibleBrut(cible)
    // Trace d'audit : une cible qui s'est résolue AU MOINS UNE FOIS pendant qu'on
    // la montrait a bien eu son repère. La mesurer après coup se retourne contre
    // nous — un bouton de menu disparaît justement parce que le geste a réussi —
    // d'où cette trace posée au moment du rendu.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const w = window as any
      if (!w.__SIM_DEMO_VUS) w.__SIM_DEMO_VUS = {}
      const cle = cleCible(cible)
      if (r) w.__SIM_DEMO_VUS[cle] = true
      else if (w.__SIM_DEMO_VUS[cle] === undefined) w.__SIM_DEMO_VUS[cle] = false
    }
    return r
  }, [])

  const resoudreCibleBrut = useCallback((cible: CibleDemo): Rect | null => {
    const grid = gridRef.current
    // Le calque couvre TOUT l'atelier : c'est donc dans ce repère qu'il faut
    // rendre les rectangles. Les cellules, elles, viennent de la grille : on
    // ajoute le décalage de la grille dans l'atelier. Sans cela, un repère de
    // cellule s'affichait quelques dizaines de pixels trop haut.
    const hote = zoneAtelierRef.current
    if (!hote) return null
    const h = hote.getBoundingClientRect()
    const zg = zoneGrilleRef.current?.getBoundingClientRect()
    const dx = zg ? zg.left - h.left : 0
    const dy = zg ? zg.top - h.top : 0
    const depuisGrille = (r: { left: number; top: number; width: number; height: number }) => ({
      left: r.left + dx,
      top: r.top + dy,
      width: r.width,
      height: r.height,
    })
    if (cible.k === "cellule" || cible.k === "plage") {
      if (!grid) return null
      const bornes = cible.ref.split(":")
      let a = grid.getCellRect(bornes[0])
      let b = grid.getCellRect(bornes[bornes.length - 1])
      if (!a || !b) return null
      /**
       * La cible tombe-t-elle sous le bord de la feuille ? Alors on y va.
       *
       * La grille ne défile jamais d'elle-même. Une démonstration qui désigne
       * A41 — « la deuxième page commence ici » — dessinait donc son repère
       * hors du champ : l'apprenant regardait un écran où rien ne se passe
       * pendant que le compteur avançait (audit du 30/07/2026, module 13).
       *
       * Après le défilement les rectangles ont bougé : il faut les REDEMANDER.
       * Les réutiliser tels quels replacerait le repère à l'ancienne position,
       * c'est-à-dire de nouveau à côté.
       */
      // Hauteur RÉELLE de la zone de grille, pas déduite de celle de l'atelier :
      // le bandeau de consigne occupe le bas, la soustraction se tromperait.
      const basDeFeuille = zg?.height ?? h.height - dy
      if (a.top + a.height > basDeFeuille || a.top < 0) {
        if (grid.scrollToCell(bornes[0])) {
          const a2 = grid.getCellRect(bornes[0])
          const b2 = grid.getCellRect(bornes[bornes.length - 1])
          if (a2 && b2) {
            a = a2
            b = b2
          }
        }
      }
      const left = Math.min(a.left, b.left)
      const top = Math.min(a.top, b.top)
      return depuisGrille({
        left,
        top,
        width: Math.max(a.left + a.width, b.left + b.width) - left,
        height: Math.max(a.top + a.height, b.top + b.height) - top,
      })
    }
    if (cible.k === "enteteColonne") {
      const r = grid?.getCellRect(`${cible.col}1`)
      // L'en-tête n'est pas une cellule : il est juste au-dessus de la ligne 1.
      return r ? depuisGrille({ left: r.left, top: Math.max(0, r.top - 20), width: r.width, height: 20 }) : null
    }
    if (cible.k === "enteteLigne") {
      const r = grid?.getCellRect(`A${cible.ligne}`)
      return r ? depuisGrille({ left: Math.max(0, r.left - 46), top: r.top, width: 46, height: r.height }) : null
    }
    if (cible.k === "clavier") {
      // Un raccourci n'a pas de lieu : on réserve un cadre au centre de l'écran,
      // où le composant posera les touches sans curseur de souris.
      return { left: h.width / 2 - 90, top: h.height / 2 - 34, width: 180, height: 68 }
    }
    const el = document.querySelector(cible.sel)
    if (!el) return null
    let r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return null
    // Même règle que pour les cellules : un bouton sous le bord de l'écran est
    // « trouvé » sans être visible. Les panneaux de mise en page sont plus
    // hauts qu'un portable — `mep-entete-pied` tombait à y=1015 sur 900 px.
    // Sans conteneur défilable, `scrollIntoView` ne fait rien : on remesure
    // dans tous les cas plutôt que de supposer que ça a marché.
    if (r.bottom > h.bottom || r.top < h.top) {
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior })
      r = el.getBoundingClientRect()
    }
    return { left: r.left - h.left, top: r.top - h.top, width: r.width, height: r.height }
  }, [])

  /**
   * Crochets d'audit, retirés des bundles de production par le remplacement de
   * `NODE_ENV` — même dispositif que `window.__SIM_GRID`.
   *
   * POURQUOI ILS SONT NÉCESSAIRES
   * Une démonstration dont la cible ne se résout pas se joue À BLANC : le calque
   * ne dessine rien, mais la minuterie tourne, le compteur avance et « Revoir »
   * apparaît à la fin. Vue de l'extérieur, elle est indistinguable d'une
   * démonstration réussie — c'est ce qui a permis à 60 gestes invisibles de
   * traverser tous les contrôles. Et `resoudre()` n'est appelé que sur le geste
   * AFFICHÉ : sans sonde, il faudrait attendre chaque geste pour savoir s'il
   * atteint sa cible.
   *
   *   · `__SIM_FORCE_DEMO` déclenche la démonstration dès l'entrée dans l'étape,
   *     sans attendre 3 erreurs, 6 tâtonnements ou 45 secondes — les trois seuls
   *     déclencheurs de l'apprenant, intenables sur 1 358 étapes.
   *   · `__SIM_DEMO_PROBE()` résout d'un coup TOUTES les cibles du plan courant
   *     et rend la liste de celles qui ne mènent à rien.
   */
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    // Identifiant de l'étape courante, lisible sans rien calculer. La sonde
    // complète résout toutes les cibles — donc interroge le squelette d'Univer —
    // et s'en servir pour se recaler sur l'étape coûtait plus cher que l'audit
    // lui-même.
    ;(window as any).__SIM_ETAPE = stepRef.current?.id ?? null
    ;(window as any).__SIM_DEMO_PROBE = () => {
      const s = stepRef.current
      if (!s) return { erreur: "aucune étape" }
      const plan =
        s.montrer?.length ?
          (() => {
            const ps = s.montrer.map((a) => planDemonstration(a, onglet)).filter(Boolean) as PlanDemo[]
            return ps.length ? { gestes: ps.flatMap((p) => p.gestes), pas: ps.flatMap((p) => p.pas) } : null
          })()
        : mode === "EVALUATION" ? null
        : planDemonstration(s.action)
      if (!plan) return { id: s.id, type: s.action.type, plan: null }
      return {
        id: s.id,
        type: s.action.type,
        onglet,
        gestes: plan.gestes.map((g) => {
          const cibles = [g.cible, ...(g.glisserVers ? [g.glisserVers] : [])]
          return {
            bulle: g.bulle,
            ecrire: g.ecrire ?? null,
            cibles: cibles.map((c) => ({
              genre: c.k,
              valeur:
                c.k === "cellule" || c.k === "plage" ? c.ref
                : c.k === "enteteColonne" ? c.col
                : c.k === "enteteLigne" ? String(c.ligne)
                : c.k === "dom" ? c.sel
                : "clavier",
              // `resolu` = maintenant ; `vu` = s'est résolu au moins une fois
              // pendant que le geste était à l'écran. C'est `vu` qui dit si
              // l'apprenant a eu un repère : un bouton de menu disparaît
              // justement parce que le geste a abouti.
              resolu: !!resoudreCibleBrut(c),
              vu: (window as any).__SIM_DEMO_VUS?.[cleCible(c)] ?? null,
            })),
          }
        }),
      }
    }
  }

  /**
   * Remet les cellules dans l'état d'avant la démonstration d'un écran de
   * lecture. Sans cela, « Voir le geste » laissait la valeur montrée dans la
   * feuille et l'étape suivante démarrait sur un classeur faussé.
   */
  const rendreClasseur = useCallback(() => {
    const grid = gridRef.current
    const avant = avantDemoRef.current
    const refs = Object.keys(avant)
    if (!grid || refs.length === 0) return
    verrouillerDemo(800)
    const cells: Record<string, unknown> = {}
    for (const ref of refs) {
      const v = avant[ref]
      cells[ref] = v === "" ? {} : v.trim().startsWith("=") ? { f: v } : { v }
    }
    grid.applyCells(cells as Parameters<typeof grid.applyCells>[0])
    avantDemoRef.current = {}
  }, [verrouillerDemo])

  /**
   * Crée un nom de plage pendant la démonstration, sans déclencher la
   * validation. Le verrou est le même que pour l'écriture : sans lui,
   * l'observation ferait valider l'étape et sauter à la suivante en pleine
   * explication.
   */
  const definirDemo = useCallback((nom: string, ref: string) => {
    const grid = gridRef.current
    // Même raison que pour la pression d'un contrôle : un nom de plage créé sur
    // un écran de lecture ne serait pas défait.
    if (!grid || stepRef.current?.action.type === "READ") return
    verrouillerDemo(900)
    grid.defineName(nom, ref)
  }, [verrouillerDemo])

  /** Écrit une valeur pendant la démonstration, sans déclencher la validation. */
  const ecrireDemo = useCallback((ref: string, valeur: string) => {
    const grid = gridRef.current
    if (!grid) return
    // Sur un écran de lecture, on note la valeur d'avant pour la remettre à la
    // fin : la démonstration illustre, elle ne modifie pas le classeur.
    if (stepRef.current?.action.type === "READ" && !(ref in avantDemoRef.current)) {
      const v = lireCellule(ref)
      avantDemoRef.current[ref] = v == null || v === "" ? "" : String(v)
    }
    // `stateChange` est temporisé de 350 ms côté grille : l'échéance couvre le
    // recalcul du moteur (60-120 ms) puis cette temporisation.
    verrouillerDemo(800)
    grid.applyCells({ [ref]: valeur === "" ? {} : valeur.trim().startsWith("=") ? { f: valeur } : { v: valeur } })
  }, [lireCellule, verrouillerDemo])

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  if (!step && !finished) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-[13px] text-warm-600">
        Cette simulation ne contient aucune étape.
      </div>
    )
  }

  const gradable = steps.filter((s) => s.action.type !== "READ").length
  const evaluationNotee = mode === "EVALUATION"
  /** Nature de l'étape et critère de réussite, tous deux déduits de l'action. */
  const nature = step ? natureEtape(step.action, mode) : "action"
  const attendu = step ? resumerAttendu(step.action) : null
  /** Chapitre suivant du parcours, proposé sur le jalon de fin. */
  const chapitreSuivant = (() => {
    if (!sommaire || sommaire.length === 0) return null
    const i = sommaire.findIndex((e) => e.id === chapterId)
    return i >= 0 && i < sommaire.length - 1 ? sommaire[i + 1] : null
  })()
  /**
   * Fil d'Ariane sans répétition. Les titres d'évaluation portent déjà le nom du
   * module (« S'évaluer · Prise en main ») : les concaténer donnait
   * « Prise en main · S'évaluer · Prise en main » en haut de chaque évaluation.
   */
  const filModule = scenario.moduleTitle ?? ""
  // Le module a-t-il une affiche ? On teste le NUMÉRO, pas l'élément JSX :
  // `<AfficheModule/>` est toujours truthy même quand il rend null, et le repli
  // n'aurait jamais eu lieu.
  const affiche = numeroModule(scenario.moduleTitle) !== null
  const filChapitre = (() => {
    const t = scenario.title
    if (!filModule) return t
    const suffixe = ` · ${filModule}`
    if (t.endsWith(suffixe)) return t.slice(0, -suffixe.length)
    if (t === filModule) return t
    return t
  })()

  return (
    <div
      ref={carteRef}
      // Plein cadre : une colonne verticale qui remplit exactement son conteneur
      // et n'a AUCUN défilement. C'est la structure elle-même qui rend le
      // débordement impossible — la consigne du bas ne peut plus être poussée
      // hors de l'écran, ni une barre de défilement apparaître.
      className={
        pleinCadre
          ? "relative flex h-full min-h-0 flex-col overflow-hidden bg-white"
          : "relative overflow-hidden border border-border bg-white shadow-sm"
      }
      style={pleinCadre ? undefined : { borderRadius: 16 }}
    >
      {!introVue && step && (
        <div
          className="absolute inset-0 z-40 flex flex-col justify-center overflow-hidden px-6 py-8 sm:px-10"
          style={{ background: "linear-gradient(180deg,#faf9f5 0%,#f2efe8 100%)" }}
        >
          {/* Affiche du module (direction B, 29/07/2026). Une par module, la même
              pour ses leçons, ses exercices et son évaluation. Le repli
              ci-dessous — le mini-classeur — ne sert plus qu'aux modules dont
              l'affiche n'est pas encore dessinée : il était affiché sur les 246
              chapitres et ne parlait que du module 6. */}
          {affiche ? (
            <div
              aria-hidden
              // Centrage par le FLUX, pas par `translateY(-50%)` : l'animation
              // d'entrée pose son propre `transform` et écrasait la translation
              // de centrage — l'affiche se retrouvait décalée d'une demi-hauteur
              // vers le bas, ce que l'ancien visuel subissait déjà.
              className="pointer-events-none absolute hidden select-none lg:flex lg:items-center"
              style={{ right: "6%", top: 0, bottom: 0, width: 372, animation: "sim-intro-monte .9s .35s ease both" }}
            >
              <AfficheModule moduleTitle={scenario.moduleTitle} />
            </div>
          ) : (
          <div
            aria-hidden
            className="pointer-events-none absolute hidden select-none lg:block"
            style={{
              right: "6%",
              top: "50%",
              width: 372,
              transform: "translateY(-50%) perspective(1200px) rotateY(-15deg) rotateX(5deg)",
              animation: "sim-intro-monte .9s .35s ease both",
            }}
          >
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 30px 60px -24px rgba(16,32,27,.35)", background: "#fff", border: "1px solid #DDD8CE" }}>
              <div style={{ background: "#107C41", color: "#fff", padding: "7px 11px", fontSize: 11, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ background: "rgba(255,255,255,.22)", borderRadius: 3, padding: "1px 5px", fontWeight: 700, fontSize: 9 }}>X</span>
                Classeur
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
                <tbody>
                  <tr>
                    {["", "A", "B", "C"].map((c) => (
                      <td key={c} style={{ background: "#F5F3EF", color: "#8D8880", border: "1px solid #E4E0D8", textAlign: "center", height: 19, width: c === "" ? 26 : undefined }}>
                        {c}
                      </td>
                    ))}
                  </tr>
                  {[
                    ["1", "Trimestre", "Ventes", ""],
                    ["2", "Janvier", "1 250", ""],
                    ["3", "Février", "1 480", ""],
                    ["4", "Mars", "1 620", ""],
                    ["5", "Total", "4 350", ""],
                  ].map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td
                          key={j}
                          style={{
                            border: "1px solid #EDEAE3",
                            height: 20,
                            padding: "0 5px",
                            color: j === 0 ? "#8D8880" : "#22302B",
                            background: j === 0 ? "#F5F3EF" : i === 4 ? "#EAF6EF" : "#fff",
                            textAlign: j === 2 ? "right" : "left",
                            fontWeight: i === 4 ? 700 : 400,
                            outline: i === 4 && j === 2 ? "2px solid #107C41" : undefined,
                            outlineOffset: -2,
                          }}
                        >
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ background: "#10201B", color: "#8FE3B3", fontSize: 11.5, padding: "7px 11px", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>
                =SOMME(B2:B4)
              </div>
            </div>
          </div>
          )}
          <div className="relative" style={{ maxWidth: 620 }}>
            <div
              className="uppercase"
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "2.2px",
                color: "#187a4e",
                marginBottom: 14,
                animation: "sim-intro-monte .6s .1s ease both",
              }}
            >
              {mode === "LESSON" ? "Leçon" : mode === "EXERCISE" ? "Exercice" : "Évaluation"}
              {filModule && filModule !== filChapitre ? ` — ${filModule}` : ""}
            </div>
            <h2
              style={{
                fontSize: "clamp(24px, 4.5vw, 40px)",
                lineHeight: 1.06,
                fontWeight: 850,
                letterSpacing: "-0.8px",
                color: "#171a18",
                marginBottom: 14,
                animation: "sim-intro-monte .7s .25s ease both",
              }}
            >
              {scenario.intro?.title || scenario.title}
            </h2>
            {scenario.intro?.body && (
              <p
                style={{
                  fontSize: "clamp(13px, 1.8vw, 15.5px)",
                  color: "#3c423e",
                  lineHeight: 1.6,
                  marginBottom: 16,
                  animation: "sim-intro-monte .6s .45s ease both",
                }}
              >
                {scenario.intro.body}
              </p>
            )}
            <div
              style={{
                fontSize: 12.5,
                color: "#9aa19c",
                marginBottom: 22,
                animation: "sim-intro-monte .6s .55s ease both",
              }}
            >
              {total} étape{total > 1 ? "s" : ""} · ≈ {estimatedSimulationMinutes(mode, total)} min
              {mode === "EVALUATION" ? " · sans aide, score enregistré" : ""}
            </div>
            <button
              type="button"
              data-control="intro-commencer"
              onClick={() => {
                setIntroVue(true)
                // Sans cela le focus clavier reste sur le bouton : la première
                // frappe de la leçon n'atteint jamais la grille (même piège que
                // le bouton « Suivant »).
                window.setTimeout(() => gridRef.current?.focus(), 60)
              }}
              className="inline-flex items-center gap-2.5 rounded-xl"
              style={{
                background: "#171a18",
                color: "#fff",
                fontSize: 14.5,
                fontWeight: 700,
                padding: "12px 22px",
                animation: "sim-intro-monte .7s .7s ease both",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "8px solid #fff",
                  borderTop: "5.5px solid transparent",
                  borderBottom: "5.5px solid transparent",
                }}
              />
              {mode === "LESSON"
                ? "Commencer la leçon"
                : mode === "EXERCISE"
                  ? "Commencer l'exercice"
                  : "Commencer l'évaluation"}
            </button>
          </div>
        </div>
      )}
      {/* Cockpit : une seule barre haute qui porte le repérage et les commandes.
          Avant, deux bandeaux se superposaient (en-tête ivoire pâle + barre de
          titre Excel) et la progression tenait dans un « 1 / 8 » gris de 12 px.
          Le mode évaluation se signalait par un mot beige : il colore désormais
          toute la barre. */}
      <div
        className="flex flex-shrink-0 items-center gap-2 px-2 sm:gap-3 sm:px-3"
        style={{
          height: 44,
          background: evaluationNotee ? "#3A2410" : "#10201B",
          color: "#fff",
          fontSize: 12,
        }}
      >
        {sommaire && sommaire.length > 0 && (
          <button
            type="button"
            data-control="sim-sommaire"
            onClick={() => setPanneau((p) => (p === "lecons" ? null : "lecons"))}
            aria-label="Toutes les leçons"
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
            style={{
              height: 28,
              background: panneau === "lecons" ? "#fff" : "rgba(255,255,255,.09)",
              color: panneau === "lecons" ? "#10201B" : "#DCE6E1",
              fontSize: 11.5,
              fontWeight: panneau === "lecons" ? 600 : 400,
            }}
          >
            <span aria-hidden>☰</span>
            <span className="hidden sm:inline">Leçons</span>
          </button>
        )}
        {onNote && (
          <button
            type="button"
            data-control="sim-notes"
            onClick={() => setPanneau((p) => (p === "notes" ? null : "notes"))}
            aria-label="Mes notes"
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
            style={{
              height: 28,
              background: panneau === "notes" ? "#fff" : "rgba(255,255,255,.09)",
              color: panneau === "notes" ? "#10201B" : "#DCE6E1",
              fontSize: 11.5,
              fontWeight: panneau === "notes" ? 600 : 400,
            }}
          >
            <span aria-hidden>✎</span>
            <span className="hidden sm:inline">Notes</span>
            {note && note.trim() !== "" && (
              <span aria-hidden style={{ width: 5, height: 5, borderRadius: 9, background: "#4ED08A" }} />
            )}
          </button>
        )}
        <div className="min-w-0 flex-1 truncate text-left sm:text-center" style={{ color: "#8FA49C" }}>
          {evaluationNotee && (
            <span
              className="mr-2 rounded-full"
              style={{ background: "#C6902A", color: "#231604", fontSize: 9.5, fontWeight: 800, padding: "2px 7px", letterSpacing: ".08em" }}
            >
              ÉVALUATION NOTÉE
            </span>
          )}
          {/* Sur téléphone la barre ne peut pas tout porter : le module cède la
              place au titre du chapitre, la seule information dont l'apprenant a
              besoin en permanence. */}
          {filModule && filModule !== filChapitre && (
            <span className="hidden sm:inline">{filModule}&nbsp;&nbsp;|&nbsp;&nbsp;</span>
          )}
          <b style={{ color: "#fff", fontWeight: 600 }}>{filChapitre}</b>
        </div>
        {/* Progression : segments quand le chapitre est court (on voit le chemin
            entier), barre continue au-delà — vingt segments ne se lisent plus. */}
        {total <= 14 ? (
          <div className="hidden flex-shrink-0 items-center gap-[3px] sm:flex" aria-hidden>
            {steps.map((_, i) => (
              <span
                // La clé du segment courant embarque le compteur de relais : elle
                // change à chaque avancée, ce qui rejoue son animation.
                key={i === index ? `cur${relais}` : i}
                style={{
                  display: "block",
                  width: 13,
                  height: 4,
                  borderRadius: 9,
                  background: i < index ? "#4ED08A" : i === index ? "#fff" : "rgba(255,255,255,.16)",
                  transition: "background-color .3s ease",
                  animation: i === index && relais ? "sim-seg-pop .5s cubic-bezier(.2,.9,.2,1) both" : undefined,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="hidden flex-shrink-0 sm:block" aria-hidden style={{ width: 96, height: 4, borderRadius: 9, background: "rgba(255,255,255,.16)" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 9, background: "#4ED08A", width: `${Math.round((index / Math.max(1, total)) * 100)}%` }} />
          </div>
        )}
        <span className="flex-shrink-0 tabular-nums" style={{ color: "#8FA49C" }}>
          {Math.min(index + 1, total)}/{total}
        </span>
        {onQuitter && (
          <button
            type="button"
            data-control="sim-quitter"
            onClick={onQuitter}
            title="Quitter l'atelier"
            aria-label="Quitter l'atelier"
            className="flex flex-shrink-0 items-center justify-center rounded-lg"
            style={{ width: 28, height: 28, background: "rgba(255,255,255,.07)", color: "#CFDAD5", fontSize: 13 }}
          >
            ✕
          </button>
        )}
      </div>

      {finished ? (
        /* Jalon de fin de chapitre (traitement « C », choix Samuel du 29/07).
           Réservé à la FIN : une carte à chaque étape imposerait douze secondes
           d'attente par leçon, et la phrase d'acquis n'existe pas pour les
           1 872 étapes — ici le titre du chapitre suffit à la porter. */
        <div
          className={
            pleinCadre
              ? "flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-10 text-center"
              : "px-5 py-10 text-center"
          }
        >
          <div
            className="w-full rounded-2xl border border-border bg-white px-6 py-7 shadow-sm"
            style={{ maxWidth: 430, animation: "sim-jalon-carte .42s cubic-bezier(.2,.9,.2,1) both" }}
          >
            <div
              aria-hidden
              className="mx-auto mb-3 flex items-center justify-center rounded-full"
              style={{
                width: 46,
                height: 46,
                background: evaluationNotee ? "#FBF1DF" : "#E7F3EB",
                color: evaluationNotee ? "#8A5A12" : "#107C41",
                fontSize: 22,
                animation: "sim-jalon-rond .5s .1s cubic-bezier(.2,.9,.2,1) both",
              }}
            >
              ✓
            </div>
            <p className="font-display text-[17px] font-bold text-ink">
              {mode === "EVALUATION" ? "Évaluation terminée" : "Chapitre terminé"}
            </p>
            <p className="mt-1 text-[13.5px] text-warm-600">{filChapitre}</p>
            {mode === "EVALUATION" ? (
              <p className="mt-3 text-[13px] text-warm-700">
                Score :{" "}
                <span className="font-semibold text-emerald-700">
                  {Math.round(computeScore(steps, firstTryRef.current) * 100)} %
                </span>{" "}
                sur {gradable} action{gradable > 1 ? "s" : ""} évaluée{gradable > 1 ? "s" : ""}
              </p>
            ) : (
              <p className="mt-3 text-[13px] text-warm-500">
                {total} étape{total > 1 ? "s" : ""} franchie{total > 1 ? "s" : ""}
              </p>
            )}
            {chapitreSuivant && onNaviguer && (
              <button
                type="button"
                data-control="sim-chapitre-suivant"
                onClick={() => onNaviguer(chapitreSuivant.id)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold text-white"
                style={{ background: "#10201B" }}
              >
                Chapitre suivant
                <span aria-hidden>›</span>
              </button>
            )}
            {chapitreSuivant && (
              <p className="mt-2.5 truncate text-[12px] text-warm-400">{chapitreSuivant.titre}</p>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Fenêtre Excel simulée. En plein cadre elle prend tout l'espace laissé
              par le cockpit et la bande de consigne — ni plus, ni moins. */}
          {/* Le poste de travail enveloppe la fenêtre Excel quand le scénario le
              déclare ; sinon on garde le conteneur d'origine et rien ne change
              pour les 243 chapitres existants. */}
          {/* Conteneur de l'atelier : il porte le calque de démonstration, qui
              doit rester visible même quand le classeur est masqué. */}
          <div
            ref={zoneAtelierRef}
            className={pleinCadre ? "relative flex min-h-0 flex-1 flex-col" : "relative"}
          >
          <Enveloppe
            poste={posteActif ? poste : null}
            pleinCadre={!!pleinCadre}
            onControl={handleControl}
            onEnregistrer={(nom) => gestePoste(CONTROLES_POSTE.enregistrerValider, nom)}
            onOuvrir={(nom) => gestePoste(CONTROLES_POSTE.ouvrirValider, nom)}
            decor={decorPoste}
            highlight={highlightedControl}
          >
            {/* Jalon d'étape franchie : il couvre la feuille, jamais la bande de
                consigne — la consigne suivante reste lisible pendant ce temps. */}
            {jalon && (
              <div
                aria-hidden
                className="absolute inset-0 z-40 flex items-center justify-center px-6"
                style={{
                  background: "rgba(8,17,14,.45)",
                  animation: "sim-jalon-fond 1.15s ease both",
                  // Purement décoratif : sans cela il avale le clic d'un apprenant
                  // qui enchaîne sans attendre la fin de l'animation — c'est le
                  // joueur automatique qui l'a attrapé, sur l'étape suivant la
                  // première réussite de quatre scénarios sur six.
                  pointerEvents: "none",
                }}
              >
                <div
                  className="rounded-2xl bg-white px-6 py-4 text-center shadow-2xl"
                  style={{ animation: "sim-jalon-carte .34s cubic-bezier(.2,.9,.2,1) both", maxWidth: 340 }}
                >
                  <div
                    aria-hidden
                    className="mx-auto mb-2 flex items-center justify-center rounded-full"
                    style={{
                      width: 34,
                      height: 34,
                      background: "#E7F3EB",
                      color: "#107C41",
                      fontSize: 17,
                      animation: "sim-jalon-rond .44s .06s cubic-bezier(.2,.9,.2,1) both",
                    }}
                  >
                    ✓
                  </div>
                  <p className="font-display text-[14.5px] font-bold text-ink">Étape {jalon.n} franchie</p>
                  {jalon.texte && <p className="mt-0.5 text-[12px] text-warm-500">{jalon.texte}</p>}
                </div>
              </div>
            )}
            <SimulationChrome
              tabs={scenario.ribbon}
              state={
                step?.setup?.ribbon
                  ? { ...step.setup.ribbon, activeTab: onglet }
                  : { activeTab: onglet }
              }
              fileName={scenario.workbook.fileName}
              avecPoste={posteActif}
              barreTitrePoste={decorPoste}
              selection={selection}
              formulaText={formulaText}
              highlight={highlightedControl}
              onControl={handleControl}
              onTabChange={setOnglet}
              nameBoxDraft={nameBoxDraft}
              onNameBoxChange={setNameBoxDraft}
              onNameBoxCommit={commitNameBox}
              onNameBoxCancel={() => setNameBoxDraft(null)}
            />
            {/* Les couches se posent DANS ce conteneur, dont le coin haut-gauche
                est celui de la grille : elles peuvent donc placer un cadre ou une
                feuille de papier avec les coordonnées que la grille leur donne.
                Le relais d'observation est en phase de capture pour arriver avant
                que la couche n'ait rendu à nouveau. */}
            <div
              ref={zoneGrilleRef}
              // Repère de mesure : `getCellRect` rend des coordonnées RELATIVES
              // à ce conteneur. Sans lui, un contrôle automatique qui veut
              // cliquer une cellule doit deviner l'origine — et tape à côté.
              data-zone-grille=""
              className={
                pleinCadre
                  ? "relative min-h-0 flex-1 overflow-hidden border border-t-0 border-neutral-300"
                  : "relative overflow-hidden border border-t-0 border-neutral-300"
              }
              style={pleinCadre ? undefined : { height: hauteurGrille }}
              onClickCapture={besoins.miseEnPage || besoins.tcd || besoins.graphique ? relaisControleCouche : undefined}
            >
              <ExcelGrid onReady={handleReady} onAction={handleAction} heightPx={hauteurGrille} />
              {besoins.miseEnPage && (
                <PageLayoutLayer
                  pageSetup={reglages}
                  pages={pagination}
                  metrique={metrique}
                  onChange={changerReglages}
                  fichier={scenario.workbook.fileName}
                  feuille={sheets.find((s) => s.active)?.name}
                />
              )}
              {besoins.tcd && tcd && (
                <PivotLayer
                  pivot={tcd}
                  tableau={tableauTcd}
                  champs={champsTcd}
                  onDropField={deposerChamp}
                  onSetAgg={changerAgregat}
                  onRefresh={actualiserTcd}
                  onRemoveField={retirerChamp}
                  onSetStyle={changerStyleTcd}
                  valeursFiltre={valeursFiltre}
                  onSetFilterValues={changerValeursFiltre}
                  zoneParDefaut={zoneParDefautTcd}
                  /* Fond OPAQUE. À 95 %, les 5 % restants laissaient passer la
                     feuille source ET les cellules du tableau croisé écrites
                     dedans : trois lectures du même contenu se superposaient,
                     en-têtes de colonnes compris. Un tableau croisé, dans Excel,
                     ne se lit jamais par-dessus ses données. */
                  className="absolute inset-0 z-10 bg-white"
                />
              )}
              {besoins.graphique && (
                <ChartLayer
                  chart={graphique}
                  valeurs={valeursGraphique}
                  onSelectElement={choisirElementGraphique}
                  onMove={deplacerGraphique}
                />
              )}
              {halo && !demo && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute rounded-[3px] ring-2 ring-amber-400 ring-offset-0 animate-pulse"
                  style={{
                    left: halo.left,
                    top: halo.top,
                    width: halo.width,
                    height: halo.height,
                    zIndex: 20,
                    boxShadow: "0 0 0 5px rgba(251,191,36,0.28)",
                  }}
                />
              )}
              {/* Bulle d'aide ANCRÉE à la cellule cible : le guide vit sur la
                  feuille, pas seulement en petit texte sous l'écran. */}
              {halo && hintShown && step?.aide?.text && !demo && (
                <div
                  className="pointer-events-none absolute rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-amber-900 shadow-md ring-1 ring-amber-300"
                  style={{
                    maxWidth: 260,
                    zIndex: 30,
                    // Placement qui évite la zone de travail : à DROITE de la cible
                    // quand la feuille en laisse la place, au-dessus sinon, et en
                    // dernier recours dessous mais décalée — posée à plat sous la
                    // cellule, elle recouvrait A2:C3, soit l'essentiel de l'espace
                    // utile sur téléphone.
                    ...(largeurGrille - (halo.left + halo.width) > 240
                      ? { left: halo.left + halo.width + 12, top: Math.max(4, halo.top - 2) }
                      : halo.top > 120
                        ? { left: Math.max(4, halo.left), top: halo.top - 10, transform: "translateY(-100%)" }
                        : { left: Math.max(4, halo.left + halo.width + 10), top: halo.top + halo.height + 10 }),
                  }}
                >
                  <span aria-hidden>👉 </span>
                  {step.aide.text}
                </div>
              )}
              {fx?.rect && (
                <div
                  key={fx.k}
                  aria-hidden
                  className="pointer-events-none absolute rounded-[3px]"
                  style={{
                    left: fx.rect.left,
                    top: fx.rect.top,
                    width: fx.rect.width,
                    height: fx.rect.height,
                    zIndex: 20,
                    backgroundColor: fx.kind === "ok" ? "rgba(16,185,129,0.14)" : "rgba(244,63,94,0.14)",
                    boxShadow:
                      fx.kind === "ok"
                        ? "0 0 0 3px #10b981, 0 0 0 7px rgba(16,185,129,0.25)"
                        : "0 0 0 3px #f43f5e, 0 0 0 7px rgba(244,63,94,0.25)",
                    animation:
                      fx.kind === "ok"
                        ? "sim-flash 1.4s ease forwards"
                        : "sim-shake .5s ease, sim-flash 2.8s ease forwards",
                  }}
                />
              )}
              {fx && (
                <div
                  key={`t${fx.k}`}
                  className="pointer-events-none absolute flex justify-center"
                  style={{ left: 0, right: 0, top: 8, zIndex: 30 }}
                >
                  <div
                    className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold shadow-lg"
                    style={{
                      animation: `sim-pop ${fx.kind === "ok" ? "1.4s" : "2.8s"} ease forwards`,
                      maxWidth: "85%",
                      color: "#fff",
                      backgroundColor: fx.kind === "ok" ? "#059669" : "#e11d48",
                    }}
                  >
                    {fx.kind === "ok" ? "✓ C'est exact" : fx.message || "Ce n'est pas encore ça — réessayez."}
                  </div>
                </div>
              )}
              <style>{`
@keyframes sim-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
@keyframes sim-pop{0%{opacity:0;transform:translateY(-6px) scale(.96)}10%{opacity:1;transform:translateY(0) scale(1)}80%{opacity:1}100%{opacity:0}}
@keyframes sim-flash{0%{opacity:0}10%{opacity:1}65%{opacity:1}100%{opacity:0}}
@keyframes sim-intro-monte{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes sim-intro-cell{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes sim-consigne-in{from{opacity:0;transform:translateY(11px)}to{opacity:1;transform:translateY(0)}}
@keyframes sim-etape-pop{0%{transform:scale(.82);opacity:.3}55%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes sim-coche{0%{opacity:0;transform:translateY(-50%) scale(.5)}18%{opacity:1;transform:translateY(-50%) scale(1.12)}32%{transform:translateY(-50%) scale(1)}74%{opacity:1}100%{opacity:0;transform:translateY(-50%) scale(.92)}}
@keyframes sim-seg-pop{0%{transform:scaleX(.2)}55%{transform:scaleX(1.35)}100%{transform:scaleX(1)}}
@keyframes sim-jalon-carte{0%{opacity:0;transform:scale(.92) translateY(10px)}100%{opacity:1;transform:scale(1) translateY(0)}}
@keyframes sim-jalon-rond{0%{transform:scale(.5);opacity:0}45%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes sim-jalon-fond{0%{opacity:0}14%{opacity:1}76%{opacity:1}100%{opacity:0}}
/* Un apprenant qui a demandé moins d'animations garde le repère, sans mouvement. */
@media (prefers-reduced-motion: reduce){
  [style*="sim-consigne-in"],[style*="sim-etape-pop"],[style*="sim-coche"],[style*="sim-jalon-carte"],[style*="sim-jalon-rond"]{animation-duration:.01ms !important;animation-iteration-count:1 !important}
}
`}</style>
            </div>
            {/* Bas de la fenêtre Excel — SOUS la grille, comme dans le logiciel. */}
            <div className="flex-shrink-0">
              <SimulationFooter
                sheets={sheets}
                onSheet={handleSheet}
                onControl={handleControl}
                highlight={highlightedControl}
                stats={stats}
                aggregates={step?.setup?.statusBar?.aggregates ?? scenario.statusBar?.aggregates}
              />
            </div>
            {besoins.macros && (
              <div
                className={pleinCadre ? "flex-shrink-0 overflow-y-auto pt-2" : "pt-2"}
                style={pleinCadre ? { maxHeight: "38%" } : undefined}
                onClickCapture={relaisControleCouche}
              >
                <MacroPanel
                  macros={macros}
                  courante={macroCourante}
                  enregistrement={enregistrement?.actif ? "started" : "stopped"}
                  code={codeMacro}
                  onDemarrer={demarrerMacro}
                  onArreter={arreterMacro}
                  onChangerCode={(c) => {
                    codeMacroRef.current = c
                    setCodeMacro(c)
                  }}
                  onExecuter={executerMacroNommee}
                  onRaccourci={changerRaccourci}
                  onSupprimer={supprimerMacro}
                  commande={commandeMacro ?? undefined}
                />
              </div>
            )}
          </Enveloppe>
            {demo && (
              <DemonstrationGeste
                key={`demo${index}-${rejeu}`}
                onFini={() => {
                  setDemoFinie(true)
                  rendreClasseur()
                }}
                plan={demo}
                resoudre={resoudreCible}
                onEcrire={ecrireDemo}
                // Changer d'onglet ne valide rien — c'est déjà le cas quand
                // l'apprenant explore le ruban lui-même.
                onOnglet={(t) => setOnglet(t as RibbonTab)}
                onDefinir={definirDemo}
                onSelectionner={selectionnerDemo}
                onPresser={presserDemo}
                lecture={step?.action.type === "READ"}
                largeur={zoneAtelierRef.current?.clientWidth ?? 640}
                /* Première ligne de la feuille dans le repère du calque : le
                   bord haut de la grille, plus les en-têtes de colonnes. La
                   bulle ne remonte jamais au-dessus de cette limite. */
                hautFeuille={
                  zoneGrilleRef.current && zoneAtelierRef.current
                    ? zoneGrilleRef.current.getBoundingClientRect().top -
                      zoneAtelierRef.current.getBoundingClientRect().top +
                      20
                    : 0
                }
              />
            )}
          </div>

          {/* Bande de consigne : pleine largeur sous la feuille, filet de couleur
              à gauche qui porte le verdict. Le texte est passé à 15 px — c'est la
              phrase que l'apprenant relit à chaque geste, elle ne peut pas être
              plus petite que le contenu de la feuille. */}
          <div
            className="relative flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden border-t border-border px-4 py-3"
            style={{
              borderLeft: `4px solid ${
                relaisActif ? "#22A75A"
                : step?.action.type === "READ" ? "#3E5A67"
                : verdict ? (verdict.ok ? "#059669" : "#e11d48")
                : "#107C41"
              }`,
              background:
                relaisActif ? "#F2FBF6"
                : step?.action.type === "READ" ? "#fff"
                : verdict ? (verdict.ok ? "#F2FBF6" : "#FEF4F5")
                : "#fff",
              transition: "background-color .3s ease, border-color .3s ease",
            }}
          >
            {/* Coche de franchissement : elle prend la place du numéro d'étape le
                temps que la nouvelle consigne s'installe. */}
            {relaisActif && (
              <span
                aria-hidden
                data-relais="coche"
                className="absolute flex items-center justify-center rounded-full text-white"
                style={{
                  left: 16,
                  top: "50%",
                  width: 26,
                  height: 26,
                  background: "#22A75A",
                  fontSize: 14,
                  fontWeight: 700,
                  zIndex: 3,
                  // Purement décorative : elle ne doit jamais intercepter un clic.
                  pointerEvents: "none",
                  animation: "sim-coche .78s cubic-bezier(.2,.9,.2,1) both",
                }}
              >
                ✓
              </span>
            )}
            <div
              // La clé force le remontage à chaque étape : sans elle, React
              // réutilise le nœud et l'animation d'entrée ne rejoue jamais.
              key={`tx${index}`}
              className="min-w-0 flex-1"
              style={{
                animation: relais ? "sim-consigne-in .34s cubic-bezier(.2,.85,.25,1) both" : undefined,
              }}
            >
              {/* Nature de l'étape : la question qu'un débutant se pose en premier,
                  « est-ce que je dois faire quelque chose ou seulement lire ? ».
                  Elle n'avait aucune réponse à l'écran. */}
              <span
                className="mb-1.5 inline-flex items-center gap-1.5 rounded-md uppercase"
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: ".07em",
                  padding: "4px 8px",
                  color: nature === "lecture" ? "#3E5A67" : nature === "evaluee" ? "#8A5A12" : "#107C41",
                  background:
                    nature === "lecture" ? "#E8F0F3" : nature === "evaluee" ? "#FBF1DF" : "#E7F3EB",
                  visibility: relaisActif ? "hidden" : undefined,
                  animation: relais ? "sim-etape-pop .5s cubic-bezier(.2,.9,.2,1) both" : undefined,
                }}
              >
                <span aria-hidden>{nature === "lecture" ? "👁" : nature === "evaluee" ? "★" : "✋"}</span>
                {/* « À lire » datait du temps où ces écrans n'étaient qu'un
                    paragraphe. Ils portent maintenant une démonstration jouée :
                    on y REGARDE et on COMPREND, il n'y a rien à lire seul. */}
                {nature === "lecture"
                  ? evaluationNotee
                    ? "Énoncé"
                    : "À comprendre"
                  : nature === "evaluee"
                  ? "Évalué"
                  : "À vous de jouer"}
              </span>
              <div style={{ fontSize: 15, lineHeight: 1.45 }}>
                {step && <Consigne text={step.consigne} />}
              </div>
              {/* Dire explicitement qu'on n'attend rien : sans cette ligne,
                  l'apprenant cherche ce qu'il doit faire pendant que la
                  démonstration se joue. */}
              {nature === "lecture" && step?.montrer?.length ? (
                <p className="mt-1.5 text-[12.5px] text-warm-500">
                  <span aria-hidden>👁 </span>
                  Démonstration à l’écran — <b className="font-semibold">aucune action attendue</b>.
                </p>
              ) : null}
              {/* Critère de réussite, déduit de l'étape : la consigne dit quoi
                  faire, jamais à quoi on reconnaît que c'est fait. */}
              {attendu && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-warm-500">
                  <span aria-hidden>◎</span>
                  Attendu : <b className="font-semibold text-ink">{attendu}</b>
                </p>
              )}
              {evaluationNotee && nature !== "lecture" && (
                <p className="mt-1 text-[12px]" style={{ color: "#8A5A12" }}>
                  <span aria-hidden>★ </span>Compté dans votre note
                </p>
              )}
              {/* L'aide ne vit qu'à UN endroit : dans la bulle ancrée à la cible
                  quand elle peut l'être, ici sinon. Les deux s'affichaient, mot
                  pour mot, sous la consigne et sur la feuille. */}
              {mode !== "EVALUATION" && step?.aide?.text && hintShown && !halo && (
                <p className="mt-1.5 text-[13px] text-warm-600">
                  <span aria-hidden>👉 </span>
                  {step.aide.text}
                </p>
              )}
              {/* Écran de lecture : l'apprenant qui tape ou clique par réflexe ne
                  voyait RIEN — la saisie est refusée en silence par le verrou de
                  cellules, et le verdict ne sert qu'à teinter le fond. On le lui
                  dit, en gris, sans le moindre air de reproche. */}
              {step?.action.type === "READ" && verdict && !verdict.ok && (
                <p className="mt-1.5 text-[13px] text-warm-600">
                  <span aria-hidden>💡 </span>
                  {verdict.message}
                </p>
              )}
              {/* Aide progressive : l'apprenant coincé n'est jamais laissé sans issue. */}
              {step && step.action.type !== "READ" && (essais >= 3 || tatonnements >= 6 || tropLong) && !demonstration && (
                <div
                  className="mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
                  style={{ background: "#FDEDEC", border: "1px solid #F3D2CE", color: "#7A2620" }}
                >
                  <span className="min-w-0 flex-1">
                    <b>Vous bloquez ?</b>{" "}
                    {evaluationNotee
                      ? "Vous pouvez passer cette question — elle sera comptée comme non réussie."
                      : "Je peux vous montrer comment faire, vous pourrez ensuite continuer."}
                  </span>
                  <button
                    type="button"
                    data-control="sim-montrer"
                    onClick={() => setDemonstration(true)}
                    className="flex-shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold"
                    style={{ border: "1px solid currentColor", color: "inherit" }}
                  >
                    {evaluationNotee ? "Passer la question" : "Montrez-moi"}
                  </button>
                </div>
              )}
              {step && demonstration && step.action.type !== "READ" && (
                <div
                  className="mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
                  style={
                    evaluationNotee
                      ? { background: "#FBF1DF", border: "1px solid #EBD9B4", color: "#6B4C10" }
                      : { background: "#E7F3EB", border: "1px solid #BFE3CD", color: "#0C5B31" }
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span aria-hidden>{evaluationNotee ? "★ " : "👉 "}</span>
                    {evaluationNotee ? (
                      <>
                        <b>Question passée.</b> Elle sera comptée comme non réussie dans votre note.
                      </>
                    ) : (
                      <>
                        <b>Voici la réponse.</b>{" "}
                        {reponseAttendue(step.action) ??
                          "Suivez le repère affiché à l'écran, puis reprenez le geste."}
                      </>
                    )}
                  </span>
                  {/* Rejouer la démonstration : elle dure quelques secondes et un
                      apprenant qui a regardé ailleurs n'avait aucun moyen de la
                      revoir — il fallait recharger le chapitre. */}
                  {demo && demoFinie && (
                    <button
                      type="button"
                      data-control="sim-revoir-demo"
                      onClick={() => {
                        setDemoFinie(false)
                        setRejeu((n) => n + 1)
                      }}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold"
                      style={{ border: "1px solid currentColor", color: "inherit" }}
                    >
                      <span aria-hidden>↻</span> Revoir la démonstration
                    </button>
                  )}
                  <button
                    type="button"
                    data-control="sim-debloquer"
                    onClick={goNext}
                    className="flex-shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold"
                    style={{ border: "1px solid currentColor", color: "inherit" }}
                  >
                    {evaluationNotee ? "Question suivante ›" : "J'ai compris — continuer ›"}
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {/* Retour en arrière. Il ne portait qu'un chevron « ‹ » gris pâle,
                  sans libellé : personne ne comprenait que c'était le retour à
                  l'étape précédente. Il dit maintenant ce qu'il fait, et à
                  quelle étape il ramène. */}
              {reculPossible && (
                <button
                  type="button"
                  data-control="sim-reculer"
                  onClick={() => setReculDemande(true)}
                  aria-label={`Revenir à l'étape ${index} sur ${total}`}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
                  style={{ border: "1px solid #D6D0C5", color: "#3C433F", background: "#fff" }}
                >
                  <span aria-hidden style={{ fontSize: 15, lineHeight: 1, marginTop: -1 }}>
                    ‹
                  </span>
                  <span className="hidden sm:inline">Étape précédente</span>
                  <span className="sm:hidden">Précédent</span>
                  <span
                    aria-hidden
                    className="rounded px-1.5 py-0.5 text-[10.5px] font-bold"
                    style={{ background: "#F0EDE6", color: "#6b6862" }}
                  >
                    {index} / {total}
                  </span>
                </button>
              )}
              {mode === "EXERCISE" && !hintShown && step?.aide && (
                <button
                  type="button"
                  onClick={revealHint}
                  className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium text-warm-700 hover:bg-warm-50"
                >
                  Un indice
                </button>
              )}
              {/* Écran de lecture qui décrit un geste : on le MONTRE. Le
                  paragraphe devient une démonstration jouée, rejouable, sans
                  rien exiger de l'apprenant — il regarde, puis il continue. */}
              {/* Elle se joue seule à l'ouverture ; ce bouton ne sert plus qu'au
                  cas où l'apprenant arrive après coup. */}
              {step?.action.type === "READ" && step.montrer && !demonstration && (
                <button
                  type="button"
                  data-control="sim-voir-geste"
                  onClick={() => {
                    setDemoFinie(false)
                    setDemonstration(true)
                  }}
                  className="rounded-lg px-4 py-2 text-[12.5px] font-bold text-white"
                  style={{ background: "#107C41" }}
                >
                  <span aria-hidden>▶</span> Voir le geste
                </button>
              )}
              {step?.action.type === "READ" && step.montrer && demonstration && demoFinie && (
                <button
                  type="button"
                  data-control="sim-revoir-geste"
                  onClick={() => {
                    setDemoFinie(false)
                    setRejeu((n) => n + 1)
                  }}
                  className="rounded-lg border px-4 py-2 text-[12.5px] font-bold"
                  style={{ borderColor: "#107C41", color: "#107C41" }}
                >
                  <span aria-hidden>↻</span> Revoir
                </button>
              )}
              {step?.action.type === "READ" && (
                <button
                  type="button"
                  // Identifiant stable : le libellé a changé, un test qui vise le
                  // texte se casse à chaque reformulation.
                  data-control="sim-suivant"
                  onClick={() => handleAction({ kind: "next" })}
                  // « Suivant » n'indiquait pas qu'il n'y avait rien d'autre à
                  // faire sur cette étape : le libellé le dit maintenant.
                  // Couleur d'action propre au simulateur : `bg-primary` prenait la
                  // couleur du partenaire (violette, puis turquoise) au milieu d'un
                  // univers vert Excel et ivoire.
                  className="rounded-lg px-4 py-2 text-[12.5px] font-bold text-white"
                  style={{ background: evaluationNotee ? "#10201B" : "#3E5A67" }}
                >
                  J&apos;ai compris, continuer ›
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Avertissement avant de reculer. Modale maison : le `confirm()` natif est
          proscrit dans le LMS, et il n'expliquerait pas ce qui va se passer. */}
      {reculDemande && (
        <div
          className="absolute inset-0 flex items-center justify-center px-6"
          style={{ background: "rgba(8,17,14,.62)", zIndex: 80 }}
          role="dialog"
          aria-modal="true"
          aria-label="Revenir à l'étape précédente"
        >
          <div className="w-full rounded-2xl bg-white p-5 shadow-2xl" style={{ maxWidth: 420 }}>
            <h4 className="font-display text-[16px] font-bold text-ink">Revenir à l'étape {index} ?</h4>
            <p className="mt-2 text-[13.5px] leading-relaxed text-warm-700">
              Vous allez revoir sa consigne. Ce que vous avez déjà saisi reste dans la feuille, mais le point
              de départ de cette étape est remis en place : il faudra refaire le geste pour avancer à nouveau.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setReculDemande(false)}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-warm-700 hover:bg-warm-50"
              >
                Annuler
              </button>
              <button
                type="button"
                data-control="sim-reculer-confirmer"
                onClick={reculer}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
                style={{ background: "#10201B" }}
              >
                Revenir à l'étape {index}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panneaux de l'atelier ──────────────────────────────────────────────
          Ils se SUPERPOSENT au lieu de pousser le contenu : l'écran garde ses
          dimensions, donc la règle du « rien ne défile » tient même panneau
          ouvert. */}
      {panneau && (
        <div
          role="presentation"
          onClick={() => setPanneau(null)}
          className="absolute inset-0"
          style={{ top: 44, background: "rgba(8,17,14,.5)", zIndex: 60 }}
        />
      )}
      {sommaire && sommaire.length > 0 && (
        <aside
          aria-label="Toutes les leçons"
          aria-hidden={panneau !== "lecons"}
          className="absolute bottom-0 left-0 flex flex-col bg-white shadow-2xl"
          style={{
            top: 44,
            // 460 px : en dessous, « 16 ét. · 11 min » chasse le titre. Au-dessus,
            // le panneau mange la feuille de calcul, qui reste l'écran de travail.
            width: "min(460px, 86%)",
            zIndex: 70,
            transform: panneau === "lecons" ? "translateX(0)" : "translateX(-101%)",
            transition: "transform .26s cubic-bezier(.32,.72,0,1)",
            visibility: panneau === "lecons" ? "visible" : "hidden",
          }}
        >
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-warm-50 px-3 py-2.5">
            <h4 className="flex-1 text-[13.5px] font-bold">Toutes les leçons</h4>
            <span className="text-[11px] text-warm-400">
              {sommaire.length} chapitres · {dureeLisible(sommaire.reduce((t, e) => t + (e.secondes ?? 0), 0))}
            </span>
            <button
              type="button"
              onClick={() => setPanneau(null)}
              aria-label="Fermer"
              className="rounded-lg bg-warm-100 px-2 py-1 text-[12px] text-warm-600"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <SommaireAtelier
              entrees={sommaire}
              courant={chapterId}
              etapeCourante={index + 1}
              etapesTotal={total}
              modeCourant={mode}
              onNaviguer={(id) => {
                setPanneau(null)
                onNaviguer?.(id)
              }}
            />
          </div>
        </aside>
      )}
      {onNote && (
        <aside
          aria-label="Mes notes"
          aria-hidden={panneau !== "notes"}
          className="absolute bottom-0 right-0 flex flex-col bg-white shadow-2xl"
          style={{
            top: 44,
            width: "min(340px, 84%)",
            zIndex: 70,
            transform: panneau === "notes" ? "translateX(0)" : "translateX(101%)",
            transition: "transform .26s cubic-bezier(.32,.72,0,1)",
            visibility: panneau === "notes" ? "visible" : "hidden",
          }}
        >
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-warm-50 px-3 py-2.5">
            <h4 className="flex-1 text-[13.5px] font-bold">Mes notes</h4>
            <button
              type="button"
              onClick={() => setPanneau(null)}
              aria-label="Fermer"
              className="rounded-lg bg-warm-100 px-2 py-1 text-[12px] text-warm-600"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[11.5px] text-warm-400">
              {filModule && filModule !== filChapitre ? `${filModule} · ` : ""}
              {filChapitre}
            </p>
            <textarea
              value={note ?? ""}
              onChange={(e) => onNote(e.target.value)}
              placeholder="Écrivez ici ce que vous voulez retenir de ce chapitre…"
              className="w-full rounded-xl border border-border p-3 text-[13px] leading-relaxed text-ink outline-none focus:border-emerald-600"
              style={{ minHeight: 170, resize: "vertical" }}
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warm-400">
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9, background: "#107C41" }} />
              Enregistré automatiquement
            </p>
            {notesHref && (
              <a href={notesHref} className="mt-3 inline-block text-[12.5px] font-semibold text-emerald-700">
                Voir toutes mes notes →
              </a>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

/**
 * Enveloppe de la fenêtre Excel.
 *
 * Sans poste déclaré, c'est le conteneur d'origine — aucune différence pour les
 * chapitres existants. Avec un poste, le bureau prend la place et la fenêtre
 * Excel vient se poser dessus.
 */
function Enveloppe({
  poste,
  pleinCadre,
  onControl,
  onEnregistrer,
  onOuvrir,
  decor,
  highlight,
  children,
}: {
  poste: PosteState | null
  pleinCadre: boolean
  onControl: (id: string) => void
  onEnregistrer: (nom: string) => void
  onOuvrir: (nom: string) => void
  decor?: boolean
  highlight?: string | null
  children: React.ReactNode
}) {
  if (poste) {
    return (
      <DesktopLayer
        poste={poste}
        onControl={onControl}
        onEnregistrer={onEnregistrer}
        onOuvrir={onOuvrir}
        decor={decor}
        highlight={highlight}
      >
        {children}
      </DesktopLayer>
    )
  }
  return (
    <div
      className={
        pleinCadre
          ? "relative flex min-h-0 flex-1 flex-col px-2 pt-2 sm:px-3 sm:pt-3"
          : "relative px-3 pt-3"
      }
    >
      {children}
    </div>
  )
}

/**
 * Sommaire de la formation dans l'atelier.
 *
 * Groupé par module, et seul le module en cours est déplié : sur 27 modules et
 * 246 chapitres, tout ouvrir d'entrée noie l'information (choix Samuel du 29/07).
 */
function SommaireAtelier({
  entrees,
  courant,
  etapeCourante,
  etapesTotal,
  modeCourant,
  onNaviguer,
}: {
  entrees: EntreeSommaire[]
  courant: string
  /** Position dans le chapitre OUVERT — connue du player seul. */
  etapeCourante: number
  etapesTotal: number
  modeCourant: string
  onNaviguer: (id: string) => void
}) {
  const moduleCourant = entrees.find((e) => e.id === courant)?.module ?? null
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({ [moduleCourant ?? "—"]: true })

  const groupes: Array<{ nom: string; items: EntreeSommaire[] }> = []
  for (const e of entrees) {
    const nom = e.module ?? "—"
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.nom === nom) dernier.items.push(e)
    else groupes.push({ nom, items: [e] })
  }

  const PASTILLE: Record<EntreeSommaire["genre"], { l: string; c: string; f: string }> = {
    lecon: { l: "L", c: "#2C6BB0", f: "#E9F1FB" },
    exercice: { l: "E", c: "#107C41", f: "#E7F3EB" },
    evaluation: { l: "★", c: "#8A5A12", f: "#FBF1DF" },
    autre: { l: "·", c: "#8D8880", f: "#F1EEE8" },
  }

  return (
    <>
      {groupes.map((g, i) => {
        const ouvert = ouverts[g.nom] ?? false
        const faits = g.items.filter((x) => x.termine).length
        const estCourant = g.nom === moduleCourant
        return (
          <div key={`${g.nom}-${i}`} className="border-b border-warm-100 last:border-b-0">
            <button
              type="button"
              onClick={() => setOuverts((o) => ({ ...o, [g.nom]: !ouvert }))}
              className="flex w-full items-center gap-2 px-1 py-2 text-left"
            >
              <span
                className="flex flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                style={{
                  width: 21,
                  height: 21,
                  background: estCourant ? "#107C41" : faits === g.items.length ? "#E7F3EB" : "#F1EEE8",
                  color: estCourant ? "#fff" : faits === g.items.length ? "#107C41" : "#8D8880",
                }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{g.nom === "—" ? "Chapitres" : g.nom}</span>
              <span className="flex-shrink-0 text-[10.5px] text-warm-400">
                {faits}/{g.items.length}
                {(() => {
                  const t = g.items.reduce((n, x) => n + (x.secondes ?? 0), 0)
                  return t > 0 ? ` · ${dureeLisible(t)}` : ""
                })()}
              </span>
              <span aria-hidden className="flex-shrink-0 text-[10px] text-warm-400">
                {ouvert ? "▾" : "▸"}
              </span>
            </button>
            {ouvert && (
              <ul className="mb-1.5 list-none pl-7">
                {g.items.map((e) => {
                  const p = PASTILLE[e.genre]
                  const actif = e.id === courant
                    // Le chapitre OUVERT s'étale : on y montre la position exacte
                    // et le temps qu'il reste. Les autres tiennent sur une ligne,
                    // pour qu'une dizaine reste visible sans défiler.
                    const reste = actif
                      ? Math.max(1, estimatedSimulationMinutes(modeCourant, Math.max(0, etapesTotal - etapeCourante + 1)))
                      : 0
                    return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onNaviguer(e.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left"
                        style={{
                          background: actif ? "#fff" : undefined,
                          boxShadow: actif ? "0 1px 2px rgba(0,0,0,.09)" : undefined,
                        }}
                      >
                        <span
                          className="flex flex-shrink-0 items-center justify-center rounded"
                          style={{ width: 15, height: 15, background: p.f, color: p.c, fontSize: 8, fontWeight: 700 }}
                        >
                          {p.l}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span
                            className="min-w-0 truncate text-[12px]"
                            style={{ color: actif ? "#171a18" : "#6E6A62", fontWeight: actif ? 700 : 400 }}
                          >
                            {e.titre}
                          </span>
                          {actif && etapesTotal > 0 && (
                            <>
                              <span className="text-[10.5px] font-bold" style={{ color: "#0b5c30" }}>
                                étape {etapeCourante} sur {etapesTotal} · ≈ {reste} min restantes
                              </span>
                              <span
                                aria-hidden
                                className="mt-0.5 overflow-hidden rounded-sm"
                                style={{ height: 3, background: "#E4E0D8" }}
                              >
                                <span
                                  className="block h-full rounded-sm"
                                  style={{
                                    width: `${Math.round(((etapeCourante - 1) / etapesTotal) * 100)}%`,
                                    background: "#107C41",
                                    transition: "width .3s ease",
                                  }}
                                />
                              </span>
                            </>
                          )}
                        </span>
                        {!actif && !!e.etapes && (
                          <span className="flex-shrink-0 text-[10.5px] text-warm-400">
                            {e.etapes} ét. · {estimatedSimulationMinutes(
                              e.genre === "exercice" ? "EXERCISE" : e.genre === "evaluation" ? "EVALUATION" : "LESSON",
                              e.etapes,
                            )} min
                          </span>
                        )}
                        {e.termine && (
                          <span aria-hidden className="flex-shrink-0 text-[11px] text-emerald-600">
                            ✓
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </>
  )
}
