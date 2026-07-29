"use client"

/**
 * Habillage Excel : onglets du ruban, groupes de boutons, barre de formule.
 *
 * Purement présentationnel — il ne connaît ni le scénario ni la validation. Il
 * remonte l'identifiant du contrôle cliqué, et c'est le simulateur qui décide si
 * c'était le bon geste. Cette séparation permet d'ajouter des boutons sans
 * toucher à la logique pédagogique.
 *
 * Le périmètre suit ce que les scénarios déclarent réellement avoir besoin. Le
 * module « Calculs simples » n'utilise que l'onglet Accueil et son seul groupe
 * Édition : inutile de reconstruire les 464 Ko de ruban de la formation d'origine,
 * qui couvrait Word, PowerPoint et Outlook en plus.
 *
 * Convention d'identifiants (voir types.ts) :
 *   `bf-*`  barre de formule    `acc-*` onglet Accueil
 *   `sb-*`  barre d'état        `ui-*`  châssis
 */

import type { RibbonTab, RibbonState } from "@/lib/simulation/types"

/**
 * Icônes du ruban.
 *
 * Un ruban fait de mots alignés ne ressemble pas à Excel : c'est ce qui cassait
 * le plus l'immersion (retour Samuel du 29/07). Excel n'est reconnaissable que
 * par ses pictogrammes. Ils sont dessinés ici en SVG `currentColor` plutôt
 * qu'importés : aucun fichier à servir (voir piège 0c), aucune police d'icônes,
 * et la couleur suit l'état du bouton (grisé, survolé, sélectionné).
 *
 * Les couleurs codées en dur sont celles qu'Excel utilise vraiment et qui
 * portent du sens : le A souligné de la couleur de police, le pot de peinture,
 * le Σ de la somme. Le reste est monochrome.
 */
const I = (d: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-shrink-0">
    {d}
  </svg>
)
const trait = { stroke: "currentColor", strokeWidth: 1.25, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

const ICONS: Record<string, React.ReactNode> = {
  "acc-coller": I(
    <>
      <rect x="3.5" y="3" width="9" height="11" rx="1.4" {...trait} />
      <rect x="5.8" y="1.6" width="4.4" height="2.6" rx=".9" fill="currentColor" opacity=".75" />
    </>,
  ),
  "acc-copier": I(
    <>
      <rect x="2.5" y="2.5" width="7.5" height="9" rx="1.2" {...trait} />
      <rect x="6" y="5" width="7.5" height="9" rx="1.2" {...trait} fill="#fff" />
    </>,
  ),
  "acc-gras": I(<text x="8" y="12" textAnchor="middle" fontSize="12" fontWeight="800" fill="currentColor">G</text>),
  "acc-italique": I(<text x="8" y="12" textAnchor="middle" fontSize="12" fontStyle="italic" fill="currentColor">I</text>),
  "acc-souligne": I(
    <>
      <text x="8" y="11" textAnchor="middle" fontSize="11" fill="currentColor">S</text>
      <path d="M4 13.6h8" {...trait} />
    </>,
  ),
  "acc-taille-plus": I(
    <>
      <text x="6" y="12" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">A</text>
      <path d="M11 5.5v4M9 7.5h4" {...trait} />
    </>,
  ),
  "acc-taille-moins": I(
    <>
      <text x="6" y="12" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">A</text>
      <path d="M9.5 7.5h4" {...trait} />
    </>,
  ),
  "acc-couleur-police": I(
    <>
      <text x="8" y="10.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">A</text>
      <rect x="3" y="12.2" width="10" height="2.4" rx=".6" fill="#c0392b" />
    </>,
  ),
  "acc-remplissage": I(
    <>
      <path d="M6.4 2.6 11.6 7.8l-5 5-5.2-5.2z" {...trait} />
      <path d="M13.4 10.2c.9 1.2 1.4 2 1.4 2.6a1.4 1.4 0 0 1-2.8 0c0-.6.5-1.4 1.4-2.6Z" fill="#e8a33d" />
    </>,
  ),
  "acc-bordures": I(
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx=".6" {...trait} />
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2 1.6" />
    </>,
  ),
  "acc-aligner-gauche": I(<path d="M2.5 4h11M2.5 7h7M2.5 10h11M2.5 13h7" {...trait} />),
  "acc-aligner-centre": I(<path d="M2.5 4h11M4.5 7h7M2.5 10h11M4.5 13h7" {...trait} />),
  "acc-aligner-droite": I(<path d="M2.5 4h11M6.5 7h7M2.5 10h11M6.5 13h7" {...trait} />),
  "acc-fusionner": I(
    <>
      <rect x="2" y="4" width="12" height="8" rx=".8" {...trait} />
      <path d="M6.2 6.4 4.4 8l1.8 1.6M9.8 6.4 11.6 8l-1.8 1.6" {...trait} />
    </>,
  ),
  "acc-renvoyer-ligne": I(
    <>
      <path d="M2.5 4.5h11M2.5 8h8.5a2.2 2.2 0 0 1 0 4.4H7.6" {...trait} />
      <path d="M9.2 10.8 7.4 12.4l1.8 1.6" {...trait} />
    </>,
  ),
  "acc-mfc-regle": I(
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1" {...trait} />
      <rect x="3.4" y="4" width="4.2" height="3" rx=".4" fill="#e8a33d" opacity=".85" />
      <rect x="3.4" y="8.4" width="4.2" height="3" rx=".4" fill="#3f9c6d" opacity=".85" />
      <path d="M9.4 5.5h3.2M9.4 9.9h3.2" {...trait} />
    </>,
  ),
  "acc-mfc-effacer": I(
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1" {...trait} />
      <path d="M5 5.4l6 5.6M11 5.4l-6 5.6" {...trait} />
    </>,
  ),
  "acc-format-monetaire": I(<text x="8" y="12" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">€</text>),
  "acc-pourcentage": I(<text x="8" y="12" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">%</text>),
  "acc-format-date": I(
    <>
      <rect x="2.2" y="3.4" width="11.6" height="10.2" rx="1.2" {...trait} />
      <path d="M2.2 6.6h11.6M5.4 2.2v2.4M10.6 2.2v2.4" {...trait} />
    </>,
  ),
  "acc-format-nombre": I(
    <>
      <text x="8" y="8.4" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">123</text>
      <path d="M3 11.4h10" {...trait} />
      <path d="M3 13.6h6" {...trait} />
    </>,
  ),
  "acc-inserer": I(
    <>
      <rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1" {...trait} />
      <path d="M8 5.4v5.2M5.4 8h5.2" {...trait} />
    </>,
  ),
  "acc-supprimer": I(
    <>
      <rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1" {...trait} />
      <path d="M5.4 8h5.2" {...trait} />
    </>,
  ),
  "acc-format-largeur": I(
    <>
      <path d="M4 3v10M12 3v10" {...trait} />
      <path d="M5.6 8h4.8M6.9 6.6 5.4 8l1.5 1.4M9.1 6.6 10.6 8 9.1 9.4" {...trait} />
    </>,
  ),
  "acc-format-masquer": I(
    <>
      <path d="M1.8 8s2.3-3.8 6.2-3.8S14.2 8 14.2 8s-2.3 3.8-6.2 3.8S1.8 8 1.8 8Z" {...trait} />
      <circle cx="8" cy="8" r="1.7" {...trait} />
      <path d="M2.6 13.4 13.4 2.6" {...trait} />
    </>,
  ),
  "acc-format": I(
    <>
      <rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1" {...trait} />
      <path d="M2.2 6.2h11.6M6.2 6.2v7.2" {...trait} />
    </>,
  ),
  "acc-recopier": I(
    <>
      <rect x="2.6" y="2.4" width="6.6" height="4.4" rx=".7" {...trait} />
      <path d="M5.9 8.2v5M4.3 11.6l1.6 1.7 1.6-1.7" {...trait} />
      <rect x="10.4" y="9" width="3.2" height="4.4" rx=".6" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 1.4" />
    </>,
  ),
  "acc-effacer": I(
    <>
      <path d="M6.4 12.8h6.4" {...trait} />
      <path d="M9.6 3.2 3.4 9.4a1.3 1.3 0 0 0 0 1.8l1.6 1.6h3l5.4-5.4a1.3 1.3 0 0 0 0-1.8l-2.2-2.4a1.3 1.3 0 0 0-1.6 0Z" {...trait} />
    </>,
  ),
  "don-tri-croissant": I(
    <>
      <path d="M4 3v10M2.4 11.4 4 13l1.6-1.6" {...trait} />
      <path d="M7.6 4.2h6M7.6 7.4h4.4M7.6 10.6h2.8" {...trait} />
    </>,
  ),
  "don-tri-decroissant": I(
    <>
      <path d="M4 13V3M2.4 4.6 4 3l1.6 1.6" {...trait} />
      <path d="M7.6 4.2h2.8M7.6 7.4h4.4M7.6 10.6h6" {...trait} />
    </>,
  ),
  "don-filtrer": I(<path d="M2.4 3.4h11.2l-4.3 5v4.6l-2.6-1.5V8.4z" {...trait} />),
  "don-effacer-filtre": I(
    <>
      <path d="M2 3.2h9l-3.5 4.1v3.8L5 9.6V7.3z" {...trait} />
      <path d="M10.6 10.6l3.2 3.2M13.8 10.6l-3.2 3.2" {...trait} />
    </>,
  ),
  "don-convertir": I(
    <>
      <rect x="2.2" y="3.4" width="11.6" height="9.2" rx="1" {...trait} />
      <path d="M8 3.4v9.2" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2 1.5" />
    </>,
  ),
  "don-valeur-cible": I(
    <>
      <circle cx="8" cy="8" r="5.4" {...trait} />
      <circle cx="8" cy="8" r="2.2" {...trait} />
      <circle cx="8" cy="8" r=".9" fill="currentColor" />
    </>,
  ),
  "don-validation": I(
    <>
      <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1" {...trait} />
      <path d="M5 8.2l2 2 4-4.4" {...trait} />
    </>,
  ),
  "ins-tcd": I(
    <>
      <rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1" {...trait} />
      <path d="M2.2 6h11.6M6.4 6v7.4" {...trait} />
      <rect x="2.2" y="2.6" width="11.6" height="3.4" fill="currentColor" opacity=".18" />
    </>,
  ),
  "ins-image-cellule": I(
    <>
      <rect x="2.2" y="3" width="11.6" height="10" rx="1" {...trait} />
      <circle cx="5.8" cy="6.4" r="1.1" {...trait} />
      <path d="M2.6 11.6 6.4 8.4l2.6 2.2 2-1.8 2.4 2.4" {...trait} />
    </>,
  ),
  "ins-graph-histogramme": I(<path d="M3 13V7.4M6.4 13V4.2M9.8 13v-4M13.2 13V6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />),
  "ins-graph-barres": I(<path d="M3 4h7.4M3 8h9.4M3 12h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />),
  "ins-graph-courbes": I(
    <>
      <path d="M2.4 11.6 6 7.4l2.8 2.4 4.8-6" {...trait} />
      <path d="M2.4 13.4h11.2" stroke="currentColor" strokeWidth="1" opacity=".5" />
    </>,
  ),
  "ins-graph-secteurs": I(
    <>
      <circle cx="8" cy="8" r="5.4" {...trait} />
      <path d="M8 8V2.6A5.4 5.4 0 0 1 12.8 10Z" fill="currentColor" opacity=".28" />
      <path d="M8 8 12.8 10" {...trait} />
    </>,
  ),
  "ins-graph-aires": I(
    <>
      <path d="M2.4 12.4 6 8l2.8 2.2 4.8-5.4v7.6Z" fill="currentColor" opacity=".25" />
      <path d="M2.4 12.4 6 8l2.8 2.2 4.8-5.4" {...trait} />
    </>,
  ),
  "ins-graph-nuage": I(
    <>
      <path d="M2.6 13.4V2.8M2.6 13.4h11" {...trait} />
      <circle cx="6" cy="10" r="1.05" fill="currentColor" />
      <circle cx="8.6" cy="7.4" r="1.05" fill="currentColor" />
      <circle cx="11.6" cy="5.2" r="1.05" fill="currentColor" />
      <circle cx="5.2" cy="6.4" r="1.05" fill="currentColor" />
    </>,
  ),
  "rev-commentaire": I(
    <>
      <path d="M2.4 3.6h11.2v7.2H7.2l-3 2.6v-2.6H2.4Z" {...trait} />
      <path d="M5.4 7.2h5.2" {...trait} />
    </>,
  ),
  "aff-figer-volets": I(
    <>
      <rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1" {...trait} />
      <path d="M2.2 6.2h11.6M6.2 2.6v10.8" stroke="currentColor" strokeWidth="1.6" />
    </>,
  ),
  "dev-macros": I(
    <>
      <circle cx="8" cy="8" r="2.2" {...trait} />
      <path d="M8 1.8v1.9M8 12.3v1.9M1.8 8h1.9M12.3 8h1.9M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4" {...trait} />
    </>,
  ),
  "dev-enregistrer-macro": I(
    <>
      <circle cx="8" cy="8" r="5.4" {...trait} />
      <circle cx="8" cy="8" r="2.6" fill="#c0392b" />
    </>,
  ),
  "dev-arreter-enregistrement": I(
    <>
      <circle cx="8" cy="8" r="5.4" {...trait} />
      <rect x="5.8" y="5.8" width="4.4" height="4.4" rx=".7" fill="currentColor" />
    </>,
  ),
  "mep-zone-impression-definir": I(
    <>
      <path d="M4.4 6.4V2.8h7.2v3.6" {...trait} />
      <rect x="2.4" y="6.4" width="11.2" height="4.4" rx="1" {...trait} />
      <path d="M4.4 10.8h7.2v2.6H4.4z" {...trait} fill="#fff" />
    </>,
  ),
  "mep-saut-inserer": I(
    <>
      <path d="M2.4 8h11.2" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.4 1.8" />
      <path d="M4 4.6h8M4 11.4h8" {...trait} />
    </>,
  ),
  "poste-enregistrer": I(
    <>
      <path d="M3.2 3.2h7.4l2.2 2.2v7.4a.8.8 0 0 1-.8.8H4a.8.8 0 0 1-.8-.8V4a.8.8 0 0 1 .8-.8Z" {...trait} />
      <path d="M5.4 3.2v3.4h4.4V3.2" {...trait} />
      <rect x="5" y="9" width="6" height="4.6" rx=".6" {...trait} />
    </>,
  ),
  "tcd-actualiser": I(
    <>
      <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7" {...trait} />
      <path d="M13.4 2.6v3.2h-3.2" {...trait} />
    </>,
  ),
}

/**
 * Boutons dont le pictogramme EST déjà le libellé (le G du gras, le € du format
 * monétaire…). Afficher les deux donnait « G » sous « G » sur toute la rangée
 * Police. Le libellé reste dans `title` et `aria-label`.
 */
const ICONE_SEULE = new Set([
  "acc-gras",
  "acc-italique",
  "acc-souligne",
  "acc-taille-plus",
  "acc-taille-moins",
  "acc-format-monetaire",
  "acc-pourcentage",
])

const TAB_LABELS: Partial<Record<RibbonTab, string>> = {
  accueil: "Accueil",
  insertion: "Insertion",
  "mise-en-page": "Mise en page",
  formules: "Formules",
  donnees: "Données",
  revision: "Révision",
  affichage: "Affichage",
  developpeur: "Développeur",
  // Onglets contextuels. Sans libellé, l'onglet affichait sa clé technique —
  // « tableau-creation » — là où Excel écrit une phrase.
  "tableau-creation": "Analyse du tableau croisé",
  "graph-creation": "Création de graphique",
  "graph-mise-en-forme": "Mise en forme du graphique",
  "graph-analyse": "Analyse du graphique",
  "entete-pied": "En-tête et pied de page",
  "image-format": "Format de l'image",
  "forme-format": "Format de la forme",
  "donnees-solveur": "Solveur",
}

/** Agrégats de la sélection, calculés par la grille. null = aucune sélection utile. */
export type SelectionStats = {
  count: number
  numbers: number
  sum: number | null
  average: number | null
  min: number | null
  max: number | null
} | null

type Props = {
  /** Onglets à afficher, déclarés par le scénario. */
  tabs: RibbonTab[]
  /** État imposé par l'étape courante (onglet actif, boutons grisés…). */
  state?: RibbonState
  /** Nom du classeur, affiché dans la barre de titre. */
  fileName: string
  /** Sélection courante, affichée dans la zone Nom. */
  selection: string
  /** Contenu de la cellule active, affiché dans la barre de formule. */
  formulaText: string
  /** Identifiant du contrôle à mettre en évidence (halo d'aide). */
  highlight?: string | null
  onControl: (controlId: string) => void
  /** Changement d'onglet du ruban : simple navigation, jamais une étape. */
  onTabChange?: (tab: RibbonTab) => void
  /** Édition dans la barre de formule. */
  onFormulaChange?: (text: string) => void
  onFormulaCommit?: () => void
  onFormulaCancel?: () => void
  /** true pendant l'édition d'une formule : Excel grise une partie du ruban. */
  editing?: boolean
  /**
   * Poste de travail actif : ajoute le groupe « Fichier » avec Enregistrer.
   * Sans lui, la leçon « Ouvrir et enregistrer » n'aurait aucun bouton à cliquer.
   */
  avecPoste?: boolean
  /** Saisie en cours dans la zone Nom. null = affiche la sélection courante. */
  nameBoxDraft?: string | null
  onNameBoxChange?: (text: string) => void
  onNameBoxCommit?: () => void
  onNameBoxCancel?: () => void
}

export default function SimulationChrome({
  tabs,
  state,
  fileName,
  selection,
  formulaText,
  highlight,
  onControl,
  onTabChange,
  onFormulaChange,
  onFormulaCommit,
  onFormulaCancel,
  editing,
  avecPoste,
  nameBoxDraft,
  onNameBoxChange,
  onNameBoxCommit,
  onNameBoxCancel,
}: Props) {
  const activeTab = state?.activeTab ?? tabs[0] ?? "accueil"
  const disabled = state?.disabled ?? {}
  const selected = new Set(state?.selected ?? [])

  /** Bouton du ruban. Un bouton inactif porte l'infobulle qui explique pourquoi. */
  const Btn = ({
    id,
    label,
    icon,
    wide,
  }: {
    id: string
    label: string
    icon?: React.ReactNode
    wide?: boolean
  }) => {
    const isDisabled = id in disabled
    const isHighlighted = highlight === id
    // Icône déduite de l'identifiant : pas d'icône à passer bouton par bouton, et
    // un nouveau bouton reste rendu (texte seul) tant que son pictogramme n'existe pas.
    const pict = icon ?? ICONS[id]
    const sansTexte = pict != null && ICONE_SEULE.has(id)
    return (
      <button
        type="button"
        title={isDisabled ? disabled[id] : label}
        aria-label={label}
        // Identifiant stable du contrôle : plusieurs boutons partagent le même
        // libellé (« Format », « Effacer », « Supprimer » selon l'onglet), ce
        // qui rend l'aria-label ambigu pour piloter le ruban en test.
        data-control={id}
        disabled={isDisabled}
        onClick={() => !isDisabled && onControl(id)}
        className={[
          "relative flex items-center rounded transition-colors",
          sansTexte
            ? "justify-center px-1.5 py-1.5"
            : pict && !wide
              ? "flex-col justify-center gap-0.5 px-1.5 py-1 text-[9.5px] leading-tight"
              : wide
                ? "flex-col justify-center gap-0.5 px-3 py-1.5 text-center text-[11px] leading-tight"
                : "gap-1.5 px-2 py-1 text-[11.5px]",
          isDisabled
            ? "cursor-not-allowed text-neutral-400"
            : "text-neutral-700 hover:bg-emerald-50 active:bg-emerald-100",
          selected.has(id) ? "bg-emerald-100 ring-1 ring-emerald-300" : "",
          isHighlighted ? "ring-2 ring-offset-1 ring-amber-400 animate-pulse" : "",
        ].join(" ")}
      >
        {pict}
        {!sansTexte && (
          <span className={pict && !wide ? "max-w-[62px] truncate" : "whitespace-nowrap"}>{label}</span>
        )}
      </button>
    )
  }

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="flex flex-shrink-0 flex-col items-center border-r border-neutral-200 px-2.5 pb-0.5 pt-1 last:border-r-0">
      <div className="flex items-end gap-1">{children}</div>
      <div className="mt-0.5 text-[9.5px] text-neutral-500">{title}</div>
    </div>
  )

  const SumIcon = (
    <span className="font-serif text-[15px] leading-none text-emerald-700" aria-hidden>
      Σ
    </span>
  )

  // Structure réelle d'Excel. Ne montrer que les onglets utiles à la leçon donnait
  // un logiciel amputé : l'apprenant n'apprenait jamais où vivent les commandes.
  // Les onglets hors scénario sont donc affichés mais inertes — et SANS
  // `data-ribbon-tab`, pour qu'un pilote automatique ne perde pas son temps dessus.
  const TAB_ORDER: RibbonTab[] = [
    "accueil",
    "insertion",
    "mise-en-page",
    "formules",
    "donnees",
    "revision",
    "affichage",
  ]
  const declares = new Set<string>(tabs)
  const contextuels = tabs.filter((t) => !TAB_ORDER.includes(t))
  const tousOnglets: RibbonTab[] = [...TAB_ORDER, ...contextuels]

  return (
    <div className="select-none overflow-hidden border border-neutral-300 bg-white" style={{ borderRadius: "8px 8px 0 0" }}>
      {/* Barre de titre. Effacée quand le poste de travail est là : sa fenêtre
          en porte déjà une, avec de VRAIS boutons système — deux barres
          superposées se voyaient immédiatement. */}
      <div
        className="items-center gap-2 bg-emerald-700 px-3 py-1.5 text-white"
        style={{ display: avecPoste ? "none" : "flex" }}
      >
        <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">X</span>
        <span className="truncate text-[12px]">
          {fileName} —{" "}
          <span
            className="rounded-full font-extrabold"
            style={{ background: "#fff", color: "#1e7145", fontSize: 10.5, padding: "2px 7px", letterSpacing: ".3px" }}
          >
            Excel 2024
          </span>
        </span>
        {/* Les boutons système de la fenêtre. Décoratifs : le vrai plein écran est
            porté par le cockpit du player (`data-control="sim-agrandir"`), qui est
            le seul endroit où l'apprenant a besoin de le chercher. */}
        <span className="ml-auto flex-shrink-0 select-none" aria-hidden style={{ letterSpacing: 5, opacity: 0.75, fontSize: 11 }}>
          ─ ▢ ✕
        </span>
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-2 pt-1" style={{ scrollbarWidth: "none" }}>
        {tousOnglets.map((t) => {
          const actif = t === activeTab
          const utilisable = declares.has(t)
          return (
            <button
              key={t}
              type="button"
              // Identifiant stable de l'onglet, au même titre que `data-control` sur
              // les boutons : un test automatisé doit pouvoir aller chercher l'onglet
              // qui porte le bouton dont il a besoin.
              {...(utilisable ? { "data-ribbon-tab": t } : {})}
              aria-pressed={actif}
              title={utilisable ? undefined : "Cet onglet d'Excel n'est pas utilisé dans cette leçon"}
              onClick={() => utilisable && onTabChange?.(t)}
              className={[
                "flex-shrink-0 whitespace-nowrap rounded-t px-3 py-1 text-[11.5px]",
                actif
                  ? "border border-b-white border-neutral-200 bg-white font-medium text-emerald-800"
                  : utilisable
                    ? "text-neutral-600 hover:bg-white/60"
                    : "cursor-default text-neutral-400",
              ].join(" ")}
            >
              {TAB_LABELS[t] ?? t}
            </button>
          )
        })}
      </div>

      {/* Groupes de l'onglet actif.
          Le ruban défile horizontalement quand il dépasse — sans le fondu à droite,
          il paraissait simplement COUPÉ (« Supprimer » tranché au bord, « Couleu »
          sur mobile) et rien n'invitait à faire défiler. */}
      <div
        className={[
          "relative bg-white",
          editing ? "opacity-50" : "",
        ].join(" ")}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8"
          style={{ background: "linear-gradient(90deg,rgba(255,255,255,0),#fff 78%)" }}
        />
        <div
          className="flex items-stretch overflow-x-auto py-0.5"
          style={{ scrollbarWidth: "thin" }}
        >
        {activeTab === "accueil" && (
          <>
            {avecPoste && (
              <Group title="Fichier">
                <Btn id="poste-ouvrir" label="Ouvrir" />
                <Btn id="poste-enregistrer" label="Enregistrer" />
                <Btn id="poste-enregistrer-sous" label="Enregistrer sous" wide />
              </Group>
            )}
            <Group title="Presse-papiers">
              <Btn id="acc-coller" label="Coller" wide />
              <Btn id="acc-copier" label="Copier" />
            </Group>
            <Group title="Police">
              <Btn id="acc-gras" label="G" />
              <Btn id="acc-italique" label="I" />
              <Btn id="acc-souligne" label="S" />
              <Btn id="acc-taille-plus" label="A+" />
              <Btn id="acc-taille-moins" label="A−" />
              <Btn id="acc-couleur-police" label="Couleur" />
              <Btn id="acc-remplissage" label="Remplir" />
              <Btn id="acc-bordures" label="Bordures" />
            </Group>
            <Group title="Alignement">
              <Btn id="acc-aligner-gauche" label="Gauche" />
              <Btn id="acc-aligner-centre" label="Centre" />
              <Btn id="acc-aligner-droite" label="Droite" />
              <Btn id="acc-fusionner" label="Fusionner" />
              <Btn id="acc-renvoyer-ligne" label="Renvoyer" />
            </Group>
            <Group title="Styles">
              <Btn id="acc-mfc-regle" label="Mise en forme cond." wide />
              <Btn id="acc-mfc-effacer" label="Effacer règles" />
            </Group>
            <Group title="Nombre">
              <Btn id="acc-format-monetaire" label="€" />
              <Btn id="acc-pourcentage" label="%" />
              <Btn id="acc-format-date" label="Date" />
              <Btn id="acc-format-nombre" label="Format" />
            </Group>
            <Group title="Cellules">
              <Btn id="acc-inserer" label="Insérer" />
              <Btn id="acc-supprimer" label="Supprimer" />
              {/* Ces deux gestes étaient IMPLÉMENTÉS dans le simulateur et admis par
                  le contrôleur, mais aucun bouton ne les rendait : neuf étapes
                  demandaient à l'apprenant de cliquer quelque chose qui n'existait
                  pas. Le menu Format d'Excel les abrite ; ici ils sont posés à plat,
                  ce qui évite un menu déroulant de plus à piloter. */}
              <Btn id="acc-format-largeur" label="Largeur" />
              <Btn id="acc-format-masquer" label="Masquer" />
              <div className="flex items-center">
                <Btn id="acc-format" label="Format" />
                <button
                  type="button"
                  title="Options de format"
                  aria-label="Options de format de cellule"
                  data-control="acc-format-fleche"
            onClick={() => onControl("acc-format-fleche")}
                  className={[
                    "rounded px-1 py-1 text-[9px] text-neutral-600 hover:bg-emerald-50",
                    highlight === "acc-format-fleche" ? "ring-2 ring-amber-400 animate-pulse" : "",
                  ].join(" ")}
                >
                  ▾
                </button>
              </div>
            </Group>
            <Group title="Édition">
              {/* Le bouton Somme automatique et sa flèche forment un contrôle
                  double : le bouton applique SOMME, la flèche ouvre le menu. */}
              <div className="flex items-center">
                <Btn id="acc-somme-auto" label="Somme" icon={SumIcon} />
                <button
                  type="button"
                  title="Autres fonctions"
                  aria-label="Autres fonctions de calcul"
                  data-control="acc-somme-auto-fleche"
            onClick={() => onControl("acc-somme-auto-fleche")}
                  className={[
                    "rounded px-1 py-1 text-[9px] text-neutral-600 hover:bg-emerald-50",
                    highlight === "acc-somme-auto-fleche" ? "ring-2 ring-amber-400 animate-pulse" : "",
                  ].join(" ")}
                >
                  ▾
                </button>
              </div>
              <Btn id="acc-recopier" label="Recopier" />
              <Btn id="acc-effacer" label="Effacer" />
            </Group>
          </>
        )}
        {activeTab === "donnees" && (
          <>
            <Group title="Trier et filtrer">
              <Btn id="don-tri-croissant" label="A→Z" />
              <Btn id="don-tri-decroissant" label="Z→A" />
              <Btn id="don-filtrer" label="Filtrer" />
              <Btn id="don-effacer-filtre" label="Effacer" />
            </Group>
            <Group title="Outils de données">
              <Btn id="don-convertir" label="Convertir" />
              <Btn id="don-valeur-cible" label="Valeur cible" wide />
              <Btn id="don-validation" label="Validation" wide />
              <Btn id="don-effacer-validation" label="Effacer validation" wide />
            </Group>
          </>
        )}
        {activeTab === "insertion" && (
          <>
            {/* Excel ouvre son onglet Insertion sur ce bouton : c'est le seul point
                d'entrée pour créer un tableau croisé, et la plage vient de la
                sélection — exactement comme pour un graphique. */}
            <Group title="Tableaux">
              <Btn id="ins-tcd" label="Tableau croisé dynamique" wide />
            </Group>
            <Group title="Illustrations">
              <Btn id="ins-image-cellule" label="Image dans la cellule" wide />
            </Group>
            {/* Les graphiques ne passent pas par Univer, dont le module est payant :
                ils sont rendus par notre propre couche. Du point de vue de
                l'apprenant, le geste est celui d'Excel — sélectionner une plage,
                puis choisir un type dans ce groupe. */}
            <Group title="Graphiques">
              <Btn id="ins-graph-recommande" label="Graphique recommandé" wide />
              <Btn id="ins-graph-histogramme" label="Histogramme" />
              <Btn id="ins-graph-barres" label="Barres" />
              <Btn id="ins-graph-courbes" label="Courbes" />
              <Btn id="ins-graph-secteurs" label="Secteurs" />
              <Btn id="ins-graph-aires" label="Aires" />
              <Btn id="ins-graph-nuage" label="Nuage" />
            </Group>
          </>
        )}
        {activeTab === "graph-creation" && (
          <>
            <Group title="Éléments du graphique">
              <Btn id="ins-graph-element-titre" label="Titre" />
              <Btn id="ins-graph-element-titres-axes" label="Titres des axes" wide />
              <Btn id="ins-graph-element-legende" label="Légende" />
              <Btn id="ins-graph-element-etiquettes" label="Étiquettes" />
              <Btn id="ins-graph-element-quadrillage" label="Quadrillage" />
            </Group>
            <Group title="Légende">
              <Btn id="ins-graph-legende-droite" label="À droite" />
              <Btn id="ins-graph-legende-bas" label="En bas" />
            </Group>
            <Group title="Styles">
              <Btn id="ins-graph-style-2" label="Style 2" />
              <Btn id="ins-graph-style-3" label="Style 3" />
              <Btn id="ins-graph-style-4" label="Style 4" />
              <Btn id="ins-graph-style-5" label="Style 5" />
            </Group>
            <Group title="Données">
              <Btn id="ins-graph-intervertir" label="Lignes / colonnes" wide />
              <Btn id="ins-graph-selectionner-donnees" label="Sélectionner les données" wide />
              <Btn id="ins-graph-filtre-serie" label="Filtrer une série" wide />
              <Btn id="ins-graph-supprimer-serie" label="Supprimer une série" wide />
            </Group>
            <Group title="Type">
              <Btn id="ins-graph-modifier-type" label="Modifier le type" wide />
            </Group>
          </>
        )}
        {activeTab === "graph-mise-en-forme" && (
          <>
            <Group title="Série">
              <Btn id="ins-graph-couleur-serie" label="Couleur de la série" wide />
              <Btn id="ins-graph-forme-serie" label="Forme de la série" wide />
            </Group>
            <Group title="Analyse">
              <Btn id="ins-graph-tendance-lineaire" label="Tendance linéaire" wide />
              <Btn id="ins-graph-tendance-moyenne-mobile" label="Moyenne mobile" wide />
              <Btn id="ins-graph-tendance-supprimer" label="Retirer la tendance" wide />
            </Group>
          </>
        )}
        {activeTab === "mise-en-page" && (
          <Group title="Mise en page">
            {/* Ces quatre boutons dépendent de la SÉLECTION, que le calque de mise
                en page ne connaît pas : ils vivent donc au ruban. Tout le reste des
                réglages est porté par le panneau du calque. */}
            <Btn id="mep-zone-impression-definir" label="Définir la zone d'impression" wide />
            <Btn id="mep-imprimer-titres" label="Imprimer les titres" wide />
            <Btn id="mep-saut-inserer" label="Insérer un saut de page" wide />
            <Btn id="mep-saut-supprimer" label="Supprimer le saut" wide />
          </Group>
        )}
        {activeTab === "tableau-creation" && (
          <Group title="Tableau croisé dynamique">
            <Btn id="tcd-actualiser" label="Actualiser" />
            {/* Étendre la source est le seul moyen de faire entrer des lignes
                ajoutées SOUS la plage : actualiser ne suffit pas, et c'est
                précisément le piège qu'enseigne la leçon « mettre à jour ». */}
            <Btn id="tcd-source" label="Modifier la source de données" wide />
            <Btn id="tcd-champs" label="Liste des champs" wide />
          </Group>
        )}
        {activeTab === "developpeur" && (
          // Le panneau des macros porte les mêmes commandes : ces boutons sont le
          // chemin d'Excel, le panneau reste le chemin visible en permanence.
          <Group title="Code">
            <Btn id="dev-enregistrer-macro" label="Enregistrer une macro" wide />
            <Btn id="dev-arreter-enregistrement" label="Arrêter l'enregistrement" wide />
            <Btn id="dev-references-relatives" label="Références relatives" wide />
            <Btn id="dev-macros" label="Macros" />
          </Group>
        )}
        {activeTab === "revision" && (
          <Group title="Commentaires">
            <Btn id="rev-commentaire" label="Nouveau commentaire" wide />
            <Btn id="rev-supprimer-commentaire" label="Supprimer" />
          </Group>
        )}
        {activeTab === "affichage" && (
          <Group title="Fenêtre">
            <Btn id="aff-figer-volets" label="Figer les volets" wide />
            <Btn id="aff-liberer-volets" label="Libérer les volets" wide />
          </Group>
        )}
        {!(
          [
            "accueil",
            "donnees",
            "revision",
            "affichage",
            "insertion",
            "graph-creation",
            "graph-mise-en-forme",
            "mise-en-page",
            "tableau-creation",
            "developpeur",
          ] as string[]
        ).includes(activeTab) && (
          <div className="px-3 py-2 text-[11.5px] text-neutral-500">
            Onglet {TAB_LABELS[activeTab] ?? activeTab}
          </div>
        )}
        </div>
      </div>

      {/* Barre de formule */}
      <div className="flex items-stretch border-t border-neutral-200 bg-white">
        {/* Zone Nom SAISISSABLE : dans Excel elle sert autant à lire où l'on est
            qu'à s'y rendre. Sur un tableau de dix mille lignes, taper la référence
            est le seul moyen raisonnable d'atteindre une cellule. */}
        <input
          value={nameBoxDraft ?? selection ?? "A1"}
          onChange={(e) => onNameBoxChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onNameBoxCommit?.()
            } else if (e.key === "Escape") {
              e.preventDefault()
              onNameBoxCancel?.()
            }
          }}
          readOnly={!onNameBoxChange}
          aria-label="Zone Nom"
          className="w-24 flex-shrink-0 border-r border-neutral-200 px-2 text-center text-[11.5px] text-neutral-700 outline-none focus:bg-emerald-50"
        />
        <div className="flex flex-shrink-0 items-center gap-0.5 border-r border-neutral-200 px-1">
          <button
            type="button"
            title="Annuler"
            aria-label="Annuler la saisie"
            onClick={() => {
              onControl("bf-annuler")
              onFormulaCancel?.()
            }}
            className={[
              "rounded px-1.5 py-0.5 text-[12px] text-neutral-500 hover:bg-neutral-100",
              highlight === "bf-annuler" ? "ring-2 ring-amber-400 animate-pulse" : "",
            ].join(" ")}
          >
            ✕
          </button>
          {/* Geste le plus fréquent des scénarios : valider par l'icône plutôt
              que par la touche Entrée. Il doit être visible et cliquable. */}
          <button
            type="button"
            title="Entrer"
            aria-label="Valider la saisie"
            onClick={() => {
              onControl("bf-entrer")
              onFormulaCommit?.()
            }}
            className={[
              "rounded px-1.5 py-0.5 text-[12px] text-emerald-700 hover:bg-emerald-50",
              highlight === "bf-entrer" ? "ring-2 ring-amber-400 animate-pulse" : "",
            ].join(" ")}
          >
            ✓
          </button>
          <button
            type="button"
            title="Insérer une fonction"
            aria-label="Insérer une fonction"
            data-control="bf-fx"
            onClick={() => onControl("bf-fx")}
            className={[
              "rounded px-1.5 py-0.5 text-[11px] italic text-neutral-600 hover:bg-neutral-100",
              highlight === "bf-fx" ? "ring-2 ring-amber-400 animate-pulse" : "",
            ].join(" ")}
          >
            fx
          </button>
        </div>
        <input
          value={formulaText}
          onChange={(e) => onFormulaChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onFormulaCommit?.()
            } else if (e.key === "Escape") {
              e.preventDefault()
              onFormulaCancel?.()
            }
          }}
          readOnly={!onFormulaChange}
          aria-label="Barre de formule"
          className="min-w-0 flex-1 px-2 py-1 font-mono text-[12px] text-neutral-800 outline-none"
        />
      </div>

    </div>
  )
}

/**
 * Bas de la fenêtre Excel : onglets de feuille puis barre d'état.
 *
 * Séparé du chrome parce qu'il doit se rendre SOUS la grille. Tant que tout
 * vivait dans un seul composant, les onglets de feuille et la barre d'état
 * s'affichaient AU-DESSUS de la feuille — l'inverse d'Excel, où ils sont en bas
 * depuis toujours (défaut relevé par Samuel le 29/07).
 *
 * La barre d'état est désormais PERMANENTE : elle n'apparaissait qu'en présence
 * de nombres sélectionnés, si bien que la fenêtre se terminait le plus souvent
 * sur une barre de défilement grise. Excel affiche toujours « Prêt » et le zoom ;
 * seuls les agrégats sont conditionnels.
 */
export function SimulationFooter({
  sheets,
  onSheet,
  onControl,
  highlight,
  stats,
  aggregates,
  editing,
}: {
  sheets?: Array<{ name: string; active: boolean }>
  onSheet?: (name: string) => void
  onControl: (controlId: string) => void
  highlight?: string | null
  stats?: SelectionStats
  aggregates?: string[]
  editing?: boolean
}) {
  const agregats: React.ReactNode[] = []
  if (stats) {
    for (const agg of aggregates ?? ["moyenne", "nb-non-vides", "somme"]) {
      if (agg === "moyenne" && stats.average != null)
        agregats.push(
          <span key={agg}>
            Moyenne : <b className="font-semibold text-neutral-800">{fmt(stats.average)}</b>
          </span>,
        )
      else if (agg === "nb-non-vides" && stats.count > 0)
        agregats.push(
          <span key={agg}>
            Nb (non vides) : <b className="font-semibold text-neutral-800">{stats.count}</b>
          </span>,
        )
      else if (agg === "nb" && stats.numbers > 0)
        agregats.push(
          <span key={agg}>
            Nb : <b className="font-semibold text-neutral-800">{stats.numbers}</b>
          </span>,
        )
      else if (agg === "somme" && stats.sum != null)
        agregats.push(
          <span key={agg}>
            Somme : <b className="font-semibold text-neutral-800">{fmt(stats.sum)}</b>
          </span>,
        )
      else if (agg === "min" && stats.min != null)
        agregats.push(
          <span key={agg}>
            Min : <b className="font-semibold text-neutral-800">{fmt(stats.min)}</b>
          </span>,
        )
      else if (agg === "max" && stats.max != null)
        agregats.push(
          <span key={agg}>
            Max : <b className="font-semibold text-neutral-800">{fmt(stats.max)}</b>
          </span>,
        )
    }
  }

  return (
    <div className="select-none border border-t-0 border-neutral-300 bg-white" style={{ borderRadius: "0 0 8px 8px" }}>
      {/* Onglets de feuille. Un classeur multi-feuilles est la base de
          l'organisation d'un travail Excel, et les références inter-feuilles en
          dépendent. */}
      {sheets && sheets.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-t border-neutral-200 bg-neutral-50 px-2 pt-1" style={{ scrollbarWidth: "none" }}>
          {sheets.map((sh) => (
            <button
              key={sh.name}
              type="button"
              aria-label={`Feuille ${sh.name}`}
              onClick={() => onSheet?.(sh.name)}
              className={[
                "flex-shrink-0 whitespace-nowrap rounded-t px-2.5 py-0.5 text-[11.5px] transition-colors",
                sh.active
                  ? "border border-b-white border-neutral-200 bg-white font-medium text-emerald-800"
                  : "text-neutral-600 hover:bg-neutral-100",
              ].join(" ")}
            >
              {sh.name}
            </button>
          ))}
          <button
            type="button"
            title="Nouvelle feuille"
            aria-label="Nouvelle feuille"
            data-control="ui-nouvelle-feuille"
            onClick={() => onControl("ui-nouvelle-feuille")}
            className={[
              "flex-shrink-0 rounded px-1.5 py-0.5 text-[13px] leading-none text-neutral-500 hover:bg-neutral-100",
              highlight === "ui-nouvelle-feuille" ? "ring-2 ring-amber-400 animate-pulse" : "",
            ].join(" ")}
          >
            +
          </button>
        </div>
      )}

      {/* Barre d'état. Les agrégats de la sélection sont un vrai geste Excel que
          beaucoup ignorent : compter ou sommer sans écrire de formule. */}
      <div
        aria-label="Barre d'état"
        className="flex items-center gap-4 border-t border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] text-neutral-600"
      >
        <span className="flex-shrink-0">{editing ? "Entrer" : "Prêt"}</span>
        <span className="ml-auto flex min-w-0 items-center gap-4 overflow-hidden whitespace-nowrap">{agregats}</span>
        <span className="flex-shrink-0 tabular-nums text-neutral-500">100 %</span>
      </div>
    </div>
  )
}

/** Nombres à la française : espace pour les milliers, virgule décimale. */
function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return rounded.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}
