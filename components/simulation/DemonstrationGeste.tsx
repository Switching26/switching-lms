"use client"

/**
 * « Montrez-moi » : la démonstration animée du geste attendu.
 *
 * POURQUOI
 * Après trois essais ratés, l'atelier affichait « Voici la réponse. B5 doit
 * valoir 9 » — une phrase, et rien d'autre. L'apprenant restait devant sa
 * grille sans savoir où était B5 (sa sélection pouvait être à l'autre bout de
 * la feuille), ni comment on saisit, ni comment on valide. Le moment précis où
 * un débutant abandonne.
 *
 * Mise en scène B, choisie par Samuel le 29/07/2026 : le PAS À PAS COMPLET.
 * Trois pas nommés — cliquer, saisir, valider — suivis en haut de la grille,
 * pendant qu'un curseur fait le geste à l'endroit exact. Le vocabulaire compte
 * autant que le geste : l'apprenant repart avec trois mots qu'il se répétera
 * seul la fois suivante.
 *
 * CE COMPOSANT N'ÉCRIT JAMAIS DANS LA GRILLE. La valeur est peinte dans le
 * calque, par-dessus la cellule. Écrire pour de vrai déclencherait l'observation
 * du classeur, donc la validation de l'étape, donc le passage automatique à la
 * suivante — la démonstration se serait sabotée elle-même. L'apprenant reprend
 * la main avec « J'ai compris — continuer ».
 *
 * Les coordonnées viennent de `getCellRect` (métriques d'Univer, pas le DOM :
 * la grille est un canvas). Le parent les calcule, ce composant ne fait que
 * jouer — il reste ainsi vérifiable sans moteur de tableur.
 */

import { useEffect, useRef, useState } from "react"
import type { SimulationAction } from "@/lib/simulation/types"

const VERT = "#107C41"
const ENCRE = "#171a18"

export type Rect = { left: number; top: number; width: number; height: number }

/** Ce qu'il y a à montrer, déduit de l'action — aucun texte à écrire par étape. */
export type PlanDemo = {
  /** Cellule visée. Absente pour un bouton du ruban. */
  cellule?: string
  /** Bouton du ruban visé. */
  controle?: string
  /** Ce qui se tape, caractère par caractère. */
  frappe?: string
  /** Ce qui reste affiché dans la cellule à la fin (résultat, pas formule). */
  affichage?: string
  /** Cellule sélectionnée après Entrée — Excel descend d'une ligne. */
  suivante?: string
  /** Libellés des pas, dans l'ordre. */
  pas: string[]
  /** Phrase de la bulle à chaque pas. */
  bulles: string[]
}

/** Cellule d'en dessous : `B5` → `B6`. Null si la référence n'est pas simple. */
function celluleDessous(ref: string): string | undefined {
  const m = /^([A-Z]{1,3})([0-9]{1,7})$/.exec(ref.trim().toUpperCase())
  return m ? `${m[1]}${Number(m[2]) + 1}` : undefined
}

/**
 * Traduit une action en démonstration. Renvoie null quand le geste ne se montre
 * pas honnêtement — mieux vaut garder la réponse écrite que mimer à peu près.
 */
export function planDemonstration(action: SimulationAction): PlanDemo | null {
  switch (action.type) {
    case "TYPE": {
      const quoi = action.accept?.[0]
      if (!quoi || action.target === "formula-bar") return null
      // Sur une FORMULE, le scénario ne déclare pas le résultat : on ne simule
      // donc pas l'après-Entrée. Afficher la formule dans la cellule aurait
      // enseigné faux (Excel y met le résultat), et inventer un nombre encore
      // plus. La démonstration s'arrête sur le geste, qui est ce qu'elle promet.
      const formule = quoi.trim().startsWith("=")
      return {
        cellule: action.target,
        frappe: quoi,
        affichage: quoi,
        suivante: formule ? undefined : celluleDessous(action.target),
        pas: ["Cliquer la cellule", "Saisir", "Valider"],
        bulles: [`la cellule ${action.target}`, `on tape ${quoi}`, "puis Entrée"],
      }
    }
    case "EXPECT_STATE": {
      // On montre la PREMIÈRE cellule attendue : la démonstration enseigne le
      // geste, pas le remplissage d'un tableau entier.
      const entrees = Object.entries(action.cells)
      if (entrees.length === 0) return null
      const [ref, att] = entrees[0]
      const quoi = att.f ?? att.anyOf?.[0] ?? (att.v !== undefined ? String(att.v) : null)
      if (!quoi) return null
      const resultat = att.v !== undefined ? String(att.v) : quoi
      return {
        cellule: ref,
        frappe: quoi,
        affichage: resultat,
        suivante: celluleDessous(ref),
        pas: ["Cliquer la cellule", "Saisir", "Valider"],
        bulles: [`la cellule ${ref}`, `on tape ${quoi}`, "puis Entrée"],
      }
    }
    case "CLICK_CELL":
      return {
        cellule: action.cell,
        pas: ["Cliquer la cellule"],
        bulles: [`la cellule ${action.cell}`],
      }
    case "CLICK_CONTROL":
      return {
        controle: action.control,
        pas: ["Cliquer le bouton"],
        bulles: ["ce bouton du ruban"],
      }
    default:
      return null
  }
}

type Props = {
  plan: PlanDemo
  /** Rectangle de la cellule (ou du bouton) visé, dans le repère du calque. */
  cible: Rect
  /** Rectangle de la cellule sélectionnée après validation. */
  suivante?: Rect | null
  /** Largeur du calque, pour ne pas pousser la bulle hors champ. */
  largeur: number
  onFini?: () => void
}

/** Un cran de la partition. `attendre` est le temps AVANT de passer au suivant. */
type Cran = { pas: number; phase: "vise" | "bulle" | "clic" | "frappe" | "entree" | "fini"; attendre: number }

export default function DemonstrationGeste({ plan, cible, suivante, largeur, onFini }: Props) {
  const [cran, setCran] = useState(0)
  const [tapes, setTapes] = useState(0)
  const doux = useRef(false)
  const finiRef = useRef(onFini)
  finiRef.current = onFini

  useEffect(() => {
    doux.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  // La partition, déduite du plan : un geste sans frappe s'arrête au clic.
  const crans: Cran[] = []
  crans.push({ pas: 0, phase: "vise", attendre: 900 })
  crans.push({ pas: 0, phase: "bulle", attendre: 1200 })
  crans.push({ pas: 0, phase: "clic", attendre: 800 })
  if (plan.frappe) {
    crans.push({ pas: 1, phase: "frappe", attendre: 260 + plan.frappe.length * 110 + 700 })
    crans.push({ pas: 2, phase: "entree", attendre: 900 })
  }
  crans.push({ pas: plan.pas.length - 1, phase: "fini", attendre: 0 })

  const courant = crans[Math.min(cran, crans.length - 1)]

  // Avance de cran en cran. En mouvement réduit, on saute directement à la fin :
  // l'apprenant voit le résultat et les pas, sans animation.
  useEffect(() => {
    if (courant.phase === "fini") {
      finiRef.current?.()
      return
    }
    if (doux.current) {
      setCran(crans.length - 1)
      setTapes(plan.frappe?.length ?? 0)
      return
    }
    const t = window.setTimeout(() => setCran((c) => c + 1), courant.attendre)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cran, courant.phase, courant.attendre])

  // La frappe, caractère par caractère.
  useEffect(() => {
    if (courant.phase !== "frappe" || !plan.frappe) return
    if (tapes >= plan.frappe.length) return
    const t = window.setTimeout(() => setTapes((n) => n + 1), 110)
    return () => window.clearTimeout(t)
  }, [courant.phase, tapes, plan.frappe])

  const enCours = crans.findIndex((c) => c === courant)
  const apresClic = enCours >= crans.findIndex((c) => c.phase === "clic")
  const apresEntree = courant.phase === "fini" && !!plan.frappe
  const cellule = apresEntree && suivante ? suivante : cible
  const nombre = plan.affichage !== undefined && plan.affichage !== "" && !Number.isNaN(Number(plan.affichage))

  // Le curseur ne s'affiche qu'une fois la première position posée, sinon il
  // traverse l'écran depuis le coin haut-gauche au premier rendu.
  const [pret, setPret] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setPret(true), 30)
    return () => window.clearTimeout(t)
  }, [])

  const bulleTexte = plan.bulles[Math.min(courant.pas, plan.bulles.length - 1)]
  const bulleVisible = courant.phase === "bulle" || courant.phase === "frappe"
  const bulleGauche = Math.min(Math.max(4, cible.left + cible.width / 2 - 60), Math.max(4, largeur - 190))

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: 40 }}>
      {/* Les trois pas, suivis en haut de la feuille. C'est le vocabulaire que
          l'apprenant emportera : cliquer, saisir, valider. */}
      {/* En BAS de la feuille : posés en haut, ils recouvraient les en-têtes de
          colonnes et la première ligne — précisément là où se joue la moitié
          des démonstrations. */}
      <div
        className="absolute flex flex-wrap gap-1.5"
        style={{ left: 8, bottom: 8, animation: "sim-demo-entree .3s ease both" }}
      >
        {plan.pas.map((p, i) => {
          const actif = i === courant.pas && courant.phase !== "fini"
          const fait = i < courant.pas || courant.phase === "fini"
          return (
            <span
              key={p}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-none"
              style={{
                background: actif ? "rgba(16,124,65,.1)" : "rgba(255,255,255,.94)",
                border: `1px solid ${actif || fait ? VERT : "#E4E0D8"}`,
                color: actif || fait ? "#0b5c30" : "#9aa19c",
                fontWeight: actif ? 700 : 500,
                boxShadow: "0 1px 3px rgba(0,0,0,.08)",
              }}
            >
              <span
                className="flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ width: 14, height: 14, background: actif || fait ? VERT : "#C9C3B8" }}
              >
                {fait && !actif ? "✓" : i + 1}
              </span>
              {p}
            </span>
          )
        })}
      </div>

      {/* La cellule visée : cadre vert dès le clic, comme une vraie sélection. */}
      <div
        className="absolute"
        style={{
          left: cellule.left,
          top: cellule.top,
          width: cellule.width,
          height: cellule.height,
          outline: apresClic ? `2px solid ${VERT}` : "none",
          outlineOffset: -2,
          background: apresClic && !apresEntree ? "rgba(16,124,65,.06)" : "transparent",
          transition: "left .25s ease, top .25s ease",
        }}
      />
      {/* L'onde du clic. */}
      {courant.phase === "clic" && (
        <span
          className="absolute rounded-full"
          style={{
            left: cible.left + cible.width / 2 - 7,
            top: cible.top + cible.height / 2 - 7,
            width: 14,
            height: 14,
            border: `2px solid ${VERT}`,
            animation: "sim-demo-onde .62s ease-out",
          }}
        />
      )}

      {/* Ce qui se tape, peint PAR-DESSUS la cellule : la grille n'est jamais
          modifiée, donc l'étape ne se valide pas toute seule. */}
      {plan.frappe && (courant.phase === "frappe" || courant.phase === "entree" || courant.phase === "fini") && (
        <div
          className="absolute flex items-center"
          style={{
            left: cible.left + 1,
            top: cible.top + 1,
            width: cible.width - 2,
            height: cible.height - 2,
            padding: "0 5px",
            background: "#fff",
            justifyContent: courant.phase === "fini" && nombre ? "flex-end" : "flex-start",
            fontSize: 12.5,
            color: ENCRE,
            fontFamily: "system-ui,-apple-system,sans-serif",
            animation: courant.phase === "fini" ? "sim-demo-pose 1.1s ease" : undefined,
          }}
        >
          {courant.phase === "fini" ? plan.affichage : plan.frappe.slice(0, tapes)}
          {courant.phase === "frappe" && (
            <span
              style={{
                display: "inline-block", width: 1, height: 15, background: ENCRE,
                marginLeft: 1, animation: "sim-demo-caret .9s steps(1) infinite",
              }}
            />
          )}
        </div>
      )}

      {/* La bulle : courte, ancrée sous le curseur. */}
      {bulleVisible && (
        <div
          className="absolute rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white"
          style={{
            left: bulleGauche,
            top: cible.top > 46 ? cible.top - 34 : cible.top + cible.height + 10,
            background: ENCRE,
            maxWidth: 186,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            boxShadow: "0 6px 16px -6px rgba(0,0,0,.5)",
            animation: "sim-demo-entree .28s ease both",
          }}
        >
          {bulleTexte}
        </div>
      )}

      {/* La touche Entrée, qui s'enfonce. */}
      {courant.phase === "entree" && (
        <div
          className="absolute rounded-md bg-white px-2 py-1 text-[10.5px] font-bold"
          style={{
            left: Math.min(cible.left + cible.width + 10, Math.max(4, largeur - 76)),
            top: cible.top + cible.height + 6,
            border: `1.5px solid ${ENCRE}`,
            borderBottomWidth: 3,
            color: ENCRE,
            animation: "sim-demo-touche .9s ease both",
          }}
        >
          ⏎ Entrée
        </div>
      )}

      {/* Le curseur. `top/left: 0` obligatoire : sans origine explicite, le
          translate part de la position en flux et la flèche sort du cadre. */}
      <svg
        className="absolute"
        viewBox="0 0 20 26"
        style={{
          left: 0,
          top: 0,
          width: 20,
          height: 26,
          opacity: pret && courant.phase !== "fini" ? 1 : 0,
          transform: `translate(${cible.left + cible.width * 0.5}px, ${cible.top + cible.height * 0.42}px)`,
          transition: "transform .85s cubic-bezier(.33,.02,.2,1), opacity .3s",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))",
        }}
      >
        <path
          d="M2 1l15 12-6.5.6 4 7.6-3.2 1.7-3.9-7.5L2 20z"
          fill="#fff"
          stroke={ENCRE}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>

      <style>{`
@keyframes sim-demo-entree{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes sim-demo-onde{0%{opacity:.95;transform:scale(.3)}100%{opacity:0;transform:scale(3.4)}}
@keyframes sim-demo-caret{50%{opacity:0}}
@keyframes sim-demo-pose{0%{background:rgba(16,124,65,.32)}100%{background:#fff}}
@keyframes sim-demo-touche{0%{opacity:0}25%{opacity:1;transform:translateY(0)}45%{transform:translateY(2px)}60%{transform:translateY(0)}100%{opacity:1}}
@media (prefers-reduced-motion: reduce){
  [style*="sim-demo-"]{animation-duration:.01ms !important;animation-iteration-count:1 !important}
}
`}</style>
    </div>
  )
}
