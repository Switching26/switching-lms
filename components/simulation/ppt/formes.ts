/**
 * PowerPoint — les formes, en chemins SVG.
 *
 * Chaque forme est un chemin dans un carré unitaire 100 × 100, étiré par
 * `preserveAspectRatio="none"`. ZÉRO asset à servir : le piège des 404 sur
 * `public/` en standalone Railway — qui a coûté une journée sur les couvertures
 * et les logos du LMS — ne peut pas se produire ici.
 *
 * Six formes, pas les 187 `prst-geom-type` d'OOXML : l'inventaire des leçons de
 * référence ne fait jamais dessiner autre chose. En ajouter une est une ligne.
 *
 * Module à part, partagé par la surface ET le ruban : le placer dans l'un des
 * deux créerait un cycle d'import entre eux.
 */

export const FORMES: Record<string, string> = {
  rectangle: "M0,0 H100 V100 H0 Z",
  "rectangle-arrondi": "M12,0 H88 Q100,0 100,12 V88 Q100,100 88,100 H12 Q0,100 0,88 V12 Q0,0 12,0 Z",
  ellipse: "M50,0 A50,50 0 1,1 49.9,0 Z",
  fleche: "M0,32 H62 V8 L100,50 L62,92 V68 H0 Z",
  bulle: "M0,0 H100 V72 H36 L18,96 V72 H0 Z",
  triangle: "M50,0 L100,100 H0 Z",
}

/** Libellé français d'une forme, pour les menus et les libellés de contrôle. */
export const NOM_FORME: Record<string, string> = {
  rectangle: "Rectangle",
  "rectangle-arrondi": "Rectangle arrondi",
  ellipse: "Ellipse",
  fleche: "Flèche",
  bulle: "Bulle",
  triangle: "Triangle",
}
