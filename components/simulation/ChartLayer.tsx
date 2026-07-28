"use client"

/**
 * Couche visuelle des graphiques : un cadre flottant en SVG, posé au-dessus de la
 * grille.
 *
 * PUREMENT PRÉSENTATIONNEL. Ce composant ne connaît ni le scénario, ni la
 * validation, ni Univer. Il reçoit un `ChartState` et les valeurs déjà lues, il
 * dessine, et il remonte l'élément cliqué. Toute la mesure vit dans
 * `lib/simulation/chart.ts` : la même séparation que le ruban, qui remonte
 * l'identifiant d'un bouton sans savoir si c'était le bon geste.
 *
 * POURQUOI DU SVG ÉCRIT À LA MAIN. Les modules 17 et 18 font sélectionner,
 * mettre en forme et masquer chaque élément du graphique. Il faut donc que chaque
 * élément soit un nœud identifiable, cliquable et surlignable — ce qu'une
 * bibliothèque de graphiques ne concède jamais complètement. Aucune dépendance
 * externe, donc aucun poids ajouté au bundle, et un rendu net à toutes les
 * densités d'écran.
 *
 * POURQUOI ON REMESURE AU LIEU DE METTRE À L'ÉCHELLE. Le cadre est ramené dans
 * les limites de la grille (390 px de large sur un téléphone), puis la géométrie
 * est RECALCULÉE à cette taille. Une transformation d'échelle aurait déformé le
 * texte et les traits, et un graphique illisible n'enseigne rien.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { ChartState } from "@/lib/simulation/types"
import {
  CADRE_DEFAUT,
  cheminBarre,
  disposerGraphique,
  libelleElement,
  type Cadre,
  type DispositionGraphique,
} from "@/lib/simulation/chart"

type Frame = NonNullable<ChartState["frame"]>

type Props = {
  chart: ChartState | null
  /** Valeurs des plages du graphique, indexées par plage ("B2:B7"). */
  valeurs: Record<string, unknown[]>
  onSelectElement: (el: string) => void
  /** Nouveau cadre après un déplacement. Appelé à la fin du geste. */
  onMove?: (frame: Frame) => void
}

/** Marge intérieure minimale entre le cadre et le bord de la grille. */
const MARGE_GRILLE = 6

export default function ChartLayer({ chart, valeurs, onSelectElement, onMove }: Props) {
  const racineRef = useRef<HTMLDivElement | null>(null)
  const [conteneur, setConteneur] = useState({ w: 0, h: 0 })
  /** Cadre courant. Piloté localement pendant le glissement pour rester fluide. */
  const [cadre, setCadre] = useState<Frame>(chart?.frame ?? CADRE_DEFAUT)
  const glissement = useRef<{ x: number; y: number; base: Frame; deplace: boolean } | null>(null)

  // Le cadre du modèle reprend la main dès que l'étape change : une nouvelle
  // leçon doit repartir de la position prévue par son scénario.
  useEffect(() => {
    if (chart?.frame) setCadre(chart.frame)
  }, [chart?.id, chart?.frame])

  // La grille passe de 380 px de haut sur desktop à un conteneur bien plus étroit
  // sur téléphone : on mesure au lieu de supposer.
  useEffect(() => {
    const el = racineRef.current
    if (!el) return
    const mesurer = () => setConteneur({ w: el.clientWidth, h: el.clientHeight })
    mesurer()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const terminerGlissement = useCallback(() => {
    const g = glissement.current
    glissement.current = null
    if (g?.deplace && onMove) onMove(cadre)
  }, [cadre, onMove])

  // Tant que la grille n'est pas mesurée, on ne dessine RIEN : le cadre serait
  // posé à sa position déclarée, donc hors écran sur un téléphone, le temps d'une
  // image. Un graphique qui apparaît une image plus tard est invisible à l'œil ;
  // un graphique qui saute d'un bord à l'autre se voit tout de suite.
  if (!chart || conteneur.w === 0) {
    return <div ref={racineRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" />
  }

  /* ── Cadre ramené dans les limites de la grille ────────────────────────── */
  const dispoW = conteneur.w
  const dispoH = conteneur.h || cadre.h + cadre.y + MARGE_GRILLE
  const largeur = Math.max(180, Math.min(cadre.w, dispoW - MARGE_GRILLE * 2))
  const hauteur = Math.max(130, Math.min(cadre.h, dispoH - MARGE_GRILLE * 2))
  const gauche = Math.max(MARGE_GRILLE, Math.min(cadre.x, dispoW - largeur - MARGE_GRILLE))
  const haut = Math.max(MARGE_GRILLE, Math.min(cadre.y, dispoH - hauteur - MARGE_GRILLE))

  const d = disposerGraphique(chart, valeurs, largeur, hauteur)
  const selection = d.selection
  const idDetourage = `tracage-${chart.id}`

  /* ── Glissement du cadre ───────────────────────────────────────────────── */
  const surPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Un clic sur un élément du graphique le sélectionne : il ne déplace pas le
    // cadre. Seul le fond, la bordure et la poignée déclenchent le déplacement.
    const cible = e.target as HTMLElement | SVGElement
    if (cible.closest?.("[data-chart-element]")) return
    glissement.current = { x: e.clientX, y: e.clientY, base: { ...cadre, x: gauche, y: haut }, deplace: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const surPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = glissement.current
    if (!g) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    // Seuil de 3 px : sans lui, un clic un peu tremblant déplacerait le
    // graphique au lieu de sélectionner, ce qui est très déroutant au doigt.
    if (!g.deplace && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    g.deplace = true
    setCadre({
      ...g.base,
      x: Math.max(MARGE_GRILLE, Math.min(g.base.x + dx, dispoW - largeur - MARGE_GRILLE)),
      y: Math.max(MARGE_GRILLE, Math.min(g.base.y + dy, dispoH - hauteur - MARGE_GRILLE)),
    })
  }

  const choisir = (element: string) => (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    onSelectElement(element)
  }
  const auClavier = (element: string) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    onSelectElement(element)
  }

  /** Attributs communs à tout élément sélectionnable. */
  const selectionnable = (element: string, focusable = true) => ({
    "data-chart-element": element,
    role: "button" as const,
    "aria-label": libelleElement(element, chart),
    tabIndex: focusable ? 0 : undefined,
    onClick: choisir(element),
    onKeyDown: auClavier(element),
    style: { cursor: "pointer" as const, outline: "none" },
  })

  /**
   * Marque de données : barre, point ou part. Le premier clic sélectionne la SÉRIE
   * entière, le second le point isolé — la règle d'Excel, et celle que les leçons
   * enseignent (« un second clic descend d'un cran »). Sans cette progression, un
   * point ne serait jamais atteignable autrement qu'au hasard.
   */
  const marque = (serieElement: string, elementMarque: string, etiquette: string) => ({
    "data-chart-element": elementMarque,
    role: "button" as const,
    "aria-label": etiquette,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      onSelectElement(selection === serieElement || selection === elementMarque ? elementMarque : serieElement)
    },
    style: { cursor: "pointer" as const, outline: "none" },
  })

  const encre = d.style.encre
  const trait = d.style.trait

  return (
    <div ref={racineRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div
        className="pointer-events-auto absolute select-none rounded-[3px] border border-neutral-300 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.10)]"
        style={{ left: gauche, top: haut, width: largeur, height: hauteur, touchAction: "none" }}
        onPointerDown={surPointerDown}
        onPointerMove={surPointerMove}
        onPointerUp={terminerGlissement}
        onPointerCancel={terminerGlissement}
      >
        <svg
          width={largeur}
          height={hauteur}
          viewBox={`0 0 ${largeur} ${hauteur}`}
          role="img"
          aria-label={`Graphique : ${chart.title ?? "sans titre"}`}
          style={{ display: "block", cursor: "move" }}
        >
          {d.style.fond && <rect x={0} y={0} width={largeur} height={hauteur} fill={d.style.fond} />}

          {/* Quadrillage : cliquable en un seul bloc, comme dans Excel. */}
          {d.quadrillage.length > 0 && (
            <g {...selectionnable("quadrillage")}>
              {d.quadrillage.map((l, i) => (
                <g key={i}>
                  {/* Préhension élargie : une ligne d'un pixel ne se vise pas au doigt. */}
                  <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="transparent" strokeWidth={7} />
                  <line
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke={trait}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                </g>
              ))}
            </g>
          )}

          {/* Séries : aires, puis lignes, puis marques. */}
          {d.series.map((s) => (
            <g key={s.element}>
              {s.aire && <path d={s.aire} fill={s.couleur} fillOpacity={0.22} stroke="none" />}

              {s.ligne && (
                <g {...selectionnable(s.element)}>
                  {/* Zone de préhension large : une courbe de 2 px est
                      impossible à viser au doigt. */}
                  <path d={s.ligne} fill="none" stroke="transparent" strokeWidth={14} strokeLinecap="round" />
                  <path
                    d={s.ligne}
                    fill="none"
                    stroke={s.couleur}
                    strokeWidth={selection === s.element ? 2.8 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              )}

              {s.barres.map((b) => (
                <path
                  key={b.element}
                  d={cheminBarre(b)}
                  fill={s.couleur}
                  fillOpacity={selection === s.element || selection === b.element ? 1 : 0.92}
                  stroke={selection === b.element ? encre : "none"}
                  strokeWidth={selection === b.element ? 1 : 0}
                  {...marque(s.element, b.element, `${s.nom}, ${b.categorie} : ${b.valeur}`)}
                />
              ))}

              {s.parts.map((p) => (
                <path
                  key={p.element}
                  d={p.d}
                  fill={p.couleur}
                  stroke="#ffffff"
                  strokeWidth={selection === p.element ? 2.5 : 1}
                  {...marque(s.element, p.element, `${p.categorie} : ${p.valeur}`)}
                />
              ))}

              {s.points.map((p) => (
                <g key={p.element} {...marque(s.element, p.element, `${s.nom}, ${p.categorie} : ${p.valeur}`)}>
                  <circle cx={p.cx} cy={p.cy} r={9} fill="transparent" />
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r={selection === p.element ? 4.5 : 3.2}
                    fill={s.couleur}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                </g>
              ))}

              {/* Courbe de tendance : toujours en pointillé, comme Excel, pour
                  qu'on ne la confonde jamais avec une donnée réelle. */}
              {s.tendance && (
                <path
                  d={s.tendance.d}
                  fill="none"
                  stroke={s.couleur}
                  strokeWidth={1.6}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  clipPath={`url(#${idDetourage})`}
                />
              )}

            </g>
          ))}

          <clipPath id={idDetourage}>
            <rect x={d.tracage.x} y={d.tracage.y} width={d.tracage.w} height={d.tracage.h} />
          </clipPath>

          {/* Étiquettes de données, au-dessus des marques. */}
          {d.series.map((s) =>
            [...s.barres, ...s.points, ...s.parts].map((m) =>
              m.etiquette ? (
                <text
                  key={`et-${m.element}`}
                  x={m.etiquette.x}
                  y={m.etiquette.y}
                  textAnchor={m.etiquette.ancrage}
                  fontSize={d.police.etiquettes}
                  fill={"part" in m ? "#ffffff" : encre}
                  style={{ pointerEvents: "none" }}
                >
                  {m.etiquette.texte}
                </text>
              ) : null,
            ),
          )}

          {/* Axes. */}
          {d.axeX && <Axe axe={d.axeX} element="axe-x" police={d.police.axes} encre={encre} trait={trait} attrs={selectionnable("axe-x")} />}
          {d.axeY && <Axe axe={d.axeY} element="axe-y" police={d.police.axes} encre={encre} trait={trait} attrs={selectionnable("axe-y")} />}

          {/* Titre. */}
          {d.titre && (
            <g {...selectionnable("titre")}>
              <rect
                x={d.cadres["titre"]?.x ?? 0}
                y={d.cadres["titre"]?.y ?? 0}
                width={d.cadres["titre"]?.w ?? 0}
                height={d.cadres["titre"]?.h ?? 0}
                fill="transparent"
              />
              <text
                x={d.titre.x}
                y={d.titre.y}
                textAnchor="middle"
                fontSize={d.police.titre}
                fontWeight={600}
                fill={encre}
              >
                {d.titre.texte}
              </text>
            </g>
          )}

          {/* Légende. */}
          {d.legende && (
            <g {...selectionnable("legende")}>
              <rect
                x={d.legende.cadre.x}
                y={d.legende.cadre.y}
                width={d.legende.cadre.w}
                height={d.legende.cadre.h}
                fill="transparent"
              />
              {d.legende.entrees.map((e, i) => (
                <g key={`${e.element}-${i}`}>
                  {e.tendance ? (
                    <line
                      x1={e.x}
                      y1={e.y}
                      x2={e.x + d.legende!.pastille}
                      y2={e.y}
                      stroke={e.couleur}
                      strokeWidth={1.6}
                      strokeDasharray="4 3"
                    />
                  ) : (
                    <rect
                      x={e.x}
                      y={e.y - d.legende!.pastille / 2}
                      width={d.legende!.pastille}
                      height={d.legende!.pastille}
                      rx={1}
                      fill={e.couleur}
                    />
                  )}
                  <text
                    x={e.x + d.legende!.pastille + 5}
                    y={e.y + d.police.legende * 0.35}
                    fontSize={d.police.legende}
                    fill={encre}
                  >
                    {e.etiquette}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Poignées de sélection : le repère visuel d'Excel, huit carrés
              blancs sur le pourtour de l'élément sélectionné. */}
          {selection && d.cadres[selection] && <Poignees cadre={d.cadres[selection]} encre={encre} />}
        </svg>
      </div>
    </div>
  )
}

/** Un axe : sa ligne, ses graduations, son titre éventuel. */
function Axe({
  axe,
  element,
  police,
  encre,
  trait,
  attrs,
}: {
  axe: NonNullable<DispositionGraphique["axeX"]>
  element: string
  police: number
  encre: string
  trait: string
  attrs: Record<string, unknown>
}) {
  return (
    <g {...attrs}>
      <rect x={axe.cadre.x} y={axe.cadre.y} width={Math.max(4, axe.cadre.w)} height={Math.max(4, axe.cadre.h)} fill="transparent" />
      <line
        x1={axe.ligne.x1}
        y1={axe.ligne.y1}
        x2={axe.ligne.x2}
        y2={axe.ligne.y2}
        stroke={trait}
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
      {axe.graduations.map((g, i) => (
        <g key={`${element}-${i}`}>
          {g.trait && (
            <line x1={g.trait.x1} y1={g.trait.y1} x2={g.trait.x2} y2={g.trait.y2} stroke={trait} strokeWidth={1} />
          )}
          <text x={g.x} y={g.y} textAnchor={axe.ancrage} fontSize={police} fill={encre}>
            {g.libelle}
          </text>
        </g>
      ))}
      {axe.titre && (
        <text
          x={axe.titre.x}
          y={axe.titre.y}
          textAnchor="middle"
          fontSize={police}
          fill={encre}
          transform={axe.titre.vertical ? `rotate(-90 ${axe.titre.x} ${axe.titre.y})` : undefined}
        >
          {axe.titre.texte}
        </text>
      )}
    </g>
  )
}

/**
 * Poignées de sélection. Le rectangle est légèrement dilaté et sa taille
 * minimale garantie : sur un point de courbe, huit poignées collées les unes aux
 * autres ne se verraient pas.
 */
function Poignees({ cadre, encre }: { cadre: Cadre; encre: string }) {
  const marge = 3
  const w = Math.max(12, cadre.w + marge * 2)
  const h = Math.max(12, cadre.h + marge * 2)
  const x = cadre.x - marge - Math.max(0, 12 - (cadre.w + marge * 2)) / 2
  const y = cadre.y - marge - Math.max(0, 12 - (cadre.h + marge * 2)) / 2
  const t = 5
  const positions: Array<[number, number]> = [
    [x, y],
    [x + w / 2, y],
    [x + w, y],
    [x, y + h / 2],
    [x + w, y + h / 2],
    [x, y + h],
    [x + w / 2, y + h],
    [x + w, y + h],
  ]
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={encre}
        strokeOpacity={0.45}
        strokeWidth={1}
        strokeDasharray="3 2"
      />
      {positions.map(([px, py], i) => (
        <rect
          key={i}
          x={px - t / 2}
          y={py - t / 2}
          width={t}
          height={t}
          fill="#ffffff"
          stroke={encre}
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      ))}
    </g>
  )
}
