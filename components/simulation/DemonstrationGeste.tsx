"use client"

/**
 * « Montrez-moi » : la démonstration animée du geste attendu.
 *
 * POURQUOI CETTE VERSION
 * La première ne savait jouer qu'UN geste, et seulement pour quatre types
 * d'action sur vingt-deux. Retour de Samuel le 29/07/2026 : « des fois c'est
 * absent, des fois c'est une mauvaise démonstration, des fois elle se finit
 * pas, c'est pas clair ». L'audit lui a donné raison — sur 1 654 étapes
 * interactives : 518 muettes, 550 formules arrêtées avant le résultat, 155
 * étapes multi-cellules dont une seule était montrée.
 *
 * Ce composant joue désormais une SÉQUENCE de gestes (`lib/simulation/
 * demonstration.ts`, 100 % des étapes couvertes) et va jusqu'au bout : la
 * valeur est réellement écrite dans la grille, donc une formule affiche son
 * RÉSULTAT calculé par le moteur — pas la formule, pas un nombre inventé.
 *
 * ÉCRIRE SANS VALIDER. Écrire déclenche l'observation du classeur, donc la
 * validation de l'étape, donc le passage automatique à la suivante : la
 * démonstration se saborderait. Le player pose un verrou (`onEcrire`) qui fait
 * ignorer les observations le temps de l'écriture. L'apprenant garde la main et
 * reprend avec « J'ai compris — continuer ».
 *
 * Les coordonnées viennent de `getCellRect` (métriques d'Univer, pas le DOM :
 * la grille est un canvas) et du DOM pour le châssis. Le parent résout, ce
 * composant ne fait que jouer.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { CibleDemo, PlanDemo } from "@/lib/simulation/demonstration"

const VERT = "#107C41"
const VERT_F = "#0b5c30"
const ENCRE = "#171a18"

export type Rect = { left: number; top: number; width: number; height: number }

type Props = {
  plan: PlanDemo
  /** Résout une cible en rectangle, dans le repère du calque. */
  resoudre: (cible: CibleDemo) => Rect | null
  /** Largeur du calque, pour garder bulles et étiquettes dans le champ. */
  largeur: number
  /** Écrit réellement dans la grille, validation neutralisée. */
  onEcrire?: (ref: string, valeur: string) => void
  /**
   * Ouvre réellement un onglet du ruban. Indispensable : le ruban ne rend que
   * son onglet actif, donc désigner l'onglet sans l'ouvrir laisse le bouton du
   * geste SUIVANT introuvable — et ce geste-là se joue alors à blanc.
   */
  onOnglet?: (onglet: string) => void
  /** Crée réellement un nom de plage, sans déclencher la validation de l'étape. */
  onDefinir?: (nom: string, ref: string) => void
  /** Sélectionne réellement une cellule ou une plage. */
  onSelectionner?: (ref: string) => void
  /**
   * Presse réellement un contrôle du châssis. Sans cela, les démonstrations des
   * étapes jugées sur autre chose qu'une valeur de cellule — format, tri,
   * filtre, mise en page, graphique, tableau croisé, macro, poste — montraient
   * le bon bouton sans que rien ne change à l'écran.
   */
  onPresser?: (id: string, arg?: string) => void
  onFini?: () => void
}

/** Étapes d'un geste. `avertir` n'existe qu'une fois, au tout début. */
type Phase = "avertir" | "vise" | "bulle" | "clic" | "glisse" | "frappe" | "valide" | "fini"

export default function DemonstrationGeste({ plan, resoudre, largeur, onEcrire, onOnglet, onDefinir, onSelectionner, onPresser, onFini }: Props) {
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<Phase>("avertir")
  const [tapes, setTapes] = useState(0)
  const doux = useRef(false)
  const finiRef = useRef(onFini)
  const ecrireRef = useRef(onEcrire)
  const ongletRef = useRef(onOnglet)
  const definirRef = useRef(onDefinir)
  const selRef = useRef(onSelectionner)
  const presserRef = useRef(onPresser)
  finiRef.current = onFini
  ecrireRef.current = onEcrire
  ongletRef.current = onOnglet
  definirRef.current = onDefinir
  selRef.current = onSelectionner
  presserRef.current = onPresser

  useEffect(() => {
    doux.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  const geste = plan.gestes[Math.min(i, plan.gestes.length - 1)]
  const dernier = i >= plan.gestes.length - 1

  /** Enchaîne les phases d'un geste. */
  const suite = useCallback(() => {
    setPhase((p) => {
      if (p === "avertir") return "vise"
      if (p === "vise") return "bulle"
      if (p === "bulle") return geste?.glisserVers ? "glisse" : "clic"
      // TOUT geste sort par « valide » : c'est le seul endroit qui décide
      // entre passer au suivant et terminer. Un clic sec ou un glissement
      // filaient droit sur « fini » et arrêtaient la séquence entière à leur
      // hauteur — une démonstration en huit gestes s'interrompait au premier
      // clic de repérage, compteur figé (défaut trouvé le 29/07/2026).
      if (p === "glisse") return "valide"
      if (p === "clic") return geste?.frappe ? "frappe" : "valide"
      if (p === "frappe") return "valide"
      return "fini"
    })
  }, [geste])

  // Minuterie : chaque phase a sa durée. L'avertissement doit se lire, la
  // frappe dépend de la longueur du texte.
  useEffect(() => {
    // La phase « valide » est pilotée par l'effet d'écriture ci-dessous, pas
    // ici : les deux minuteries se couraient après (850 ms contre 900 ms) et la
    // plus rapide passait à « fini » en annulant le passage au geste suivant.
    // La séquence restait donc bloquée sur son premier geste, compteur figé.
    if (phase === "fini" || phase === "valide") return
    if (doux.current) {
      setTapes(geste?.frappe?.length ?? 0)
      // Mouvement réduit : on écrit tout d'un coup et on s'arrête à la pose.
      // L'onglet s'ouvre aussi, sinon le dernier geste — le seul rendu dans ce
      // mode — reste sur un bouton absent de la page.
      for (const g of plan.gestes) {
        if (g.selectionner) selRef.current?.(g.selectionner)
        if (g.ecrire) ecrireRef.current?.(g.ecrire.ref, g.ecrire.valeur)
        if (g.onglet) ongletRef.current?.(g.onglet)
        if (g.definir) definirRef.current?.(g.definir.nom, g.definir.ref)
        if (g.presser) presserRef.current?.(g.presser.id, g.presser.arg)
      }
      setI(plan.gestes.length - 1)
      setPhase("fini")
      return
    }
    // Le PREMIER geste est joué lentement : c'est lui qui enseigne. Les
    // suivants s'accélèrent — une séquence de huit cellules à trois secondes
    // pièce dure une demi-minute et l'apprenant décroche avant la fin.
    const vite = i > 0 ? 0.55 : 1
    const duree =
      phase === "avertir" ? 3200
      : phase === "vise" ? 900 * vite
      : phase === "bulle" ? (i === 0 ? 1100 : 620)
      : phase === "clic" ? 700 * vite
      : phase === "glisse" ? 1200
      : phase === "frappe" ? (260 + (geste?.frappe?.length ?? 0) * 105 + 500) * vite
      : 850 * vite
    const t = window.setTimeout(suite, duree)
    return () => window.clearTimeout(t)
  }, [phase, i, geste, suite, plan.gestes])

  // La frappe, caractère par caractère.
  useEffect(() => {
    if (phase !== "frappe" || !geste?.frappe) return
    if (tapes >= geste.frappe.length) return
    const t = window.setTimeout(() => setTapes((n) => n + 1), i > 0 ? 58 : 105)
    return () => window.clearTimeout(t)
  }, [phase, tapes, geste, i])

  // Écriture réelle à la validation, puis geste suivant.
  useEffect(() => {
    if (phase !== "valide" || !geste) return
    if (geste.ecrire) ecrireRef.current?.(geste.ecrire.ref, geste.ecrire.valeur)
    // L'onglet s'ouvre AVANT le passage au geste suivant : c'est ce qui met son
    // bouton dans la page, donc ce qui rend sa cible résoluble.
    if (geste.onglet) ongletRef.current?.(geste.onglet)
    if (geste.definir) definirRef.current?.(geste.definir.nom, geste.definir.ref)
    // La sélection vient AVANT la pression : un bouton de mise en forme agit sur
    // la sélection courante, et le geste précédent du plan est justement celui
    // qui l'établit.
    if (geste.selectionner) selRef.current?.(geste.selectionner)
    if (geste.presser) presserRef.current?.(geste.presser.id, geste.presser.arg)
    // Un seul chemin de sortie : soit le geste suivant, soit la fin.
    const t = window.setTimeout(
      () => {
        if (dernier) {
          setPhase("fini")
          return
        }
        setI((n) => n + 1)
        setTapes(0)
        setPhase("vise")
      },
      i === 0 ? 900 : 450,
    )
    return () => window.clearTimeout(t)
    // `i` volontairement absent : il ne change qu'AVEC la phase, et l'inclure
    // relancerait l'effet en pleine transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, geste, dernier])

  useEffect(() => {
    if (phase === "fini" && dernier) finiRef.current?.()
  }, [phase, dernier])

  if (!geste) return null

  const avertit = phase === "avertir"
  const rect = avertit ? null : resoudre(geste.cible)
  const rectFin = geste.glisserVers ? resoudre(geste.glisserVers) : null
  const agit = phase === "clic" || phase === "glisse" || phase === "frappe" || phase === "valide" || phase === "fini"

  const pointe =
    phase === "glisse" && rectFin
      ? { x: rectFin.left + rectFin.width * 0.5, y: rectFin.top + rectFin.height * 0.42 }
      : rect
        ? { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.42 }
        : null

  /**
   * Repère atteint dans la liste des pas.
   *
   * Sur une séquence de plusieurs gestes, les pas se répartissent entre eux :
   * caler l'avancement sur la seule phase cochait toute la liste dès le premier
   * geste validé, alors qu'il en restait sept à jouer.
   */
  const pasCourant =
    plan.pas.length === 1 ? 0
    : plan.gestes.length > 1
      ? Math.min(
          Math.round((i / Math.max(1, plan.gestes.length - 1)) * (plan.pas.length - 1)) +
            (phase === "fini" ? 1 : 0),
          plan.pas.length - 1,
        )
      : phase === "frappe" ? Math.min(1, plan.pas.length - 1)
      : phase === "valide" || phase === "fini" ? plan.pas.length - 1
      : 0

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: 40 }}>
      {avertit && (
        <>
          <div className="absolute inset-0" style={{ background: "rgba(23,26,24,.42)", animation: "sim-demo-voile .3s ease both" }} />
          <div
            className="absolute rounded-2xl bg-white px-5 py-4"
            style={{
              left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(430px, 88%)",
              boxShadow: "0 24px 60px -18px rgba(0,0,0,.5)", borderTop: "4px solid #E8A33D",
              animation: "sim-demo-carte .34s cubic-bezier(.2,.9,.2,1) both",
            }}
          >
            <p className="mb-1.5 flex items-center gap-2 text-[14.5px] font-extrabold" style={{ color: "#8a5a12" }}>
              <span aria-hidden style={{ fontSize: 17 }}>👀</span>
              Je vais vous montrer
            </p>
            <p className="text-[13px] leading-snug" style={{ color: "#3C433F" }}>
              Vous vous êtes trompé plusieurs fois — ce n’est pas grave. Regardez bien : je fais
              {plan.gestes.length > 1 ? ` les ${plan.gestes.length} gestes ` : " le geste "}
              à votre place, étape par étape. Vous pourrez le refaire ensuite.
            </p>
          </div>
        </>
      )}

      {/* Les pas suivis, en bas de la feuille. */}
      <div
        className="absolute flex flex-wrap gap-1.5"
        style={{ left: 8, bottom: 8, opacity: avertit ? 0 : 1, transition: "opacity .3s" }}
      >
        {plan.pas.map((p, n) => {
          const actif = n === pasCourant && phase !== "fini"
          const fait = n < pasCourant || phase === "fini"
          return (
            <span
              key={`${n}-${p}`}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-none"
              style={{
                background: actif ? "rgba(16,124,65,.1)" : "rgba(255,255,255,.94)",
                border: `1px solid ${actif || fait ? VERT : "#E4E0D8"}`,
                color: actif || fait ? VERT_F : "#9aa19c",
                fontWeight: actif ? 700 : 500,
                boxShadow: "0 1px 3px rgba(0,0,0,.08)",
              }}
            >
              <span
                className="flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ width: 14, height: 14, background: actif || fait ? VERT : "#C9C3B8" }}
              >
                {fait && !actif ? "✓" : n + 1}
              </span>
              {p}
            </span>
          )
        })}
        {/* Compteur de gestes : sans lui, une séquence de huit cellules donne
            l'impression que la démonstration tourne en rond. */}
        {plan.gestes.length > 1 && !avertit && (
          <span
            className="flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold leading-none"
            style={{ background: ENCRE, color: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.14)" }}
          >
            {Math.min(i + 1, plan.gestes.length)} / {plan.gestes.length}
          </span>
        )}
      </div>

      {rect && !avertit && (
        <>
          {/* Halo d'appel AVANT le clic : le déplacement du curseur seul ne
              suffisait pas à faire regarder au bon endroit. */}
          {(phase === "vise" || phase === "bulle") && (
            <span
              className="absolute rounded-md"
              style={{
                left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12,
                border: `2px solid ${VERT}`, animation: "sim-demo-appel 1.15s ease-in-out infinite",
              }}
            />
          )}

          <div
            className="absolute"
            style={{
              left: rect.left, top: rect.top,
              width: rectFin && (phase === "glisse" || phase === "fini") ? rectFin.left + rectFin.width - rect.left : rect.width,
              height: rectFin && (phase === "glisse" || phase === "fini") ? rectFin.top + rectFin.height - rect.top : rect.height,
              outline: agit ? `2.5px solid ${VERT}` : "none",
              outlineOffset: -2,
              background: agit && phase !== "fini" ? "rgba(16,124,65,.08)" : "transparent",
              transition: "width .5s ease, height .5s ease, left .25s ease, top .25s ease",
            }}
          />

          {phase === "clic" && (
            <span
              className="absolute rounded-full"
              style={{
                left: rect.left + rect.width / 2 - 7, top: rect.top + rect.height / 2 - 7,
                width: 14, height: 14, border: `2px solid ${VERT}`, animation: "sim-demo-onde .62s ease-out",
              }}
            />
          )}

          {geste.frappe && (phase === "frappe" || phase === "valide") && (
            <div
              className="absolute flex items-center"
              style={{
                left: rect.left + 1, top: rect.top + 1, width: rect.width - 2, height: rect.height - 2,
                padding: "0 5px", background: "#fff", fontSize: 12.5, color: ENCRE,
                fontFamily: "system-ui,-apple-system,sans-serif", overflow: "hidden", whiteSpace: "nowrap",
              }}
            >
              {geste.frappe.slice(0, tapes)}
              {phase === "frappe" && (
                <span style={{ display: "inline-block", width: 1, height: 15, background: ENCRE, marginLeft: 1, animation: "sim-demo-caret .9s steps(1) infinite" }} />
              )}
            </div>
          )}

          {!geste.touches && (phase === "bulle" || phase === "frappe" || phase === "glisse") && (
            <div
              className="absolute rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white"
              style={{
                left: Math.min(Math.max(4, rect.left + rect.width / 2 - 70), Math.max(4, largeur - 210)),
                top: rect.top > 46 ? rect.top - 34 : rect.top + rect.height + 10,
                background: ENCRE, maxWidth: 205, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                boxShadow: "0 6px 16px -6px rgba(0,0,0,.5)", animation: "sim-demo-entree .28s ease both",
              }}
            >
              {geste.bulle}
            </div>
          )}

          {/* Raccourci clavier : les touches, en relief, là où le curseur
              n'aurait rien à désigner. Elles restent affichées jusqu'à la fin
              du geste — le temps de les lire. */}
          {geste.touches && (
            <div
              className="absolute flex items-center gap-1.5"
              style={{
                left: rect.left, top: rect.top + rect.height / 2 - 16,
                width: rect.width, justifyContent: "center",
                animation: "sim-demo-touche .85s ease both",
              }}
            >
              {geste.touches.map((t, n) => (
                <span key={`${n}-${t}`} className="flex items-center gap-1.5">
                  {n > 0 && <span className="text-[13px] font-bold" style={{ color: ENCRE }}>+</span>}
                  <span
                    className="rounded-md bg-white px-2.5 py-1.5 text-[12.5px] font-bold"
                    style={{ border: `1.5px solid ${ENCRE}`, borderBottomWidth: 3, color: ENCRE }}
                  >
                    {t}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Double-clic : le curseur seul ne distingue pas un clic de deux. */}
          {geste.double && agit && (
            <div
              className="absolute rounded-md px-2 py-1 text-[10.5px] font-bold text-white"
              style={{
                left: Math.min(rect.left + rect.width + 10, Math.max(4, largeur - 60)),
                top: rect.top + rect.height + 6,
                background: ENCRE, animation: "sim-demo-touche .85s ease both",
              }}
            >
              ×2
            </div>
          )}

          {phase === "valide" && !geste.touches && (
            <div
              className="absolute rounded-md bg-white px-2 py-1 text-[10.5px] font-bold"
              style={{
                left: Math.min(rect.left + rect.width + 10, Math.max(4, largeur - 76)),
                top: rect.top + rect.height + 6,
                border: `1.5px solid ${ENCRE}`, borderBottomWidth: 3, color: ENCRE,
                animation: "sim-demo-touche .85s ease both",
              }}
            >
              {geste.frappe ? "⏎ Entrée" : "⌦ Suppr"}
            </div>
          )}

          {/* Le curseur. `top/left: 0` obligatoire : sans origine explicite, le
              translate part de la position en flux et la flèche sort du cadre. */}
          {pointe && !geste.touches && (
            <svg
              className="absolute"
              viewBox="0 0 20 26"
              style={{
                left: 0, top: 0, width: 20, height: 26,
                opacity: phase === "fini" ? 0 : 1,
                transform: `translate(${pointe.x}px, ${pointe.y}px)`,
                transition: "transform .8s cubic-bezier(.33,.02,.2,1), opacity .3s",
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))",
              }}
            >
              <path d="M2 1l15 12-6.5.6 4 7.6-3.2 1.7-3.9-7.5L2 20z" fill="#fff" stroke={ENCRE} strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          )}
        </>
      )}

      <style>{`
@keyframes sim-demo-voile{from{opacity:0}to{opacity:1}}
@keyframes sim-demo-carte{from{opacity:0;transform:translate(-50%,-46%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes sim-demo-entree{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes sim-demo-onde{0%{opacity:.95;transform:scale(.3)}100%{opacity:0;transform:scale(3.4)}}
@keyframes sim-demo-appel{0%,100%{opacity:.95;transform:scale(1)}50%{opacity:.35;transform:scale(1.06)}}
@keyframes sim-demo-caret{50%{opacity:0}}
@keyframes sim-demo-touche{0%{opacity:0}25%{opacity:1;transform:translateY(0)}45%{transform:translateY(2px)}60%{transform:translateY(0)}100%{opacity:1}}
@media (prefers-reduced-motion: reduce){
  [style*="sim-demo-"]{animation-duration:.01ms !important;animation-iteration-count:1 !important}
}
`}</style>
    </div>
  )
}
