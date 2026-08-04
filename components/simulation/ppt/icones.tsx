/**
 * Icônes du ruban PowerPoint.
 *
 * Un ruban fait de mots alignés ne ressemble à aucun logiciel de bureautique :
 * c'est ce qui cassait le plus l'immersion sur Excel (retour Samuel du 29/07),
 * et le ruban de PowerPoint était dans cet état — 42 boutons, pas un
 * pictogramme. Même remède, même facture : du SVG `currentColor` dessiné ici
 * plutôt qu'importé. Aucun fichier à servir (piège 0c : `public/` peut être en
 * 404 en standalone Railway), aucune police d'icônes, et la couleur suit l'état
 * du bouton — grisé, survolé, actif.
 *
 * ⚠️ Ces icônes sont PROPRES à PowerPoint, elles ne sont pas les 52 d'Excel
 * recopiées. Les quelques gestes réellement communs — gras, italique, souligné,
 * les trois alignements, l'image — sont dessinés à l'identique pour qu'un
 * apprenant qui passe d'une formation à l'autre reconnaisse le même bouton ; le
 * reste (diapositives, dispositions, transitions, animations, diaporama) n'a
 * aucun équivalent dans un tableur et est dessiné pour l'occasion.
 *
 * La résolution se fait par PRÉFIXE quand un bouton est paramétré
 * (`ins-forme-<x>`, `tra-<x>`, `ani-<x>`, `aff-<x>`) : une table exacte
 * laisserait sans icône tout bouton né après elle.
 */

/**
 * ⚠️ React est importé EXPLICITEMENT, contrairement au reste du dossier.
 *
 * Les autres composants n'en ont pas besoin : leur JSX vit dans le corps d'une
 * fonction, donc n'est évalué qu'au rendu. Ici la table d'icônes est une
 * constante de MODULE — son JSX s'évalue au chargement. Sans cet import, tout
 * script Node qui remonte jusqu'à ce fichier tombe sur « React is not defined »,
 * et `check-parcours-ppt` en fait partie : il importe `observationDuGeste`
 * depuis le player, qui tire la surface, qui tire le ruban, qui tire ces icônes.
 * Les contrôles PowerPoint s'arrêtaient tous net.
 */
import * as React from "react"

const I = (d: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0 }}>
    {d}
  </svg>
)

const trait = {
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

/** La silhouette 16/9 d'une diapositive — le motif de base de la moitié des icônes. */
const cadre = (p: { x?: number; y?: number; w?: number; h?: number; fill?: string } = {}) => (
  <rect
    x={p.x ?? 1.6}
    y={p.y ?? 3.2}
    width={p.w ?? 12.8}
    height={p.h ?? 9.6}
    rx="1.2"
    {...trait}
    fill={p.fill ?? "none"}
  />
)

const ICONES: Record<string, React.ReactNode> = {
  /* ─── Diapositives ─── */
  "acc-nouvelle-diapo": I(
    <>
      {cadre({ w: 9.6, h: 7.6, y: 4.4 })}
      <path d="M12.4 3.2v4.4M10.2 5.4h4.4" {...trait} />
    </>,
  ),
  "acc-disposition": I(
    <>
      {cadre()}
      <path d="M1.6 6.6h12.8M7 6.6v6.2" {...trait} />
    </>,
  ),
  "acc-dupliquer-diapo": I(
    <>
      <rect x="1.4" y="2.4" width="9.4" height="7" rx="1.1" {...trait} />
      <rect x="5.2" y="6.6" width="9.4" height="7" rx="1.1" {...trait} fill="#fff" />
    </>,
  ),
  "acc-supprimer-diapo": I(
    <>
      <path d="M2.6 4.4h10.8" {...trait} />
      <path d="M4.4 4.4l.7 8.4a1 1 0 001 .9h3.8a1 1 0 001-.9l.7-8.4" {...trait} />
      <path d="M6.3 4.4V3a.9.9 0 01.9-.9h1.6a.9.9 0 01.9.9v1.4" {...trait} />
    </>,
  ),
  "acc-monter-diapo": I(
    <>
      <path d="M8 13.2V3.4" {...trait} />
      <path d="M4.4 7L8 3.4 11.6 7" {...trait} />
    </>,
  ),
  "acc-descendre-diapo": I(
    <>
      <path d="M8 2.8v9.8" {...trait} />
      <path d="M4.4 9L8 12.6 11.6 9" {...trait} />
    </>,
  ),

  /* ─── Police — dessinées à l'identique d'Excel, ce sont les mêmes gestes ─── */
  "acc-gras": I(
    <text x="8" y="12" textAnchor="middle" fontSize="12" fontWeight="800" fill="currentColor">
      G
    </text>,
  ),
  "acc-italique": I(
    <text x="8" y="12" textAnchor="middle" fontSize="12" fontStyle="italic" fill="currentColor">
      I
    </text>,
  ),
  "acc-souligne": I(
    <>
      <text x="8" y="11" textAnchor="middle" fontSize="11" fill="currentColor">
        S
      </text>
      <path d="M4.6 13.4h6.8" {...trait} />
    </>,
  ),
  "acc-align-gauche": I(
    <>
      <path d="M2.4 4h11.2M2.4 6.8h7.4M2.4 9.6h11.2M2.4 12.4h7.4" {...trait} />
    </>,
  ),
  "acc-align-centre": I(
    <>
      <path d="M2.4 4h11.2M4.3 6.8h7.4M2.4 9.6h11.2M4.3 12.4h7.4" {...trait} />
    </>,
  ),
  "acc-align-droite": I(
    <>
      <path d="M2.4 4h11.2M6.2 6.8h7.4M2.4 9.6h11.2M6.2 12.4h7.4" {...trait} />
    </>,
  ),

  /* ─── Insertion ─── */
  "ins-zone-texte": I(
    <>
      {cadre({ y: 3.6, h: 8.8 })}
      <path d="M5 6.6h6M8 6.6v4.2" {...trait} />
    </>,
  ),
  "ins-image": I(
    <>
      {cadre({ y: 3.2, h: 9.6 })}
      <circle cx="5.6" cy="6.6" r="1.15" {...trait} />
      <path d="M1.9 11.6l3.3-3 2.6 2.3 2.4-2.6 4 4.2" {...trait} />
    </>,
  ),
  "ins-forme": I(
    <>
      <rect x="1.6" y="7" width="6.2" height="6.2" rx="1" {...trait} />
      <circle cx="10.8" cy="5.4" r="3.4" {...trait} />
    </>,
  ),
  "ins-tableau": I(
    <>
      {cadre()}
      <path d="M1.6 6.6h12.8M1.6 9.8h12.8M6 3.2v9.6M10.2 3.2v9.6" {...trait} />
    </>,
  ),

  /* ─── Objet ─── */
  "obj-supprimer": I(
    <>
      <rect x="2.2" y="2.6" width="7.4" height="7.4" rx="1" {...trait} strokeDasharray="2 1.6" />
      <path d="M9.6 9.6l4 4M13.6 9.6l-4 4" {...trait} />
    </>,
  ),

  /* ─── Diaporama ─── */
  "dia-depuis-debut": I(
    <>
      {cadre()}
      <path d="M6.4 6.2l3.6 2-3.6 2z" fill="currentColor" />
    </>,
  ),
  "dia-depuis-courante": I(
    <>
      {cadre()}
      <path d="M5.4 6.2l3.2 2-3.2 2z" fill="currentColor" />
      <path d="M11 6.2v4" {...trait} />
    </>,
  ),
  "dia-masquer": I(
    <>
      {cadre()}
      <path d="M2.6 13.4L13.4 2.6" {...trait} />
    </>,
  ),
  "dia-quitter": I(
    <>
      <path d="M9.6 2.6H3.4a1 1 0 00-1 1v8.8a1 1 0 001 1h6.2" {...trait} />
      <path d="M11.8 5.4L14.4 8l-2.6 2.6M6.6 8h7.8" {...trait} />
    </>,
  ),

  /* ─── Volet et notes ─── */
  "vol-bascule": I(
    <>
      {cadre({ x: 1.4, w: 13.2 })}
      <path d="M6.2 3.2v9.6" {...trait} />
    </>,
  ),
  "vol-notes-bascule": I(
    <>
      <path d="M3.2 2.4h9.6a.9.9 0 01.9.9v9.4a.9.9 0 01-.9.9H3.2a.9.9 0 01-.9-.9V3.3a.9.9 0 01.9-.9z" {...trait} />
      <path d="M4.9 5.8h6.2M4.9 8.2h6.2M4.9 10.6h3.6" {...trait} />
    </>,
  ),
}

/* ═══════════ Familles paramétrées, résolues par PRÉFIXE ═══════════ */

/** Onglets : un chevron sobre, la même silhouette pour les six. */
const ICONE_ONGLET = I(
  <>
    {cadre({ y: 4, h: 8 })}
    <path d="M1.6 7h12.8" {...trait} />
  </>,
)

const ICONES_TRANSITION: Record<string, React.ReactNode> = {
  "tra-fondu": I(
    <>
      {cadre()}
      <rect x="1.6" y="3.2" width="6.4" height="9.6" rx="1.2" fill="currentColor" opacity=".28" />
    </>,
  ),
  "tra-balayage": I(
    <>
      {cadre()}
      <path d="M5.6 3.2v9.6" {...trait} />
      <path d="M8.4 6.6l2.4 1.4-2.4 1.4z" fill="currentColor" />
    </>,
  ),
  "tra-aucune": I(
    <>
      {cadre()}
      <path d="M4.6 8h6.8" {...trait} />
    </>,
  ),
}

const ICONES_ANIMATION: Record<string, React.ReactNode> = {
  "ani-apparaitre": I(
    <>
      <path d="M8 3.2v9.6" {...trait} />
      <path d="M4.8 6.4L8 3.2l3.2 3.2" {...trait} />
      <path d="M2.6 14.2h10.8" {...trait} strokeDasharray="2 1.6" />
    </>,
  ),
  "ani-fondu": I(
    <>
      <circle cx="8" cy="8" r="5" {...trait} />
      <path d="M8 3a5 5 0 010 10z" fill="currentColor" opacity=".3" />
    </>,
  ),
}

const ICONES_VUE: Record<string, React.ReactNode> = {
  "aff-normal": I(
    <>
      {cadre({ x: 1.4, w: 13.2 })}
      <path d="M5.8 3.2v9.6" {...trait} />
    </>,
  ),
  "aff-trieuse": I(
    <>
      <rect x="1.5" y="3" width="5.6" height="4.2" rx=".9" {...trait} />
      <rect x="8.9" y="3" width="5.6" height="4.2" rx=".9" {...trait} />
      <rect x="1.5" y="8.8" width="5.6" height="4.2" rx=".9" {...trait} />
      <rect x="8.9" y="8.8" width="5.6" height="4.2" rx=".9" {...trait} />
    </>,
  ),
}

/** Une forme au choix : on dessine la silhouette demandée, pas un pictogramme générique. */
const ICONES_FORME: Record<string, React.ReactNode> = {
  rectangle: I(<rect x="2.2" y="4" width="11.6" height="8" rx="1" {...trait} />),
  ellipse: I(<ellipse cx="8" cy="8" rx="5.8" ry="4.2" {...trait} />),
  triangle: I(<path d="M8 3.2l5.4 9.4H2.6z" {...trait} />),
  fleche: I(
    <>
      <path d="M2.4 8h9.6" {...trait} />
      <path d="M9.4 5.2L12.6 8l-3.2 2.8" {...trait} />
    </>,
  ),
  etoile: I(<path d="M8 2.6l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11.4l-3.5 1.9.8-3.9L2.4 6.7l3.9-.5z" {...trait} />),
  ligne: I(<path d="M2.8 12.4L13.2 3.6" {...trait} />),
}

/**
 * L'icône d'un bouton, ou `null` s'il n'en a pas — auquel cas le ruban rend son
 * libellé seul, ce qui reste correct : une icône manquante ne doit jamais faire
 * disparaître un bouton.
 */
export function iconePpt(id: string): React.ReactNode | null {
  if (ICONES[id]) return ICONES[id]
  if (id.startsWith("ong-")) return ICONE_ONGLET
  if (ICONES_TRANSITION[id]) return ICONES_TRANSITION[id]
  if (ICONES_ANIMATION[id]) return ICONES_ANIMATION[id]
  if (ICONES_VUE[id]) return ICONES_VUE[id]
  if (id.startsWith("ins-forme-")) return ICONES_FORME[id.slice(10)] ?? ICONES["ins-forme"]
  if (id.startsWith("acc-disposition-")) return ICONES["acc-disposition"]
  if (id.startsWith("vol-diapo-")) return null
  return null
}

/**
 * Boutons dont l'icône EST le libellé : afficher les deux donnerait « G » sous
 * un « G ». C'est le défaut corrigé sur le ruban d'Excel, où toute la rangée
 * Police s'affichait en double.
 */
export const ICONE_SEULE_PPT = new Set([
  "acc-gras",
  "acc-italique",
  "acc-souligne",
  "acc-align-gauche",
  "acc-align-centre",
  "acc-align-droite",
])
