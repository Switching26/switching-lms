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
import SimulationChrome from "./SimulationChrome"
import ChartLayer from "./ChartLayer"
import PivotLayer from "./PivotLayer"
import PageLayoutLayer from "./PageLayoutLayer"
import MacroPanel from "./MacroPanel"
import { estimatedSimulationMinutes } from "@/lib/simulation/duree"
import type {
  ChartState,
  ChartType,
  MacroState,
  PageSetupState,
  PivotAgg,
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

type Props = {
  chapterId: string
  mode: Mode
  scenario: SimulationScenario
  /** Étape de reprise, fournie par l'API. */
  initialStep?: number
  /** Aperçu admin : aucune écriture de progression. */
  preview?: boolean
  onCompleted?: () => void
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

  const step: SimulationStep | undefined = steps[index]
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

  /* ── Mise en place de l'étape ──────────────────────────────────────────── */

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
      const juge = s.action.type
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
      setFormulaText("")
      setVerdict(null)
      setHintShown(mode === "LESSON")
      // Le focus revient à la grille : sans cela, après un clic sur « Suivant »
      // ou sur un bouton du ruban, l'apprenant tape dans le vide jusqu'à ce qu'il
      // pense à recliquer dans une cellule.
      grid.focus()
      if (s.setup?.selection) setStats(grid.getSelectionStats(s.setup.selection))
      setNameBoxDraft(null)
      setSheets(grid.getSheets())
    },
    [mode, lireCellule, poserGraphique, poserReglages, poserTcdDansFeuille],
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
      applyStep(steps[index])
    },
    // Volontairement figé sur le montage : la grille se monte une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    if (gridReady) applyStep(step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, gridReady])

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
    setIndex(next)
    void persist({ step: next })
  }, [index, total, mode, steps, persist, onCompleted])

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
        lancerFx(step, "ok")
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
      const isRealMistake =
        !navigation && !surEtat
          ? true
          : (observed.kind === "cellClick" && step.action.type === "CLICK_CELL") ||
            (observed.kind === "dragRange" && step.action.type === "DRAG_RANGE") ||
            (observed.kind === "gotoRef" && step.action.type === "GOTO_REF")
      if (isRealMistake) {
        attemptedRef.current.add(step.id)
        firstTryRef.current[step.id] = false
        pendingRef.current.errors += 1
        setVerdict(v)
        lancerFx(step, "ko", v.message)
      } else if (surEtat && observed.kind !== "stateChange" && v.message) {
        setVerdict(v)
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
  const handleControl = useCallback(
    (controlId: string) => {
      const grid = gridRef.current
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
    [effetModele, handleAction],
  )

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
    if (mode === "EVALUATION" || !hintShown || !step) return null
    if (step.action.type === "CLICK_CONTROL") return step.action.control
    return null
  }, [mode, hintShown, step])

  // `showTarget` était déclaré dans 150 aides et n'affichait rien : l'apprenant
  // bloqué demandait une aide censée pointer la cellule et ne voyait aucun
  // repère. On calcule le rectangle de la cible avec les métriques d'Univer.
  const [halo, setHalo] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const grid = gridRef.current
    if (!grid || !step || mode === "EVALUATION" || !hintShown || !step.aide?.showTarget) {
      setHalo(null)
      return
    }
    const a = step.action
    const cible =
      a.type === "TYPE" ? (a.target === "formula-bar" ? null : a.target)
      : a.type === "CLICK_CELL" ? a.cell
      : a.type === "GOTO_REF" ? a.ref
      : a.type === "DRAG_RANGE" ? a.range
      : a.type === "DEFINE_NAME" ? (a.ref ?? null)
      : null
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
  }, [mode, hintShown, step, index, gridReady])

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  if (!step && !finished) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-[13px] text-warm-600">
        Cette simulation ne contient aucune étape.
      </div>
    )
  }

  const gradable = steps.filter((s) => s.action.type !== "READ").length

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      {!introVue && step && (
        <div
          className="absolute inset-0 z-40 flex flex-col justify-center overflow-hidden px-6 py-8 sm:px-10"
          style={{ background: "linear-gradient(180deg,#faf9f5 0%,#f2efe8 100%)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute select-none"
            style={{
              right: "-1%",
              top: "-14%",
              fontSize: "min(32vw, 280px)",
              fontWeight: 900,
              fontStyle: "italic",
              color: "rgba(24,110,72,0.07)",
              letterSpacing: "-10px",
              lineHeight: 1,
            }}
          >
            ƒx
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{
              height: "32%",
              background:
                "repeating-linear-gradient(0deg,rgba(23,26,24,.055) 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,rgba(23,26,24,.055) 0 1px,transparent 1px 54px)",
              transform: "perspective(600px) rotateX(58deg)",
              transformOrigin: "bottom",
            }}
          />
          {[
            { left: "14%", bottom: "10%", bg: "#2fbf80", delay: "0s" },
            { left: "64%", bottom: "17%", bg: "#187a4e", delay: "1.1s" },
            { left: "42%", bottom: "6%", bg: "#66d3a3", delay: "2s" },
          ].map((c, i) => (
            <div
              key={i}
              aria-hidden
              className="pointer-events-none absolute rounded"
              style={{
                left: c.left,
                bottom: c.bottom,
                width: 44,
                height: 19,
                background: c.bg,
                opacity: 0.85,
                animation: `sim-intro-cell 3.2s ease-in-out ${c.delay} infinite`,
              }}
            />
          ))}
          <div className="relative" style={{ maxWidth: 660 }}>
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
              {scenario.moduleTitle ? ` — ${scenario.moduleTitle}` : ""}
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
      {/* En-tête : titre de l'étape et compteur */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-warm-50 px-4 py-2.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-warm-400">
          {mode === "LESSON" ? "Leçon" : mode === "EXERCISE" ? "Exercice" : "Évaluation"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {scenario.moduleTitle ? `${scenario.moduleTitle} · ` : ""}
          {scenario.title}
        </span>
        <span className="font-mono text-[12px] tabular-nums text-warm-600">
          {Math.min(index + 1, total)} / {total}
        </span>
      </div>

      {finished ? (
        <div className="px-5 py-10 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            {mode === "EVALUATION" ? "Évaluation terminée" : "Vous avez terminé cette étape du parcours"}
          </p>
          {mode === "EVALUATION" && (
            <p className="mt-1.5 text-[13px] text-warm-700">
              Score :{" "}
              <span className="font-semibold text-emerald-700">
                {Math.round(computeScore(steps, firstTryRef.current) * 100)} %
              </span>{" "}
              sur {gradable} action{gradable > 1 ? "s" : ""} évaluée{gradable > 1 ? "s" : ""}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Fenêtre Excel simulée */}
          <div className="px-3 pt-3">
            <SimulationChrome
              tabs={scenario.ribbon}
              state={
                step?.setup?.ribbon
                  ? { ...step.setup.ribbon, activeTab: onglet }
                  : { activeTab: onglet }
              }
              fileName={scenario.workbook.fileName}
              selection={selection}
              formulaText={formulaText}
              highlight={highlightedControl}
              onControl={handleControl}
              onTabChange={setOnglet}
              stats={stats}
              aggregates={step?.setup?.statusBar?.aggregates ?? scenario.statusBar?.aggregates}
              sheets={sheets}
              onSheet={handleSheet}
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
              className="relative h-[380px] overflow-hidden rounded-b-lg border border-t-0 border-neutral-300"
              onClickCapture={besoins.miseEnPage || besoins.tcd || besoins.graphique ? relaisControleCouche : undefined}
            >
              <ExcelGrid onReady={handleReady} onAction={handleAction} />
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
                  className="absolute inset-0 z-10 bg-white/95"
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
              {halo && (
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
              {halo && hintShown && step?.aide?.text && (
                <div
                  className="pointer-events-none absolute max-w-[280px] rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-amber-900 shadow-md ring-1 ring-amber-300"
                  style={
                    halo.top > 130
                      ? { left: Math.max(4, halo.left), top: halo.top - 8, transform: "translateY(-100%)", zIndex: 30 }
                      : { left: Math.max(4, halo.left), top: halo.top + halo.height + 8, zIndex: 30 }
                  }
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
`}</style>
            </div>
            {besoins.macros && (
              <div className="pt-2" onClickCapture={relaisControleCouche}>
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
          </div>

          {/* Barre de consigne */}
          <div className="flex flex-wrap items-start gap-3 border-t border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              {step && <Consigne text={step.consigne} />}
              {verdict && !verdict.ok && (
                <p className="mt-1.5 text-[12.5px] text-rose-700">{verdict.message}</p>
              )}
              {verdict?.ok && <p className="mt-1.5 text-[12.5px] text-emerald-700">C'est exact.</p>}
              {mode !== "EVALUATION" && step?.aide?.text && hintShown && (
                <p className="mt-1.5 text-[12.5px] text-warm-600">{step.aide.text}</p>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {mode === "EXERCISE" && !hintShown && step?.aide && (
                <button
                  type="button"
                  onClick={revealHint}
                  className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-warm-700 hover:bg-warm-50"
                >
                  Un indice
                </button>
              )}
              {step?.action.type === "READ" && (
                <button
                  type="button"
                  onClick={() => handleAction({ kind: "next" })}
                  className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                >
                  Suivant
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
