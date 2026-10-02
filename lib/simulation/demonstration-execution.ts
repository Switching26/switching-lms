import { columnIndexToLetter, parseRange } from "./grid"
import type { SimulationAction } from "./types"

type ClavierGrille = {
  getSelection(): string
  setSelection(ref: string): void
  applyCells(cells: Record<string, { v: string }>): void
}

/** La reprise d’une recopie rejoue aussi sa formule source, dans l’ordre. */
export async function rejouerRecopiesDemo(
  grid: { applyCells(cells: Record<string, { f?: string; v?: string }>): void; fillRange?(from: string, to: string): Promise<boolean> },
  actions: readonly SimulationAction[],
): Promise<void> {
  for (const action of actions) {
    if (action.type === "TYPE" && action.target !== "formula-bar" && action.accept?.length) {
      const texte = action.accept[0]
      grid.applyCells({ [action.target]: texte.trim().startsWith("=") ? { f: texte } : { v: texte } })
    } else if (action.type === "FILL_HANDLE") await grid.fillRange?.(action.from, action.to)
  }
}

/** Les touches de navigation et la date produisent leur effet dans la grille.
 * Le retour false distingue une touche non exécutée d'une démonstration réelle. */
export function jouerToucheDemo(grid: ClavierGrille, key: string, date = new Date()): string | false {
  const r = parseRange(grid.getSelection() || "A1")
  if (!r) return false
  const touches = key.toLowerCase().split("+")
  const touche = touches[touches.length - 1]
  let row = r.startRow, col = r.startCol
  if (touche === "tab") col += touches.includes("shift") ? -1 : 1
  else if (touche === "enter") row += touches.includes("shift") ? -1 : 1
  else if (touche === "arrowright") col++
  else if (touche === "arrowleft") col--
  else if (touche === "arrowdown") row++
  else if (touche === "arrowup") row--
  else if (touche === "home" && (touches.includes("control") || touches.includes("ctrl"))) { row = 0; col = 0 }
  else if (touche === ";" && (touches.includes("control") || touches.includes("ctrl"))) {
    const ref = `${columnIndexToLetter(col)}${row + 1}`
    grid.applyCells({ [ref]: { v: date.toLocaleDateString("fr-FR") } })
    return ref
  } else return false
  const ref = `${columnIndexToLetter(Math.max(0, col))}${Math.max(0, row) + 1}`
  grid.setSelection(ref)
  return ref
}
