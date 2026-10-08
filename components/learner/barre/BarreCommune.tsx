"use client"

import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from "react"
import { BookOpen, FileText, HelpCircle, List, MoreHorizontal, Play, StickyNote, StopCircle, Volume2, VolumeX, X } from "lucide-react"
import { BoutonImmersion, type useImmersion } from "../useImmersion"

/** Présentation seulement : les commandes restent celles des lecteurs. */
export type SonBarre = {
  disponible: boolean
  active: boolean
  enLecture: boolean
  rejouer: () => void
  arreter: () => void
  basculer: () => void
}
export type ActionBarre = { id: string; libelle: string; executer: () => void }

type Props = {
  module?: string | null
  titre: string
  compteur: { rang: number; total: number; unite: "Étape" | "Chapitre" }
  progression: { etapes: number; courant: number; accent: string } | { pourcentage: number }
  evaluationNotee?: boolean
  atelier?: boolean
  leconsOuvertes: boolean
  onLecons: () => void
  son?: SonBarre
  onNotes?: () => void
  notesOuvertes?: boolean
  onDocuments?: () => void
  documentsOuverts?: boolean
  onGuide?: () => void
  guideOuvert?: boolean
  guideRef?: RefObject<HTMLButtonElement | null>
  immersion?: ReturnType<typeof useImmersion>
  onQuitter?: () => void
  outils?: ActionBarre[]
}

export default function BarreCommune(p: Props) {
  const [menu, setMenu] = useState<"son" | "plus" | null>(null)
  const racine = useRef<HTMLDivElement>(null)
  const sonRef = useRef<HTMLButtonElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const fermer = () => setMenu(null)
  useEffect(() => {
    if (!menu) return
    const bouton = menu === "son" ? sonRef.current : plusRef.current
    racine.current?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-${menu}`)} button:not(:disabled)`)?.focus()
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation(); setMenu(null); bouton?.focus({ preventScroll: true })
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      const items = Array.from(racine.current?.querySelectorAll<HTMLButtonElement>(`#${CSS.escape(`${id}-${menu}`)} button:not(:disabled)`) || [])
      if (!items.length) return
      e.preventDefault()
      const n = items.indexOf(document.activeElement as HTMLButtonElement)
      items[(n + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
    }
    const dehors = (e: PointerEvent) => { if (!racine.current?.contains(e.target as Node)) setMenu(null) }
    window.addEventListener("keydown", clavier, true)
    document.addEventListener("pointerdown", dehors)
    return () => { window.removeEventListener("keydown", clavier, true); document.removeEventListener("pointerdown", dehors) }
  }, [menu, id])
  // Un écran de chapitre différent ne conserve pas un menu de l'ancien titre.
  useEffect(fermer, [p.titre, p.compteur.rang])
  const agir = (action: () => void) => { fermer(); action() }
  const control = (nom: string) => p.atelier ? `sim-${nom}` : `cad-${nom}`
  const count = `${p.compteur.unite} ${p.compteur.rang} sur ${p.compteur.total}`
  const etapes = "etapes" in p.progression ? p.progression : null
  const son = p.son
  const Voix = son?.active ? Volume2 : VolumeX
  const boutonsPanneaux = (dansMenu = false) => <>
    {p.onNotes && <button type="button" className={dansMenu ? "lms-bar-menu-action" : "lms-bar-button"} data-control={control("notes")} aria-label="Mes notes" aria-pressed={p.notesOuvertes} onClick={() => agir(p.onNotes!)}><StickyNote/><span>Notes</span></button>}
    {p.onDocuments && <button type="button" className={dansMenu ? "lms-bar-menu-action" : "lms-bar-button"} data-control={control("ressources")} aria-label="Documents" aria-pressed={p.documentsOuverts} onClick={() => agir(p.onDocuments!)}><FileText/><span>Documents</span></button>}
    {p.onGuide && <button ref={dansMenu ? undefined : p.guideRef} type="button" className={dansMenu ? "lms-bar-menu-action" : "lms-bar-button"} data-control={control("guide")} aria-label="Guide de la formation" aria-pressed={p.guideOuvert} onClick={() => agir(p.onGuide!)}><HelpCircle/><span>Guide</span></button>}
  </>
  const outils = p.outils || []
  return <div ref={racine} className={`lms-common-bar${p.atelier ? " lms-common-bar-atelier" : " lms-reader-toolbar"}`} data-control={control("cockpit")} data-evaluation={p.evaluationNotee || undefined} data-immersion-panel-open={menu ? "" : undefined}>
    <button type="button" className="lms-bar-button lms-bar-lessons" data-control={control("sommaire")} aria-label="Toutes les leçons" aria-expanded={p.leconsOuvertes} onClick={() => agir(p.onLecons)}><List/><span>Leçons</span></button>
    <div className="lms-bar-title" title={[p.module, p.titre, count].filter(Boolean).join(" · ")}>
      <small>{p.evaluationNotee && <span className="lms-bar-evaluation">Évaluation notée</span>}{p.module}</small>
      <div><strong>{p.titre}</strong><span className="lms-bar-count" data-control={control("progression")}>{count}</span></div>
    </div>
    {son && <div className="lms-bar-sound" data-voix="">
      <button ref={sonRef} type="button" className="lms-bar-button" data-control="voix-menu" aria-label={son.active ? "Son" : "Son coupé"} aria-expanded={menu === "son"} aria-controls={`${id}-son`} aria-haspopup="menu" onClick={() => setMenu(menu === "son" ? null : "son")}><Voix/><span>{son.active ? "Son" : "Son coupé"}</span></button>
      {menu === "son" && <div id={`${id}-son`} className="lms-bar-menu" role="menu" aria-label="Son">
        <button type="button" role="menuitem" className="lms-bar-menu-action" data-control={p.atelier ? "sim-voix" : "cad-voix"} disabled={!son.disponible || (!son.active && !son.enLecture)} onClick={son.enLecture ? son.arreter : son.rejouer}>{son.enLecture ? <StopCircle/> : <Play/>}<span>{son.enLecture ? "Arrêter la lecture" : "Réécouter la consigne"}<small>{son.disponible ? "La consigne de cette étape" : "Pas de voix sur cet écran"}</small></span></button>
        <hr/>
        <button type="button" role="menuitemcheckbox" aria-checked={son.active} className="lms-bar-menu-action" data-control={p.atelier ? "sim-voix-couper" : "cad-voix-couper"} onClick={son.basculer}><Voix/><span>Lire chaque consigne<small>{son.active ? "Activé" : "Coupé"} · votre choix est mémorisé</small></span><i className="lms-bar-switch" data-on={son.active}/></button>
      </div>}
    </div>}
    <div className="lms-bar-desktop-actions">{boutonsPanneaux()}<span className="lms-bar-separator"/><BoutonImmersion controle={p.immersion}/>{p.onQuitter && <button type="button" className="lms-bar-button lms-bar-icon" data-control={control("quitter")} aria-label="Quitter" title="Quitter" onClick={p.onQuitter}><X/></button>}</div>
    <div className={`lms-bar-more${outils.length ? " lms-bar-more-outils" : ""}`}>
      <button ref={plusRef} type="button" className="lms-bar-button lms-bar-icon" aria-label="Plus d’options" aria-haspopup="menu" aria-expanded={menu === "plus"} aria-controls={`${id}-plus`} onClick={() => setMenu(menu === "plus" ? null : "plus")}><MoreHorizontal/></button>
      {menu === "plus" && <div id={`${id}-plus`} className="lms-bar-menu" role="menu" aria-label="Plus d’options"><div className="lms-bar-mobile-actions">{boutonsPanneaux(true)}</div>{outils.map(a => <button key={a.id} type="button" role="menuitem" className="lms-bar-menu-action" onClick={() => agir(a.executer)}><BookOpen/><span>{a.libelle}</span></button>)}{p.onQuitter && <button type="button" role="menuitem" className="lms-bar-menu-action lms-bar-mobile-actions" data-control={control("quitter")} onClick={p.onQuitter}><X/><span>Quitter</span></button>}</div>}
    </div>
    <div className="lms-bar-progress" data-control={control("progres")} role="progressbar" aria-label={"etapes" in p.progression ? "Avancement des étapes" : "Progression de la formation"} aria-valuemin={0} aria-valuemax={"etapes" in p.progression ? p.progression.etapes : 100} aria-valuenow={"etapes" in p.progression ? Math.min(p.progression.courant, p.progression.etapes) : p.progression.pourcentage}>
      {etapes ? Array.from({ length: etapes.etapes }, (_, i) => <i key={i} data-done={i < etapes.courant} data-current={i === etapes.courant} style={{ "--bar-step-accent": etapes.accent } as CSSProperties}/>) : "pourcentage" in p.progression && <i className="lms-bar-progress-fill" style={{ width: `${Math.max(0, Math.min(100, p.progression.pourcentage))}%` }}/>}
    </div>
  </div>
}
