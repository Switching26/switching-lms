/**
 * Format de scénario des simulations bureautiques.
 *
 * Principe directeur : le contenu pédagogique est ENTIÈREMENT déclaratif et
 * séparé du moteur. Un auteur (humain ou génération assistée) écrit un objet
 * `SimulationScenario` ; il n'écrit jamais de code, ne dessine jamais d'écran.
 * C'est ce qui rend tenable une formation de plusieurs milliers d'étapes.
 *
 * Ce format est stocké tel quel dans `Simulation.scenario` (JSONB) : il peut
 * donc évoluer sans migration. `schemaVersion` sert à migrer les scénarios
 * existants le jour où une rupture est nécessaire.
 *
 * Les types d'action sont dérivés de l'analyse des 2 748 étapes de la formation
 * de référence : sept primitives couvrent l'intégralité des gestes demandés,
 * plus un état passif pour les écrans de lecture. Ajouter une primitive est
 * additif — ne jamais changer le sens d'une primitive existante.
 */

export const SIMULATION_SCHEMA_VERSION = 1 as const

/* ═══════════ CLASSEUR ═══════════ */

/** Référence de cellule en notation A1 : "B2". Plage : "B2:B6". */
export type CellRef = string
export type RangeRef = string

export type CellFormat = {
  bold?: boolean
  italic?: boolean
  align?: "left" | "center" | "right"
  /** Format numérique Excel, ex. "# ##0,00 €" ou "0%". */
  numberFormat?: string
  background?: string
  color?: string
}

export type CellState = {
  /** Valeur littérale saisie (texte ou nombre). Exclusif avec `f`. */
  v?: string | number
  /** Formule, séparateur français : "=SOMME(B2:B6)". Exclusif avec `v`. */
  f?: string
  format?: CellFormat
}

export type SheetState = {
  name: string
  /** Largeurs en pixels, par lettre de colonne : { A: 110 }. */
  columnWidths?: Record<string, number>
  rowHeights?: Record<string, number>
  /** Cellules non vides uniquement, indexées en A1 : { B2: { v: 5 } }. */
  cells: Record<CellRef, CellState>
}

/**
 * Règle de mise en forme conditionnelle déclarée par un scénario. Le vrai Excel
 * demande ces paramètres dans une boîte de dialogue ; l'apprenant, lui, choisit
 * le type de règle et la plage — c'est cela qu'on évalue.
 */
export type ConditionalRule = {
  kind: "greaterThan" | "lessThan" | "between" | "textContains" | "duplicates"
  value?: number
  value2?: number
  text?: string
  background?: string
  fontColor?: string
  bold?: boolean
}

export type WorkbookState = {
  /** Nom affiché dans la barre de titre, ex. "Inventaire.xlsx". */
  fileName: string
  sheets: SheetState[]
  activeSheetIndex?: number
  /** Sélection au démarrage. */
  selection?: CellRef | RangeRef
  /**
   * Plage qui reçoit les boutons de filtre d'Excel, ligne d'en-tête comprise.
   * Univer ne devine pas la ligne de titres : c'est au scénario de la déclarer.
   */
  filterRange?: RangeRef
}

/* ═══════════ RUBAN ═══════════ */

/**
 * Onglets du ruban à rendre disponibles. Déclarés par scénario : inutile de
 * construire tout Office pour un module qui ne touche que l'onglet Accueil.
 */
export type RibbonTab =
  | "accueil"
  | "insertion"
  | "mise-en-page"
  | "formules"
  | "donnees"
  | "revision"
  | "affichage"
  | "developpeur"
  // Onglets contextuels
  | "tableau-creation"
  | "graph-creation"
  | "graph-mise-en-forme"
  | "graph-analyse"
  | "image-format"
  | "forme-format"
  | "entete-pied"
  | "donnees-solveur"

/**
 * Identifiant d'un contrôle cliquable. Convention :
 *   `bf-*`  barre de formule   (bf-entrer, bf-annuler, bf-fx)
 *   `acc-*` onglet Accueil     (acc-somme-auto, acc-somme-auto-fleche, acc-recopier)
 *   `sb-*`  barre d'état       (sb-nb-non-vides)
 *   `ui-*`  châssis            (ui-poignee-options-recopie)
 * Le moteur mappe ces identifiants vers les éléments réels du ruban.
 */
export type ControlId = string

export type RibbonState = {
  /** Onglet actif au moment de l'étape. */
  activeTab?: RibbonTab
  /** Contrôles à forcer inactifs, avec l'infobulle qui explique pourquoi. */
  disabled?: Record<ControlId, string>
  /** Contrôles à afficher en état sélectionné. */
  selected?: ControlId[]
  /**
   * Groupes du ruban à griser. Excel désactive une partie du ruban pendant
   * l'édition d'une formule : le reproduire coûte peu et rend la simulation
   * crédible.
   */
  disabledGroups?: number[]
}

export type StatusBarState = {
  /** Agrégats affichés à droite de la barre d'état. */
  aggregates?: Array<"moyenne" | "nb" | "nb-non-vides" | "somme" | "min" | "max">
  sheetCount?: number
}

/* ═══════════ ACTIONS ═══════════ */

/**
 * Validation d'une saisie. Le champ `accept` liste TOUTES les écritures
 * acceptées — un apprenant peut écrire `=SOMME(B2:B6)` ou `=B2+B3+B4+B5+B6`,
 * les deux sont justes. Refuser une réponse correcte est la pire faute d'un
 * simulateur pédagogique, donc `accept` doit être généreux.
 */
export type TypeAction = {
  type: "TYPE"
  /** Où l'on tape : une cellule, ou la barre de formule. */
  target: CellRef | "formula-bar"
  /** Écritures acceptées. Comparaison après normalisation des espaces. */
  accept: string[]
  /** Défaut false : la casse est ignorée (`=somme(...)` est accepté). */
  caseSensitive?: boolean
  /**
   * true : on compare des formules — normalisation supplémentaire (espaces
   * autour des opérateurs, `,`/`;` comme séparateur d'arguments, casse des
   * noms de fonction et des références).
   */
  formulaMode?: boolean
  maxLength?: number
  /**
   * Contenu déjà présent au début de l'étape, quand une étape précédente a
   * commencé la saisie (ex. `=B2*` puis l'apprenant tape `15`).
   */
  prefill?: string
}

/**
 * Validation par l'ÉTAT du classeur plutôt que par le geste.
 *
 * C'est le mode de validation des exercices, et le seul praticable pour les
 * gestes que la grille ne peut pas observer proprement (poignée de recopie,
 * copier/coller, actions multi-cellules). On vérifie le résultat : peu importe
 * que l'apprenant ait tiré la poignée, utilisé le ruban ou retapé la formule,
 * du moment que le classeur est juste.
 *
 * Les formules sont comparées après normalisation, donc `=SOMME(C2:C6)` et
 * `=somme(c2:c6)` se valent. `anyOf` permet plusieurs états acceptables.
 */
export type ExpectStateAction = {
  type: "EXPECT_STATE"
  /** Cellules à vérifier. `f` compare la formule, `v` la valeur calculée. */
  cells: Record<CellRef, { f?: string; v?: string | number; anyOf?: string[] }>
}

export type SimulationAction =
  /** Écran de lecture : rien à faire, on avance. */
  | { type: "READ" }
  | TypeAction
  | ExpectStateAction
  /** Sélection d'une colonne entière par son en-tête, ex. { column: "C" }. */
  | { type: "SELECT_COLUMN"; column: string }
  /** Sélection d'une ligne entière par son en-tête, ex. { row: 3 }. */
  | { type: "SELECT_ROW"; row: number }
  /** Changement de feuille par son onglet. */
  | { type: "SELECT_SHEET"; name: string }
  /** Atteindre une cellule en saisissant sa référence dans la zone Nom. */
  | { type: "GOTO_REF"; ref: string }
  /**
   * Valide la MISE EN FORME obtenue, sans imposer le chemin — pendant de
   * `EXPECT_STATE` pour tout ce qui est visuel. Univer n'expose pas de getter
   * pour le gras ni l'italique : ceux-là se valident par le clic de ruban.
   */
  | {
      type: "EXPECT_FORMAT"
      cells: Record<
        CellRef,
        {
          background?: string
          fontSize?: number
          hAlign?: "left" | "center" | "right"
          vAlign?: "top" | "middle" | "bottom"
          wrap?: boolean
        }
      >
    }
  /** Trier une plage sur une de ses colonnes, par le ruban Données. */
  | { type: "SORT_RANGE"; range: string; column: string; ascending: boolean }
  /**
   * Filtrer une colonne sur une liste de valeurs, via les boutons de filtre
   * d'Excel. `values` est l'ensemble des valeurs qui doivent rester visibles.
   */
  | { type: "FILTER_COLUMN"; column: string; values: string[] }
  /**
   * Nommer la sélection via la zone Nom. `ref` est facultatif : quand il est
   * fourni, la plage nommée doit correspondre, sinon on se contente du nom.
   */
  | { type: "DEFINE_NAME"; name: string; ref?: string }
  /** Clic sur une cellule (sélection). */
  | { type: "CLICK_CELL"; cell: CellRef }
  /** Clic sur une cellule avec modificateur : sélection disjointe, extension. */
  | { type: "CLICK_CELL_MODIFIER"; cell: CellRef; modifier: "Control" | "Shift" }
  /** Clic sur un bouton du ruban, de la barre de formule ou d'un menu. */
  | { type: "CLICK_CONTROL"; control: ControlId }
  /** Clic droit pour ouvrir un menu contextuel. */
  | { type: "CONTEXT_MENU"; target: CellRef | ControlId }
  /** Double-clic (poignée de recopie, ajustement de largeur, édition). */
  | { type: "DOUBLE_CLICK"; target: CellRef | ControlId }
  /** Touche seule ou combinaison : "Enter", "Delete", "F4", "Control+c". */
  | { type: "KEY"; key: string }
  /**
   * Glissement de la poignée de recopie. `tooltips` = infobulles à afficher
   * pendant le glissement, pour les séries incrémentées (Février, Mars…).
   */
  | { type: "FILL_HANDLE"; from: CellRef | RangeRef; to: CellRef; tooltips?: string[] }
  /**
   * Sélection d'une plage au cliquer-glisser. `duringEdit` : la sélection se
   * fait pendant l'édition d'une formule, pour corriger un argument — Excel
   * réinjecte alors la plage dans la formule, d'où `template`
   * (ex. "=MOYENNE({{range}})").
   */
  | { type: "DRAG_RANGE"; range: RangeRef; duringEdit?: boolean; template?: string }

/* ═══════════ ÉTAPES ═══════════ */

export type StepHint = {
  /** Niveau 1 : indice textuel, sans désigner la cible. */
  text?: string
  /**
   * Niveau 2 : on montre où. Le moteur pose un halo sur la cible de l'action.
   * En mode LESSON le halo est visible d'emblée ; en EXERCISE il faut le
   * demander ; en EVALUATION il n'existe pas.
   */
  showTarget?: boolean
}

export type SimulationStep = {
  /** Identifiant stable, ex. "M06-L02-04". Sert au suivi et aux corrections. */
  id: string
  /**
   * Consigne affichée en bas d'écran. Balisage volontairement minimal :
   *   `**terme**` → vocabulaire métier en gras
   *   `==action==` → l'action à effectuer, mise en évidence
   * Pas de HTML brut : la consigne est rendue par le moteur, jamais injectée.
   */
  consigne: string
  /**
   * État à appliquer AVANT l'étape, en delta sur l'état courant du classeur.
   * Permet de démarrer une étape dans une situation précise sans rejouer
   * toutes les précédentes — indispensable pour la navigation libre.
   */
  setup?: {
    cells?: Record<CellRef, CellState>
    selection?: CellRef | RangeRef
    /** La cellule est en cours d'édition au démarrage de l'étape. */
    editing?: boolean
    ribbon?: RibbonState
    statusBar?: StatusBarState
    /** Règle conditionnelle que le bouton du ruban appliquera à cette étape. */
    cf?: { range: string; rule: ConditionalRule }
  }
  action: SimulationAction
  aide?: StepHint
  /** Message affiché après réussite, quand une explication est utile. */
  feedback?: string
  /**
   * Points de l'étape en mode EVALUATION. Défaut 1. Une étape à 0 n'est pas
   * notée (étape de mise en situation).
   */
  points?: number
}

/* ═══════════ SCÉNARIO ═══════════ */

export type SimulationScenario = {
  schemaVersion: typeof SIMULATION_SCHEMA_VERSION
  /** Titre affiché dans l'en-tête, ex. "Calculer une moyenne". */
  title: string
  /**
   * Mode visé par ce contenu. Indication d'AUTEUR : elle permet au contrôleur de
   * scénarios d'appliquer les bonnes règles pédagogiques (une leçon montre le
   * geste, un exercice ne le montre pas, une évaluation n'a pas d'aide). Le mode
   * qui fait foi à l'exécution reste `Simulation.mode` en base.
   */
  mode?: "LESSON" | "EXERCISE" | "EVALUATION"
  /** Fil d'Ariane, ex. "Calculs simples". */
  moduleTitle?: string
  /** Écran d'ouverture. */
  intro?: { title: string; body: string }
  /** Écran de fin. */
  outro?: { body: string }
  /** Onglets du ruban nécessaires à ce scénario. */
  ribbon: RibbonTab[]
  /** État initial du classeur. */
  workbook: WorkbookState
  statusBar?: StatusBarState
  steps: SimulationStep[]
}

/* ═══════════ AIDES ═══════════ */

/** Nombre d'étapes réellement notables (utilisé pour le score d'évaluation). */
export function gradableStepCount(scenario: SimulationScenario): number {
  return scenario.steps.filter((s) => s.action.type !== "READ" && (s.points ?? 1) > 0).length
}

/**
 * Normalise une formule avant comparaison. On veut qu'un apprenant ne soit
 * jamais recalé pour une espace ou une minuscule : seul le sens compte.
 */
export function normalizeFormula(input: string): string {
  return input
    .trim()
    .toUpperCase()
    // Espaces superflus, y compris autour des opérateurs et séparateurs.
    .replace(/\s+/g, "")
    // Excel accepte les deux séparateurs d'arguments selon la locale.
    .replace(/,/g, ";")
}

/** Normalise une saisie non-formule (texte ou nombre). */
export function normalizeValue(input: string, caseSensitive = false): string {
  const trimmed = input.trim().replace(/\s+/g, " ")
  return caseSensitive ? trimmed : trimmed.toLocaleUpperCase("fr-FR")
}

/**
 * La saisie de l'apprenant correspond-elle à l'une des réponses acceptées ?
 * Centralisé ici pour que la correction client (leçon/exercice) et la
 * correction serveur (évaluation) appliquent EXACTEMENT la même règle.
 */
export function matchesTypedAnswer(typed: string, action: TypeAction): boolean {
  const norm = action.formulaMode
    ? normalizeFormula
    : (s: string) => normalizeValue(s, action.caseSensitive)
  const candidate = norm(typed)
  return action.accept.some((expected) => norm(expected) === candidate)
}
