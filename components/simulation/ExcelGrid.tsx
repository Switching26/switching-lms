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
import type { CellState, WorkbookState } from "@/lib/simulation/types"
import { formatCell, parseCell, parseRange, formatRange } from "@/lib/simulation/grid"
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
  /** Sélection courante en notation A1. */
  getSelection: () => string
  /** Verrouille l'édition : seules ces cellules restent modifiables. */
  setEditableCells: (refs: string[] | null) => void
  /**
   * Redonne le focus clavier à la grille. Nécessaire après toute interaction avec
   * un élément du DOM (bouton Suivant, bouton du ruban, demande d'indice) : le
   * focus part sur le bouton et l'apprenant ne peut plus taper sans recliquer.
   */
  focus: () => void
  /** Position à l'écran d'une cellule, pour poser le halo d'aide. */
  getCellRect: (ref: string) => { top: number; left: number; width: number; height: number } | null
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
      const [{ createUniver, LocaleType, mergeLocales }, { UniverSheetsCorePreset }, locale] =
        await Promise.all([
          import("@univerjs/presets"),
          import("@univerjs/preset-sheets-core"),
          import("@univerjs/preset-sheets-core/locales/fr-FR"),
        ])
      if (disposed) return

      const created = createUniver({
        locale: LocaleType.FR_FR,
        locales: { [LocaleType.FR_FR]: mergeLocales(locale.default ?? locale) },
        presets: [
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

      univerAPI.createWorkbook({ name: "Simulation" })

      const sheet = () => univerAPI.getActiveWorkbook()?.getActiveSheet()

      /* ── Interface de pilotage ─────────────────────────────────────────── */

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
          } else if (state.v !== undefined) {
            rg.setValue(state.v)
          } else {
            rg.setValue("")
          }
        }
      }

      const api: GridApi = {
        applyWorkbook: (wb) => {
          const sh = sheet()
          if (!sh) return
          const first = wb.sheets[wb.activeSheetIndex ?? 0]
          if (!first) return
          applyCells(first.cells)
          if (wb.selection) api.setSelection(wb.selection)
        },
        applyCells,
        setSelection: (ref) => {
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
        getValue: (ref) => sheet()?.getRange(ref)?.getValue?.() ?? null,
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
        getCellRect: (ref) => {
          const pos = parseCell(ref)
          if (!pos) return null
          const el = container.querySelector<HTMLElement>(
            `[data-row="${pos.row}"][data-col="${pos.col}"]`,
          )
          if (!el) return null
          const cr = container.getBoundingClientRect()
          const er = el.getBoundingClientRect()
          return { top: er.top - cr.top, left: er.left - cr.left, width: er.width, height: er.height }
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

      // Sélection d'une plage au glisser.
      listen("SelectionMoveEnd", () => {
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
