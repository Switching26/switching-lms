export type RectangleRapport = { left: number; top: number; width: number; height: number }

/** Le rapport utilise la place jusqu'au volet, et se replie dans la vue si besoin. */
export function cadreRapportTcd(rect: RectangleRapport | null | undefined, largeur: number, hauteur: number) {
  const disponible = Math.max(1, largeur - 288)
  const largeurLisible = Math.min(240, disponible)
  const left = Math.min(Math.max(0, rect?.left ?? 0), Math.max(0, disponible - largeurLisible))
  const top = Math.min(Math.max(36, rect?.top ?? 36), Math.max(36, hauteur - 80))
  return {
    left, top,
    width: Math.min(Math.max(largeurLisible, rect?.width ?? disponible), disponible - left),
    maxHeight: Math.max(40, hauteur - top),
  }
}
