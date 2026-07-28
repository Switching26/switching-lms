"use client"

/**
 * Couche visuelle du tableau croisé dynamique : le volet « Champs de tableau croisé
 * dynamique » et le rendu du tableau produit.
 *
 * PUREMENT PRÉSENTATIONNELLE. Ce composant ne connaît ni Univer, ni le scénario, ni
 * la progression : il reçoit un état et rend des événements. Tout ce qui décide
 * (créer, modifier, actualiser, valider) vit dans le simulateur. C'est la même règle
 * que pour `ExcelGrid` : un seul fichier a le droit de parler au moteur.
 *
 * POURQUOI un rendu du tableau ICI alors que les valeurs sont déjà posées dans la
 * grille : la grille ne sait pas afficher un style de tableau croisé — elle ne
 * conserve que des valeurs — et le module 20 consacre une leçon aux styles. Ce rendu
 * est donc la vue « habillée » du même tableau, et c'est lui qui rend `styleId`
 * visible. Les deux lisent la même structure calculée, il n'y a pas deux vérités.
 *
 * GESTES : le glisser-déposer est écrit en événements `pointer*`, jamais en
 * HTML5 drag-and-drop. Ce dernier n'existe pas au doigt, et la formation est
 * consultée sur téléphone. Un repli existe pour les cas où le glissement échoue
 * (souris capricieuse, lecteur d'écran, doigt maladroit) : on touche le champ, il
 * s'arme, puis on touche la zone visée.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { PivotAgg, PivotState } from "@/lib/simulation/types"
import type { PositionAxe, TableauCroise, ZoneTcd } from "@/lib/simulation/pivot"
import { STYLES_TCD, libelleValeur, styleTcd } from "@/lib/simulation/pivot"

/* ═══════════ ZONES ═══════════ */

/**
 * Ordre d'Excel : Filtres et Colonnes en haut, Lignes et Valeurs en bas. On le
 * respecte pour qu'un apprenant qui ouvre le vrai Excel retrouve ses repères.
 */
const ZONES: Array<{ id: ZoneTcd; titre: string; sous: string }> = [
  { id: "filters", titre: "Filtres", sous: "sous condition" },
  { id: "cols", titre: "Colonnes", sous: "en largeur" },
  { id: "rows", titre: "Lignes", sous: "en hauteur" },
  { id: "values", titre: "Valeurs", sous: "à calculer" },
]

const LIBELLES_AGG: Array<{ id: PivotAgg; libelle: string }> = [
  { id: "somme", libelle: "Somme" },
  { id: "nombre", libelle: "Nombre" },
  { id: "moyenne", libelle: "Moyenne" },
  { id: "min", libelle: "Min" },
  { id: "max", libelle: "Max" },
]

type Props = {
  /** État du tableau croisé, null tant qu'il n'y en a pas. */
  pivot: PivotState | null
  /** Tableau calculé par `calculerTcd`, null tant qu'il n'y en a pas. */
  tableau: TableauCroise | null
  /** Champs disponibles, dans l'ordre des colonnes de la source. */
  champs: string[]
  /** Un champ a été déposé dans une zone. */
  onDropField: (champ: string, zone: ZoneTcd) => void
  /** Le calcul d'un champ de la zone Valeurs a changé. */
  onSetAgg: (champ: string, agg: PivotAgg) => void
  /** L'apprenant demande l'actualisation. */
  onRefresh: () => void
  /**
   * Retrait d'un champ. Facultatif : sans ce rappel, les croix et les cases à
   * cocher de retrait ne sont pas proposées, plutôt que de proposer un geste sans
   * effet — rien n'est plus décourageant qu'un bouton qui ne fait rien.
   */
  onRemoveField?: (champ: string) => void
  /** Choix d'un style numéroté. Facultatif, même raison. */
  onSetStyle?: (styleId: number) => void
  /**
   * Valeurs qu'un filtre de rapport peut prendre, et changement de sélection.
   * Sans ces deux rappels le filtre reste en LECTURE SEULE : la leçon
   * « basculez le filtre sur T1 » n'a alors aucun geste possible. Seul le
   * simulateur connaît les valeurs distinctes de la source, il les fournit.
   */
  valeursFiltre?: (champ: string) => string[]
  onSetFilterValues?: (champ: string, valeurs: string[]) => void
  /**
   * Zone visée quand on COCHE un champ dans la liste. Excel envoie les champs
   * numériques en Valeurs et les autres en Lignes ; seul le simulateur sait de
   * quel type est un champ, il fournit donc la réponse.
   */
  zoneParDefaut?: (champ: string) => ZoneTcd
  className?: string
}

/* ═══════════ EN-TÊTES DE COLONNES ═══════════ */

type CelluleEntete = { libelle: string; span: number; position: PositionAxe }

/**
 * Regroupe les positions de colonnes par niveau pour obtenir des `colSpan`.
 * La grille écrit un libellé une seule fois au début de son groupe ; en HTML on
 * dispose de la fusion de cellules, on l'utilise.
 */
function entetesParNiveau(tableau: TableauCroise): CelluleEntete[][] {
  const nbNiveaux =
    tableau.champsColonnes.length + (tableau.valeurs.length > 1 && tableau.champsColonnes.length > 0 ? 1 : 0)
  if (nbNiveaux === 0) {
    return [tableau.colonnes.map((p) => ({ libelle: p.libelle, span: 1, position: p }))]
  }
  const niveaux: CelluleEntete[][] = []
  for (let niveau = 0; niveau < nbNiveaux; niveau++) {
    const ligne: CelluleEntete[] = []
    let prefixePrecedent: string | null = null
    for (const p of tableau.colonnes) {
      const libelle = p.libelles[niveau] ?? ""
      const prefixe = p.libelles.slice(0, niveau + 1).join("§")
      if (ligne.length > 0 && prefixe === prefixePrecedent) {
        ligne[ligne.length - 1].span += 1
      } else {
        ligne.push({ libelle, span: 1, position: p })
      }
      prefixePrecedent = prefixe
    }
    niveaux.push(ligne)
  }
  return niveaux
}

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })

/**
 * Libellé qu'Excel affiche quand un filtre de rapport ne retient rien — et donc
 * tout. Il doit être IDENTIQUE à celui que `libelleFiltre` produit dans le
 * modèle, sinon la liste déroulante ne se voit jamais sur la bonne valeur.
 */
const TOUS = "(Tous)"


/* ═══════════ PUCE DE CHAMP ═══════════ */

/**
 * Une puce de champ, déplaçable. Définie au niveau du module et NON dans le rendu
 * du volet : un composant recréé à chaque rendu change d'identité, React démonte
 * alors sa cellule en plein glissement — le pointeur capturé pointe vers un nœud
 * détaché et le dépôt n'arrive jamais. Défaut trouvé au banc d'essai.
 */
function Puce({
  champ,
  zone,
  agg,
  arme,
  fantome,
  menuOuvert,
  gestes,
  onToggleMenu,
  onChoisirAgg,
  onRetirer,
}: {
  champ: string
  zone: ZoneTcd | null
  agg: PivotAgg
  arme: boolean
  fantome: boolean
  menuOuvert: boolean
  gestes: Record<string, unknown>
  onToggleMenu: () => void
  onChoisirAgg: (agg: PivotAgg) => void
  onRetirer?: () => void
}) {
  const enValeurs = zone === "values"
  return (
    <span
      data-pivot-field={champ}
      data-pivot-placed={zone ?? ""}
      // État « armé » lisible par un test : sans lui, le repli au clic ne se
      // vérifierait qu'à la classe CSS, ce qui casse au moindre ajustement visuel.
      data-pivot-armed={arme ? "1" : undefined}
      className={[
        "group relative inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[11.5px]",
        "cursor-grab select-none bg-white active:cursor-grabbing",
        arme ? "border-emerald-500 ring-2 ring-emerald-300" : "border-neutral-300",
        fantome ? "opacity-50" : "",
      ].join(" ")}
      {...gestes}
    >
      <span className="truncate">{enValeurs ? libelleValeur({ name: champ, agg }) : champ}</span>
      {enValeurs && (
        <button
          type="button"
          data-pivot-agg-menu={champ}
          aria-label={`Paramètres du champ ${champ}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onToggleMenu()
          }}
          className="rounded px-0.5 text-[9px] leading-none text-neutral-500 hover:bg-neutral-100"
        >
          ▼
        </button>
      )}
      {zone && onRetirer && (
        <button
          type="button"
          data-pivot-remove={champ}
          aria-label={`Retirer ${champ}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onRetirer()
          }}
          className="rounded px-0.5 text-[10px] leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      )}
      {enValeurs && menuOuvert && (
        <span
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 flex w-44 flex-col rounded border border-neutral-300 bg-white py-1 shadow-lg"
        >
          <span className="px-2 pb-1 text-[9.5px] uppercase tracking-wide text-neutral-500">
            Paramètres des champs de valeurs
          </span>
          {LIBELLES_AGG.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitemradio"
              aria-checked={a.id === agg}
              data-pivot-agg={a.id}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onChoisirAgg(a.id)
              }}
              className={[
                "px-2 py-1 text-left text-[11.5px] hover:bg-emerald-50",
                a.id === agg ? "font-medium text-emerald-800" : "text-neutral-700",
              ].join(" ")}
            >
              {a.libelle} de {champ}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

/* ═══════════ COMPOSANT ═══════════ */


export default function PivotLayer({
  pivot,
  tableau,
  champs,
  onDropField,
  onSetAgg,
  onRefresh,
  onRemoveField,
  onSetStyle,
  valeursFiltre,
  onSetFilterValues,
  zoneParDefaut,
  className,
}: Props) {
  // État strictement local à l'affichage : glissement en cours, champ armé pour le
  // repli au clic, menu de calcul ouvert, tiroir ouvert sur mobile.
  //
  // Le glissement vit dans une RÉFÉRENCE et non dans un état : `pointerup` doit
  // savoir tout de suite si le doigt s'est déplacé, or un état posé par
  // `pointermove` peut ne pas être encore appliqué au moment du relâchement —
  // vérifié au banc, le dépôt était alors purement et simplement ignoré. L'état
  // `glisseVue` ne sert qu'à griser la puce en cours de déplacement.
  const glisseRef = useRef<{ champ: string; x: number; y: number; deplace: boolean } | null>(null)
  const [glisseVue, setGlisseVue] = useState<{ champ: string; deplace: boolean } | null>(null)
  const [zoneVisee, setZoneVisee] = useState<ZoneTcd | null>(null)
  const [arme, setArme] = useState<string | null>(null)
  const [menuAgg, setMenuAgg] = useState<string | null>(null)
  const [tiroir, setTiroir] = useState(false)
  const [galerie, setGalerie] = useState(true)
  // Horodatage du dernier glissement conclu. Un glissement qui se termine sur la
  // puce d'origine déclenche un `click` que le navigateur envoie quand même : sans
  // ce garde-fou, le champ tout juste déposé serait aussitôt armé. Un DRAPEAU ne
  // suffisait pas — quand le relâchement a lieu ailleurs, aucun `click` n'arrive
  // sur la puce, le drapeau restait levé et avalait le clic suivant, celui de
  // l'apprenant. Défaut trouvé au banc d'essai.
  const dernierGlissement = useRef(0)
  // Retrait des écoutes de glissement, posé le temps du geste.
  const nettoyageRef = useRef<(() => void) | null>(null)

  const placement = useCallback(
    (champ: string): ZoneTcd | null => {
      if (!pivot) return null
      for (const z of ZONES) {
        if ((pivot[z.id] ?? []).some((f) => f.name === champ)) return z.id
      }
      return null
    },
    [pivot],
  )

  const zoneSous = (x: number, y: number): ZoneTcd | null => {
    if (typeof document === "undefined") return null
    const cible = document.elementFromPoint(x, y)
    const hote = cible?.closest?.("[data-pivot-zone]") as HTMLElement | null
    const nom = hote?.dataset?.pivotZone
    return nom ? (nom as ZoneTcd) : null
  }

  const deposer = (champ: string, zone: ZoneTcd) => {
    onDropField(champ, zone)
    setArme(null)
    // Un retour tactile bref confirme le dépôt : sur téléphone, la zone est
    // souvent masquée par le doigt au moment où on relâche.
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(8)
  }

  /**
   * Démarre un glissement. Les écoutes vivent sur `window` et non sur la puce :
   * une fois le doigt sorti de la puce, celle-ci ne reçoit plus rien, et la
   * capture de pointeur ne survit pas au moindre remontage — vérifié au banc, le
   * dépôt n'arrivait jamais. Sur `window`, le geste va jusqu'à son terme.
   */
  const demarrerGlissement = (champ: string, x0: number, y0: number) => {
    glisseRef.current = { champ, x: x0, y: y0, deplace: false }
    setGlisseVue({ champ, deplace: false })

    const surMove = (ev: PointerEvent) => {
      const g = glisseRef.current
      if (!g) return
      // Seuil mesuré depuis l'ORIGINE : un glissement lent ne franchirait jamais
      // un seuil calculé d'un point au suivant.
      const deplace = g.deplace || Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 6
      glisseRef.current = { champ, x: ev.clientX, y: ev.clientY, deplace }
      if (deplace && !g.deplace) setGlisseVue({ champ, deplace: true })
      setZoneVisee(zoneSous(ev.clientX, ev.clientY))
    }
    const surFin = (ev: PointerEvent) => {
      nettoyer()
      const g = glisseRef.current
      glisseRef.current = null
      setGlisseVue(null)
      setZoneVisee(null)
      if (!g || !g.deplace) return
      dernierGlissement.current = Date.now()
      const zone = zoneSous(ev.clientX, ev.clientY)
      if (zone) deposer(champ, zone)
    }
    const nettoyer = () => {
      window.removeEventListener("pointermove", surMove)
      window.removeEventListener("pointerup", surFin)
      window.removeEventListener("pointercancel", surFin)
      nettoyageRef.current = null
    }
    nettoyageRef.current = nettoyer
    window.addEventListener("pointermove", surMove)
    window.addEventListener("pointerup", surFin)
    window.addEventListener("pointercancel", surFin)
  }

  // Un démontage en pleine manipulation ne doit pas laisser d'écoutes derrière lui.
  useEffect(() => () => nettoyageRef.current?.(), [])

  const gestes = (champ: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      demarrerGlissement(champ, e.clientX, e.clientY)
    },
    onClick: () => {
      // Repli, et seul chemin possible au clavier : on arme le champ, puis on
      // active la zone visée.
      if (Date.now() - dernierGlissement.current < 300) return
      setArme((a) => (a === champ ? null : champ))
    },
    // Sans cela, le premier mouvement du doigt fait défiler la page au lieu de
    // déplacer le champ.
    style: { touchAction: "none" as const },
  })

  /* ── Puce de champ ──────────────────────────────────────────────────────── */

  const puce = (champ: string, zone: ZoneTcd | null) => (
    <Puce
      key={`${zone ?? "liste"}-${champ}`}
      champ={champ}
      zone={zone}
      agg={(zone && pivot ? (pivot[zone] ?? []).find((f) => f.name === champ)?.agg : undefined) ?? "somme"}
      arme={arme === champ}
      fantome={glisseVue?.champ === champ && glisseVue.deplace}
      menuOuvert={menuAgg === champ}
      gestes={gestes(champ)}
      onToggleMenu={() => setMenuAgg((m) => (m === champ ? null : champ))}
      onChoisirAgg={(a) => {
        setMenuAgg(null)
        onSetAgg(champ, a)
      }}
      onRetirer={onRemoveField ? () => onRemoveField(champ) : undefined}
    />
  )

  /* ── Volet des champs ───────────────────────────────────────────────────── */

  // `avecTitre` : dans le tiroir mobile, l'en-tête du tiroir porte déjà le titre.
  const voletRendu = (avecTitre: boolean) => (
    <div className="flex h-full w-full flex-col gap-2 overflow-y-auto bg-neutral-50 p-2 text-neutral-800">
      {avecTitre && (
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
          Champs de tableau croisé dynamique
        </div>
      )}

      <div className="rounded border border-neutral-200 bg-white p-1.5">
        <div className="mb-1 text-[10px] text-neutral-500">Choisissez les champs à ajouter au rapport :</div>
        <ul className="flex flex-col gap-0.5">
          {champs.map((champ) => {
            const zone = placement(champ)
            return (
              <li key={champ} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={zone !== null}
                  data-pivot-check={champ}
                  aria-label={champ}
                  onChange={() => {
                    if (zone) onRemoveField?.(champ)
                    else deposer(champ, zoneParDefaut?.(champ) ?? "rows")
                  }}
                  className="h-3 w-3 accent-emerald-600"
                />
                {puce(champ, null)}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Les quatre zones, empilées : à 256 px de volet, deux colonnes tronquent
          « Somme de Montant » — et un libellé tronqué ne s'apprend pas. */}
      <div className="grid grid-cols-1 gap-1.5">
        {ZONES.map((z) => (
          <div
            key={z.id}
            data-pivot-zone={z.id}
            role="button"
            tabIndex={0}
            aria-label={`Zone ${z.titre}`}
            onClick={() => {
              if (arme) deposer(arme, z.id)
            }}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && arme) {
                e.preventDefault()
                deposer(arme, z.id)
              }
            }}
            className={[
              "min-h-[56px] rounded border p-1.5 transition-colors",
              zoneVisee === z.id
                ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300"
                : arme
                  ? "border-dashed border-emerald-400 bg-white"
                  : "border-neutral-200 bg-white",
            ].join(" ")}
          >
            <div className="mb-1 flex items-baseline justify-between gap-1">
              <span className="text-[10.5px] font-semibold text-neutral-700">{z.titre}</span>
              <span className="truncate text-[9px] text-neutral-400">{z.sous}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {(pivot?.[z.id] ?? []).map((f) => puce(f.name, z.id))}
              {(pivot?.[z.id] ?? []).length === 0 && (
                <span className="text-[10px] italic text-neutral-400">
                  {arme ? "Toucher ici pour déposer" : "Déposer un champ ici"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {onSetStyle && (
        <div className="rounded border border-neutral-200 bg-white p-1.5">
          <button
            type="button"
            onClick={() => setGalerie((g) => !g)}
            className="flex w-full items-center justify-between text-[10.5px] font-semibold text-neutral-700"
          >
            <span>Styles de tableau croisé</span>
            <span className="text-[9px] text-neutral-400">{galerie ? "▲" : "▼"}</span>
          </button>
          {galerie && (
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              {STYLES_TCD.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  data-pivot-style={s.id}
                  aria-pressed={(pivot?.styleId ?? 1) === s.id}
                  onClick={() => onSetStyle(s.id)}
                  className={[
                    "overflow-hidden rounded border text-left",
                    (pivot?.styleId ?? 1) === s.id ? "border-emerald-500 ring-1 ring-emerald-300" : "border-neutral-200",
                  ].join(" ")}
                >
                  <span className="block px-1 py-0.5 text-[9px]" style={{ background: s.entete.fond, color: s.entete.texte }}>
                    Style {s.id}
                  </span>
                  <span className="block h-1.5" style={{ background: s.bande || "#ffffff" }} />
                  <span className="block h-1.5" style={{ background: s.total.fond }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  /* ── Rendu du tableau ───────────────────────────────────────────────────── */

  const style = styleTcd(pivot?.styleId)
  const niveaux = tableau ? entetesParNiveau(tableau) : []

  const corps = (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {pivot?.stale && (
        <div className="flex items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          <span>Les données de la source ont changé depuis le dernier calcul.</span>
          <button
            type="button"
            data-pivot-action="refresh"
            onClick={onRefresh}
            className="rounded border border-amber-400 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
          >
            Actualiser
          </button>
        </div>
      )}

      {!tableau || tableau.valeurs.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-300 bg-white p-4 text-center text-[11.5px] text-neutral-500">
          Déposez un champ dans <strong>Lignes</strong> et un champ dans <strong>Valeurs</strong> pour construire le
          tableau.
        </div>
      ) : (
        // Un tableau croisé large doit défiler DANS son cadre : la page, elle, ne
        // défile jamais horizontalement.
        <div className="overflow-x-auto rounded border" style={{ borderColor: style.bordure }}>
          {tableau.filtres.length > 0 && (
            <div className="flex flex-col gap-0.5 border-b p-1.5" style={{ borderColor: style.bordure }}>
              {tableau.filtres.map((f) => (
                <div key={f.champ} className="flex items-center gap-2 text-[11.5px]">
                  <span className="font-semibold">{f.champ}</span>
                  {onSetFilterValues && valeursFiltre ? (
                    // Le filtre de rapport d'Excel est une liste déroulante : c'est
                    // par elle que passe « ne montrez que le Sud ». Une seule valeur
                    // à la fois suffit à ce que le module enseigne.
                    <select
                      data-pivot-filter={f.champ}
                      aria-label={`Filtre ${f.champ}`}
                      value={f.libelle}
                      onChange={(e) =>
                        onSetFilterValues(f.champ, e.target.value === TOUS ? [] : [e.target.value])
                      }
                      className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-neutral-700"
                    >
                      <option value={TOUS}>{TOUS}</option>
                      {valeursFiltre(f.champ).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-neutral-700">
                      {f.libelle}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              {tableau.champsColonnes.length > 0 && (
                <tr>
                  <th
                    className="whitespace-nowrap px-2 py-1 text-left font-semibold"
                    style={{ background: style.entete.fond, color: style.entete.texte }}
                  >
                    {tableau.valeurs.length === 1 ? libelleValeur(tableau.valeurs[0]) : ""}
                  </th>
                  <th
                    colSpan={tableau.colonnes.length}
                    className="whitespace-nowrap px-2 py-1 text-left font-semibold"
                    style={{ background: style.entete.fond, color: style.entete.texte }}
                  >
                    Étiquettes de colonnes
                  </th>
                </tr>
              )}
              {niveaux.map((ligne, niveau) => (
                <tr key={niveau}>
                  {niveau === 0 && (
                    <th
                      rowSpan={niveaux.length}
                      className="whitespace-nowrap px-2 py-1 text-left align-bottom font-semibold"
                      style={{ background: style.entete.fond, color: style.entete.texte }}
                    >
                      {tableau.champsLignes.length > 0 ? "Étiquettes de lignes" : ""}
                    </th>
                  )}
                  {ligne.map((c, i) => (
                    <th
                      key={`${niveau}-${i}`}
                      colSpan={c.span}
                      className="whitespace-nowrap px-2 py-1 text-right font-semibold"
                      style={{
                        background: c.position.total || c.position.sousTotal ? style.total.fond : style.entete.fond,
                        color: c.position.total || c.position.sousTotal ? style.total.texte : style.entete.texte,
                      }}
                    >
                      {c.libelle}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {tableau.lignes.map((pl, i) => (
                <tr
                  key={`${pl.cle.join("§")}-${i}`}
                  style={{
                    background: pl.total
                      ? style.total.fond
                      : style.bande && i % 2 === 1
                        ? style.bande
                        : "transparent",
                    color: pl.total ? style.total.texte : undefined,
                  }}
                >
                  <th
                    scope="row"
                    className={[
                      "whitespace-nowrap px-2 py-1 text-left",
                      pl.total || pl.sousTotal ? "font-semibold" : "font-normal",
                    ].join(" ")}
                    style={{ paddingLeft: `${8 + (pl.total ? 0 : pl.niveau * 14)}px` }}
                  >
                    {pl.libelle}
                  </th>
                  {tableau.colonnes.map((pc, j) => {
                    const v = tableau.cellules[i]?.[j] ?? null
                    const totalise = pl.total || pc.total || pl.sousTotal || pc.sousTotal
                    return (
                      <td
                        key={j}
                        className={["px-2 py-1 text-right tabular-nums", totalise ? "font-semibold" : ""].join(" ")}
                        style={totalise && !pl.total ? { background: style.total.fond, color: style.total.texte } : undefined}
                      >
                        {v === null ? "" : nf.format(v)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  /* ── Assemblage : colonne à droite, tiroir au doigt ─────────────────────── */

  return (
    <div className={["flex w-full flex-col gap-2 md:flex-row md:items-start", className ?? ""].join(" ")}>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Sous 768 px, le volet devient un tiroir : à 390 px, une colonne de
            256 px ne laisserait pas de quoi lire le tableau. */}
        <div className="flex justify-end md:hidden">
          <button
            type="button"
            data-pivot-action="ouvrir-volet"
            onClick={() => setTiroir(true)}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] text-neutral-700"
          >
            Champs du tableau croisé
          </button>
        </div>
        {corps}
      </div>

      {/* Volet en colonne dès 768 px. */}
      <aside className="hidden w-72 shrink-0 self-stretch rounded border border-neutral-200 md:block">{voletRendu(true)}</aside>
      {tiroir && (
        <div className="fixed inset-0 z-40 flex md:hidden" role="dialog" aria-label="Champs de tableau croisé dynamique">
          <div className="flex-1 bg-black/30" onClick={() => setTiroir(false)} />
          <div className="flex w-[86%] max-w-xs flex-col border-l border-neutral-300 bg-neutral-50 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-2 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                Champs de tableau croisé dynamique
              </span>
              <button
                type="button"
                data-pivot-action="fermer-volet"
                onClick={() => setTiroir(false)}
                className="rounded px-1.5 py-0.5 text-[12px] text-neutral-500 hover:bg-neutral-200"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1">{voletRendu(false)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export { ZONES as ZONES_TCD, LIBELLES_AGG }
