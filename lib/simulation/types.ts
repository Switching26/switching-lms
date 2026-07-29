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

/**
 * Règle de validation des données. Comme pour la mise en forme conditionnelle,
 * le vrai Excel demande ces paramètres dans une boîte de dialogue : le scénario
 * les déclare, l'apprenant choisit le type de règle et la plage.
 */
export type ValidationRule = {
  kind: "list" | "numberBetween" | "numberGreaterThan" | "checkbox"
  values?: string[]
  min?: number
  max?: number
  value?: number
  /** Si vrai, Excel avertit sans bloquer ; sinon il refuse la saisie. */
  allowInvalid?: boolean
  errorMessage?: string
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
  /** Graphiques déjà posés au démarrage. */
  charts?: ChartState[]
  /** Tableaux croisés déjà posés au démarrage. */
  pivots?: PivotState[]
  /** Réglages d'impression au démarrage. */
  pageSetup?: PageSetupState
  /** Macros déjà enregistrées au démarrage. */
  macros?: MacroState[]
}

/* ═══════════ GRAPHIQUES (modules 17 et 18) ═══════════ */

/**
 * Les graphiques ne passent PAS par Univer : son moteur de graphiques est un
 * paquet payant. Ce modèle est rendu par notre propre couche SVG, ce qui a deux
 * avantages pédagogiques — on maîtrise chaque élément que la leçon fait
 * sélectionner, et le rendu reste net à toutes les tailles.
 */
export type ChartType = "histogramme" | "barres" | "courbes" | "secteurs" | "aires" | "nuage"

export type ChartSeries = {
  /** Libellé affiché en légende. */
  name: string
  /** Plage des valeurs, ex. "B2:B7". */
  values: RangeRef
  color?: string
  /** Courbe de tendance (module 18). */
  trendline?: "lineaire" | "moyenne-mobile"
  /** Forme des points d'une série (module 18) : barre pleine, cylindre, cône. */
  shape?: "barre" | "cylindre" | "cone"
  hidden?: boolean
}

export type ChartElements = {
  titre?: boolean
  legende?: boolean
  etiquettes?: boolean
  quadrillage?: boolean
  axes?: boolean
  /** Titres d'axes, que le module 17 fait afficher séparément. */
  titresAxes?: boolean
}

export type ChartState = {
  id: string
  type: ChartType
  /** Plage source telle que l'apprenant l'a sélectionnée, si elle est contiguë. */
  source?: RangeRef
  /** Plage des libellés d'axe des abscisses. */
  categories?: RangeRef
  series: ChartSeries[]
  title?: string
  elements?: ChartElements
  legendPosition?: "droite" | "bas" | "haut" | "gauche"
  /** Style de la galerie, ex. 4 pour « la 4e de la catégorie En couleurs ». */
  style?: number
  /** Cadre flottant en pixels, relatif au coin haut-gauche de la grille. */
  frame?: { x: number; y: number; w: number; h: number }
  /**
   * Élément sélectionné par l'apprenant : "titre", "legende", "quadrillage",
   * "axe-x", "axe-y", "serie:0", "point:0:2". Le module 17 consacre une leçon
   * entière à cette sélection, donc elle fait partie de l'état observable.
   */
  selectedElement?: string
}

/* ═══════════ TABLEAUX CROISÉS DYNAMIQUES (module 20) ═══════════ */

export type PivotAgg = "somme" | "nombre" | "moyenne" | "min" | "max"

export type PivotField = {
  /** Nom de la colonne source, tel qu'il figure dans la ligne d'en-tête. */
  name: string
  /** Agrégat, pour un champ placé en Valeurs. Défaut : somme si numérique. */
  agg?: PivotAgg
}

export type PivotState = {
  id: string
  /** Plage source, ligne d'en-tête comprise. */
  source: RangeRef
  /** Coin haut-gauche où le tableau se pose. */
  target: CellRef
  rows: PivotField[]
  cols: PivotField[]
  values: PivotField[]
  filters: PivotField[]
  /** Valeurs retenues par les filtres de rapport, par nom de champ. */
  filterValues?: Record<string, string[]>
  styleId?: number
  /**
   * Vrai quand la source a changé depuis le dernier calcul. Le vrai Excel ne
   * recalcule pas un TCD tout seul : le module 20 fait cliquer Actualiser, donc
   * cet état périmé doit exister pour que la leçon ait un sens.
   */
  stale?: boolean
}

/* ═══════════ MISE EN PAGE ET IMPRESSION (module 13) ═══════════ */

/* ═══════════ POSTE DE TRAVAIL (direction C) ═══════════ */

/** Une application installée sur le poste. Seule Excel s'ouvre réellement. */
export type AppPoste = { id: string; nom: string; ouvrable?: boolean }

/** Un classeur enregistré, retrouvable sur le bureau et dans les récents. */
export type FichierPoste = { nom: string; surBureau?: boolean }

/**
 * Un modèle proposé par l'écran d'accueil d'Excel. L'ouvrir ne donne JAMAIS le
 * modèle lui-même mais une copie sans nom : c'est précisément ce que la leçon
 * « Créer un classeur à partir d'un modèle » veut faire sentir.
 */
export type ModelePoste = { id: string; nom: string; apercu?: string }

/** Où en est Excel : fermé, sur son écran d'accueil, ou dans un classeur. */
export type EtatExcel = "ferme" | "accueil" | "classeur"

/** Boîte de dialogue système ouverte par-dessus la fenêtre. */
export type BoitePoste = "aucune" | "enregistrer" | "ouvrir"

export type PosteState = {
  excel: EtatExcel
  /** Menu Démarrer déplié. */
  menu: boolean
  boite: BoitePoste
  /** Nom du classeur courant ; null tant qu'il n'a jamais été enregistré. */
  classeur: string | null
  /** Classeur modifié depuis le dernier enregistrement. */
  modifie: boolean
  fichiers: FichierPoste[]
  apps: AppPoste[]
  modeles: ModelePoste[]
}

/** Ce qu'une étape peut exiger de l'état du poste. */
export type PosteAttendu = {
  excel?: EtatExcel
  menu?: boolean
  boite?: BoitePoste
  /** Nom exact du classeur courant. */
  classeur?: string
  /** Fichiers qui doivent exister, par leur nom. */
  fichiers?: string[]
}

/** Les gestes possibles sur le poste, tels que les émettent ses boutons. */
export type GestePoste =
  | { type: "menu" }
  | { type: "lancer"; app: string }
  | { type: "fermer" }
  | { type: "reduire" }
  | { type: "nouveau" }
  /** `forcer` = « Enregistrer sous » : la fenêtre s'ouvre même si le classeur a déjà un nom. */
  | { type: "ouvrirBoite"; boite: Exclude<BoitePoste, "aucune">; forcer?: boolean }
  | { type: "fermerBoite" }
  | { type: "enregistrer"; nom: string; surBureau?: boolean }
  | { type: "ouvrirFichier"; nom: string }
  | { type: "ouvrirModele"; modele: string }
  | { type: "modifier" }

export type PageSetupState = {
  orientation?: "portrait" | "paysage"
  format?: "A4" | "A3" | "Letter"
  /** Marges en centimètres. */
  margins?: { haut: number; bas: number; gauche: number; droite: number }
  /** Ajuster à N page(s) en largeur / en hauteur. */
  scaleToFit?: { largeur?: number; hauteur?: number }
  /** Échelle en pourcentage, exclusive de `scaleToFit`. */
  scale?: number
  /** Titres à répéter : "$1:$1" pour la ligne 1, "$A:$A" pour la colonne A. */
  repeatRows?: string
  repeatCols?: string
  header?: { gauche?: string; centre?: string; droite?: string }
  footer?: { gauche?: string; centre?: string; droite?: string }
  /** Index (base 0) des lignes / colonnes AVANT lesquelles la page se coupe. */
  pageBreakRows?: number[]
  pageBreakCols?: number[]
  printArea?: RangeRef
  gridlines?: boolean
  headings?: boolean
  /** Mode d'affichage de la feuille. */
  view?: "normal" | "mise-en-page" | "sauts-de-page"
  /** Centrer la zone imprimée. */
  center?: { horizontal?: boolean; vertical?: boolean }
}

/* ═══════════ MACROS (module 27) ═══════════ */

/**
 * L'enregistreur ne transcrit que les gestes que le module enseigne. Chaque
 * instruction est réellement rejouable par le moteur : « Visualiser et modifier
 * une macro » n'aurait aucun sens si le code affiché était décoratif.
 */
export type MacroStatement =
  | { op: "select"; ref: string }
  | { op: "value"; ref: string; value: string | number }
  | { op: "formula"; ref: string; formula: string }
  | { op: "font"; ref: string; bold?: boolean; italic?: boolean; size?: number; color?: string }
  | { op: "interior"; ref: string; color: string }
  | { op: "numberFormat"; ref: string; pattern: string }

export type MacroState = {
  name: string
  /** Raccourci sous la forme "Ctrl+e" ou "Ctrl+Maj+E". */
  shortcut?: string
  /** Enregistrement en références relatives plutôt qu'absolues. */
  relative?: boolean
  statements: MacroStatement[]
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
          /**
           * Famille de format de nombre attendue, plutôt que le motif exact :
           * un apprenant peut choisir « € avec deux décimales » ou « € sans
           * décimale » et avoir raison dans les deux cas.
           */
          numberFormat?: "monetaire" | "pourcentage" | "date" | "nombre" | "aucun"
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
  /**
   * Le graphique produit doit correspondre aux champs déclarés. Comme pour
   * EXPECT_FORMAT, SEULS les champs présents sont comparés : une leçon qui
   * n'enseigne que le type ne doit pas échouer sur une couleur de série.
   */
  | {
      type: "EXPECT_CHART"
      chart: {
        type?: ChartType
        source?: RangeRef
        categories?: RangeRef
        title?: string
        /** Nombre de séries attendu. */
        seriesCount?: number
        /** Séries attendues, comparées dans l'ordre, champs déclarés seulement. */
        series?: Array<Partial<Pick<ChartSeries, "name" | "values" | "color" | "trendline" | "shape" | "hidden">>>
        elements?: ChartElements
        legendPosition?: ChartState["legendPosition"]
        style?: number
      }
    }
  /** Sélectionner un élément DANS le graphique (titre, légende, série…). */
  | { type: "SELECT_CHART_ELEMENT"; element: string }
  /** Le tableau croisé produit doit correspondre aux champs déclarés. */
  | {
      type: "EXPECT_PIVOT"
      pivot: {
        source?: RangeRef
        target?: CellRef
        /** Comparaison par NOM de champ, l'ordre compte. */
        rows?: string[]
        cols?: string[]
        values?: Array<{ name: string; agg?: PivotAgg }>
        filters?: string[]
        styleId?: number
        /** Exiger un tableau à jour : l'étape « Actualiser » attend `false`. */
        stale?: boolean
        /**
         * Quelques cellules du tableau produit, pour prouver que le calcul est
         * juste et pas seulement que les champs sont bien placés.
         */
        cells?: Record<CellRef, { v?: number | string; t?: string }>
      }
    }
  /** Les réglages d'impression doivent correspondre aux champs déclarés. */
  | { type: "EXPECT_PAGE_SETUP"; pageSetup: PageSetupState }
  /**
   * Valide l'état du POSTE DE TRAVAIL : Excel lancé ou fermé, classeur
   * enregistré sous tel nom, fichier présent. Même principe qu'`EXPECT_STATE` —
   * on juge le résultat, pas le chemin : peu importe que l'apprenant ait lancé
   * Excel depuis le menu Démarrer ou depuis la barre des tâches.
   */
  | { type: "EXPECT_POSTE"; poste: PosteAttendu }
  /** La macro enregistrée doit correspondre aux champs déclarés. */
  | {
      type: "EXPECT_MACRO"
      macro: {
        name?: string
        shortcut?: string
        relative?: boolean
        /** Nombre minimal d'instructions transcrites. */
        minStatements?: number
        /** Fragments que le code généré doit contenir, ex. "Range(\"B4\")". */
        contains?: string[]
        /** Effet attendu APRÈS exécution de la macro. */
        effet?: Record<CellRef, { v?: number | string }>
      }
    }
  /** Démarrer ou arrêter l'enregistreur. */
  | { type: "RECORD_MACRO"; expect: "started" | "stopped" }

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
    /**
     * État du poste de travail imposé au démarrage de l'étape.
     *
     * Indispensable pour la reprise : un apprenant qui revient à l'étape 12
     * d'une leçon qui démarre Excel fermé doit retrouver Excel ouvert sur son
     * classeur, pas le bureau nu. Même rôle que `cells` pour le classeur.
     */
    poste?: Partial<PosteState>
    ribbon?: RibbonState
    statusBar?: StatusBarState
    /** Règle conditionnelle que le bouton du ruban appliquera à cette étape. */
    cf?: { range: string; rule: ConditionalRule }
    /** Règle de validation que le bouton du ruban appliquera à cette étape. */
    dv?: { range: string; rule: ValidationRule }
    /** Commentaire que le bouton Révision posera à cette étape. */
    note?: { ref: string; texte: string }
    /** Volets à figer quand l'étape passe par le bouton Affichage. */
    freeze?: { rows: number; cols: number }
    /** Contenu tabulé que le bouton Coller déposera à cette étape. */
    paste?: { texte: string }
    /** Découpage en colonnes que le bouton Convertir appliquera. */
    split?: { range: string; separateur: number; fusionnerSeparateurs?: boolean }
    /**
     * Image que le bouton Insertion déposera dans une cellule. `source` est un
     * data URI : le scénario reste autonome, sans dépendre d'un fichier servi.
     */
    image?: { ref: string; source: string }
    /**
     * Valeur cible : quelle valeur donner à `inputRef` pour que `formulaRef`
     * atteigne `target`. Le vrai Excel demande ces trois champs dans une boîte
     * de dialogue ; le scénario les déclare.
     */
    goalSeek?: { formulaRef: string; target: number; inputRef: string }
    /**
     * Graphique que le bouton d'insertion créera à cette étape. Le scénario
     * déclare le résultat attendu du geste : l'apprenant sélectionne la plage
     * et clique, le moteur pose CE graphique.
     */
    chart?: Partial<ChartState> & { type: ChartType }
    /** Modification à appliquer au graphique courant (module 18). */
    chartEdit?: Partial<ChartState> & {
      /** Ajouter des séries à la fin. */
      addSeries?: ChartSeries[]
      /** Retirer des séries par nom. */
      removeSeries?: string[]
      /** Modifier une série existante, repérée par nom. */
      editSeries?: Array<{ name: string } & Partial<ChartSeries>>
    }
    /** Tableau croisé que le bouton du ruban créera à cette étape. */
    pivot?: Partial<PivotState> & { source: RangeRef; target: CellRef }
    /** Modification à appliquer au tableau croisé courant. */
    pivotEdit?: Partial<PivotState> & {
      addRows?: PivotField[]
      addCols?: PivotField[]
      addValues?: PivotField[]
      addFilters?: PivotField[]
      removeFields?: string[]
      /** Modifier la source pour rendre le tableau périmé, puis l'actualiser. */
      sourceCells?: Record<CellRef, CellState>
      refresh?: boolean
    }
    /** Réglages d'impression que le contrôle appliquera à cette étape. */
    pageSetup?: PageSetupState
    /** Macro que l'enregistreur produira, ou modification de la macro courante. */
    macro?: Partial<MacroState> & { name: string }
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
  /**
   * Poste de travail autour d'Excel (direction C, validée le 29/07/2026).
   *
   * Absent — le cas des 243 chapitres existants — l'atelier s'ouvre directement
   * dans le classeur, comme avant. Présent, il ajoute le bureau, la barre des
   * tâches et le menu Démarrer, et permet d'enseigner les gestes qui vivent
   * AUTOUR du tableur : lancer Excel, l'enregistrer, le fermer.
   */
  poste?: {
    /** false pour commencer devant un bureau, Excel non lancé. */
    excelOuvert?: boolean
    /** Nom du classeur déjà ouvert, s'il vient d'un fichier. */
    classeur?: string
    /** Fichiers déjà présents sur le poste. */
    fichiers?: Array<{ nom: string; surBureau?: boolean }>
    /** Modèles proposés par l'écran d'accueil d'Excel. */
    modeles?: Array<{ id: string; nom: string; apercu?: string }>
  }
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

/**
 * Normalise une saisie non-formule (texte ou nombre).
 *
 * Hors mode strict, on replie la casse ET les accents : une étape qui ne se soucie
 * pas des majuscules n'a aucune raison d'exiger les accents. Refuser « Releve »
 * quand la donnée attendue est « Relevé » punit la frappe et non la compréhension,
 * et dans un cours de tableur l'objet d'une étape n'est jamais l'orthographe.
 * `caseSensitive` signifie donc « orthographe stricte » : un auteur qui a
 * réellement besoin de l'exactitude au caractère près le déclare.
 */
export function normalizeValue(input: string, caseSensitive = false): string {
  const trimmed = input.trim().replace(/\s+/g, " ")
  if (caseSensitive) return trimmed
  return trimmed
    .toLocaleUpperCase("fr-FR")
    // Décomposition puis retrait des signes diacritiques combinants.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
