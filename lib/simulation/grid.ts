/**
 * Utilitaires de repérage dans la grille : conversion entre la notation A1 que
 * lisent les auteurs de scénarios et les indices 0-based que manipule le moteur.
 *
 * Tout le reste du simulateur parle en A1 — c'est la seule notation que l'auteur
 * d'un scénario devrait avoir à écrire, et la seule qui apparaît dans les
 * consignes ("sélectionnez la cellule B12"). Les indices restent confinés ici.
 */

/** { row: 0, col: 0 } correspond à A1. */
export type CellPos = { row: number; col: number }
export type RangePos = { startRow: number; startCol: number; endRow: number; endCol: number }

const A1_RE = /^\$?([A-Z]+)\$?([0-9]+)$/i

/** "C" → 2. Gère les colonnes à plusieurs lettres (AA, AB…). */
export function columnLetterToIndex(letters: string): number {
  let n = 0
  const up = letters.toUpperCase()
  for (let i = 0; i < up.length; i++) {
    n = n * 26 + (up.charCodeAt(i) - 64)
  }
  return n - 1
}

/** 2 → "C". */
export function columnIndexToLetter(index: number): string {
  let n = index + 1
  let s = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * "B12" → { row: 11, col: 1 }. Les `$` des références absolues sont ignorés :
 * ils changent le comportement à la recopie, pas la position.
 * Renvoie null si la notation est invalide, pour que l'appelant décide quoi faire
 * plutôt que de propager un NaN silencieux.
 */
export function parseCell(ref: string): CellPos | null {
  const m = A1_RE.exec(ref.trim())
  if (!m) return null
  const row = parseInt(m[2], 10) - 1
  if (row < 0) return null
  return { row, col: columnLetterToIndex(m[1]) }
}

/** { row: 11, col: 1 } → "B12". */
export function formatCell(pos: CellPos): string {
  return `${columnIndexToLetter(pos.col)}${pos.row + 1}`
}

/**
 * "B2:D7" → rectangle normalisé. Accepte aussi une cellule seule ("B2"), qui
 * devient un rectangle de 1×1 — ça évite de dupliquer le code appelant.
 * Le rectangle est toujours normalisé (start ≤ end) même si l'auteur a écrit
 * la plage à l'envers ("D7:B2").
 */
export function parseRange(ref: string): RangePos | null {
  const parts = ref.trim().split(":")
  if (parts.length === 1) {
    const c = parseCell(parts[0])
    return c ? { startRow: c.row, startCol: c.col, endRow: c.row, endCol: c.col } : null
  }
  if (parts.length !== 2) return null
  const a = parseCell(parts[0])
  const b = parseCell(parts[1])
  if (!a || !b) return null
  return {
    startRow: Math.min(a.row, b.row),
    startCol: Math.min(a.col, b.col),
    endRow: Math.max(a.row, b.row),
    endCol: Math.max(a.col, b.col),
  }
}

/** Rectangle → "B2:D7", ou "B2" si la plage tient sur une seule cellule. */
export function formatRange(r: RangePos): string {
  const a = formatCell({ row: r.startRow, col: r.startCol })
  if (r.startRow === r.endRow && r.startCol === r.endCol) return a
  return `${a}:${formatCell({ row: r.endRow, col: r.endCol })}`
}

/**
 * Deux références désignent-elles la même zone ? Comparaison géométrique et non
 * textuelle : "B2:C3" et "C3:B2" sont la même plage, "B2" et "B2:B2" aussi.
 * C'est indispensable pour la validation — refuser un élève parce qu'il a
 * sélectionné dans l'autre sens serait absurde.
 */
export function sameArea(a: string, b: string): boolean {
  const ra = parseRange(a)
  const rb = parseRange(b)
  if (!ra || !rb) return false
  return (
    ra.startRow === rb.startRow &&
    ra.startCol === rb.startCol &&
    ra.endRow === rb.endRow &&
    ra.endCol === rb.endCol
  )
}

/** La cellule est-elle dans la plage ? */
export function rangeContains(range: string, cell: string): boolean {
  const r = parseRange(range)
  const c = parseCell(cell)
  if (!r || !c) return false
  return c.row >= r.startRow && c.row <= r.endRow && c.col >= r.startCol && c.col <= r.endCol
}

/** Toutes les cellules d'une plage, dans l'ordre de lecture. */
export function cellsOf(range: string): string[] {
  const r = parseRange(range)
  if (!r) return []
  const out: string[] = []
  for (let row = r.startRow; row <= r.endRow; row++) {
    for (let col = r.startCol; col <= r.endCol; col++) {
      out.push(formatCell({ row, col }))
    }
  }
  return out
}

/** Nombre de cellules d'une plage, sans les énumérer. */
export function rangeSize(range: string): number {
  const r = parseRange(range)
  if (!r) return 0
  return (r.endRow - r.startRow + 1) * (r.endCol - r.startCol + 1)
}
