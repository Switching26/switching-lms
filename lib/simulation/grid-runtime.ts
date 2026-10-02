import type { CellState } from "./types"
import type { ObservedAction } from "./validate"
import { columnIndexToLetter, parseRange } from "./grid"

/** Construire une FRange hors bornes laisse une résolution ouverte dans Redi. */
export function plageDansBornes(ref: string, rows: number, cols: number): boolean {
  const range = parseRange(ref)
  return !!(range && range.startRow >= 0 && range.startCol >= 0 && range.endRow < rows && range.endCol < cols)
}

/** Les noms créés avec la zone Nom restent attachés à leur plage au remplissage. */
export function referenceNomAbsolue(feuille: string, ref: string): string | null {
  const aire = parseRange(ref)
  if (!aire) return null
  const coin = (r: number, c: number) => `$${columnIndexToLetter(c)}$${r + 1}`
  const debut = coin(aire.startRow, aire.startCol)
  const fin = coin(aire.endRow, aire.endCol)
  return `'${feuille.replace(/'/g, "''")}'!${debut}${debut === fin ? "" : `:${fin}`}`
}

/** Contenu éditable, sans le format monétaire/pourcentage affiché par la grille. */
export function texteCelluleBrut(formule: string, valeur: unknown): string {
  if (formule) return formule
  if (valeur === null || valeur === undefined) return ""
  if (typeof valeur === "boolean") return valeur ? "VRAI" : "FAUX"
  return typeof valeur === "number" ? String(valeur).replace(".", ",") : String(valeur)
}

/** Toutes les cellules réellement présentes dans le modèle sparse, styles compris. */
export function referencesCellulesDuSnapshot(cellData: unknown): string[] {
  if (!cellData || typeof cellData !== "object") return []
  const refs: string[] = []
  for (const [row, colonnes] of Object.entries(cellData)) {
    if (!/^\d+$/.test(row) || !colonnes || typeof colonnes !== "object") continue
    for (const [col, cellule] of Object.entries(colonnes)) {
      if (!/^\d+$/.test(col) || !cellule || typeof cellule !== "object") continue
      if (Object.keys(cellule).length === 0) continue
      refs.push(`${columnIndexToLetter(Number(col))}${Number(row) + 1}`)
    }
  }
  return refs
}

type HoteTri = {
  getFormula: (ref: string) => string
  getValue: (ref: string) => unknown
  /** Contenu natif complet : images en cellule, texte riche et styles. */
  getCellData?: (ref: string) => Record<string, unknown> | null
  applyCells: (cells: Record<string, CellState>) => void
  onSort: (action: ObservedAction) => void
}

/** Tri français manuel : sa réussite émet son observation, sans événement natif. */
export function trierPlageFr(hote: HoteTri, range: string, column: number, ascending: boolean): boolean {
  const aire = parseRange(range)
  if (!aire || !Number.isInteger(column) || column < 0 || column > aire.endCol - aire.startCol) return false
  const lignes = []
  for (let r = aire.startRow; r <= aire.endRow; r++) {
    const cellules = []
    for (let c = aire.startCol; c <= aire.endCol; c++) {
      const ref = `${columnIndexToLetter(c)}${r + 1}`
      cellules.push({ f: hote.getFormula(ref), v: hote.getValue(ref), data: hote.getCellData?.(ref) })
    }
    lignes.push({ cle: cellules[column]?.v ?? "", cellules })
  }
  const comparer = (x: unknown, y: unknown) => {
    const nx = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."))
    const ny = typeof y === "number" ? y : Number(String(y ?? "").replace(",", "."))
    const xNum = Number.isFinite(nx) && String(x ?? "").trim() !== ""
    const yNum = Number.isFinite(ny) && String(y ?? "").trim() !== ""
    if (xNum && yNum) return nx - ny
    if (xNum) return -1
    if (yNum) return 1
    return String(x ?? "").localeCompare(String(y ?? ""), "fr", { numeric: true, sensitivity: "base" })
  }
  const ordre = [...lignes].sort((x, y) => ascending ? comparer(x.cle, y.cle) : comparer(y.cle, x.cle))
  const cells: Record<string, CellState> = {}
  ordre.forEach((ligne, i) => ligne.cellules.forEach((cellule, j) => {
    const ref = `${columnIndexToLetter(aire.startCol + j)}${aire.startRow + i + 1}`
    cells[ref] = cellule.data ?? (cellule.f ? { f: cellule.f } : { v: (cellule.v ?? "") as CellState["v"] })
  }))
  hote.applyCells(cells)
  hote.onSort({ kind: "sort", range, column: columnIndexToLetter(aire.startCol + column), ascending })
  return true
}
