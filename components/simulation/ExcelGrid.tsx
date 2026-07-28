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
import type { ObservedAction, ActionChannel } from "@/lib/simulation/validate"
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
  /** Pose ou remplace le commentaire d'une cellule. */
  setNote: (ref: string, texte: string) => boolean
  /** Texte du commentaire d'une cellule, chaîne vide s'il n'y en a pas. */
  getNote: (ref: string) => string
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
  /** Bordures sur tout le pourtour et l'intérieur de la sélection. */
  setBorderAll: (on: boolean) => void
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
  renameSheet: (oldName: string, newName: string) => void
  /** Noms définis (plages nommées) du classeur. */
  defineName: (name: string, ref: string) => boolean
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
  /** Gras sur la sélection courante. */
  toggleBold: (on: boolean) => void
  /**
   * Nature de la sélection courante : cellule, plage, colonne(s) entière(s) ou
   * ligne(s) entière(s). Le scénario peut ainsi exiger « sélectionnez la colonne
   * C » sans dépendre de la hauteur réelle de la grille.
   */
  getSelectionKind: () => { kind: "cell" | "range" | "column" | "row"; ref: string; index: number } | null
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
            localeNote.default ?? localeNote
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

      const sheet = () => univerAPI.getActiveWorkbook()?.getActiveSheet()

      /* ── Interface de pilotage ─────────────────────────────────────────── */

      // Motif « décimales variables » : le chemin d'affichage sans format ne
      // passe pas par numfmt et rend « 42.25 » au lieu de « 42,25 ». On pose ce
      // motif seulement quand la valeur calculée n'est PAS entière — sur un
      // entier il laisserait une virgule orpheline (« 12, »), et un entier
      // s'affiche de toute façon pareil dans les deux conventions.
      const MOTIF_DECIMAL = "0.##########"
      const localiserDecimale = (ref: string) => {
        try {
          const rg = sheet()?.getRange(ref)
          if (!rg) return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyRg = rg as any
          if (anyRg.getNumberFormat?.()) return // format déjà voulu par l'auteur
          const brut = anyRg.getRawValue?.()
          if (typeof brut !== "number" || !Number.isFinite(brut) || Number.isInteger(brut)) return
          anyRg.setNumberFormat?.(MOTIF_DECIMAL)
        } catch {
          /* le nombre restera à l'anglaise, sans autre conséquence */
        }
      }

      const applyCells = (cells: Record<string, CellState>) => {
        const sh = sheet()
        if (!sh) return
        for (const [ref, state] of Object.entries(cells)) {
          const rg = sh.getRange(ref)
          if (!rg) continue
          if (state.f !== undefined) {
            // La formule de l'auteur est écrite en français ; le moteur ne
            // comprend que sa propre convention.
            rg.setValue({ f: frToEngine(state.f) })
            // Le résultat n'est connu qu'après recalcul (60 à 120 ms mesurés).
            window.setTimeout(() => localiserDecimale(ref), 200)
          } else if (state.v !== undefined) {
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
              const existante = univerAPI.getActiveWorkbook()?.getSheetByName?.(autre.name)
              if (!existante) univerAPI.getActiveWorkbook()?.insertSheet?.(autre.name)
              const cible = univerAPI.getActiveWorkbook()?.getSheetByName?.(autre.name)
              if (cible && autre.cells) {
                for (const [ref, st] of Object.entries(autre.cells)) {
                  const rg = cible.getRange?.(ref)
                  if (!rg) continue
                  if (st.f !== undefined) rg.setValue?.({ f: frToEngine(st.f) })
                  else if (st.v !== undefined) rg.setValue?.(st.v)
                }
              }
            } catch {
              /* une feuille en trop ne doit pas empêcher la leçon de démarrer */
            }
          }
          // La première feuille a été renommée, pas insérée : ses données n'ont
          // pas été posées dans la boucle ci-dessus.
          if (premiere?.cells) {
            try {
              const cible = univerAPI.getActiveWorkbook()?.getSheetByName?.(premiere.name)
              if (cible) {
                for (const [ref, st] of Object.entries(premiere.cells)) {
                  const rg = cible.getRange?.(ref)
                  if (!rg) continue
                  if (st.f !== undefined) rg.setValue?.({ f: frToEngine(st.f) })
                  else if (st.v !== undefined) rg.setValue?.(st.v)
                }
              }
            } catch {
              /* la feuille active reçoit de toute façon applyCells ci-dessous */
            }
          }
          // On termine sur la feuille active déclarée par le scénario.
          try {
            const active = univerAPI.getActiveWorkbook()?.getSheetByName?.(first.name)
            if (active) univerAPI.getActiveWorkbook()?.setActiveSheet?.(active)
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
        sortRange: (range, column, ascending) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rg = sheet()?.getRange(range) as any
            if (!rg?.sort) return false
            rg.sort({ column, ascending })
            return true
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setHorizontalAlignment?.(align)
          } catch {
            /* sans conséquence */
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
          const sel = univerAPI.getActiveWorkbook()?.getActiveSheet()?.getSelection?.()
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
            const wb = univerAPI.getActiveWorkbook()
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
            const wb = univerAPI.getActiveWorkbook()
            const sh = wb?.getSheetByName?.(name)
            if (sh) wb?.setActiveSheet?.(sh)
          } catch {
            /* feuille introuvable : on ne change rien */
          }
        },
        insertSheet: (name) => {
          try {
            univerAPI.getActiveWorkbook()?.insertSheet?.(name)
          } catch {
            /* sans conséquence */
          }
        },
        renameSheet: (oldName, newName) => {
          try {
            univerAPI.getActiveWorkbook()?.getSheetByName?.(oldName)?.setName?.(newName)
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
            univerAPI.getActiveWorkbook()?.insertDefinedName?.(name, `${sh}!${ref}`)
            return true
          } catch {
            return false
          }
        },
        getDefinedNames: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (univerAPI.getActiveWorkbook()?.getDefinedNames?.() ?? []).map((d: any) => ({
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
        hideColumn: (col) => { try { sheet()?.hideColumn?.(col, 1) } catch {} },
        hideRow: (row) => { try { sheet()?.hideRow?.(row, 1) } catch {} },
        toggleBold: (on) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(selectedRange() as any)?.setFontWeight?.(on ? "bold" : "normal")
          } catch {
            /* sans conséquence */
          }
        },
        getSelectionKind: () => {
          const ref = api.getSelection()
          if (!ref) return null
          const r = parseRange(ref)
          if (!r) return null
          // Une colonne entière va de la ligne 0 au bas de la grille allouée ;
          // idem pour une ligne. On compare à des seuils généreux plutôt qu'à une
          // borne exacte, la taille de grille dépendant du moteur.
          const fullColumn = r.startRow === 0 && r.endRow >= 200
          const fullRow = r.startCol === 0 && r.endCol >= 15
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

      const listen = (eventName: string, handler: (params: unknown) => void) => {
        const ev = univerAPI.Event?.[eventName]
        if (!ev) return
        const d = univerAPI.addEvent(ev, handler)
        if (d?.dispose) disposers.push(() => d.dispose())
      }

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

        // On rapporte ce que l'apprenant a écrit, en français : c'est cela que la
        // validation doit comparer, et cela qu'il faut réafficher.
        const formula = stored ? engineToFr(stored) : ""
        const value = api.getValue(ref)
        const text = formula || (value == null ? "" : String(value))
        onActionRef.current({
          kind: "typed",
          target: ref,
          text,
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

      listen("SheetValueChanged", () => {
        if (settleTimer) clearTimeout(settleTimer)
        settleTimer = setTimeout(() => {
          settleTimer = null
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
