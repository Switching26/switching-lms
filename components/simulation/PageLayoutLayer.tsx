"use client"

/**
 * Couche visuelle de la mise en page (module 13).
 *
 * Purement PRÉSENTATIONNELLE : elle ne connaît ni le scénario, ni la validation,
 * ni Univer. Elle reçoit l'état d'impression, la pagination déjà calculée par
 * `lib/simulation/pagesetup.ts`, et la métrique de la grille ; elle dessine, et
 * elle remonte des intentions par `onChange`. C'est la même séparation que
 * `SimulationChrome` : on peut ajouter un réglage sans toucher à la pédagogie.
 *
 * Deux conséquences pour qui la câble :
 *
 * 1. `onChange` PROPOSE un réglage, il ne l'applique pas. Pendant une étape, le
 *    simulateur doit appliquer le `setup.pageSetup` déclaré par le scénario, pas
 *    le patch proposé ici — sinon un apprenant qui bricole le panneau pourrait
 *    valider une étape sans avoir fait le geste demandé.
 *
 * 2. La couche annote la grille vivante, elle ne la reflue pas. En mode Mise en
 *    page, chaque feuille de papier est positionnée pour que sa ZONE UTILE tombe
 *    exactement sur la bande de lignes et de colonnes correspondante ; les marges,
 *    l'en-tête et le pied sont peints par-dessus les lignes voisines, qui sont
 *    précisément celles qui n'appartiennent pas à cette page. Excel, lui, écarte
 *    vraiment les feuilles — nous les recouvrons. C'est le seul écart, il est
 *    volontaire : il garantit que ce que l'apprenant voit dans une cellule reste
 *    la vraie cellule, jamais une copie qui pourrait mentir.
 */

import { useMemo, useRef, useState } from "react"
import type { PageSetupState } from "@/lib/simulation/types"
import {
  ECHELLE_MAX,
  ECHELLE_MIN,
  PIXELS_PAR_CM,
  PRESETS_MARGES,
  cumulPx,
  miseEnPageTouchee,
  rendreZone,
  type Pagination,
} from "@/lib/simulation/pagesetup"

/** Dimensions réelles lues sur la grille, en pixels. */
export type MetriqueGrille = {
  /** Largeur de chaque colonne, indexée de 0. */
  colonnes: number[]
  /** Hauteur de chaque ligne, indexée de 0. */
  lignes: number[]
  /** Largeur de l'en-tête de lignes : abscisse de la colonne A. */
  offsetX: number
  /** Hauteur de l'en-tête de colonnes : ordonnée de la ligne 1. */
  offsetY: number
}

type Props = {
  pageSetup: PageSetupState
  pages: Pagination
  metrique: MetriqueGrille
  /** Réglage proposé par l'apprenant. Voir l'avertissement en tête de fichier. */
  onChange?: (patch: PageSetupState) => void
  /** Pour rendre &F et &A dans l'aperçu d'en-tête. Facultatif. */
  fichier?: string
  feuille?: string
  /** Injectable pour que &D et &T soient reproductibles en test. */
  date?: Date
}

const DEFAUT_COLONNE = 88
const DEFAUT_LIGNE = 24
/** Largeur de la gouttière grise entre deux feuilles, en pixels. */
const GOUTTIERE = 16

export default function PageLayoutLayer({
  pageSetup,
  pages,
  metrique,
  onChange,
  fichier,
  feuille,
  date,
}: Props) {
  const [tiroirOuvert, setTiroirOuvert] = useState(false)
  const [zoneEditee, setZoneEditee] = useState<"header" | "footer" | null>(null)
  const [caseEditee, setCaseEditee] = useState<"gauche" | "centre" | "droite">("centre")
  const vue = pageSetup.view ?? "normal"

  /** Abscisse du bord GAUCHE d'une colonne, dans le repère de la grille. */
  const x = (colonne: number) => metrique.offsetX + cumulPx(metrique.colonnes, colonne, DEFAUT_COLONNE)
  /** Ordonnée du bord HAUT d'une ligne. */
  const y = (ligne: number) => metrique.offsetY + cumulPx(metrique.lignes, ligne, DEFAUT_LIGNE)

  const patch = (p: PageSetupState) => onChange?.(p)

  return (
    <>
      {/* ── Annotations sur la grille ─────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={vue === "normal"}>
        {vue === "normal" && <RupturesDiscretes pageSetup={pageSetup} pages={pages} x={x} y={y} />}
        {vue === "mise-en-page" && (
          <FeuillesDePapier
            pageSetup={pageSetup}
            pages={pages}
            metrique={metrique}
            x={x}
            y={y}
            fichier={fichier}
            feuille={feuille}
            date={date}
            onZone={(z) => {
              setZoneEditee(z)
              setCaseEditee("gauche")
            }}
          />
        )}
        {vue === "sauts-de-page" && (
          <ApercuDesSauts pageSetup={pageSetup} pages={pages} metrique={metrique} x={x} y={y} onChange={patch} />
        )}
      </div>

      {/* ── Panneau de réglages ───────────────────────────────────────────── */}
      {/* Desktop : carte latérale. Mobile (390 px) : tiroir, sinon le panneau
          mangerait toute la largeur et la grille deviendrait inutilisable. */}
      <div
        className="pointer-events-auto absolute right-2 top-2 z-20 hidden w-[240px] overflow-y-auto md:block"
        style={{ maxHeight: "calc(100% - 1rem)" }}
      >
        <PanneauReglages pageSetup={pageSetup} pages={pages} onChange={patch} onEnteteEtPied={() => setZoneEditee("header")} />
      </div>

      <button
        type="button"
        data-control="mep-panneau"
        aria-label="Réglages de mise en page"
        onClick={() => setTiroirOuvert(true)}
        className="pointer-events-auto absolute bottom-3 right-3 z-20 rounded-full bg-emerald-700 px-3.5 py-2 text-[12px] font-medium text-white shadow-lg md:hidden"
      >
        Mise en page
      </button>

      {tiroirOuvert && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col justify-end md:hidden">
          <button
            type="button"
            aria-label="Fermer les réglages"
            onClick={() => setTiroirOuvert(false)}
            className="flex-1 bg-neutral-900/40"
          />
          <div className="max-h-[78%] overflow-y-auto rounded-t-2xl bg-white p-3 shadow-2xl">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-300" />
            <PanneauReglages
              pageSetup={pageSetup}
              pages={pages}
              onChange={patch}
              onEnteteEtPied={() => {
                setZoneEditee("header")
                setTiroirOuvert(false)
              }}
            />
          </div>
        </div>
      )}

      {/* ── Éditeur d'en-tête et de pied ──────────────────────────────────── */}
      {zoneEditee && (
        <EditeurEnteteEtPied
          pageSetup={pageSetup}
          zone={zoneEditee}
          caseActive={caseEditee}
          onZone={setZoneEditee}
          onCase={setCaseEditee}
          onChange={patch}
          onFermer={() => setZoneEditee(null)}
        />
      )}
    </>
  )
}

/* ═══════════ VUE NORMALE : les pointillés d'Excel ═══════════ */

/**
 * Excel n'affiche ces pointillés qu'une fois la feuille mise en page ou imprimée.
 * Reproduire cette discrétion évite de couvrir les vingt-six autres modules de
 * traits que personne n'a demandés.
 */
function RupturesDiscretes({
  pageSetup,
  pages,
  x,
  y,
}: {
  pageSetup: PageSetupState
  pages: Pagination
  x: (c: number) => number
  y: (l: number) => number
}) {
  if (!miseEnPageTouchee(pageSetup)) return null
  const manuellesL = new Set(pages.rupturesLignesManuelles)
  const manuellesC = new Set(pages.rupturesColonnesManuelles)
  return (
    <>
      {pages.rupturesLignes.map((ligne) => (
        <div
          key={`l${ligne}`}
          data-rupture-ligne={ligne}
          className="absolute left-0 right-0"
          style={{
            top: y(ligne),
            borderTop: manuellesL.has(ligne) ? "1px solid #94a3b8" : "1px dashed #94a3b8",
          }}
        />
      ))}
      {pages.rupturesColonnes.map((colonne) => (
        <div
          key={`c${colonne}`}
          data-rupture-colonne={colonne}
          className="absolute bottom-0 top-0"
          style={{
            left: x(colonne),
            borderLeft: manuellesC.has(colonne) ? "1px solid #94a3b8" : "1px dashed #94a3b8",
          }}
        />
      ))}
    </>
  )
}

/* ═══════════ VUE MISE EN PAGE : les feuilles de papier ═══════════ */

function FeuillesDePapier({
  pageSetup,
  pages,
  metrique,
  x,
  y,
  fichier,
  feuille,
  date,
  onZone,
}: {
  pageSetup: PageSetupState
  pages: Pagination
  metrique: MetriqueGrille
  x: (c: number) => number
  y: (l: number) => number
  fichier?: string
  feuille?: string
  date?: Date
  onZone: (z: "header" | "footer") => void
}) {
  const m = pages.margesPx
  const largeurTotale = x(metrique.colonnes.length)

  return (
    <>
      {/* Règle horizontale en centimètres : c'est elle qui rend les marges
          tangibles, et le module parle en centimètres du début à la fin. */}
      <Regle largeurPx={largeurTotale} debutX={metrique.offsetX} />

      {pages.pages.map((page) => {
        const gauche = x(page.colonneDebut)
        const haut = y(page.ligneDebut)
        const droite = x(page.colonneFin + 1)
        const bas = y(page.ligneFin + 1)
        const premiere = page.bandeLigne === 0 && page.bandeColonne === 0
        const ctx = { page: page.numero, total: pages.nombrePages, fichier, feuille, date }
        const entete = rendreZone(pageSetup.header, ctx)
        const pied = rendreZone(pageSetup.footer, ctx)

        return (
          <div key={page.numero}>
            {/* Le papier : sa zone utile épouse la bande, les marges débordent. */}
            <div
              data-page={page.numero}
              className="absolute rounded-[2px] ring-1 ring-neutral-300"
              style={{
                left: gauche - m.gauche,
                top: haut - m.haut,
                width: droite - gauche + m.gauche + m.droite,
                height: bas - haut + m.haut + m.bas,
                boxShadow: "0 1px 6px rgba(0,0,0,.10)",
              }}
            />
            {/* Marges opaques : elles masquent les lignes hors page, et ce sont
                elles qui donnent la sensation de feuille séparée. */}
            <BandeMarge left={gauche - m.gauche} top={haut - m.haut} width={droite - gauche + m.gauche + m.droite} height={m.haut} />
            <BandeMarge left={gauche - m.gauche} top={bas} width={droite - gauche + m.gauche + m.droite} height={m.bas} />
            <BandeMarge left={gauche - m.gauche} top={haut} width={m.gauche} height={bas - haut} />
            <BandeMarge left={droite} top={haut} width={m.droite} height={bas - haut} />

            {/* Limite de la zone imprimable : le trait que l'on cherche des yeux. */}
            <div
              className="absolute border border-dashed border-neutral-300"
              style={{ left: gauche, top: haut, width: droite - gauche, height: bas - haut }}
            />

            {/* Zones d'en-tête et de pied, cliquables : c'est l'« autre chemin »
                du chapitre 4, celui qui n'ouvre aucune boîte de dialogue. */}
            <ZoneEntete
              left={gauche}
              top={haut - m.haut}
              width={droite - gauche}
              height={m.haut}
              textes={entete}
              placeholder="Cliquez pour ajouter un en-tête"
              control="mep-zone-entete"
              actif={premiere}
              onClick={() => onZone("header")}
            />
            <ZoneEntete
              left={gauche}
              top={bas}
              width={droite - gauche}
              height={m.bas}
              textes={pied}
              placeholder="Cliquez pour ajouter un pied de page"
              control="mep-zone-pied"
              actif={premiere}
              onClick={() => onZone("footer")}
            />

            {/* Gouttière sous la feuille : la séparation visible entre deux pages. */}
            {page.bandeLigne < pages.bandesLignes.length - 1 && (
              <div
                className="absolute bg-neutral-200"
                style={{ left: gauche - m.gauche, top: bas + m.bas, width: droite - gauche + m.gauche + m.droite, height: GOUTTIERE }}
              />
            )}
            {page.bandeColonne < pages.bandesColonnes.length - 1 && (
              <div
                className="absolute bg-neutral-200"
                style={{ left: droite + m.droite, top: haut - m.haut, width: GOUTTIERE, height: bas - haut + m.haut + m.bas }}
              />
            )}

            {/* Rappel des titres réimprimés : sans lui, l'apprenant croit que la
                page 2 a perdu ses en-têtes alors que le réglage les y remet. */}
            {(page.lignesRepetees.length > 0 || page.colonnesRepetees.length > 0) && page.bandeLigne > 0 && (
              <div
                className="absolute rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-medium text-white"
                style={{ left: gauche + 4, top: haut + 3 }}
              >
                + titres répétés
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function BandeMarge({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  return <div className="absolute bg-white" style={{ left, top, width, height: Math.max(0, height) }} />
}

function ZoneEntete({
  left,
  top,
  width,
  height,
  textes,
  placeholder,
  control,
  actif,
  onClick,
}: {
  left: number
  top: number
  width: number
  height: number
  textes: { gauche: string; centre: string; droite: string }
  placeholder: string
  control: string
  actif: boolean
  onClick: () => void
}) {
  const vide = !textes.gauche && !textes.centre && !textes.droite
  return (
    <button
      type="button"
      data-control={control}
      aria-label={placeholder}
      onClick={onClick}
      className="pointer-events-auto absolute flex items-center gap-1 px-1 text-[10px] text-neutral-500 hover:bg-emerald-50/70"
      style={{ left, top, width, height: Math.max(0, height) }}
    >
      {vide ? (
        <span className={actif ? "mx-auto italic text-neutral-400" : "sr-only"}>{placeholder}</span>
      ) : (
        <>
          <span className="flex-1 truncate text-left">{textes.gauche}</span>
          <span className="flex-1 truncate text-center">{textes.centre}</span>
          <span className="flex-1 truncate text-right">{textes.droite}</span>
        </>
      )}
    </button>
  )
}

function Regle({ largeurPx, debutX }: { largeurPx: number; debutX: number }) {
  const graduations = Math.max(0, Math.floor((largeurPx - debutX) / PIXELS_PAR_CM))
  return (
    <div className="absolute left-0 top-0 h-4 bg-neutral-100" style={{ width: largeurPx }}>
      {Array.from({ length: graduations + 1 }, (_, i) => (
        <div key={i} className="absolute top-0 h-full border-l border-neutral-400" style={{ left: debutX + i * PIXELS_PAR_CM }}>
          <span className="ml-0.5 text-[8px] leading-none text-neutral-500">{i}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════ VUE SAUTS DE PAGE ═══════════ */

/**
 * La vue où l'on négocie avec Excel. Les sauts automatiques sont en pointillés,
 * les manuels en trait plein, et tous se déplacent au glisser — c'est ce geste,
 * plus que la commande du ruban, qui fait comprendre qu'un saut est déplaçable.
 */
function ApercuDesSauts({
  pageSetup,
  pages,
  metrique,
  x,
  y,
  onChange,
}: {
  pageSetup: PageSetupState
  pages: Pagination
  metrique: MetriqueGrille
  x: (c: number) => number
  y: (l: number) => number
  onChange: (p: PageSetupState) => void
}) {
  const manuellesL = useMemo(() => new Set(pages.rupturesLignesManuelles), [pages.rupturesLignesManuelles])
  const manuellesC = useMemo(() => new Set(pages.rupturesColonnesManuelles), [pages.rupturesColonnesManuelles])

  return (
    <>
      {/* Filigrane : le numéro de page au centre de chaque page. */}
      {pages.pages.map((page) => {
        const gauche = x(page.colonneDebut)
        const haut = y(page.ligneDebut)
        const droite = x(page.colonneFin + 1)
        const bas = y(page.ligneFin + 1)
        return (
          <div
            key={page.numero}
            data-filigrane={page.numero}
            className="absolute flex items-center justify-center"
            style={{ left: gauche, top: haut, width: droite - gauche, height: bas - haut }}
          >
            {/* Taille en style inline : une valeur arbitraire Tailwind contenant
                des virgules ne survit pas au parseur de classes. */}
            <span
              className="select-none font-bold text-neutral-300/70"
              style={{ fontSize: "clamp(18px, 6vw, 54px)" }}
            >
              Page {page.numero}
            </span>
          </div>
        )
      })}

      {/* Bord extérieur de la zone paginée : Excel le trace en bleu épais. */}
      <div
        className="absolute border-2 border-blue-600"
        style={{
          left: x(pages.etendue.colonneDebut),
          top: y(pages.etendue.ligneDebut),
          width: x(pages.etendue.colonneFin + 1) - x(pages.etendue.colonneDebut),
          height: y(pages.etendue.ligneFin + 1) - y(pages.etendue.ligneDebut),
        }}
      />

      {pages.rupturesLignes.map((ligne) => (
        <TraitDeployable
          key={`l${ligne}`}
          sens="horizontal"
          index={ligne}
          manuel={manuellesL.has(ligne)}
          position={y(ligne)}
          tailles={metrique.lignes}
          offset={metrique.offsetY}
          defaut={DEFAUT_LIGNE}
          onDeplacer={(cible) => {
            const autres = (pageSetup.pageBreakRows ?? []).filter((n) => n !== ligne)
            onChange({ pageBreakRows: [...autres, cible] })
          }}
        />
      ))}
      {pages.rupturesColonnes.map((colonne) => (
        <TraitDeployable
          key={`c${colonne}`}
          sens="vertical"
          index={colonne}
          manuel={manuellesC.has(colonne)}
          position={x(colonne)}
          tailles={metrique.colonnes}
          offset={metrique.offsetX}
          defaut={DEFAUT_COLONNE}
          onDeplacer={(cible) => {
            const autres = (pageSetup.pageBreakCols ?? []).filter((n) => n !== colonne)
            onChange({ pageBreakCols: [...autres, cible] })
          }}
        />
      ))}
    </>
  )
}

/**
 * Un saut de page attrapable. Déplacer un saut AUTOMATIQUE le transforme en saut
 * manuel : c'est le comportement d'Excel, et c'est aussi ce que l'apprenant croit
 * faire — il n'imagine pas être en train de « créer » quelque chose.
 */
function TraitDeployable({
  sens,
  index,
  manuel,
  position,
  tailles,
  offset,
  defaut,
  onDeplacer,
}: {
  sens: "horizontal" | "vertical"
  index: number
  manuel: boolean
  position: number
  tailles: number[]
  offset: number
  defaut: number
  onDeplacer: (cible: number) => void
}) {
  const [glisse, setGlisse] = useState<number | null>(null)
  const depart = useRef(0)

  const horizontal = sens === "horizontal"
  const trait = manuel ? "2px solid #2563eb" : "2px dashed #60a5fa"
  const courant = glisse ?? position

  const auPointeur = (client: number) => {
    const cible = indexDepuisPosition(tailles, offset, client - depart.current + position, defaut)
    return Math.max(1, cible)
  }

  return (
    <div
      data-saut={`${sens}-${index}`}
      data-saut-manuel={manuel ? "1" : "0"}
      role="separator"
      aria-label={`Saut de page ${manuel ? "manuel" : "automatique"} ${horizontal ? "avant la ligne" : "avant la colonne"} ${index + 1}`}
      className={`pointer-events-auto absolute z-10 ${horizontal ? "left-0 right-0 cursor-row-resize" : "bottom-0 top-0 cursor-col-resize"}`}
      style={
        horizontal
          ? { top: courant - 4, height: 9, borderTop: trait }
          : { left: courant - 4, width: 9, borderLeft: trait }
      }
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        depart.current = horizontal ? e.clientY : e.clientX
        setGlisse(position)
      }}
      onPointerMove={(e) => {
        if (glisse === null) return
        const client = horizontal ? e.clientY : e.clientX
        setGlisse(position + (client - depart.current))
      }}
      onPointerUp={(e) => {
        if (glisse === null) return
        const client = horizontal ? e.clientY : e.clientX
        setGlisse(null)
        onDeplacer(auPointeur(client))
      }}
    />
  )
}

/** Quelle ligne (ou colonne) commence à cette position ? */
function indexDepuisPosition(tailles: number[], offset: number, position: number, defaut: number): number {
  let cumul = offset
  for (let i = 0; i < tailles.length; i++) {
    const t = Number.isFinite(tailles[i]) && tailles[i] > 0 ? tailles[i] : defaut
    // On bascule sur l'index suivant passé la moitié : c'est ce qui donne
    // l'impression que le trait « colle » à la ligne la plus proche.
    if (position < cumul + t / 2) return i
    cumul += t
  }
  return tailles.length
}

/* ═══════════ PANNEAU DE RÉGLAGES ═══════════ */

function PanneauReglages({
  pageSetup,
  pages,
  onChange,
  onEnteteEtPied,
}: {
  pageSetup: PageSetupState
  pages: Pagination
  onChange: (p: PageSetupState) => void
  onEnteteEtPied: () => void
}) {
  const marges = pageSetup.margins ?? PRESETS_MARGES.normales
  const ajuste = pageSetup.scaleToFit !== undefined

  return (
    <div className="rounded-lg border border-neutral-300 bg-white/95 p-2.5 text-[11px] text-neutral-700 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Mise en page</span>
        <span className="text-[10px] text-neutral-500">
          {pages.nombrePages} page{pages.nombrePages > 1 ? "s" : ""} · {Math.round(pages.echelle * 100)} %
        </span>
      </div>

      <Groupe titre="Affichage">
        <Choix
          valeur={pageSetup.view ?? "normal"}
          options={[
            ["normal", "Normal", "aff-mode-normal"],
            ["mise-en-page", "Mise en page", "aff-mode-mise-en-page"],
            ["sauts-de-page", "Sauts de page", "aff-mode-sauts-de-page"],
          ]}
          onChoisir={(v) => onChange({ view: v as PageSetupState["view"] })}
        />
      </Groupe>

      <Groupe titre="Orientation">
        <Choix
          valeur={pageSetup.orientation ?? "portrait"}
          options={[
            ["portrait", "Portrait", "mep-orientation-portrait"],
            ["paysage", "Paysage", "mep-orientation-paysage"],
          ]}
          onChoisir={(v) => onChange({ orientation: v as PageSetupState["orientation"] })}
        />
      </Groupe>

      <Groupe titre="Format">
        <Choix
          valeur={pageSetup.format ?? "A4"}
          options={[
            ["A4", "A4", "mep-format-a4"],
            ["A3", "A3", "mep-format-a3"],
            ["Letter", "Letter", "mep-format-letter"],
          ]}
          onChoisir={(v) => onChange({ format: v as PageSetupState["format"] })}
        />
      </Groupe>

      <Groupe titre={`Marges — ${marges.haut} / ${marges.bas} / ${marges.gauche} / ${marges.droite} cm`}>
        <Choix
          valeur={nomDuPreset(marges)}
          options={[
            ["normales", "Normales", "mep-marges-normales"],
            ["larges", "Larges", "mep-marges-larges"],
            ["etroites", "Étroites", "mep-marges-etroites"],
          ]}
          onChoisir={(v) => onChange({ margins: PRESETS_MARGES[v as keyof typeof PRESETS_MARGES] })}
        />
      </Groupe>

      <Groupe titre="Mise à l'échelle">
        {/* Les deux réglages s'excluent : on grise celui qui ne pilote pas, comme
            Excel, plutôt que de laisser croire qu'ils s'additionnent. */}
        <label className="mb-1 flex items-center justify-between gap-2">
          <span className={ajuste ? "text-neutral-400" : ""}>Échelle</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              data-control="mep-echelle"
              aria-label="Échelle en pourcentage"
              min={ECHELLE_MIN}
              max={ECHELLE_MAX}
              disabled={ajuste}
              value={pageSetup.scale ?? Math.round(pages.echelle * 100)}
              onChange={(e) => onChange({ scale: Number(e.target.value) })}
              className="w-14 rounded border border-neutral-300 px-1 py-0.5 text-right disabled:bg-neutral-100 disabled:text-neutral-400"
            />
            <span className="text-neutral-500">%</span>
          </span>
        </label>
        <label className="mb-1 flex items-center justify-between gap-2">
          <span>Ajuster, largeur</span>
          <select
            data-control="mep-ajuster-largeur"
            aria-label="Ajuster à N pages en largeur"
            value={pageSetup.scaleToFit?.largeur ?? ""}
            onChange={(e) =>
              onChange({
                scaleToFit: { ...pageSetup.scaleToFit, largeur: e.target.value ? Number(e.target.value) : undefined },
              })
            }
            className="w-20 rounded border border-neutral-300 px-1 py-0.5"
          >
            <option value="">Auto</option>
            <option value="1">1 page</option>
            <option value="2">2 pages</option>
            <option value="3">3 pages</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          <span>Ajuster, hauteur</span>
          <select
            data-control="mep-ajuster-hauteur"
            aria-label="Ajuster à N pages en hauteur"
            value={pageSetup.scaleToFit?.hauteur ?? ""}
            onChange={(e) =>
              onChange({
                scaleToFit: { ...pageSetup.scaleToFit, hauteur: e.target.value ? Number(e.target.value) : undefined },
              })
            }
            className="w-20 rounded border border-neutral-300 px-1 py-0.5"
          >
            <option value="">Auto</option>
            <option value="1">1 page</option>
            <option value="2">2 pages</option>
            <option value="3">3 pages</option>
          </select>
        </label>
      </Groupe>

      <Groupe titre="Options de la feuille">
        <Bascule
          control="mep-quadrillage-imprimer"
          label="Imprimer le quadrillage"
          coche={Boolean(pageSetup.gridlines)}
          onBasculer={(v) => onChange({ gridlines: v })}
        />
        <Bascule
          control="mep-entetes-imprimer"
          label="Imprimer les en-têtes"
          coche={Boolean(pageSetup.headings)}
          onBasculer={(v) => onChange({ headings: v })}
        />
        <Bascule
          control="mep-centrer-horizontal"
          label="Centrer horizontalement"
          coche={Boolean(pageSetup.center?.horizontal)}
          onBasculer={(v) => onChange({ center: { horizontal: v } })}
        />
        <Bascule
          control="mep-centrer-vertical"
          label="Centrer verticalement"
          coche={Boolean(pageSetup.center?.vertical)}
          onBasculer={(v) => onChange({ center: { vertical: v } })}
        />
      </Groupe>

      <Groupe titre="Titres à répéter">
        <Champ
          control="mep-titres-lignes"
          label="Lignes"
          valeur={pageSetup.repeatRows ?? ""}
          gabarit="$1:$2"
          onSaisir={(v) => onChange({ repeatRows: v })}
        />
        <Champ
          control="mep-titres-colonnes"
          label="Colonnes"
          valeur={pageSetup.repeatCols ?? ""}
          gabarit="$A:$A"
          onSaisir={(v) => onChange({ repeatCols: v })}
        />
      </Groupe>

      <Groupe titre="Zone d'impression">
        <div className="text-[10px] text-neutral-500">{pageSetup.printArea || "Toute la feuille"}</div>
        <button
          type="button"
          data-control="mep-zone-impression-annuler"
          aria-label="Annuler la zone d'impression"
          onClick={() => onChange({ printArea: "" })}
          className="mt-1 w-full rounded border border-neutral-300 px-1.5 py-1 text-left hover:bg-neutral-50"
        >
          Annuler la zone d'impression
        </button>
      </Groupe>

      <Groupe titre="Sauts de page">
        <button
          type="button"
          data-control="mep-sauts-reinitialiser"
          aria-label="Rétablir tous les sauts de page"
          onClick={() => onChange({ pageBreakRows: [], pageBreakCols: [] })}
          className="w-full rounded border border-neutral-300 px-1.5 py-1 text-left hover:bg-neutral-50"
        >
          Rétablir tous les sauts de page
        </button>
      </Groupe>

      <button
        type="button"
        data-control="mep-entete-pied"
        aria-label="En-tête et pied de page"
        onClick={onEnteteEtPied}
        className="mt-1 w-full rounded bg-emerald-700 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-800"
      >
        En-tête et pied de page…
      </button>
    </div>
  )
}

function nomDuPreset(m: { haut: number; bas: number; gauche: number; droite: number }): string {
  for (const [nom, p] of Object.entries(PRESETS_MARGES)) {
    if (Math.abs(p.gauche - m.gauche) <= 0.02 && Math.abs(p.haut - m.haut) <= 0.02) return nom
  }
  return "personnalisees"
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 border-t border-neutral-200 pt-1.5 first:border-t-0 first:pt-0">
      <div className="mb-1 text-[9.5px] uppercase tracking-wide text-neutral-500">{titre}</div>
      {children}
    </div>
  )
}

function Choix({
  valeur,
  options,
  onChoisir,
}: {
  valeur: string
  options: Array<[string, string, string]>
  onChoisir: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, label, control]) => (
        <button
          key={v}
          type="button"
          data-control={control}
          aria-label={label}
          aria-pressed={valeur === v}
          onClick={() => onChoisir(v)}
          className={`rounded border px-1.5 py-0.5 ${
            valeur === v ? "border-emerald-400 bg-emerald-100 font-medium" : "border-neutral-300 hover:bg-neutral-50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Bascule({
  control,
  label,
  coche,
  onBasculer,
}: {
  control: string
  label: string
  coche: boolean
  onBasculer: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-1.5 py-0.5">
      <input
        type="checkbox"
        data-control={control}
        aria-label={label}
        checked={coche}
        onChange={(e) => onBasculer(e.target.checked)}
        className="h-3.5 w-3.5 accent-emerald-700"
      />
      <span>{label}</span>
    </label>
  )
}

function Champ({
  control,
  label,
  valeur,
  gabarit,
  onSaisir,
}: {
  control: string
  label: string
  valeur: string
  gabarit: string
  onSaisir: (v: string) => void
}) {
  return (
    <label className="mb-1 flex items-center justify-between gap-2">
      <span>{label}</span>
      <input
        type="text"
        data-control={control}
        aria-label={`${label} à répéter`}
        value={valeur}
        placeholder={gabarit}
        onChange={(e) => onSaisir(e.target.value)}
        className="w-20 rounded border border-neutral-300 px-1 py-0.5"
      />
    </label>
  )
}

/* ═══════════ ÉDITEUR D'EN-TÊTE ET DE PIED ═══════════ */

const CODES: Array<[string, string, string]> = [
  ["&P", "Page", "mep-code-page"],
  ["&N", "Total", "mep-code-total"],
  ["&D", "Date", "mep-code-date"],
  ["&T", "Heure", "mep-code-heure"],
  ["&F", "Fichier", "mep-code-fichier"],
  ["&A", "Feuille", "mep-code-feuille"],
]

const CASES: Array<["gauche" | "centre" | "droite", string]> = [
  ["gauche", "Gauche"],
  ["centre", "Centre"],
  ["droite", "Droite"],
]

function EditeurEnteteEtPied({
  pageSetup,
  zone,
  caseActive,
  onZone,
  onCase,
  onChange,
  onFermer,
}: {
  pageSetup: PageSetupState
  zone: "header" | "footer"
  caseActive: "gauche" | "centre" | "droite"
  onZone: (z: "header" | "footer") => void
  onCase: (c: "gauche" | "centre" | "droite") => void
  onChange: (p: PageSetupState) => void
  onFermer: () => void
}) {
  const contenu = pageSetup[zone] ?? {}
  const ecrire = (place: "gauche" | "centre" | "droite", texte: string) => onChange({ [zone]: { [place]: texte } })

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-neutral-900/30 p-3">
      <div className="w-full max-w-[420px] rounded-lg bg-white p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-neutral-800">En-tête et pied de page</span>
          <button
            type="button"
            data-control="mep-entete-pied-fermer"
            aria-label="Fermer"
            onClick={onFermer}
            className="rounded px-1.5 text-[13px] text-neutral-500 hover:bg-neutral-100"
          >
            ×
          </button>
        </div>

        <div className="mb-2 flex gap-1 text-[11px]">
          {(["header", "footer"] as const).map((z) => (
            <button
              key={z}
              type="button"
              data-control={z === "header" ? "mep-onglet-entete" : "mep-onglet-pied"}
              aria-label={z === "header" ? "En-tête" : "Pied de page"}
              aria-pressed={zone === z}
              onClick={() => onZone(z)}
              className={`rounded border px-2 py-0.5 ${
                zone === z ? "border-emerald-400 bg-emerald-100 font-medium" : "border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              {z === "header" ? "En-tête" : "Pied de page"}
            </button>
          ))}
        </div>

        {/* Trois cases, comme Excel : c'est la disposition qu'il faut retenir,
            parce qu'elle explique où le texte atterrira sur le papier. */}
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CASES.map(([place, label]) => (
            <label key={place} className="block">
              <span className="mb-0.5 block text-[9.5px] uppercase tracking-wide text-neutral-500">{label}</span>
              <textarea
                data-control={`${zone === "header" ? "mep-entete" : "mep-pied"}-${place}`}
                aria-label={`${zone === "header" ? "En-tête" : "Pied de page"} — ${label}`}
                value={contenu[place] ?? ""}
                onFocus={() => onCase(place)}
                onChange={(e) => ecrire(place, e.target.value)}
                rows={2}
                className={`w-full resize-none rounded border px-1.5 py-1 text-[11px] ${
                  caseActive === place ? "border-emerald-400 ring-1 ring-emerald-200" : "border-neutral-300"
                }`}
              />
            </label>
          ))}
        </div>

        <div className="mb-1 text-[9.5px] uppercase tracking-wide text-neutral-500">
          Insérer un code dans la case {CASES.find(([p]) => p === caseActive)?.[1]}
        </div>
        <div className="flex flex-wrap gap-1">
          {CODES.map(([code, label, control]) => (
            <button
              key={code}
              type="button"
              data-control={control}
              aria-label={`Insérer ${label} (${code})`}
              onClick={() => ecrire(caseActive, `${contenu[caseActive] ?? ""}${code}`)}
              className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10.5px] hover:bg-neutral-50"
            >
              {label} <span className="text-neutral-400">{code}</span>
            </button>
          ))}
        </div>

        <p className="mt-2 text-[10px] leading-snug text-neutral-500">
          Un code n'est pas du texte : <strong>&amp;P</strong> devient le numéro de la page à l'impression. Pour une
          esperluette littérale, tapez-la deux fois.
        </p>
      </div>
    </div>
  )
}
