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

const TAB_LABELS: Partial<Record<RibbonTab, string>> = {
  accueil: "Accueil",
  insertion: "Insertion",
  "mise-en-page": "Mise en page",
  formules: "Formules",
  donnees: "Données",
  revision: "Révision",
  affichage: "Affichage",
  developpeur: "Développeur",
}

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
  /** Édition dans la barre de formule. */
  onFormulaChange?: (text: string) => void
  onFormulaCommit?: () => void
  onFormulaCancel?: () => void
  /** true pendant l'édition d'une formule : Excel grise une partie du ruban. */
  editing?: boolean
  /** Agrégats de la sélection, calculés par la grille. null = barre masquée. */
  stats?: {
    count: number
    numbers: number
    sum: number | null
    average: number | null
    min: number | null
    max: number | null
  } | null
  /** Agrégats à afficher, déclarés par le scénario. */
  aggregates?: string[]
}

export default function SimulationChrome({
  tabs,
  state,
  fileName,
  selection,
  formulaText,
  highlight,
  onControl,
  onFormulaChange,
  onFormulaCommit,
  onFormulaCancel,
  editing,
  stats,
  aggregates,
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
    return (
      <button
        type="button"
        title={isDisabled ? disabled[id] : label}
        aria-label={label}
        disabled={isDisabled}
        onClick={() => !isDisabled && onControl(id)}
        className={[
          "relative flex items-center gap-1.5 rounded px-2 py-1 text-[11.5px] transition-colors",
          wide ? "flex-col justify-center px-3 py-1.5 text-center" : "",
          isDisabled
            ? "cursor-not-allowed text-neutral-400"
            : "text-neutral-700 hover:bg-emerald-50 active:bg-emerald-100",
          selected.has(id) ? "bg-emerald-100 ring-1 ring-emerald-300" : "",
          isHighlighted ? "ring-2 ring-offset-1 ring-amber-400 animate-pulse" : "",
        ].join(" ")}
      >
        {icon}
        <span className="whitespace-nowrap">{label}</span>
      </button>
    )
  }

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="flex flex-col items-center border-r border-neutral-200 px-2.5 pb-0.5 pt-1 last:border-r-0">
      <div className="flex items-end gap-1">{children}</div>
      <div className="mt-0.5 text-[9.5px] text-neutral-500">{title}</div>
    </div>
  )

  const SumIcon = (
    <span className="font-serif text-[15px] leading-none text-emerald-700" aria-hidden>
      Σ
    </span>
  )

  return (
    <div className="select-none overflow-hidden rounded-t-lg border border-neutral-300 bg-white">
      {/* Barre de titre */}
      <div className="flex items-center gap-2 bg-emerald-700 px-3 py-1.5 text-white">
        <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">X</span>
        <span className="truncate text-[12px]">{fileName} — Excel</span>
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-2 pt-1">
        {tabs.map((t) => (
          <span
            key={t}
            className={[
              "rounded-t px-3 py-1 text-[11.5px]",
              t === activeTab
                ? "border border-b-white border-neutral-200 bg-white font-medium text-emerald-800"
                : "text-neutral-600",
            ].join(" ")}
          >
            {TAB_LABELS[t] ?? t}
          </span>
        ))}
      </div>

      {/* Groupes de l'onglet actif */}
      <div
        className={[
          "flex items-stretch overflow-x-auto bg-white py-0.5",
          // Excel grise une partie du ruban pendant l'édition d'une formule.
          editing ? "opacity-50" : "",
        ].join(" ")}
      >
        {activeTab === "accueil" && (
          <>
            <Group title="Presse-papiers">
              <Btn id="acc-coller" label="Coller" wide />
              <Btn id="acc-copier" label="Copier" />
            </Group>
            <Group title="Police">
              <Btn id="acc-gras" label="G" />
            </Group>
            <Group title="Nombre">
              <Btn id="acc-format-nombre" label="Format" />
              <Btn id="acc-pourcentage" label="%" />
            </Group>
            <Group title="Cellules">
              <Btn id="acc-inserer" label="Insérer" />
              <Btn id="acc-supprimer" label="Supprimer" />
              <div className="flex items-center">
                <Btn id="acc-format" label="Format" />
                <button
                  type="button"
                  title="Options de format"
                  aria-label="Options de format de cellule"
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
        {activeTab !== "accueil" && (
          <div className="px-3 py-2 text-[11.5px] text-neutral-500">
            Onglet {TAB_LABELS[activeTab] ?? activeTab}
          </div>
        )}
      </div>

      {/* Barre de formule */}
      <div className="flex items-stretch border-t border-neutral-200 bg-white">
        <div className="flex w-24 flex-shrink-0 items-center justify-center border-r border-neutral-200 px-2 text-[11.5px] text-neutral-700">
          {selection || "A1"}
        </div>
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

      {/* Barre d'état : agrégats de la sélection, sans écrire aucune formule.
          C'est un vrai geste Excel que beaucoup d'utilisateurs ignorent, et il
          n'existe que si des nombres sont sélectionnés — comme dans le logiciel. */}
      {stats && (
        <div
          aria-label="Barre d'état"
          className="flex items-center justify-end gap-4 border-t border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] text-neutral-600"
        >
          {(aggregates ?? ["moyenne", "nb-non-vides", "somme"]).map((agg) => {
            if (agg === "moyenne" && stats.average != null)
              return (
                <span key={agg}>
                  Moyenne : <b className="font-semibold text-neutral-800">{fmt(stats.average)}</b>
                </span>
              )
            if (agg === "nb-non-vides" && stats.count > 0)
              return (
                <span key={agg}>
                  Nb (non vides) : <b className="font-semibold text-neutral-800">{stats.count}</b>
                </span>
              )
            if (agg === "nb" && stats.numbers > 0)
              return (
                <span key={agg}>
                  Nb : <b className="font-semibold text-neutral-800">{stats.numbers}</b>
                </span>
              )
            if (agg === "somme" && stats.sum != null)
              return (
                <span key={agg}>
                  Somme : <b className="font-semibold text-neutral-800">{fmt(stats.sum)}</b>
                </span>
              )
            if (agg === "min" && stats.min != null)
              return (
                <span key={agg}>
                  Min : <b className="font-semibold text-neutral-800">{fmt(stats.min)}</b>
                </span>
              )
            if (agg === "max" && stats.max != null)
              return (
                <span key={agg}>
                  Max : <b className="font-semibold text-neutral-800">{fmt(stats.max)}</b>
                </span>
              )
            return null
          })}
        </div>
      )}
    </div>
  )
}

/** Nombres à la française : espace pour les milliers, virgule décimale. */
function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return rounded.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}
