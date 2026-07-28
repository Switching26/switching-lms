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

type Props = {
  /** Onglets à afficher, déclarés par le scénario. */
  tabs: RibbonTab[]
  /** État imposé par l'étape courante (onglet actif, boutons grisés…). */
  state?: RibbonState
  /** Nom du classeur, affiché dans la barre de titre. */
  fileName: string
  /** Mode plein écran du simulateur (bouton ⤢/⤡ dans la barre de titre). */
  immersif?: boolean
  onToggleImmersif?: () => void
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
  /** Feuilles du classeur, pour les onglets du bas. */
  sheets?: Array<{ name: string; active: boolean }>
  onSheet?: (name: string) => void
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
  immersif,
  onToggleImmersif,
  selection,
  formulaText,
  highlight,
  onControl,
  onTabChange,
  onFormulaChange,
  onFormulaCommit,
  onFormulaCancel,
  editing,
  stats,
  aggregates,
  sheets,
  onSheet,
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
        <span className="truncate text-[12px]">
          {fileName} —{" "}
          <span
            className="rounded-full font-extrabold"
            style={{ background: "#fff", color: "#1e7145", fontSize: 10.5, padding: "2px 7px", letterSpacing: ".3px" }}
          >
            Excel 2024
          </span>
        </span>
        {onToggleImmersif && (
          <button
            type="button"
            data-control="sim-agrandir"
            onClick={onToggleImmersif}
            className="ml-auto flex-shrink-0 rounded-lg font-bold"
            style={{ background: "#fff", color: "#1e7145", fontSize: 11.5, padding: "4px 10px" }}
          >
            {immersif ? "⤡ Réduire" : "⤢ Agrandir"}
          </button>
        )}
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-2 pt-1">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            // Identifiant stable de l'onglet, au même titre que `data-control` sur
            // les boutons : un test automatisé doit pouvoir aller chercher l'onglet
            // qui porte le bouton dont il a besoin.
            data-ribbon-tab={t}
            aria-pressed={t === activeTab}
            onClick={() => onTabChange?.(t)}
            className={[
              "rounded-t px-3 py-1 text-[11.5px]",
              t === activeTab
                ? "border border-b-white border-neutral-200 bg-white font-medium text-emerald-800"
                : "text-neutral-600 hover:bg-white/60",
            ].join(" ")}
          >
            {TAB_LABELS[t] ?? t}
          </button>
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

      {/* Onglets de feuille. Un classeur multi-feuilles est la base de
          l'organisation d'un travail Excel, et les références inter-feuilles en
          dépendent. */}
      {sheets && sheets.length > 0 && (
        <div className="flex items-center gap-1 border-t border-neutral-200 bg-neutral-50 px-2 py-1">
          {sheets.map((sh) => (
            <button
              key={sh.name}
              type="button"
              aria-label={`Feuille ${sh.name}`}
              onClick={() => onSheet?.(sh.name)}
              className={[
                "rounded-t px-2.5 py-0.5 text-[11.5px] transition-colors",
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
              "rounded px-1.5 py-0.5 text-[13px] leading-none text-neutral-500 hover:bg-neutral-100",
              highlight === "ui-nouvelle-feuille" ? "ring-2 ring-amber-400 animate-pulse" : "",
            ].join(" ")}
          >
            +
          </button>
        </div>
      )}

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
