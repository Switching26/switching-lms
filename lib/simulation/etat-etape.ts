import { parseRange } from "./grid"

export type CelluleCapturee = { f?: string; v?: unknown }

/** Ne jamais demander à la façade un FRange au-delà du modèle de la feuille. */
export function referencesDansBornes(refs: string[], rows: number, cols: number): string[] {
  return refs.filter((ref) => {
    const r = parseRange(ref)
    return !!r && r.startRow >= 0 && r.startCol >= 0 && r.endRow < rows && r.endCol < cols
  })
}

/** Le nettoyage couvre aussi les cellules ajoutées hors du rectangle initial. */
export function cellulesAReposer(
  capture: Record<string, CelluleCapturee>,
  presentes: string[],
  lire: (ref: string) => CelluleCapturee,
): Record<string, CelluleCapturee> {
  const differences: Record<string, CelluleCapturee> = {}
  for (const ref of Array.from(new Set([...Object.keys(capture), ...presentes]))) {
    const attendu = capture[ref] ?? {}
    const actuel = lire(ref)
    const av = actuel.v ?? ""
    const ev = attendu.v ?? ""
    const memeValeur = typeof av === "number" && typeof ev === "number"
      ? Math.abs(av - ev) < 1e-9
      : av === ev
    if ((actuel.f ?? "") !== (attendu.f ?? "") || !memeValeur) differences[ref] = attendu
  }
  return differences
}

/** Appliquer le nettoyage avec le même contrat que la grille : {} vide la case. */
export function restaurerCellulesCapturees(
  capture: Record<string, CelluleCapturee>,
  presentes: string[],
  lire: (ref: string) => CelluleCapturee,
  appliquer: (cells: Record<string, CelluleCapturee>) => void,
): void {
  const differences = cellulesAReposer(capture, presentes, lire)
  if (Object.keys(differences).length) appliquer(differences)
}

export type DonneesCellulesNatives = Record<string, Record<string, unknown>>

function empreinteNative(valeur: unknown): string {
  const trier = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(trier)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x != null).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, trier(x)]))
    return v
  }
  return JSON.stringify(trier(valeur))
}

/** Le document riche p contient notamment les images insérées dans une cellule. */
export function restaurerDonneesNatives(
  capture: DonneesCellulesNatives,
  actuelles: DonneesCellulesNatives,
  appliquer: (cells: DonneesCellulesNatives) => void,
): void {
  const differences: DonneesCellulesNatives = {}
  for (const ref of Array.from(new Set([...Object.keys(capture), ...Object.keys(actuelles)]))) {
    const attendu = capture[ref] ?? {}
    if (empreinteNative(attendu) !== empreinteNative(actuelles[ref] ?? {})) differences[ref] = structuredClone(attendu)
  }
  if (Object.keys(differences).length) appliquer(differences)
}

/** Les cellules portant seulement un style font elles aussi partie du cliché. */
export function restaurerStylesCapturees(
  capture: Record<string, string>,
  presentes: string[],
  lire: (ref: string) => unknown,
  appliquer: (ref: string, style: unknown) => void,
): void {
  for (const ref of Array.from(new Set([...Object.keys(capture), ...presentes]))) {
    try {
      const attendu = capture[ref] ?? "null"
      if (JSON.stringify(lire(ref) ?? null) !== attendu) appliquer(ref, JSON.parse(attendu))
    } catch {
      // Une référence retirée par une opération structurelle ne bloque pas les autres.
    }
  }
}

/** Une démonstration reste protégée jusqu'à un geste réel de l'apprenant.
 * Une échéance seule laisse passer les événements de recalcul tardifs. */
export class ProtectionDemonstration {
  private protegee = false
  private enCours = false
  demarrer() { this.protegee = true; this.enCours = true }
  terminer() { this.enCours = false }
  reinitialiser() { this.protegee = false; this.enCours = false }
  prendreMain(): boolean {
    if (this.enCours) return false
    this.protegee = false
    return true
  }
  autorise(kind: string) { return kind === "next" || !this.protegee }
}

export type RectangleEtat = { left: number; top: number; width: number; height: number }

/** Un repère hors de la zone visible ne doit pas désigner la cellule voisine. */
export function rectangleVisible(rect: RectangleEtat, width: number, height: number): RectangleEtat | null {
  const left = Math.max(46, rect.left)
  const top = Math.max(20, rect.top)
  const right = Math.min(width, rect.left + rect.width)
  const bottom = Math.min(height, rect.top + rect.height)
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null
}
