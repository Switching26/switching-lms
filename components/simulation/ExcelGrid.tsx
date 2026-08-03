"use client"

/**
 * Hôte du tableur. C'est le seul fichier qui connaît Univer : tout le reste du
 * simulateur passe par l'interface `GridApi` définie ici. Si un jour on change de
 * moteur, c'est ce fichier qu'on réécrit, pas le simulateur.
 *
 * DEUX RÈGLES DE MONTAGE, apprises à leurs frais ailleurs dans ce LMS :
 *
 *  1. Le composant se monte UNE fois et ne se démonte jamais au changement
 *     d'étape. Seul son contenu change, par appels impératifs. C'est exactement la
 *     leçon du player vidéo : démonter/remonter un sous-arbre qui héberge un moteur
 *     tiers laisse des instances orphelines dans le DOM.
 *  2. Toutes les fonctions de rappel sont lues depuis des refs. L'effet de montage
 *     n'a donc aucune dépendance et ne se ré-exécute jamais, même si le parent
 *     se rerend à chaque frappe de l'apprenant.
 *
 * Univer n'est PAS importable côté serveur (son moteur de rendu casse à
 * l'import Node). Ce composant doit donc toujours être chargé via
 * `dynamic(..., { ssr: false })` — voir SimulationPlayer.
 */

import { useEffect, useRef } from "react"
// Les styles d'Univer, sans lesquels la grille ne se PEINT pas : canvas aux
// dimensions nulles, boutons d'UI orphelins. Le banc de test les chargeait via
// un <link> à part — l'app, elle, ne les a jamais eus (bug découvert par Samuel
// le 28/07 : grille entièrement blanche en production, sur les 246 chapitres).
import "@univerjs/preset-sheets-core/lib/index.css"
import "@univerjs/preset-sheets-sort/lib/index.css"
import "@univerjs/preset-sheets-filter/lib/index.css"
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css"
import "@univerjs/preset-sheets-data-validation/lib/index.css"
import "@univerjs/preset-sheets-note/lib/index.css"
import "@univerjs/preset-sheets-drawing/lib/index.css"
import type { ObservedAction, ActionChannel } from "@/lib/simulation/validate"
import { lireDateOuHeureFr } from "@/lib/simulation/date-fr"
import { lireNombreFr } from "@/lib/simulation/nombre-fr"
import type { CellState, WorkbookState, ConditionalRule, ValidationRule } from "@/lib/simulation/types"
import {
  formatCell,
  parseCell,
  parseRange,
  formatRange,
  columnIndexToLetter,
  columnLetterToIndex,
} from "@/lib/simulation/grid"
import { frToEngine, engineToFr } from "@/lib/simulation/formula-fr"

/** Ce que le simulateur peut demander à la grille. */
export type GridApi = {
  /** Remplace l'état du classeur (nouvelle étape, ou reprise). */
  applyWorkbook: (wb: WorkbookState) => void
  /** Applique un delta de cellules sans toucher au reste. */
  applyCells: (cells: Record<string, CellState>) => void
  /** Sélectionne une cellule ou une plage. */
  setSelection: (ref: string) => void
  /** Formule brute d'une cellule, réaffichée en convention française. */
  getFormula: (ref: string) => string
  /** Valeur calculée d'une cellule. */
  getValue: (ref: string) => unknown
  /**
   * Rectangle d'une cellule DANS le conteneur de la grille, en pixels CSS.
   * Calculé depuis les métriques d'Univer — largeurs de colonnes, hauteurs de
   * lignes, tailles d'en-têtes et défilement — et non depuis le DOM : Univer
   * rend sur canvas, il n'existe aucun élément par cellule. Sert à surligner
   * une cible d'aide, et à piloter les gestes en test.
   */
  getCellRect: (ref: string) => { left: number; top: number; width: number; height: number } | null
  /**
   * Amène une cellule dans le champ visible.
   *
   * Sans cela, une démonstration qui désigne A41 dessinait son repère sous le
   * bord de l'écran : parfaitement « résolu », parfaitement invisible. La grille
   * ne défile jamais d'elle-même — ni la sélection, ni le repère d'aide ne la
   * font bouger (vérifié le 30/07/2026 : A41 restait à y=980 sur 900 px de
   * haut, du début à la fin de la séquence).
   *
   * Renvoie `false` si la feuille n'est pas prête ou si le défilement échoue :
   * l'appelant décide alors quoi faire, plutôt que de croire à une réussite.
   */
  scrollToCell: (ref: string) => boolean
  /**
   * Largeur d'une colonne et hauteur d'une ligne, en pixels, indices base 0.
   * `null` quand le squelette de rendu n'est pas encore là — l'appelant retombe
   * alors sur les valeurs par défaut d'Univer (88 et 24). La mise en page a
   * besoin de ces dimensions RÉELLES : une colonne élargie déplace la coupure
   * de page, et un pointillé au mauvais endroit enseigne faux.
   */
  getColumnWidth: (col: number) => number | null
  getRowHeight: (row: number) => number | null
  /**
   * Largeurs/hauteurs d'une feuille NOMMÉE, sans l'activer.
   *
   * Un chapitre qui compare deux feuilles (module 15, module 21) élargit une
   * colonne ici, une autre là. Un cliché qui ne retient qu'un seul tableau de
   * dimensions rend au rejeu les largeurs de la feuille A sur la feuille B :
   * les colonnes 1 et 2 alternaient 210/90 puis 95/200 d'un passage à l'autre.
   */
  getDimensionsFeuilles: (
    c1: number,
    c2: number,
    r1: number,
    r2: number,
  ) => Record<string, { colonnes: Record<string, number>; lignes: Record<string, number> }>
  setDimensionFeuille: (nom: string, axe: "col" | "ligne", index: number, px: number) => void
  /** Texte réellement affiché dans la cellule, format de nombre appliqué. */
  getDisplayValue: (ref: string) => string
  /** Applique un format de nombre Excel (pourcentage, monétaire, date…). */
  setNumberFormat: (refs: string[], pattern: string) => void
  /** Même chose, sur la sélection courante — ce que fait un bouton du ruban. */
  setNumberFormatOnSelection: (pattern: string) => void
  /** Motif de format de nombre d'une cellule, chaîne vide si Standard. */
  getNumberFormat: (ref: string) => string
  /**
   * Pose une règle de mise en forme conditionnelle sur une plage. Le vrai Excel
   * demande le seuil dans une boîte de dialogue ; ici le scénario le déclare.
   */
  addConditionalRule: (range: string, rule: ConditionalRule) => boolean
  /**
   * Valeur cible d'Excel : cherche quelle valeur donner à `inputRef` pour que
   * `formulaRef` atteigne `target`. Univer n'offre rien de tel ; on résout par
   * la méthode de la sécante, comme le fait Excel avec sa propre itération.
   */
  goalSeek: (
    formulaRef: string,
    target: number,
    inputRef: string
  ) => Promise<{ ok: boolean; value: number | null; iterations: number }>
  /** Fige les `rows` premières lignes et les `cols` premières colonnes. */
  setFreeze: (rows: number, cols: number) => boolean
  /** Libère les volets figés. */
  cancelFreeze: () => void
  /** Nombre de lignes et colonnes actuellement figées. */
  getFrozen: () => { rows: number; cols: number }
  /**
   * Insère une image DANS une cellule, comme le fait Excel avec « Image dans la
   * cellule ». La source peut être une URL ou un data URI.
   */
  insertCellImage: (ref: string, source: string) => Promise<boolean>
  /** Pose ou remplace le commentaire d'une cellule. */
  setNote: (ref: string, texte: string) => boolean
  /** Texte du commentaire d'une cellule, chaîne vide s'il n'y en a pas. */
  getNote: (ref: string) => string
  /**
   * TOUTES les notes de la feuille en UNE fois.
   *
   * `getNote()` résout `SheetsNoteModel` dans le conteneur d'injection à chaque
   * appel : le faire pour chaque cellule d'un relevé — plusieurs centaines —
   * finissait par déclencher « [redi]: Detecting cyclic dependency … FWorkbook2 »
   * et faisait tomber tout le player (m17-e03).
   */
  getNotes: () => Record<string, string>
  /** Retire le commentaire d'une cellule. */
  deleteNote: (ref: string) => void
  /** Pose une règle de validation des données sur une plage. */
  addValidation: (range: string, rule: ValidationRule) => boolean
  /** Retire la validation d'une plage. */
  clearValidation: (range: string) => void
  /** Vrai si la cellule respecte la validation posée, null si aucune règle. */
  isValidationSatisfied: (ref: string) => Promise<boolean | null>
  /** Retire toutes les règles conditionnelles d'une plage. */
  clearConditionalRules: (range: string) => void
  /** Retire TOUTES les règles conditionnelles de la feuille, par identifiant. */
  clearAllConditionalRules: () => void
  /** Nombre de règles conditionnelles posées sur la feuille. */
  countConditionalRules: () => number
  /** Mise en forme de la sélection : gras, italique, souligné. */
  setItalic: (on: boolean) => void
  setUnderline: (on: boolean) => void
  /** Taille de police en points, appliquée à la sélection. */
  setFontSize: (size: number) => void
  /** Couleur du texte et couleur de remplissage, en hexadécimal. */
  setFontColor: (color: string) => void
  setBackground: (color: string) => void
  /** Alignement horizontal et vertical de la sélection. */
  setAlign: (align: "left" | "center" | "right") => void
  setVerticalAlign: (align: "top" | "middle" | "bottom") => void
  /** Renvoi à la ligne automatique. */
  setWrap: (on: boolean) => void
  /** Fusionner ou dissocier la sélection. */
  mergeCells: () => void
  unmergeCells: () => void
  /**
   * Signature des PLAGES FUSIONNÉES de la feuille active, triée.
   *
   * `acc-fusionner` ne change ni valeur, ni format, ni style : sans ce relevé,
   * « fusionnez A1:D1 » était déclaré sans effet alors qu'il fusionne bien
   * (m08-e01, m08-l02). `getMergedRanges()` rend des `FRange` — on en tire une
   * liste de références lisibles, comparable d'un passage à l'autre.
   */
  getFusions: () => string[]
  fusionner: (range: string) => void
  defusionner: (range: string) => void
  /** Bordures sur tout le pourtour et l'intérieur de la sélection. */
  setBorderAll: (on: boolean) => void
  /**
   * Repose une mise en forme VISUELLE sur une plage précise, sans passer par la
   * sélection. Le rejeu d'une démonstration doit pouvoir défaire ce que le
   * premier passage a posé, et les setters existants n'agissent que sur la
   * SÉLECTION courante, qu'on ne peut pas déplacer sans effet de bord.
   */
  setVisuel: (ref: string, spec: { background?: string; fontSize?: number | null; wrap?: boolean }) => void
  /**
   * Style BRUT d'une cellule, tel qu'Univer le stocke — et sa remise en place.
   *
   * C'est la seule façon de rendre EXACTEMENT l'état de départ. Les setters par
   * attribut ne savent pas revenir à la valeur par défaut : `setHorizontalAlignment`
   * n'accepte que gauche, centre et droite, jamais « général », et
   * `setNumberFormat("")` ne retire pas un format monétaire. Or une démonstration
   * qu'on rejoue doit repartir de l'écran d'avant, sans « à peu près ».
   * `clearFormat()` remet la cellule à neuf, puis on repose le style relevé —
   * gras, bordures et alignement compris, y compris ce qu'aucun getter ne sait
   * lire attribut par attribut.
   */
  getStyleBrut: (ref: string) => unknown
  setStyleBrut: (ref: string, style: unknown) => void
  /**
   * Mise en forme relue d'une cellule, pour valider l'état plutôt que le geste.
   * Univer n'expose pas de getter pour le gras ni l'italique : ces deux-là se
   * valident par le clic de ruban.
   */
  getFormat: (ref: string) => {
    background: string
    fontSize: number | null
    hAlign: string
    vAlign: string
    wrap: boolean | null
    numberFormat: string
  }
  /**
   * Colle du contenu tabulé à la sélection, comme un collage depuis un fichier
   * texte ou une page web : tabulations entre colonnes, retours à la ligne
   * entre lignes.
   */
  pasteText: (texte: string) => Promise<boolean>
  /**
   * « Convertir » d'Excel : découpe une colonne de texte en plusieurs colonnes.
   * `separateur` suit l'énumération d'Univer — tabulation 1, virgule 2,
   * point-virgule 4, espace 8, combinables par bits.
   */
  splitToColumns: (range: string, separateur: number, fusionnerSeparateurs?: boolean) => boolean
  /**
   * Trie une plage sur une de ses colonnes. `column` est un indice RELATIF au
   * premier champ de la plage — vérifié au banc, ce n'est pas un indice absolu
   * de feuille.
   */
  sortRange: (range: string, column: number, ascending: boolean) => boolean
  /** Pose les boutons de filtre d'Excel sur la ligne d'en-tête d'une plage. */
  createFilter: (range: string) => boolean
  /** Un filtre est-il posé sur la feuille ? Le poser ne masque encore rien. */
  aUnFiltre: () => boolean
  /** Coche les valeurs à garder visibles sur une colonne filtrée. */
  setFilterCriteria: (column: string, values: string[]) => boolean
  /** Retire le filtre et réaffiche toutes les lignes. */
  removeFilter: () => boolean
  /** Indices des lignes masquées par le filtre en cours. */
  getFilteredOutRows: () => number[]
  /** Sélection courante en notation A1. */
  getSelection: () => string
  /** Verrouille l'édition : seules ces cellules restent modifiables. */
  setEditableCells: (refs: string[] | null) => void
  /** Feuilles du classeur, dans l'ordre, avec celle qui est active. */
  getSheets: () => Array<{ name: string; active: boolean }>
  activateSheet: (name: string) => void
  insertSheet: (name?: string) => void
  /**
   * Supprime une feuille par son nom. Sans elle, « Nouvelle feuille » était un
   * geste sans retour : la démonstration en créait une à chaque passage et rien
   * ne savait la retirer, si bien qu'un rejeu laissait « Feuille1 » ET
   * « Feuille2 » dans un classeur qui n'en demandait qu'une.
   */
  deleteSheet: (name: string) => boolean
  renameSheet: (oldName: string, newName: string) => void
  /** Noms définis (plages nommées) du classeur. */
  defineName: (name: string, ref: string) => boolean
  /**
   * Supprime un nom de plage. Sans elle, une démonstration `DEFINE_NAME` en
   * créait un de plus à chaque rejeu — mesuré sur `m14-e02` et `m14-e03`, où le
   * classeur repartait avec « Ventes » ET « Ventes_S1 ».
   */
  deleteName: (name: string) => boolean
  getDefinedNames: () => Array<{ name: string; ref: string }>
  /** Opérations sur les lignes et colonnes, pour les boutons du ruban. */
  insertRowBefore: (row: number) => void
  insertColumnBefore: (col: number) => void
  deleteRow: (row: number) => void
  deleteColumn: (col: number) => void
  setColumnWidth: (col: number, px: number) => void
  setRowHeight: (row: number, px: number) => void
  hideColumn: (col: number) => void
  hideRow: (row: number) => void
  /**
   * Réafficher : le pendant de `hideColumn`/`hideRow`, sans lequel l'entrée
   * « Afficher » du menu Format serait un bouton de plus qui ne fait rien —
   * exactement le défaut que l'audit du 31/07/2026 a fermé.
   */
  showColumn: (col: number, nb?: number) => void
  showRow: (row: number, nb?: number) => void
  /** Gras sur la sélection courante. */
  toggleBold: (on: boolean) => void
  /**
   * Nature de la sélection courante : cellule, plage, colonne(s) entière(s) ou
   * ligne(s) entière(s). Le scénario peut ainsi exiger « sélectionnez la colonne
   * C » sans dépendre de la hauteur réelle de la grille.
   */
  getSelectionKind: () => { kind: "cell" | "range" | "column" | "row"; ref: string; index: number } | null
  /**
   * Bornes RÉELLES de la feuille active. Une « colonne entière » se reconnaît à
   * `endRow >= maxRows - 1` : sans ces bornes, une démonstration qui veut
   * sélectionner une colonne devrait deviner combien la feuille compte de
   * lignes, et une plage trop courte ne serait pas reconnue comme une colonne.
   */
  getBornes: () => { rows: number; cols: number }
  /**
   * Redonne le focus clavier à la grille. Nécessaire après toute interaction avec
   * un élément du DOM (bouton Suivant, bouton du ruban, demande d'indice) : le
   * focus part sur le bouton et l'apprenant ne peut plus taper sans recliquer.
   */
  focus: () => void
  /** Position à l'écran d'une cellule, pour poser le halo d'aide. */
  /**
   * Agrégats de la sélection courante, pour la barre d'état.
   * Excel n'affiche `moyenne` et `somme` que s'il y a au moins deux nombres —
   * on reproduit ce comportement en renvoyant null dans ce cas.
   */
  getSelectionStats: (ref?: string) => {
    range: string
    count: number
    numbers: number
    sum: number | null
    average: number | null
    min: number | null
    max: number | null
  } | null
}

type Props = {
  /** Appelé une fois le tableur prêt, avec son interface de pilotage. */
  onReady: (api: GridApi) => void
  /** Appelé à chaque geste de l'apprenant. */
  onAction: (action: ObservedAction) => void
  /**
   * Hauteur en pixels, appliquée en style inline. Volontairement une valeur
   * DÉFINIE et non un pourcentage ou une classe : Univer dimensionne ses couches
   * internes en `height: 100%`, ce qui se résout à zéro si aucun ancêtre n'a de
   * hauteur définie. La grille se rendait alors totalement invisible sans lever
   * la moindre erreur — panne silencieuse constatée au banc d'essai.
   */
  heightPx?: number
  className?: string
}

/**
 * Un échec de setter de mise en forme ne doit pas rester invisible : c'est un
 * `catch` muet qui a laissé le bouton Droite sans effet pendant tout le
 * développement. En production on reste silencieux — l'apprenant n'a rien à
 * faire d'une trace — mais en développement l'erreur doit sauter aux yeux.
 */
function signalerEnDev(quoi: string, e: unknown) {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error(`[simulateur] ${quoi} a échoué :`, e)
  }
}

export default function ExcelGrid({ onReady, onAction, heightPx = 380, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Rappels lus par référence : l'effet de montage reste sans dépendance.
  const onReadyRef = useRef(onReady)
  const onActionRef = useRef(onAction)
  onReadyRef.current = onReady
  onActionRef.current = onAction

  // Cellules autorisées à l'édition. null = aucune restriction.
  const editableRef = useRef<Set<string> | null>(null)
  // Dernière origine de geste observée, pour renseigner le canal d'une saisie.
  const channelRef = useRef<ActionChannel>("unknown")
  // Univer clôture un glisser de plage par un clic sur la cellule d'arrivée, et
  // répète parfois l'événement de fin de sélection. Sans ces garde-fous, la plage
  // sélectionnée était aussitôt remplacée par une cellule unique dans la zone Nom.
  const lastDragRef = useRef<{ range: string; at: number }>({ range: "", at: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    const disposers: Array<() => void> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let univerAPI: any = null

    const boot = async () => {
      const [
        { createUniver, LocaleType, mergeLocales },
        { UniverSheetsCorePreset },
        locale,
        { UniverSheetsSortPreset },
        localeSort,
        { UniverSheetsFilterPreset },
        localeFilter,
        { UniverSheetsConditionalFormattingPreset },
        localeCF,
        { UniverSheetsDataValidationPreset },
        localeDV,
        { UniverSheetsNotePreset },
        localeNote,
        { UniverSheetsDrawingPreset },
        localeDrawing,
      ] = await Promise.all([
        import("@univerjs/presets"),
        import("@univerjs/preset-sheets-core"),
        import("@univerjs/preset-sheets-core/locales/fr-FR"),
        import("@univerjs/preset-sheets-sort"),
        import("@univerjs/preset-sheets-sort/locales/fr-FR"),
        import("@univerjs/preset-sheets-filter"),
        import("@univerjs/preset-sheets-filter/locales/fr-FR"),
        import("@univerjs/preset-sheets-conditional-formatting"),
        import("@univerjs/preset-sheets-conditional-formatting/locales/fr-FR"),
        import("@univerjs/preset-sheets-data-validation"),
        import("@univerjs/preset-sheets-data-validation/locales/fr-FR"),
        import("@univerjs/preset-sheets-note"),
        import("@univerjs/preset-sheets-note/locales/fr-FR"),
        import("@univerjs/preset-sheets-drawing"),
        import("@univerjs/preset-sheets-drawing/locales/fr-FR"),
      ])
      if (disposed) return

      const created = createUniver({
        locale: LocaleType.FR_FR,
        locales: {
          [LocaleType.FR_FR]: mergeLocales(
            locale.default ?? locale,
            localeSort.default ?? localeSort,
            localeFilter.default ?? localeFilter,
            localeCF.default ?? localeCF,
            localeDV.default ?? localeDV,
            localeNote.default ?? localeNote,
            localeDrawing.default ?? localeDrawing
          ),
        },
        presets: [
          // Tri et filtre : indispensables aux modules « listes de données », et
          // sous licence Apache-2.0 comme le cœur. Les graphiques et tableaux
          // croisés relèvent, eux, de @univerjs-pro (licence payante).
          UniverSheetsSortPreset(),
          UniverSheetsFilterPreset(),
          UniverSheetsConditionalFormattingPreset(),
          UniverSheetsDataValidationPreset(),
          UniverSheetsNotePreset(),
          UniverSheetsDrawingPreset(),
          UniverSheetsCorePreset({
            container,
            // Toute la chrome native est coupée : on fournit notre propre ruban,
            // notre barre de formule et nos menus, pour contrôler la pédagogie.
            header: false,
            footer: false,
            formulaBar: false,
            toolbar: false,
            contextMenu: false,
            disableAutoFocus: true,
          }),
        ],
      })
      univerAPI = created.univerAPI
      if (disposed) {
        univerAPI?.dispose?.()
        return
      }

      // ── Localisation française des nombres ──────────────────────────────
      // Univer formate les cellules avec la bibliothèque `numfmt`, en lui
      // passant TOUJOURS la locale « en » : son getter interne initialise un
      // BehaviorSubject à "en" puis fait `if (_locale) return _locale`, ce qui
      // rend morte sa propre correspondance LocaleType.FR_FR → "fr". Régler
      // l'application en français ne suffit donc pas, et le contrôleur qui
      // exposerait `setNumfmtLocal` n'est pas atteignable depuis l'injecteur
      // racine (il vit dans un injecteur enfant).
      //
      // On agit donc là où c'est public et stable : `numfmt.addLocale` permet
      // de redéfinir les données d'une locale. On réécrit « en » avec les
      // données françaises que numfmt embarque déjà. Résultat : « 1 234,50 € »
      // et « mercredi 1 janvier 2025 » au lieu de « 1,234.50 € » et
      // « Wednesday 1 January 2025 ». Univer étant le seul consommateur de
      // numfmt dans l'application, l'effet reste contenu.
      try {
        const numfmt = await import("numfmt")
        const fr = numfmt.getLocale?.("fr")
        if (fr) numfmt.addLocale?.(fr, "en")
      } catch {
        /* sans localisation les nombres restent anglais, la grille fonctionne */
      }

      univerAPI.createWorkbook({ name: "Simulation" })

      /* Deux accès nommés, sans mémorisation : une façade `FWorkbook` gardée
         d'un rendu à l'autre peut devenir périmée — la liste des feuilles
         revenait vide au rejeu de `m01-e02`. Le vrai remède au cycle
         d'injection est ailleurs : voir `listen`, qui sort les écouteurs de la
         pile d'Univer avant de rappeler la façade. */
      const classeur = () => univerAPI.getActiveWorkbook()
      const oublierFeuille = () => {}
      const sheet = () => classeur()?.getActiveSheet()
      // Sonde d'audit, hors production : sans elle, un setter qui n'existe pas
      // sur la feuille Univer échoue en silence derrière `?.` et `catch {}`.
      if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
        ;(window as any).__SIM_SHEET = sheet
      }

      /* ── Interface de pilotage ─────────────────────────────────────────── */

      // Motif « décimales variables » : le chemin d'affichage sans format ne
      // passe pas par numfmt et rend « 42.25 » au lieu de « 42,25 ». On pose ce
      // motif seulement quand la valeur calculée n'est PAS entière — sur un
      // entier il laisserait une virgule orpheline (« 12, »), et un entier
      // s'affiche de toute façon pareil dans les deux conventions.
      const MOTIF_DECIMAL = "0.##########"
      const localiserDecimale = (ref: string): boolean => {
        try {
          const rg = sheet()?.getRange(ref)
          if (!rg) return false
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyRg = rg as any
          if (anyRg.getNumberFormat?.()) return false // format déjà voulu par l'auteur
          const brut = anyRg.getRawValue?.()
          if (typeof brut !== "number" || !Number.isFinite(brut) || Number.isInteger(brut)) return false
          anyRg.setNumberFormat?.(MOTIF_DECIMAL)
          return true
        } catch {
          /* le nombre restera à l'anglaise, sans autre conséquence */
          return false
        }
      }

      /**
       * LES FORMULES DÉJÀ POSÉES, QUI DEVIENNENT DÉCIMALES PLUS TARD.
       *
       * `localiserDecimale` n'était appelée que sur la cellule qu'on venait
       * d'écrire. Or une formule du modèle ne devient décimale qu'au moment où
       * l'apprenant remplit une AUTRE cellule : dans l'évaluation du module 1,
       * `B15 = B13*B14` vaut 0 tant que le kilométrage manque, puis 172,8 dès
       * qu'il est saisi — et s'affiche « 172.8 », à dix lignes d'un « 0,54 »
       * parfaitement français. Deux écritures du même nombre sur le même écran,
       * dans une formation Excel française. Mesuré au banc : B15 ET B17.
       *
       * On retient donc les cellules porteuses d'une formule, par feuille, et
       * on les repasse après chaque salve de recalcul. La clé porte le nom de
       * la feuille : sans lui, changer d'onglet ferait poser un format sur la
       * cellule de même adresse d'une autre feuille.
       */
      // Objet simple et pas `Set` : la cible TypeScript du projet refuse
      // d'itérer un Set (TS2802), piège déjà payé dans les scripts.
      const formulesConnues: Record<string, true> = {}
      const nomFeuille = () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return String((sheet() as any)?.getSheetName?.() ?? "")
        } catch {
          return ""
        }
      }
      const noterFormule = (ref: string) => {
        formulesConnues[`${nomFeuille()}!${ref.toUpperCase()}`] = true
      }
      const franciserFormules = (): number => {
        const nom = nomFeuille()
        let poses = 0
        for (const k of Object.keys(formulesConnues)) {
          const i = k.indexOf("!")
          if (k.slice(0, i) !== nom) continue
          // Sans effet si l'auteur a déjà posé un format, ou si le résultat est
          // entier : la cellule ne sera francisée qu'au moment où elle en a
          // besoin, et une seule fois.
          if (localiserDecimale(k.slice(i + 1))) poses += 1
        }
        return poses
      }

      /**
       * Pose le format de nombre DÉCLARÉ par le scénario.
       *
       * Il figurait dans le format de scénario depuis l'origine et n'était
       * jamais appliqué — exactement comme les largeurs de colonnes avant leur
       * correctif. Conséquence : les colonnes de dates du module 10 déclarées
       * `{v: 46266, format: {numberFormat: "dd/mm/yyyy"}}` s'affichaient en
       * numéro de série, et la remise d'aplomb les signalait à chaque ouverture
       * comme un dégât de l'apprenant.
       */
      const poserFormatDeclare = (ref: string, state: CellState) => {
        const motif = state.format?.numberFormat
        if (!motif) return
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(sheet()?.getRange(ref) as any)?.setNumberFormat?.(motif)
        } catch {
          /* un motif refusé par le moteur ne doit pas empêcher la leçon */
        }
      }

      const applyCells = (cells: Record<string, CellState>) => {
        const sh = sheet()
        if (!sh) return
        for (const [ref, state] of Object.entries(cells)) {
          const rg = sh.getRange(ref)
          if (!rg) continue
          // Le format se pose APRÈS l'écriture, sinon le moteur l'écrase en
          // recalculant — même piège que la remise d'aplomb.
          if (state.format?.numberFormat) window.setTimeout(() => poserFormatDeclare(ref, state), 220)
          if (state.f !== undefined) {
            // La formule de l'auteur est écrite en français ; le moteur ne
            // comprend que sa propre convention.
            rg.setValue({ f: frToEngine(state.f) })
            noterFormule(ref)
            // Le résultat n'est connu qu'après recalcul (60 à 120 ms mesurés).
            window.setTimeout(() => localiserDecimale(ref), 200)
          } else if (state.v !== undefined) {
            // Une date ou une heure écrite à la française doit être POSÉE comme
            // nombre, avec son format : Univer lit « 03/01/2026 » à l'américaine et
            // en fait le 1ᵉʳ mars, puis réaffiche la chaîne tapée — l'erreur reste
            // donc invisible jusqu'à la première fonction de date.
            const fr = typeof state.v === "string" ? lireDateOuHeureFr(state.v) : null
            if (fr) {
              rg.setValue(fr.valeur)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(rg as any).setNumberFormat?.(fr.format)
              continue
            }
            // Une décimale écrite à la française doit devenir un NOMBRE, pas du
            // texte : posée telle quelle, « 7650,50 » restait une chaîne et les
            // sommes qui la traversaient l'ignoraient en silence.
            const nb = typeof state.v === "string" ? lireNombreFr(state.v) : null
            if (nb !== null) {
              rg.setValue(nb)
              localiserDecimale(ref)
              continue
            }
            rg.setValue(state.v)
            // Une décimale sans format s'affiche « 42.25 » : ce chemin ne passe
            // pas par numfmt, et le motif « General » ne le réveille pas. On
            // pose donc un motif à décimales variables — uniquement sur les
            // valeurs NON entières, car sur un entier le même motif laisserait
            // une virgule orpheline (« 12, »). Un entier s'affiche de la même
            // façon dans les deux conventions, il n'a donc rien à corriger.
            if (typeof state.v === "number" && Number.isFinite(state.v) && !Number.isInteger(state.v)) {
              localiserDecimale(ref)
            }
          } else {
            rg.setValue("")
          }
        }
      }

      // Toute la mise en forme s'applique à la sélection courante, comme dans Excel :

      // un seul point d'accès évite de répéter la résolution de plage partout.

      const selectedRange = () => {

        const ref = api.getSelection()

        return ref ? (sheet()?.getRange(ref) ?? null) : null

      }


      const api: GridApi = {
        applyWorkbook: (wb) => {
          const sh = sheet()
          if (!sh) return
          const indexActif = wb.activeSheetIndex ?? 0
          const first = wb.sheets[indexActif]
          if (!first) return
          // L'ordre des onglets doit suivre celui du scénario, sinon une consigne
          // qui dit « le dernier onglet » désigne la mauvaise feuille. On renomme
          // donc la feuille par défaut d'Univer (« Sheet1 », de l'anglais dans un
          // Excel français) avec le nom de la PREMIÈRE feuille déclarée, puis on
          // insère les suivantes dans l'ordre.
          const premiere = wb.sheets[0]
          try {
            if (premiere?.name && sh.getSheetName?.() !== premiere.name) sh.setName?.(premiere.name)
          } catch {
            /* sans conséquence sur le contenu */
          }
          for (let i = 1; i < wb.sheets.length; i++) {
            const autre = wb.sheets[i]
            try {
              const existante = classeur()?.getSheetByName?.(autre.name)
              if (!existante) { classeur()?.insertSheet?.(autre.name); oublierFeuille() }
              const cible = classeur()?.getSheetByName?.(autre.name)
              if (cible && autre.cells) {
                for (const [ref, st] of Object.entries(autre.cells)) {
                  const rg = cible.getRange?.(ref)
                  if (!rg) continue
                  if (st.f !== undefined) rg.setValue?.({ f: frToEngine(st.f) })
                  else if (st.v !== undefined) rg.setValue?.(st.v)
                  // Format de nombre déclaré : jamais appliqué jusqu'ici.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  if (st.format?.numberFormat) (rg as any).setNumberFormat?.(st.format.numberFormat)
                }
              }
            } catch {
              /* une feuille en trop ne doit pas empêcher la leçon de démarrer */
            }
          }
          // Largeurs de colonnes et hauteurs de lignes : elles étaient déclarées
          // dans le format de scénario mais jamais appliquées, ce qui tronquait
          // les libellés de toutes les leçons.
          const dimensionner = (feuille: typeof premiere, nom: string) => {
            if (!feuille) return
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const sh2 = classeur()?.getSheetByName?.(nom) as any
              if (!sh2) return
              for (const [lettre, largeur] of Object.entries(feuille.columnWidths ?? {})) {
                sh2.setColumnWidth?.(columnLetterToIndex(lettre), Number(largeur))
              }
              for (const [ligne, hauteur] of Object.entries(feuille.rowHeights ?? {})) {
                sh2.setRowHeight?.(Number(ligne) - 1, Number(hauteur))
              }
            } catch {
              /* des dimensions par défaut restent lisibles */
            }
          }
          for (const f of wb.sheets) dimensionner(f, f.name)

          // Grille BORNÉE à la zone utile : sans cela, la molette emmenait
          // l'élève à la ligne 640 dans le vide (vidéo Samuel du 29/07). Marge
          // large pour les leçons qui insèrent des lignes ou étendent le tableau.
          const borner = (feuille: typeof premiere, nom: string) => {
            if (!feuille) return
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const sh3 = classeur()?.getSheetByName?.(nom) as any
              if (!sh3) return
              let maxRow = 0
              let maxCol = 0
              for (const ref of Object.keys(feuille.cells ?? {})) {
                const m = ref.match(/^([A-Z]+)(\d+)$/)
                if (!m) continue
                maxRow = Math.max(maxRow, Number(m[2]))
                maxCol = Math.max(maxCol, columnLetterToIndex(m[1]) + 1)
              }
              sh3.setRowCount?.(Math.max(40, maxRow + 20))
              sh3.setColumnCount?.(Math.max(16, maxCol + 8))
            } catch {
              /* une grille non bornée reste utilisable */
            }
          }
          for (const f of wb.sheets) borner(f, f.name)

          // La première feuille a été renommée, pas insérée : ses données n'ont
          // pas été posées dans la boucle ci-dessus.
          if (premiere?.cells) {
            try {
              const cible = classeur()?.getSheetByName?.(premiere.name)
              if (cible) {
                for (const [ref, st] of Object.entries(premiere.cells)) {
                  const rg = cible.getRange?.(ref)
                  if (!rg) continue
                  if (st.f !== undefined) rg.setValue?.({ f: frToEngine(st.f) })
                  else if (st.v !== undefined) rg.setValue?.(st.v)
                  // Format de nombre déclaré : jamais appliqué jusqu'ici.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  if (st.format?.numberFormat) (rg as any).setNumberFormat?.(st.format.numberFormat)
                }
              }
            } catch {
              /* la feuille active reçoit de toute façon applyCells ci-dessous */
            }
          }
          // On termine sur la feuille active déclarée par le scénario.
          try {
            const active = classeur()?.getSheetByName?.(first.name)
            if (active) { classeur()?.setActiveSheet?.(active); oublierFeuille() }
          } catch {
            /* sans conséquence */
          }
          applyCells(first.cells)
          if (wb.selection) api.setSelection(wb.selection)
        },
        applyCells,
        setSelection: (ref) => {
          // Univer produit une plage aberrante si on lui passe autre chose
          // qu'une référence (un nom défini, un libellé) : on refuse en amont.
          if (!/^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(:\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?$/.test(ref.trim())) return
          const sh = sheet()
          const rg = sh?.getRange(ref)
          rg?.activate?.()
        },
        getFormula: (ref) => {
          const rg = sheet()?.getRange(ref)
          const raw = rg?.getFormula?.() ?? ""
          // L'apprenant ne doit jamais voir la convention anglaise.
          return raw ? engineToFr(raw) : ""
        },
        getValue: (ref) => {
          // Dès qu'un format de nombre est posé, `getValue` renvoie la CHAÎNE
          // formatée (« 42,25 ») au lieu du nombre : toute validation d'état
          // numérique casserait. `getRawValue` reste la valeur du modèle. Pour
          // une cellule de formule il renvoie la formule, d'où le garde-fou sur
          // le type avant de retomber sur `getValue`.
          const rg = sheet()?.getRange(ref)
          if (!rg) return null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const brut = (rg as any).getRawValue?.()
          if (typeof brut === "number") return brut
          return rg.getValue?.() ?? null
        },
        scrollToCell: (ref) => {
          try {
            const pos = parseCell(ref)
            if (!pos) return false
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sh2 = sheet() as any
            if (typeof sh2?.scrollToCell !== "function") return false
            // Une ligne au-dessus quand c'est possible : une cible collée au
            // bord haut se lit mal, et la bulle qui la surmonte n'aurait plus
            // de place pour se poser.
            sh2.scrollToCell(Math.max(0, pos.row - 1), Math.max(0, pos.col - 1))
            return true
          } catch {
            return false
          }
        },
        getCellRect: (ref) => {
          try {
            const pos = parseCell(ref)
            if (!pos) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sh2 = sheet() as any
            if (!sh2) return null
            const sk = sh2.getSkeleton?.()
            // Les en-têtes ont une taille propre ; sans elles tout est décalé
            // et un clic calculé tombe dans l'en-tête de lignes.
            const largeurEnTeteLignes = Number(sk?.rowHeaderWidth ?? 46)
            const hauteurEnTeteColonnes = Number(sk?.columnHeaderHeight ?? 20)
            /**
             * 🔴 SOMMER LES LARGEURS NE SUFFIT PAS : une colonne MASQUÉE garde
             * sa largeur déclarée tout en n'occupant aucun pixel.
             *
             * Le défaut est resté dormant tant que `hideColumn` ne masquait
             * rien (appel Univer faux, corrigé le 31/07/2026). Dès que le
             * masquage a fonctionné, tout ce qui repose sur cette géométrie —
             * halo d'aide, cibles de démonstration, pilotage en test — a visé
             * une colonne trop à droite : mesuré, `getCellRect("D2")` menait
             * sur E2. Or le module 4 masque des colonnes puis fait travailler
             * l'apprenant sur celles d'à côté.
             *
             * Le squelette d'Univer tient déjà le cumul des largeurs RÉELLES :
             * une colonne masquée y contribue pour zéro. On s'en sert quand il
             * est là, et l'on garde la somme naïve en secours.
             */
            const cumulC: number[] | undefined = sk?._columnWidthAccumulation
            const cumulL: number[] | undefined = sk?._rowHeightAccumulation
            const bornéC = (i: number) => (i < 0 ? 0 : Number(cumulC?.[i] ?? 0))
            const bornéL = (i: number) => (i < 0 ? 0 : Number(cumulL?.[i] ?? 0))
            let left = largeurEnTeteLignes
            if (cumulC?.length) left += bornéC(pos.col - 1)
            else for (let c = 0; c < pos.col; c++) left += Number(sh2.getColumnWidth?.(c) ?? 88)
            let top = hauteurEnTeteColonnes
            if (cumulL?.length) top += bornéL(pos.row - 1)
            else for (let r = 0; r < pos.row; r++) top += Number(sh2.getRowHeight?.(r) ?? 24)
            // Le défilement décale tout le corps de la grille, pas les en-têtes.
            //
            // ATTENTION au sens de `offsetX` / `offsetY` d'Univer : ce n'est PAS
            // le défilement total, c'est le reste à l'intérieur de la première
            // ligne (ou colonne) visible. Le défilement réel vaut donc la hauteur
            // cumulée des lignes situées AVANT `sheetViewStartRow`, plus ce reste.
            // Les soustraire seuls revenait à ignorer le défilement : après un
            // coup de molette, le halo d'aide se posait sur la mauvaise cellule et
            // un geste calculé tombait à côté.
            const scroll = sh2.getScrollState?.()
            const debutLigne = Number(scroll?.sheetViewStartRow ?? 0)
            const debutColonne = Number(scroll?.sheetViewStartColumn ?? 0)
            let defilementX = Number(scroll?.offsetX ?? 0)
            let defilementY = Number(scroll?.offsetY ?? 0)
            if (cumulC?.length) defilementX += bornéC(debutColonne - 1)
            else for (let c = 0; c < debutColonne; c++) defilementX += Number(sh2.getColumnWidth?.(c) ?? 88)
            if (cumulL?.length) defilementY += bornéL(debutLigne - 1)
            else for (let r = 0; r < debutLigne; r++) defilementY += Number(sh2.getRowHeight?.(r) ?? 24)
            left -= defilementX
            top -= defilementY
            return {
              left,
              top,
              // Largeur RÉELLE : zéro sur une colonne masquée, ce qui vaut mieux
              // qu'un rectangle plein posé sur la colonne voisine.
              width: cumulC?.length
                ? bornéC(pos.col) - bornéC(pos.col - 1)
                : Number(sh2.getColumnWidth?.(pos.col) ?? 88),
              height: cumulL?.length
                ? bornéL(pos.row) - bornéL(pos.row - 1)
                : Number(sh2.getRowHeight?.(pos.row) ?? 24),
            }
          } catch {
            return null
          }
        },
        getColumnWidth: (col) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = (sheet() as any)?.getColumnWidth?.(col)
            return Number.isFinite(Number(w)) ? Number(w) : null
          } catch {
            return null
          }
        },
        getRowHeight: (row) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const h = (sheet() as any)?.getRowHeight?.(row)
            return Number.isFinite(Number(h)) ? Number(h) : null
          } catch {
            return null
          }
        },
        /* UN SEUL PARCOURS, UNE SEULE RÉSOLUTION DE CLASSEUR.
           Redemander la façade feuille par feuille finissait par déclencher
           « [redi]: Detecting cyclic dependency … FWorkbook2 » au milieu d'une
           commande Univer, ce qui faisait tomber tout le player (m17-e03). */
        getDimensionsFeuilles: (c1, c2, r1, r2) => {
          const tout: Record<string, { colonnes: Record<string, number>; lignes: Record<string, number> }> = {}
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wb = classeur() as any
            if (!wb?.getSheets) return tout
            for (const f of wb.getSheets() ?? []) {
              const nom = String(f?.getSheetName?.() ?? "")
              if (!nom) continue
              const colonnes: Record<string, number> = {}
              const lignes: Record<string, number> = {}
              for (let c = c1; c <= c2; c++) {
                const w = f.getColumnWidth?.(c - 1)
                if (Number.isFinite(Number(w))) colonnes[String(c)] = Number(w)
              }
              for (let r = r1; r <= r2; r++) {
                const h = f.getRowHeight?.(r - 1)
                if (Number.isFinite(Number(h))) lignes[String(r)] = Number(h)
              }
              tout[nom] = { colonnes, lignes }
            }
          } catch {
            /* squelette pas prêt : le cliché se contentera de ce qu'il a */
          }
          return tout
        },
        setDimensionFeuille: (nom, axe, index, px) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f = (classeur() as any)?.getSheetByName?.(nom)
            if (!f) return
            if (axe === "col") {
              if (f.getColumnWidth?.(index) !== px) f.setColumnWidth?.(index, px)
            } else if (f.getRowHeight?.(index) !== px) f.setRowHeight?.(index, px)
          } catch {
            /* une dimension refusée ne doit pas interrompre la leçon */
          }
        },
        getDisplayValue: (ref) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const v = (sheet()?.getRange(ref) as any)?.getDisplayValue?.()
            return v === undefined || v === null ? "" : String(v)
          } catch {
            return ""
          }
        },
        setNumberFormat: (refs, pattern) => {
          for (const ref of refs) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(sheet()?.getRange(ref) as any)?.setNumberFormat?.(pattern)
            } catch {
              /* un format refusé ne doit pas interrompre la leçon */
            }
          }
        },
        pasteText: async (texte) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ok = await (univerAPI as any)?.pasteIntoSheet?.(undefined, texte)
            return Boolean(ok)
          } catch {
            return false
          }
        },
        splitToColumns: (range, separateur, fusionnerSeparateurs) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = sheet()?.getRange(range) as any
            if (!rg?.splitTextToColumns) return false
            rg.splitTextToColumns(Boolean(fusionnerSeparateurs), separateur)
            return true
          } catch {
            return false
          }
        },
        /**
         * TRIER COMME EXCEL FRANÇAIS, PAS COMME UNE TABLE DE CODES.
         *
         * `rg.sort()` d'Univer compare les chaînes par POINT DE CODE : « Écran »
         * (U+00C9) y passe donc APRÈS « Souris », et un catalogue trié « de A à
         * Z » restait dans l'ordre où il était — la fonction rendait `true` sans
         * rien déplacer (mesuré le 03/08/2026 sur `m24-e01`). Un tableur
         * français range Clavier, Écran, Souris ; c'est ce que la leçon enseigne
         * et ce que l'apprenant vérifie des yeux.
         *
         * On trie donc nous-mêmes : lecture des lignes, ordre par
         * `localeCompare("fr")` — nombres avant texte, comme Excel — puis
         * réécriture. Les formules suivent leur ligne, elles sont relues telles
         * quelles.
         */
        sortRange: (range, column, ascending) => {
          try {
            const aire = parseRange(range)
            const sh = sheet()
            if (!aire || !sh) return false
            const lignes: Array<{ cles: unknown; cellules: Array<{ f: string; v: unknown }> }> = []
            for (let r = aire.startRow; r <= aire.endRow; r++) {
              const cellules = []
              for (let c = aire.startCol; c <= aire.endCol; c++) {
                const ref = `${columnIndexToLetter(c)}${r + 1}`
                cellules.push({ f: api.getFormula(ref) ?? "", v: api.getValue(ref) })
              }
              lignes.push({ cles: cellules[column]?.v ?? "", cellules })
            }
            const cmp = (x: unknown, y: unknown) => {
              const nx = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."))
              const ny = typeof y === "number" ? y : Number(String(y ?? "").replace(",", "."))
              const xNum = Number.isFinite(nx) && String(x ?? "").trim() !== ""
              const yNum = Number.isFinite(ny) && String(y ?? "").trim() !== ""
              // Excel place les nombres avant le texte en ordre croissant.
              if (xNum && yNum) return nx - ny
              if (xNum) return -1
              if (yNum) return 1
              return String(x ?? "").localeCompare(String(y ?? ""), "fr", { numeric: true, sensitivity: "base" })
            }
            const ordonne = [...lignes].sort((a2, b2) => (ascending ? cmp(a2.cles, b2.cles) : cmp(b2.cles, a2.cles)))
            const cells: Record<string, { v?: unknown; f?: string }> = {}
            ordonne.forEach((ligne, i) => {
              const r = aire.startRow + i
              ligne.cellules.forEach((cel, j) => {
                const ref = `${columnIndexToLetter(aire.startCol + j)}${r + 1}`
                cells[ref] = cel.f ? { f: cel.f } : { v: cel.v ?? "" }
              })
            })
            applyCells(cells as Record<string, CellState>)
            return true
          } catch {
            return false
          }
        },
        aUnFiltre: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return Boolean((sheet() as any)?.getFilter?.())
          } catch {
            return false
          }
        },
        createFilter: (range) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = sheet()?.getRange(range) as any
            if (!rg?.createFilter) return false
            // Un filtre déjà posé fait échouer createFilter : on réutilise.
            return Boolean(rg.getFilter?.() ?? rg.createFilter())
          } catch {
            return false
          }
        },
        setFilterCriteria: (column, values) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f = (sheet() as any)?.getFilter?.()
            if (!f?.setColumnFilterCriteria) return false
            f.setColumnFilterCriteria(columnLetterToIndex(column), { filters: { filters: values } })
            return true
          } catch {
            return false
          }
        },
        removeFilter: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f = (sheet() as any)?.getFilter?.()
            if (!f?.remove) return false
            f.remove()
            return true
          } catch {
            return false
          }
        },
        getFilteredOutRows: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f = (sheet() as any)?.getFilter?.()
            return f?.getFilteredOutRows?.() ?? []
          } catch {
            return []
          }
        },
        addConditionalRule: (range, rule) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sh2 = sheet() as any
            const rg = sh2?.getRange(range)
            if (!rg?.createConditionalFormattingRule) return false
            let b = rg.createConditionalFormattingRule()
            switch (rule.kind) {
              case "greaterThan":
                b = b.whenNumberGreaterThan(rule.value ?? 0)
                break
              case "lessThan":
                b = b.whenNumberLessThan(rule.value ?? 0)
                break
              case "between":
                b = b.whenNumberBetween(rule.value ?? 0, rule.value2 ?? 0)
                break
              case "textContains":
                b = b.whenTextContains(rule.text ?? "")
                break
              case "duplicates":
                b = b.setDuplicateValues()
                break
              default:
                return false
            }
            if (rule.background) b = b.setBackground(rule.background)
            if (rule.fontColor) b = b.setFontColor(rule.fontColor)
            if (rule.bold) b = b.setBold(true)
            rg.addConditionalFormattingRule(b.build())
            return true
          } catch {
            return false
          }
        },
        goalSeek: async (formulaRef, target, inputRef) => {
          // Le moteur de formules recalcule en 60 à 120 ms : on attend 140 ms
          // après chaque écriture, sinon on lit la valeur précédente et la
          // convergence part n'importe où.
          const attendre = () => new Promise((r) => setTimeout(r, 140))
          const poser = async (x: number) => {
            try {
              sheet()?.getRange(inputRef)?.setValue?.(x)
            } catch {
              return NaN
            }
            await attendre()
            const v = Number(api.getValue(formulaRef))
            return Number.isFinite(v) ? v : NaN
          }

          const x0Brut = Number(api.getValue(inputRef))
          let x0 = Number.isFinite(x0Brut) ? x0Brut : 1
          let f0 = await poser(x0)
          if (!Number.isFinite(f0)) return { ok: false, value: null, iterations: 0 }

          // Second point pour amorcer la sécante : une perturbation relative,
          // ou absolue si la valeur de départ est nulle.
          let x1 = x0 === 0 ? 1 : x0 * 1.1
          let f1 = await poser(x1)
          const tolerance = Math.max(1e-9, Math.abs(target) * 1e-9)

          let i = 0
          for (; i < 25; i++) {
            if (!Number.isFinite(f1)) break
            if (Math.abs(f1 - target) <= tolerance) {
              return { ok: true, value: x1, iterations: i }
            }
            const denom = f1 - f0
            if (denom === 0) break
            const x2 = x1 - (f1 - target) * ((x1 - x0) / denom)
            if (!Number.isFinite(x2)) break
            x0 = x1
            f0 = f1
            x1 = x2
            f1 = await poser(x1)
          }

          if (Number.isFinite(f1) && Math.abs(f1 - target) <= Math.max(1e-6, Math.abs(target) * 1e-6)) {
            return { ok: true, value: x1, iterations: i }
          }
          // Échec : on remet la valeur d'origine plutôt que de laisser le
          // classeur dans l'état d'une itération intermédiaire.
          await poser(Number.isFinite(x0Brut) ? x0Brut : 0)
          return { ok: false, value: null, iterations: i }
        },
        setFreeze: (rows, cols) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sh2 = sheet() as any
            if (!sh2?.setFreeze) return false
            // xSplit/ySplit = nombre de colonnes/lignes figées ; startRow et
            // startColumn désignent la première cellule qui défile.
            sh2.setFreeze({ xSplit: cols, ySplit: rows, startRow: rows, startColumn: cols })
            return true
          } catch {
            return false
          }
        },
        cancelFreeze: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(sheet() as any)?.cancelFreeze?.()
          } catch {
            /* sans conséquence */
          }
        },
        getFrozen: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sh2 = sheet() as any
            return { rows: Number(sh2?.getFrozenRows?.() ?? 0), cols: Number(sh2?.getFrozenColumns?.() ?? 0) }
          } catch {
            return { rows: 0, cols: 0 }
          }
        },
        insertCellImage: async (ref, source) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = sheet()?.getRange(ref) as any
            if (!rg?.insertCellImageAsync) return false
            return Boolean(await rg.insertCellImageAsync(source))
          } catch {
            return false
          }
        },
        setNote: (ref, texte) => {
          try {
            const pos = parseCell(ref)
            if (!pos) return false
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = sheet()?.getRange(ref) as any
            if (!rg?.createOrUpdateNote) return false
            rg.createOrUpdateNote({
              id: `note-${ref}`,
              row: pos.row,
              col: pos.col,
              width: 180,
              height: 90,
              note: texte,
            })
            return true
          } catch {
            return false
          }
        },
        getNotes: () => {
          const tout: Record<string, string> = {}
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const notes = (sheet() as any)?.getNotes?.() ?? []
            for (const n of notes) {
              if (!n || typeof n.row !== "number" || typeof n.col !== "number") continue
              tout[`${columnIndexToLetter(n.col)}${n.row + 1}`] = String(n.note ?? "")
            }
          } catch {
            /* pas de plugin de notes : rien à relever */
          }
          return tout
        },
        getNote: (ref) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return String((sheet()?.getRange(ref) as any)?.getNote?.()?.note ?? "")
          } catch {
            return ""
          }
        },
        deleteNote: (ref) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(sheet()?.getRange(ref) as any)?.deleteNote?.()
          } catch {
            /* sans conséquence */
          }
        },
        addValidation: (range, rule) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const u = univerAPI as any
            const rg = sheet()?.getRange(range)
            if (!u?.newDataValidation || !rg) return false
            let b2 = u.newDataValidation()
            switch (rule.kind) {
              case "list":
                b2 = b2.requireValueInList(rule.values ?? [])
                break
              case "numberBetween":
                b2 = b2.requireNumberBetween(rule.min ?? 0, rule.max ?? 0)
                break
              case "numberGreaterThan":
                b2 = b2.requireNumberGreaterThan(rule.value ?? 0)
                break
              case "checkbox":
                b2 = b2.requireCheckbox()
                break
              default:
                return false
            }
            b2 = b2.setOptions({
              allowBlank: true,
              showErrorMessage: true,
              // Excel distingue « refuser » et « avertir » : on suit le scénario.
              error: rule.errorMessage ?? "Cette valeur n'est pas autorisée ici.",
              ...(rule.allowInvalid ? { allowInvalid: true } : {}),
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(rg as any).setDataValidation(b2.build())
            return true
          } catch {
            return false
          }
        },
        clearValidation: (range) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(sheet()?.getRange(range) as any)?.setDataValidation?.(null)
          } catch {
            /* sans conséquence */
          }
        },
        isValidationSatisfied: async (ref) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = sheet()?.getRange(ref) as any
            if (!rg?.getDataValidation?.()) return null
            const grille = await rg.getValidatorStatus?.()
            const etat = grille?.[0]?.[0]
            // Univer renvoie « valid » / « invalid » selon la version.
            return String(etat).toLowerCase().includes("invalid") ? false : true
          } catch {
            return null
          }
        },
        /**
         * TOUTES les règles de la FEUILLE, retirées une par une.
         *
         * `FRange.clearConditionalFormatRules()` ne retire que ce qui coïncide
         * avec la plage donnée : quand deux étapes posent des règles sur des
         * plages différentes, effacer l'une laissait l'autre, la remise en
         * reposait une de plus, et le compte montait à chaque rejeu
         * (2 → 4 sur `m11-e01`). Supprimer par identifiant ne laisse rien
         * derrière.
         */
        clearAllConditionalRules: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sh = sheet() as any
            for (const r of sh?.getConditionalFormattingRules?.() ?? []) {
              if (r?.cfId) sh.deleteConditionalFormattingRule(r.cfId)
            }
          } catch {
            /* sans conséquence */
          }
        },
        clearConditionalRules: (range) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(sheet()?.getRange(range) as any)?.clearConditionalFormatRules?.()
          } catch {
            /* sans conséquence */
          }
        },
        countConditionalRules: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return ((sheet() as any)?.getConditionalFormattingRules?.() ?? []).length
          } catch {
            return 0
          }
        },
        setItalic: (on) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setFontStyle?.(on ? "italic" : "normal")
          } catch {
            /* sans conséquence */
          }
        },
        setUnderline: (on) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setFontLine?.(on ? "underline" : "none")
          } catch {
            /* sans conséquence */
          }
        },
        setFontSize: (size) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setFontSize?.(size)
          } catch {
            /* sans conséquence */
          }
        },
        setFontColor: (color) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setFontColor?.(color)
          } catch {
            /* sans conséquence */
          }
        },
        setBackground: (color) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setBackground?.(color)
          } catch {
            /* sans conséquence */
          }
        },
        setAlign: (align) => {
          try {
            // La façade Univer nomme l'alignement à droite « normal » — son type
            // n'accepte que 'left' | 'center' | 'normal' — et LÈVE une exception
            // sur toute autre valeur. Passer "right" ne faisait donc rien du tout,
            // l'erreur étant avalée : le bouton Droite était muet pour l'apprenant.
            const facade = align === "right" ? "normal" : align
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setHorizontalAlignment?.(facade)
          } catch (e) {
            signalerEnDev("setAlign", e)
          }
        },
        setVerticalAlign: (align) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setVerticalAlignment?.(align)
          } catch {
            /* sans conséquence */
          }
        },
        setWrap: (on) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setWrap?.(on)
          } catch {
            /* sans conséquence */
          }
        },
        getFusions: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const plages = (sheet() as any)?.getMergedRanges?.() ?? []
            const refs: string[] = []
            for (const p of plages) {
              const a1 = p?.getA1Notation?.()
              if (a1) refs.push(String(a1).toUpperCase().replace(/\$/g, ""))
            }
            return refs.sort()
          } catch {
            return []
          }
        },
        fusionner: (range) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(sheet()?.getRange(range) as any)?.merge?.()
          } catch {
            /* une fusion refusée ne doit pas casser la leçon */
          }
        },
        defusionner: (range) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(sheet()?.getRange(range) as any)?.breakApart?.()
          } catch {
            /* une séparation refusée ne doit pas casser la leçon */
          }
        },
        mergeCells: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.merge?.()
          } catch {
            /* sans conséquence */
          }
        },
        unmergeCells: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.breakApart?.()
          } catch {
            /* sans conséquence */
          }
        },
        setBorderAll: (on) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = selectedRange() as any
            rg?.setBorder?.(on ? "all" : "none", on ? "thin" : "none", "#000000")
          } catch {
            /* sans conséquence */
          }
        },
        getStyleBrut: (ref) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const brut = (sheet()?.getRange(ref) as any)?.getCellStyleData?.() ?? null
            if (!brut || typeof brut !== "object") return brut
            /**
             * DEUX DÉFAUTS D'UNIVER, RETIRÉS — ET SEULEMENT CES DEUX-LÀ.
             *
             * `tb: 0` (« ne pas renvoyer à la ligne ») et `tr: { a: 0 }`
             * (« aucune rotation ») décrivent exactement l'absence : une
             * cellule qui les porte est INDISTINGUABLE à l'écran d'une cellule
             * sans style. Univer les matérialise dès qu'une opération touche la
             * cellule — une image insérée, un renvoi à la ligne annulé — alors
             * que l'état d'entrée n'avait aucun style du tout.
             *
             * Les retirer ici, et ici seulement, aligne le relevé sur ce que
             * l'apprenant VOIT. Aucune autre valeur n'est normalisée : `tb: 3`
             * est un vrai renvoi à la ligne, `tr: { a: 45 }` une vraie rotation,
             * et tous deux restent comparés.
             */
            /* Clés TRIÉES : `getCellStyleData()` ne garantit pas l'ordre
               d'insertion d'un appel à l'autre, et la comparaison passe par
               `JSON.stringify` — `{bg,bl}` et `{bl,bg}` décrivent pourtant le
               même style (m11-e01). */
            const source = brut as Record<string, unknown>
            const net: Record<string, unknown> = {}
            for (const k of Object.keys(source).sort()) net[k] = source[k]
            if (net.tb === 0) delete net.tb
            const tr = net.tr as { a?: number } | undefined
            if (tr && typeof tr === "object" && (tr.a ?? 0) === 0 && Object.keys(tr).length <= 1) delete net.tr
            return Object.keys(net).length ? net : null
          } catch {
            return null
          }
        },
        setStyleBrut: (ref, style) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = sheet()?.getRange(ref) as any
            if (!rg) return
            /**
             * LE CONTENU EST RELU ET RÉÉCRIT AVEC LE STYLE.
             *
             * `setValue({ s })` REMPLACE la cellule : la formule y laissait sa
             * place à son dernier résultat. Sur `m05-l03`, remettre le style
             * d'origine de B15 transformait `=B11*B13` en « 447,3 » — un
             * nombre figé là où la leçon montre un calcul. On relit donc le
             * contenu avant de repartir d'une cellule neuve, et on le repose
             * dans la même écriture que le style.
             */
            const formule = api.getFormula(ref)
            const valeur = api.getValue(ref)
            const contenu: Record<string, unknown> = formule
              ? { f: frToEngine(formule) }
              : valeur === null || valeur === undefined || valeur === ""
                ? {}
                : { v: valeur }
            rg.clearFormat?.()
            /**
             * `clearFormat()` NE VIDE PAS TOUT.
             *
             * Univer matérialise ses défauts dès qu'une opération touche la
             * cellule : après un tri, `tr: { a: 0 }` — rotation zéro, c'est-à-dire
             * « pas de rotation » — restait inscrit là où l'état d'entrée
             * n'avait aucun style du tout (m24-e01, m24-l01). Le relevé voyait
             * donc `∅ → {"tr":{"a":0}}` et l'état d'entrée n'était pas rendu.
             * Passer `s: null` explicitement remet la cellule sans style, ce
             * que `clearFormat` seul ne fait pas.
             */
            const s = style && typeof style === "object" && Object.keys(style).length ? style : null
            rg.setValue?.({ ...contenu, s })
            /**
             * DEUX ATTRIBUTS RÉSISTENT À TOUT ÇA : le RENVOI À LA LIGNE et la
             * ROTATION.
             *
             * Ni `clearFormat()` ni `setValue({ s: null })` ne les retirent —
             * Univer les tient hors du style de cellule que ces deux chemins
             * réécrivent. Mesuré au banc : `tb: 3` (renvoi à la ligne) restait
             * après le rejeu de m21-e01, m21-e02 et m21-l01, et `tr: { a: 0 }`
             * après l'insertion d'une image en cellule sur m24-e01 et m24-l01.
             * On les remet donc explicitement à leur valeur d'entrée, y compris
             * quand cette valeur est « rien ».
             */
            const st = (s ?? {}) as Record<string, unknown>
            const tb = st.tb as number | undefined
            if (rg.setWrap) rg.setWrap(tb === 3)
            const tr = st.tr as { a?: number } | undefined
            if (rg.setTextRotation && (tr?.a ?? 0) !== 0) rg.setTextRotation(tr?.a ?? 0)
          } catch {
            /* le moteur peut refuser un style : ne jamais casser la leçon */
          }
        },
        setVisuel: (ref, spec) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = sheet()?.getRange(ref) as any
            if (!rg) return
            if (spec.background !== undefined) rg.setBackground?.(spec.background)
            if (spec.wrap !== undefined) rg.setWrap?.(spec.wrap)
            if (spec.fontSize !== undefined && spec.fontSize !== null) rg.setFontSize?.(spec.fontSize)
          } catch {
            /* le moteur peut refuser un attribut : ne jamais casser la leçon */
          }
        },
        getFormat: (ref) => {
          const vide = { background: "", fontSize: null, hAlign: "", vAlign: "", wrap: null, numberFormat: "" }
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = sheet()?.getRange(ref) as any
            if (!rg) return vide
            return {
              background: String(rg.getBackground?.() ?? ""),
              fontSize: rg.getFontSize?.() ?? null,
              hAlign: String(rg.getHorizontalAlignment?.() ?? ""),
              vAlign: String(rg.getVerticalAlignment?.() ?? ""),
              wrap: rg.getWrap?.() ?? null,
              numberFormat: String(rg.getNumberFormat?.() ?? ""),
            }
          } catch {
            return vide
          }
        },
        setNumberFormatOnSelection: (pattern) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setNumberFormat?.(pattern)
          } catch {
            /* sans conséquence */
          }
        },
        getNumberFormat: (ref) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (sheet()?.getRange(ref) as any)?.getNumberFormat?.() ?? ""
          } catch {
            return ""
          }
        },
        getSelection: () => {
          const sel = classeur()?.getActiveSheet()?.getSelection?.()
          const rg = sel?.getActiveRange?.()
          if (!rg) return ""
          const r = rg.getRange?.()
          if (!r) return ""
          return formatRange({
            startRow: r.startRow,
            startCol: r.startColumn,
            endRow: r.endRow,
            endCol: r.endColumn,
          })
        },
        setEditableCells: (refs) => {
          editableRef.current = refs === null ? null : new Set(refs.map((r) => r.toUpperCase()))
        },
        getSheets: () => {
          try {
            const wb = classeur()
            const actif = wb?.getActiveSheet?.()?.getSheetName?.()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (wb?.getSheets?.() ?? []).map((sh: any) => {
              const name = sh?.getSheetName?.() ?? ""
              return { name, active: name === actif }
            })
          } catch {
            return []
          }
        },
        activateSheet: (name) => {
          try {
            const wb = classeur()
            const sh = wb?.getSheetByName?.(name)
            if (sh) { wb?.setActiveSheet?.(sh); oublierFeuille() }
          } catch {
            /* feuille introuvable : on ne change rien */
          }
        },
        insertSheet: (name) => {
          try {
            classeur()?.insertSheet?.(name)
            oublierFeuille()
          } catch {
            /* sans conséquence */
          }
        },
        deleteSheet: (name) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wb = classeur() as any
            const f = wb?.getSheets?.().find((s: { getSheetName: () => string }) => s.getSheetName() === name)
            const ok = f ? Boolean(wb?.deleteSheet?.(f)) : false
            oublierFeuille()
            return ok
          } catch {
            return false
          }
        },
        renameSheet: (oldName, newName) => {
          try {
            classeur()?.getSheetByName?.(oldName)?.setName?.(newName)
          } catch {
            /* sans conséquence */
          }
        },
        defineName: (name, ref) => {
          // Excel refuse les noms qui pourraient être confondus avec une
          // référence, ceux qui commencent par un chiffre ou contiennent un
          // espace. On applique les mêmes règles pour que la leçon soit juste.
          if (!/^[A-Za-z_\u00C0-\u024F][A-Za-z0-9_.\u00C0-\u024F]*$/.test(name)) return false
          if (/^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}$/.test(name)) return false
          try {
            // Une plage nommée se déclare au niveau du classeur, avec la feuille
            // active en préfixe pour que la référence reste valide partout.
            const sh = sheet()?.getSheetName?.() ?? "Feuil1"
            classeur()?.insertDefinedName?.(name, `${sh}!${ref}`)
            return true
          } catch {
            return false
          }
        },
        deleteName: (name) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return Boolean((classeur() as any)?.deleteDefinedName?.(name))
          } catch {
            return false
          }
        },
        getDefinedNames: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (classeur()?.getDefinedNames?.() ?? []).map((d: any) => ({
              name: d?.getName?.() ?? "",
              ref: d?.getFormulaOrRefString?.() ?? "",
            }))
          } catch {
            return []
          }
        },
        insertRowBefore: (row) => { try { sheet()?.insertRowBefore?.(row) } catch {} },
        insertColumnBefore: (col) => { try { sheet()?.insertColumnBefore?.(col) } catch {} },
        deleteRow: (row) => { try { sheet()?.deleteRow?.(row) } catch {} },
        deleteColumn: (col) => { try { sheet()?.deleteColumn?.(col) } catch {} },
        setColumnWidth: (col, px) => { try { sheet()?.setColumnWidth?.(col, px) } catch {} },
        setRowHeight: (row, px) => { try { sheet()?.setRowHeight?.(row, px) } catch {} },
        /**
         * 🔴 `hideColumn` et `hideRow` NE PRENNENT PAS D'INDICE.
         *
         * Univer expose les deux formes : `hideColumn(range: FRange)` attend un
         * objet plage, `hideColumns(indice, nombre)` attend des nombres. On
         * appelait la première avec `(col, 1)` — appel valide en JavaScript,
         * sans effet, sans erreur, avalé par le `catch {}`. Résultat mesuré au
         * banc le 31/07/2026 sur `M04-L05-03` : l'étape se validait, le bandeau
         * « ✓ C'est exact » s'affichait, et la colonne « Coût interne » restait
         * à l'écran — alors que la consigne annonce « La colonne disparaît » et
         * que l'étape suivante fait totaliser « la colonne masquée ».
         * Cinq étapes des modules 4 et EV01 reposaient sur ce geste.
         */
        hideColumn: (col) => { try { sheet()?.hideColumns?.(col, 1) } catch {} },
        hideRow: (row) => { try { sheet()?.hideRows?.(row, 1) } catch {} },
        // Réafficher porte sur une PLAGE : dans Excel on sélectionne les
        // colonnes encadrantes — c'est même ce que M04-L05-05 enseigne, « il
        // faut désigner une colonne qu'on ne voit plus ». Traiter un seul
        // indice ne réaffichait donc jamais rien.
        showColumn: (col, nb = 1) => { try { sheet()?.showColumns?.(col, Math.max(1, nb)) } catch {} },
        showRow: (row, nb = 1) => { try { sheet()?.showRows?.(row, Math.max(1, nb)) } catch {} },
        toggleBold: (on) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setFontWeight?.(on ? "bold" : "normal")
          } catch {
            /* sans conséquence */
          }
        },
        getBornes: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sh = classeur()?.getActiveSheet?.() as any
            return {
              rows: Number(sh?.getMaxRows?.()) || 40,
              cols: Number(sh?.getMaxColumns?.()) || 26,
            }
          } catch {
            return { rows: 40, cols: 26 }
          }
        },
        getSelectionKind: () => {
          const ref = api.getSelection()
          if (!ref) return null
          const r = parseRange(ref)
          if (!r) return null
          // Une colonne entière va de la ligne 0 au bas de la grille allouée.
          // La borne vient de la feuille RÉELLE : la grille est désormais bornée
          // à la zone utile (~40 lignes), l'ancien seuil fixe « ≥ 200 » ne
          // reconnaissait plus jamais une colonne entière.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const shSel = classeur()?.getActiveSheet?.() as any
          const maxR = Number(shSel?.getMaxRows?.()) || 999999
          const maxC = Number(shSel?.getMaxColumns?.()) || 999
          const fullColumn = r.startRow === 0 && r.endRow >= maxR - 1
          const fullRow = r.startCol === 0 && r.endCol >= maxC - 1
          if (fullColumn && !fullRow) return { kind: "column", ref, index: r.startCol }
          if (fullRow && !fullColumn) return { kind: "row", ref, index: r.startRow }
          if (r.startRow === r.endRow && r.startCol === r.endCol) return { kind: "cell", ref, index: r.startRow }
          return { kind: "range", ref, index: r.startRow }
        },
        focus: () => {
          // On cible la surface de saisie d'Univer si elle existe, sinon le
          // conteneur : dans les deux cas le clavier revient à la grille.
          const target =
            container.querySelector<HTMLElement>("[contenteditable='true']") ??
            container.querySelector<HTMLElement>("canvas") ??
            container
          try {
            target.focus?.()
          } catch {
            /* sans conséquence : l'apprenant peut toujours cliquer une cellule */
          }
        },
        getSelectionStats: (ref) => {
          const target = ref || api.getSelection()
          if (!target) return null
          const sh = sheet()
          const rg = sh?.getRange(target)
          if (!rg) return null
          let raw: unknown
          try {
            raw = rg.getValues?.() ?? rg.getValue?.()
          } catch {
            return null
          }
          const flat: unknown[] = Array.isArray(raw) ? (raw as unknown[]).flat(3) : [raw]
          const filled = flat.filter((v) => v !== null && v !== undefined && v !== "")
          const nums = filled
            .map((v) => (typeof v === "number" ? v : Number(String(v).replace(",", "."))))
            .filter((n) => Number.isFinite(n))
          const has = nums.length > 0
          return {
            range: target,
            count: filled.length,
            numbers: nums.length,
            sum: has ? nums.reduce((a, b) => a + b, 0) : null,
            average: has ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
            min: has ? Math.min(...nums) : null,
            max: has ? Math.max(...nums) : null,
          }
        },
      }

      /* ── Écoute des gestes ─────────────────────────────────────────────── */

      /**
       * TOUT ÉCOUTEUR SORT DE LA PILE D'UNIVER AVANT D'AGIR.
       *
       * Univer émet ses événements SYNCHRONEMENT, au milieu de l'exécution de la
       * commande. Nos écouteurs, eux, réinterrogent la façade —
       * `getSelectionKind()`, `getRange()`, `getActiveSheet()`. On construisait
       * donc une façade PENDANT qu'une autre était en cours de construction, et
       * le conteneur d'injection finissait par refuser :
       * « [redi]: Detecting cyclic dependency. The last identifier is
       * "FRange2" ». Mesuré sur `m01-e02`, à la sixième cellule d'une saisie de
       * huit : le classeur devenait inutilisable, le calque tombait, la
       * démonstration s'arrêtait à 5/8 sans fin ni bouton « Revoir ».
       *
       * Un `setTimeout(0)` rend la main à Univer avant que l'écouteur ne touche
       * quoi que ce soit. Les écouteurs qui temporisaient déjà (350 ms pour le
       * recalcul) ne changent pas de comportement pour autant.
       */
      const listen = (eventName: string, handler: (params: unknown) => void) => {
        const ev = univerAPI.Event?.[eventName]
        if (!ev) return
        const differe = (params: unknown) => {
          const t = setTimeout(() => {
            enAttente.delete(t)
            try {
              handler(params)
            } catch {
              /* un écouteur qui échoue ne doit pas casser la feuille */
            }
          }, 0)
          enAttente.add(t)
        }
        const d = univerAPI.addEvent(ev, differe)
        if (d?.dispose) disposers.push(() => d.dispose())
      }
      const enAttente = new Set<ReturnType<typeof setTimeout>>()
      disposers.push(() => {
        for (const t of Array.from(enAttente)) clearTimeout(t)
        enAttente.clear()
      })

      // Clic dans une cellule.
      listen("CellClicked", (p: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = p as any
        if (typeof e?.row !== "number" || typeof e?.column !== "number") return
        // Clic parasite juste après un glisser : on l'ignore.
        if (Date.now() - lastDragRef.current.at < 400) return
        channelRef.current = "mouse"
        onActionRef.current({
          kind: "cellClick",
          cell: formatCell({ row: e.row, col: e.column }),
          modifier: e?.event?.ctrlKey || e?.event?.metaKey ? "Control" : e?.event?.shiftKey ? "Shift" : undefined,
          channel: "mouse",
        })
      })

      // Verrou d'édition : hors des cellules autorisées, on annule l'entrée en
      // édition. `cancel = true` est le mécanisme officiel des événements Before*.
      listen("BeforeSheetEditStart", (p: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = p as any
        const allowed = editableRef.current
        if (!allowed) return
        if (typeof e?.row !== "number" || typeof e?.column !== "number") return
        const ref = formatCell({ row: e.row, col: e.column })
        if (!allowed.has(ref.toUpperCase())) e.cancel = true
      })

      // Fin de saisie : c'est ici qu'on récupère ce que l'apprenant a réellement
      // tapé — ET qu'on traduit sa formule pour le moteur.
      //
      // C'EST LE POINT LE PLUS IMPORTANT DE CE FICHIER. L'éditeur d'Univer écrit
      // directement dans le moteur, qui ne comprend pas le français : une formule
      // saisie `=SOMME(B2:B6)` était stockée telle quelle et la cellule affichait
      // `#NAME?`. Le défaut passait inaperçu parce que la validation d'une étape
      // de saisie compare le TEXTE tapé, pas le résultat calculé : l'étape était
      // validée et l'apprenant se retrouvait avec un classeur en erreur.
      listen("SheetEditEnded", (p: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = p as any
        if (typeof e?.row !== "number" || typeof e?.column !== "number") return
        const ref = formatCell({ row: e.row, col: e.column })
        const rg = sheet()?.getRange(ref)

        // Formule BRUTE telle que le moteur l'a stockée, sans réaffichage FR.
        const stored: string = rg?.getFormula?.() ?? ""
        if (stored.startsWith("=")) {
          // Une formule saisie par l'apprenant devient elle aussi une cellule à
          // surveiller : son résultat peut passer décimal plus tard.
          noterFormule(ref)
          const translated = frToEngine(stored)
          // Différent = la saisie était en français, il faut la retraduire pour
          // que le moteur calcule. Identique = déjà compréhensible, on ne touche pas.
          if (translated !== stored) {
            try {
              rg?.setValue?.({ f: translated })
            } catch {
              /* le moteur refusera de lui-même une formule invalide */
            }
          }
        }

        // Une DATE tapée à la française a déjà été mal lue par le moteur, qui met
        // le mois d'abord : « 07/04/2026 » y devient le 4 juillet. Comme il
        // réaffiche ensuite les chiffres tapés, l'erreur reste invisible jusqu'à la
        // première fonction de date. On relit donc l'affichage à la française et
        // l'on repose la bonne valeur quand elle diffère.
        if (!stored.startsWith("=")) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const motif = String((rg as any)?.getNumberFormat?.() ?? "")
            // Un motif de date ou d'heure : c'est le signe que le moteur a
            // interprété la saisie comme telle, et donc qu'il a pu se tromper.
            if (/[dmyhs]/i.test(motif)) {
              const affiche = api.getDisplayValue(ref)
              const lu = lireDateOuHeureFr(affiche)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const brut = (rg as any)?.getRawValue?.()
              if (lu && typeof brut === "number" && Math.abs(brut - lu.valeur) > 1e-9) {
                rg?.setValue?.(lu.valeur)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(rg as any).setNumberFormat?.(lu.format)
              }
            }
            // Même redressement pour les décimales : l'éditeur d'Univer lit
            // « 7650,50 » comme du texte, la cellule l'affiche pourtant
            // correctement, et le défaut n'apparaît qu'à la première somme.
            const brutTexte = api.getValue(ref)
            if (typeof brutTexte === "string") {
              const nb = lireNombreFr(brutTexte)
              if (nb !== null) {
                rg?.setValue?.(nb)
                localiserDecimale(ref)
              }
            }
          } catch (e) {
            signalerEnDev("lecture française d'une saisie", e)
          }
        }

        // On rapporte ce que l'apprenant a écrit, en français : c'est cela que la
        // validation doit comparer, et cela qu'il faut réafficher.
        const formula = stored ? engineToFr(stored) : ""
        const value = api.getValue(ref)
        const text = formula || (value == null ? "" : String(value))
        onActionRef.current({
          kind: "typed",
          target: ref,
          text,
          // Ce que l'apprenant VOIT, qui n'est pas toujours ce que le moteur retient :
          // une date tapée « 07/04/2026 » est retenue comme le nombre 46207, et
          // comparer l'attendu au seul texte retenu refusait quelqu'un qui avait tapé
          // exactement ce qu'on lui demandait.
          displayed: api.getDisplayValue(ref),
          channel: channelRef.current === "unknown" ? "keyboard" : channelRef.current,
          // Relue APRÈS la retraduction : c'est la valeur que l'apprenant voit.
          computed: api.getValue(ref),
        })
        channelRef.current = "unknown"
        // Un résultat décimal doit s'afficher « 13,67 » et non « 13.67 ».
        // Le recalcul prend 60 à 120 ms, on laisse une marge.
        window.setTimeout(() => localiserDecimale(ref), 200)
      })

      // Le classeur a changé, par n'importe quel moyen : saisie, poignée de
      // recopie, bouton du ruban, collage. Le simulateur en profite pour vérifier
      // l'état attendu par l'étape — c'est ce qui rend jouables les gestes que
      // cette grille ne sait pas observer directement.
      // ATTENTION à la temporisation. `SheetValueChanged` est émis AVANT que le
      // moteur de formules ait fini de recalculer : lire les cellules à cet
      // instant renvoie des valeurs périmées, et une étape validée sur l'état
      // échouait alors qu'elle était juste. Pire, c'était intermittent selon la
      // charge — le genre de défaut qu'on met des heures à reproduire.
      // On attend donc que les modifications se soient tassées avant de signaler.
      let settleTimer: ReturnType<typeof setTimeout> | null = null
      // Tri et filtre passent par les commandes d'Univer : on les observe par
      // événement plutôt qu'en devinant depuis le ruban, car l'apprenant peut
      // aussi filtrer depuis les boutons posés sur la ligne d'en-tête.
      listen("SheetRangeSorted", (p: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = p as any
        const spec = Array.isArray(e?.sortColumn) ? e.sortColumn[0] : e?.sortColumn
        if (!spec) return
        let plage = ""
        try {
          plage = e?.range?.getA1Notation?.() ?? ""
        } catch {
          plage = ""
        }
        // `column` est un indice absolu de colonne dans la feuille.
        onActionRef.current({
          kind: "sort",
          range: plage,
          column: columnIndexToLetter(Number(spec.column) || 0),
          ascending: Boolean(spec.ascending),
        })
      })

      listen("SheetRangeFiltered", (p: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = p as any
        const valeurs: string[] = e?.criteria?.filters?.filters ?? []
        onActionRef.current({
          kind: "filter",
          column: columnIndexToLetter(Number(e?.col) || 0),
          values: valeurs.map((v) => String(v)),
        })
      })

      // Poser un format déclenche à son tour `SheetValueChanged` : sans cette
      // fenêtre, notre propre francisation produisait un second `stateChange`,
      // que le lecteur comptait comme un geste de l'apprenant — un tâtonnement
      // sur une feuille que personne n'avait touchée.
      let franciseJusqua = 0
      listen("SheetValueChanged", () => {
        if (Date.now() < franciseJusqua) return
        if (settleTimer) clearTimeout(settleTimer)
        settleTimer = setTimeout(() => {
          settleTimer = null
          // Le recalcul est terminé : c'est le moment de franciser les formules
          // dont le résultat vient de devenir décimal (voir `franciserFormules`).
          // Sans effet quand rien n'a changé de nature, donc pas de boucle : une
          // cellule déjà formatée est ignorée dès la deuxième passe.
          if (franciserFormules() > 0) franciseJusqua = Date.now() + 400
          onActionRef.current({ kind: "stateChange", readings: {} })
        }, 350)
      })
      disposers.push(() => {
        if (settleTimer) clearTimeout(settleTimer)
      })

      // Sélection résultant d'un clic sur un en-tête, ou de tout autre changement.
      // Les en-têtes de COLONNE sélectionnent sans déclencher SelectionMoveEnd —
      // vérifié au banc d'essai — d'où cette seconde source d'écoute.
      const rapporterSelection = () => {
        const info = api.getSelectionKind()
        if (!info) return
        const now = Date.now()
        if (lastDragRef.current.range === info.ref && now - lastDragRef.current.at < 400) return
        if (info.kind === "column") {
          lastDragRef.current = { range: info.ref, at: now }
          onActionRef.current({ kind: "selectColumn", column: columnIndexToLetter(info.index) })
        } else if (info.kind === "row") {
          lastDragRef.current = { range: info.ref, at: now }
          onActionRef.current({ kind: "selectRow", row: info.index + 1 })
        }
      }
      listen("SelectionChanged", rapporterSelection)
      /* Changer de feuille invalide la façade mémorisée. */
      listen("ActiveSheetChanged", oublierFeuille)
      listen("SheetCreated", oublierFeuille)
      listen("SheetDeleted", oublierFeuille)

      // FILET INDISPENSABLE. Un clic sur un en-tête de COLONNE sélectionne bien
      // toute la colonne, mais Univer n'émet aucun événement de sélection dans ce
      // cas — vérifié au banc d'essai, contrairement aux en-têtes de ligne qui en
      // émettent un. On surveille donc les clics au niveau du conteneur et on
      // interroge la sélection juste après : indépendant de la couverture
      // événementielle du moteur, donc insensible à ses évolutions.
      const surClicNatif = () => {
        window.setTimeout(rapporterSelection, 120)
      }
      container.addEventListener("click", surClicNatif)
      disposers.push(() => container.removeEventListener("click", surClicNatif))

      // Sélection d'une plage au glisser.
      listen("SelectionMoveEnd", () => {
        // Un en-tête donne une colonne ou une ligne entière : traité au-dessus.
        const info = api.getSelectionKind()
        if (info && (info.kind === "column" || info.kind === "row")) {
          rapporterSelection()
          return
        }
        const ref = api.getSelection()
        if (!ref) return
        const r = parseRange(ref)
        if (!r) return
        const isSingle = r.startRow === r.endRow && r.startCol === r.endCol
        if (isSingle) return // déjà couvert par CellClicked
        const now = Date.now()
        // Même plage signalée deux fois de suite : on ne la compte qu'une.
        if (lastDragRef.current.range === ref && now - lastDragRef.current.at < 400) return
        lastDragRef.current = { range: ref, at: now }
        onActionRef.current({ kind: "dragRange", range: ref })
      })

      // Hors production, on expose l'interface de pilotage : le banc de test a besoin

      // de la géométrie EXACTE des cellules (`getCellRect`), qu'aucun modèle externe

      // ne peut deviner — la première ligne n'a pas la même hauteur que les autres.

      // Retiré des bundles de production par le remplacement de NODE_ENV.

      if (process.env.NODE_ENV !== "production") {

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        ;(window as any).__SIM_GRID = api

      }


      onReadyRef.current(api)
    }

    void boot()

    return () => {
      disposed = true
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* le moteur peut déjà être détruit */
        }
      }
      try {
        univerAPI?.dispose?.()
      } catch {
        /* idem */
      }
    }
    // Aucune dépendance : le tableur se monte une fois pour toute la durée du
    // chapitre. Les rappels sont lus via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className={className} style={{ height: heightPx, width: "100%" }} />
}
