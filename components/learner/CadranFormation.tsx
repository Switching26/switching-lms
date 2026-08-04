"use client"

/**
 * Le cadran des formations CLASSIQUES — vidéo, quiz, document, texte.
 *
 * Il donne au player classique la mise en scène des formations interactives :
 * un écran unique sous la navigation du LMS, une barre haute qui porte le
 * repérage et les commandes, une zone de travail, une bande de consigne, et
 * des panneaux qui se SUPERPOSENT au lieu de pousser le contenu. La page ne
 * défile plus.
 *
 * ── Pourquoi un châssis distinct de `components/simulation/AtelierShell` ──
 *
 * Le châssis de l'atelier est déjà app-agnostique et porte exactement la même
 * géométrie. Il n'a pas été réutilisé ici parce que son VOCABULAIRE est celui
 * d'un scénario d'étapes, et qu'un chapitre vidéo n'en a aucune :
 *   · `ConsigneAtelier.nature` ne connaît que lecture / action / evaluee ;
 *     un chapitre vidéo est « à regarder », un PDF « à consulter ».
 *   · sa bande porte « Montrez-moi », « Un indice », « Étape précédente » —
 *     aucun n'a de sens ici — et ne porte NI « Marquer comme terminé », NI la
 *     navigation de chapitre à chapitre, qui sont les deux gestes du classique.
 *   · son compteur compte des étapes ; ici on compte des chapitres.
 * Les faire cohabiter demanderait d'élargir `ConsigneAtelier` et le badge de
 * nature, donc de modifier un fichier que trois lots d'application se
 * partagent en ce moment. La mutualisation reste souhaitable — elle est
 * signalée, pas faite.
 *
 * En revanche tout ce qui pouvait être repris SANS modification l'est :
 * `PanneauRessources`, `DocumentActions`, `PdfViewer`, `dureeLisible`.
 *
 * ⚠️ Ce composant ne calcule RIEN. Comme le châssis de l'atelier, il ne reçoit
 * que du texte, des booléens et des gestes : c'est ce qui garantit qu'il ne
 * peut pas se désynchroniser de la progression, du verrou de visionnage ou de
 * l'autosave des notes, qui restent la propriété du player.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import PanneauRessources, { LIBELLE_RESSOURCES } from "@/components/simulation/PanneauRessources"
import { dureeLisible } from "@/lib/simulation/duree"
import type { LearnerDocument } from "@/lib/learner-files"

/* ═══════════ CONTRAT ═══════════ */

/**
 * `atelier` n'apparaît que dans le SOMMAIRE : une formation peut mêler
 * chapitres classiques et chapitres de simulation, et le sommaire doit alors
 * les distinguer. La bande de consigne, elle, n'est jamais rendue pour un
 * atelier — c'est le player de simulation qui prend l'écran entier.
 */
export type GenreChapitre = "video" | "quiz" | "document" | "texte" | "atelier"

export type EntreeCadran = {
  id: string
  titre: string
  /** Section d'appartenance, `null` pour un chapitre hors section. */
  module: string | null
  genre: GenreChapitre
  termine: boolean
  /** Durée du chapitre en secondes, 0 si inconnue. */
  secondes: number
}

/** État du bouton de validation, entièrement décidé par le player. */
export type ValidationChapitre =
  | { etat: "termine" }
  | { etat: "enregistrement" }
  | { etat: "verrouille"; libelle: string; explication: string }
  | { etat: "possible" }

type Props = {
  /* — Repérage — */
  chapterId: string
  filModule: string | null
  filChapitre: string
  /** Position du chapitre dans l'ordre d'apprentissage, à partir de 1. */
  index: number
  total: number
  /** Part des chapitres terminés, 0-100, pour la jauge du cockpit. */
  progression: number

  /* — Panneaux — */
  sommaire: EntreeCadran[]
  /**
   * Position de lecture dans le chapitre OUVERT — le player est seul à la
   * connaître. Le sommaire l'affiche sur l'entrée courante, qui s'étale : les
   * autres tiennent sur une ligne, pour qu'une dizaine reste visible.
   */
  positionCourante?: { vu: number; total: number } | null
  onNaviguer: (chapterId: string) => void
  note?: string
  onNote?: (valeur: string) => void
  notesHref?: string
  afficherRessources?: boolean
  documentsChapitre?: LearnerDocument[]
  documentsFormation?: LearnerDocument[]
  documentsHref?: string
  onQuitter?: () => void

  /* — Bande de consigne — */
  genre: GenreChapitre
  titre: string
  description?: string | null
  /** Texte long du chapitre, affiché sous la description dans le bloc plafonné. */
  contenu?: string | null
  /** Critère de réussite. Il vit HORS du bloc plafonné : jamais sous le pli. */
  attendu: ReactNode
  validation: ValidationChapitre
  onTerminer: () => void
  precedent?: () => void
  suivant?: () => void

  /* — Fin de formation — */
  bilan?: ReactNode

  /* — Cadre — */
  /**
   * Plein cadre : le cadran occupe toute la fenêtre sous la navigation et se
   * rend par un portail. Faux en aperçu admin, où il reste une carte dans le
   * flux de la page.
   */
  pleinCadre: boolean
  /**
   * Le cadran est-il celui qui doit s'afficher ?
   *
   * ⚠️ Il reste MONTÉ quand il est masqué, et c'est volontaire : la zone de
   * travail héberge l'hôte Vimeo persistant du player. Le démonter au passage
   * sur un chapitre d'atelier laisserait des lecteurs orphelins empilés dans le
   * document — le défaut de suppression silencieux constaté en production.
   */
  visible: boolean
  children: ReactNode
}

/* ═══════════ CONSTANTES VISUELLES ═══════════ */

const COCKPIT = 44

/** Encre du cockpit. L'accent, lui, suit l'organisme (`--partner-primary`). */
const FOND_COCKPIT = "#151B2B"
/** La salle. Le noir du simulateur, refroidi pour un contenu vidéo. */
const FOND_SALLE = "#0E1218"

const NATURE: Record<GenreChapitre, { badge: string; icone: string; teinte: string; fond: string; filet: string }> = {
  video: { badge: "À regarder", icone: "▶", teinte: "#3730A3", fond: "#EEF2FF", filet: "var(--partner-primary, #4F46E5)" },
  quiz: { badge: "À vous de jouer", icone: "✋", teinte: "#8A5A12", fond: "#FBF1DF", filet: "#C6902A" },
  document: { badge: "À consulter", icone: "👁", teinte: "#3E5A67", fond: "#E8F0F3", filet: "#3E5A67" },
  texte: { badge: "À lire", icone: "👁", teinte: "#3E5A67", fond: "#E8F0F3", filet: "#3E5A67" },
  atelier: { badge: "Atelier", icone: "✋", teinte: "#107C41", fond: "#E7F3EB", filet: "#107C41" },
}

const PASTILLE: Record<GenreChapitre, { l: string; c: string; f: string }> = {
  video: { l: "V", c: "#2C6BB0", f: "#E9F1FB" },
  quiz: { l: "★", c: "#8A5A12", f: "#FBF1DF" },
  document: { l: "D", c: "#3E5A67", f: "#E8F0F3" },
  texte: { l: "·", c: "#8D8880", f: "#F1EEE8" },
  atelier: { l: "A", c: "#107C41", f: "#E7F3EB" },
}

/** Durée en `m:ss` — la position de lecture se compare à une barre de vidéo. */
function mmssCourt(secondes: number): string {
  const v = Math.max(0, Math.round(secondes))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`
}

/** Cible tactile du cockpit : 44 px de boîte, pastille visible de 28. */
const CIBLE_COCKPIT: React.CSSProperties = {
  height: COCKPIT,
  minWidth: COCKPIT,
  padding: 0,
  background: "none",
}

function pastilleCockpit(actif: boolean): React.CSSProperties {
  return {
    height: 28,
    fontSize: 11.5,
    background: actif ? "#fff" : "rgba(255,255,255,.07)",
    color: actif ? FOND_COCKPIT : "#CBD3E4",
    fontWeight: actif ? 600 : 400,
  }
}

/* ═══════════ COMPOSANT ═══════════ */

export default function CadranFormation(p: Props) {
  const [panneau, setPanneau] = useState<"lecons" | "notes" | "ressources" | null>(null)
  const idRessources = useId()

  useEffect(() => {
    if (!panneau) return
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanneau(null)
    }
    window.addEventListener("keydown", echap)
    return () => window.removeEventListener("keydown", echap)
  }, [panneau])

  // Le portail n'existe qu'après l'hydratation : `document` est absent au rendu
  // serveur. Même contrat que le conteneur d'atelier.
  const [monte, setMonte] = useState(false)
  useEffect(() => setMonte(true), [])

  /*
   * La page cesse de défiler tant que le cadran est à l'écran.
   *
   * Le verrou n'est posé QUE si personne ne l'a déjà posé : un chapitre
   * d'atelier pose le sien, et restaurer aveuglément au démasquage rendrait la
   * page défilante sous le simulateur.
   */
  useEffect(() => {
    if (!p.pleinCadre || !p.visible) return
    const avant = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      if (document.body.style.overflow === "hidden") document.body.style.overflow = avant
    }
  }, [p.pleinCadre, p.visible])

  const carte = (
    <div
      className={
        p.pleinCadre
          ? "relative flex h-full min-h-0 flex-col overflow-clip bg-white"
          : "relative overflow-clip border border-border bg-white shadow-sm"
      }
      style={p.pleinCadre ? undefined : { borderRadius: 16 }}
      data-cadran-formation=""
    >
      <Cockpit {...p} panneau={panneau} setPanneau={setPanneau} idRessources={idRessources} />

      {/* La salle. `flex-1 min-h-0` : c'est elle qui absorbe la place restante,
          et c'est ce qui rend le débordement structurellement impossible. */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        style={{
          background: FOND_SALLE,
          padding: 18,
          /*
           * La salle CLIPPE son contenu. Ce n'est pas une précaution
           * cosmétique : sans elle, une surface plus haute que la salle
           * recouvre le cockpit et en intercepte les clics — mesuré, une vidéo
           * de 790 px dans une salle de 624 rendait le bouton « Leçons »
           * inatteignable sans qu'aucune erreur ne soit levée.
           */
          overflow: "hidden",
          /*
           * En aperçu admin la carte n'a pas de hauteur définie, donc `h-full`
           * de la vidéo se résoudrait à zéro : elle disparaîtrait sans lever la
           * moindre erreur. La salle se donne alors une hauteur explicite.
           */
          ...(p.pleinCadre ? null : { height: 420 }),
        }}
        data-zone-scene=""
      >
        {p.bilan ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
            <div className="pointer-events-auto w-full max-w-3xl">{p.bilan}</div>
          </div>
        ) : null}
        {p.children}
      </div>

      <BandeChapitre {...p} />

      {/* ── Panneaux ─────────────────────────────────────────────────────── */}
      {panneau && (
        <div
          role="presentation"
          onClick={() => setPanneau(null)}
          className="absolute inset-0"
          style={{ top: COCKPIT, background: "rgba(8,12,20,.52)", zIndex: 60 }}
        />
      )}

      <aside
        aria-label="Toutes les leçons"
        aria-hidden={panneau !== "lecons"}
        className="absolute bottom-0 left-0 flex flex-col bg-white shadow-2xl"
        style={{
          top: COCKPIT,
          width: "min(460px, 86%)",
          zIndex: 70,
          transform: panneau === "lecons" ? "translateX(0)" : "translateX(-101%)",
          transition: "transform .26s cubic-bezier(.32,.72,0,1)",
          visibility: panneau === "lecons" ? "visible" : "hidden",
        }}
      >
        <EnTetePanneau
          titre="Toutes les leçons"
          meta={`${p.total} chapitre${p.total > 1 ? "s" : ""}${
            p.sommaire.some((e) => e.secondes > 0)
              ? ` · ${dureeLisible(p.sommaire.reduce((t, e) => t + e.secondes, 0))}`
              : ""
          }`}
          onFermer={() => setPanneau(null)}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <Sommaire
            entrees={p.sommaire}
            courant={p.chapterId}
            position={p.positionCourante ?? null}
            onNaviguer={(id) => {
              setPanneau(null)
              p.onNaviguer(id)
            }}
          />
        </div>
      </aside>

      {p.onNote && (
        <aside
          aria-label="Mes notes"
          aria-hidden={panneau !== "notes"}
          className="absolute bottom-0 right-0 flex flex-col bg-white shadow-2xl"
          style={{
            top: COCKPIT,
            width: "min(340px, 84%)",
            zIndex: 70,
            transform: panneau === "notes" ? "translateX(0)" : "translateX(101%)",
            transition: "transform .26s cubic-bezier(.32,.72,0,1)",
            visibility: panneau === "notes" ? "visible" : "hidden",
          }}
        >
          <EnTetePanneau titre="Mes notes" onFermer={() => setPanneau(null)} />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[11.5px] text-warm-400">
              {p.filModule && p.filModule !== p.filChapitre ? `${p.filModule} · ` : ""}
              {p.filChapitre}
            </p>
            <textarea
              value={p.note ?? ""}
              onChange={(e) => p.onNote?.(e.target.value)}
              placeholder="Écrivez ici ce que vous voulez retenir de ce chapitre…"
              className="w-full rounded-xl border border-border p-3 text-[13px] leading-relaxed text-ink outline-none focus:border-emerald-600"
              style={{ minHeight: 170, resize: "vertical" }}
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warm-400">
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9, background: "#107C41" }} />
              Enregistré automatiquement
            </p>
            {p.notesHref && (
              <a
                href={p.notesHref}
                className="mt-1 inline-flex min-h-[44px] items-center text-[12.5px] font-semibold"
                style={{ color: "var(--partner-primary, #4F46E5)" }}
              >
                Voir toutes mes notes →
              </a>
            )}
          </div>
        </aside>
      )}

      {p.afficherRessources && (
        <PanneauRessources
          id={idRessources}
          ouvert={panneau === "ressources"}
          onFermer={() => setPanneau(null)}
          documentsChapitre={p.documentsChapitre}
          documentsFormation={p.documentsFormation}
          documentsHref={p.documentsHref}
        />
      )}
    </div>
  )

  if (!p.pleinCadre) return <div style={{ display: p.visible ? undefined : "none" }}>{carte}</div>
  // Avant l'hydratation, on réserve la place sans rendre le portail.
  if (!monte) return <div style={{ height: 420 }} />

  /*
   * Portail vers le corps du document, et non un simple `position: fixed`.
   *
   * La page apprenant garde un `transform` résiduel (`animate-fade-in-up`) qui
   * devient containing block et capture tout `fixed` descendant. Un portail
   * sort du sous-arbre transformé : le positionnement ne dépend plus d'aucun
   * ancêtre.
   *
   * Le conteneur reste rendu même masqué, pour ne jamais démonter l'hôte Vimeo.
   */
  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "calc(var(--app-impersonation-offset, 0px) + var(--app-nav-height, 64px))",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        background: FOND_SALLE,
        overflow: "hidden",
        display: p.visible ? undefined : "none",
      }}
      data-cadran-portail=""
    >
      {carte}
    </div>,
    document.body,
  )
}

/* ═══════════ COCKPIT ═══════════ */

function Cockpit({
  filModule,
  filChapitre,
  index,
  total,
  progression,
  sommaire,
  note,
  onNote,
  afficherRessources,
  onQuitter,
  panneau,
  setPanneau,
  idRessources,
}: Props & {
  panneau: "lecons" | "notes" | "ressources" | null
  setPanneau: (v: "lecons" | "notes" | "ressources" | null) => void
  idRessources: string
}) {
  return (
    <div
      data-control="cad-cockpit"
      className="flex flex-shrink-0 items-center gap-2 px-2 sm:gap-3 sm:px-3"
      style={{ height: COCKPIT, background: FOND_COCKPIT, color: "#fff", fontSize: 12 }}
    >
      {sommaire.length > 0 && (
        <button
          type="button"
          data-control="cad-sommaire"
          onClick={() => setPanneau(panneau === "lecons" ? null : "lecons")}
          aria-label="Toutes les leçons"
          aria-pressed={panneau === "lecons"}
          className="flex flex-shrink-0 items-center justify-center"
          style={CIBLE_COCKPIT}
        >
          <span
            className="flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
            style={pastilleCockpit(panneau === "lecons")}
          >
            <span aria-hidden>☰</span>
            <span className="hidden sm:inline">Leçons</span>
          </span>
        </button>
      )}

      {onNote && (
        <button
          type="button"
          data-control="cad-notes"
          onClick={() => setPanneau(panneau === "notes" ? null : "notes")}
          aria-label="Mes notes"
          aria-pressed={panneau === "notes"}
          className="flex flex-shrink-0 items-center justify-center"
          style={CIBLE_COCKPIT}
        >
          <span
            className="flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
            style={pastilleCockpit(panneau === "notes")}
          >
            <span aria-hidden>✎</span>
            <span className="hidden sm:inline">Notes</span>
            {note && note.trim() !== "" && (
              <span aria-hidden style={{ width: 5, height: 5, borderRadius: 9, background: "#4ED08A" }} />
            )}
          </span>
        </button>
      )}

      {afficherRessources && (
        <button
          type="button"
          data-control="cad-ressources"
          onClick={() => setPanneau(panneau === "ressources" ? null : "ressources")}
          aria-label={LIBELLE_RESSOURCES}
          title={LIBELLE_RESSOURCES}
          aria-expanded={panneau === "ressources"}
          aria-controls={idRessources}
          className="flex flex-shrink-0 items-center justify-center"
          style={CIBLE_COCKPIT}
        >
          <span
            className="flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
            style={pastilleCockpit(panneau === "ressources")}
          >
            {/* Icône dessinée : les glyphes de document ne se rendent pas de la
                même façon d'un système à l'autre, et ce bouton n'a QUE son
                icône sous 1024 px. */}
            <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m0 0l-2-2m2 2l2-2" />
            </svg>
            <span className="hidden lg:inline">{LIBELLE_RESSOURCES}</span>
          </span>
        </button>
      )}

      {/* Fil d'Ariane. Sur téléphone le module cède la place au titre du
          chapitre, seule information dont l'apprenant a besoin en permanence. */}
      <div className="min-w-0 flex-1 truncate text-left sm:text-center" style={{ color: "#8B93A8" }}>
        {filModule && filModule !== filChapitre && (
          <span className="hidden sm:inline">{filModule}&nbsp;&nbsp;|&nbsp;&nbsp;</span>
        )}
        <b style={{ color: "#fff", fontWeight: 600 }}>{filChapitre}</b>
      </div>

      {/* Segments quand la formation est courte — on voit le chemin entier —,
          barre continue au-delà : vingt segments ne se lisent plus. */}
      {total <= 14 ? (
        <div className="hidden flex-shrink-0 items-center gap-[3px] sm:flex" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              style={{
                display: "block",
                width: 13,
                height: 4,
                borderRadius: 9,
                background: i < index - 1 ? "#4ED08A" : i === index - 1 ? "#fff" : "rgba(255,255,255,.16)",
                transition: "background-color .3s ease",
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="hidden flex-shrink-0 sm:block"
          aria-hidden
          style={{ width: 96, height: 4, borderRadius: 9, background: "rgba(255,255,255,.16)" }}
        >
          <span
            style={{
              display: "block",
              height: "100%",
              borderRadius: 9,
              background: "#4ED08A",
              width: `${Math.max(0, Math.min(100, progression))}%`,
              transition: "width .4s ease",
            }}
          />
        </div>
      )}

      <span data-control="cad-progression" className="flex-shrink-0 tabular-nums" style={{ color: "#8B93A8" }}>
        {index}/{total}
      </span>

      {onQuitter && (
        <button
          type="button"
          data-control="cad-quitter"
          onClick={onQuitter}
          title="Quitter la formation"
          aria-label="Quitter la formation"
          className="flex flex-shrink-0 items-center justify-center"
          style={CIBLE_COCKPIT}
        >
          <span
            className="flex items-center justify-center rounded-lg"
            style={{ width: 28, height: 28, background: "rgba(255,255,255,.07)", color: "#C3CAD8", fontSize: 13 }}
          >
            ✕
          </span>
        </button>
      )}
    </div>
  )
}

/* ═══════════ BANDE DE CONSIGNE ═══════════ */

/**
 * ⚠️ CETTE BANDE EST EN `overflow:hidden` — CE QUI DÉPASSE EST INATTEIGNABLE.
 *
 * Seul le TEXTE défile, dans un bloc plafonné en `vh`. Le critère de réussite
 * et les boutons vivent HORS de ce bloc : enfermer un bouton d'action dans une
 * zone défilante le fait passer sous le pli sur un écran de portable.
 */
function BandeChapitre({
  genre,
  titre,
  description,
  contenu,
  attendu,
  validation,
  onTerminer,
  precedent,
  suivant,
}: Props) {
  const n = NATURE[genre]
  const termine = validation.etat === "termine"

  // Voile de fin de bloc : sans lui le texte se coupe au milieu d'une phrase
  // sans que rien n'annonce la suite.
  const texteRef = useRef<HTMLDivElement>(null)
  const [deborde, setDeborde] = useState(false)
  const [hauteurTexte, setHauteurTexte] = useState(0)
  useEffect(() => {
    const el = texteRef.current
    if (!el) return
    const mesurer = () => {
      setDeborde(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
      setHauteurTexte(el.clientHeight)
    }
    mesurer()
    // La police et la zone de travail peuvent encore bouger après le montage :
    // une seule mesure au premier rendu annonce un débordement qui n'existe pas.
    const t = window.setTimeout(mesurer, 220)
    el.addEventListener("scroll", mesurer)
    window.addEventListener("resize", mesurer)
    return () => {
      window.clearTimeout(t)
      el.removeEventListener("scroll", mesurer)
      window.removeEventListener("resize", mesurer)
    }
  }, [titre, description, contenu])

  return (
    <div
      data-bandeau-chapitre=""
      className="relative flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden border-t border-border px-4 py-3"
      style={{
        borderLeft: `4px solid ${termine ? "#059669" : n.filet}`,
        background: termine ? "#F2FBF6" : "#fff",
        transition: "background-color .3s ease, border-color .3s ease",
      }}
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div ref={texteRef} className="min-w-0" style={{ maxHeight: "17vh", overflowY: "auto" }}>
          <span
            data-control="cad-badge"
            className="mb-1.5 inline-flex items-center gap-1.5 rounded-md uppercase"
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: ".07em",
              padding: "4px 8px",
              color: n.teinte,
              background: n.fond,
            }}
          >
            <span aria-hidden>{n.icone}</span>
            {n.badge}
          </span>
          <h2 className="font-display text-[17px] font-semibold leading-tight text-ink">{titre}</h2>
          {description && (
            <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-warm-600">{description}</p>
          )}
          {contenu && (
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-warm-600">{contenu}</p>
          )}
        </div>
        {/* Le voile reste FIXE en bas du bloc plafonné : posé à l'intérieur, il
            glisserait avec le texte. Il est donc ancré sur la hauteur du bloc,
            pas sur celle de la colonne. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0"
          style={{
            top: hauteurTexte - 26,
            height: 26,
            opacity: deborde ? 1 : 0,
            transition: "opacity .2s",
            background: `linear-gradient(transparent, ${termine ? "#F2FBF6" : "#fff"})`,
          }}
        />

        {/* HORS du bloc plafonné, mais DANS la colonne : le critère de réussite
            se lit sous la consigne, jamais à côté d'elle, et ne passe jamais
            sous le pli. */}
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-warm-500">
          <span aria-hidden>◎</span>
          {attendu}
        </div>
      </div>

      <div className="ml-auto flex flex-shrink-0 items-center gap-2 max-sm:w-full max-sm:pt-0.5">
        <button
          type="button"
          data-control="cad-precedent"
          onClick={precedent}
          disabled={!precedent}
          aria-label="Chapitre précédent"
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border px-3.5 text-[13.5px] font-medium text-warm-600 transition-colors hover:bg-warm-50 disabled:cursor-not-allowed disabled:opacity-40 max-sm:w-[52px] max-sm:flex-none max-sm:px-0"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          <span className="max-sm:hidden">Précédent</span>
        </button>
        <button
          type="button"
          data-control="cad-suivant"
          onClick={suivant}
          disabled={!suivant}
          aria-label="Chapitre suivant"
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border px-3.5 text-[13.5px] font-medium text-warm-600 transition-colors hover:bg-warm-50 disabled:cursor-not-allowed disabled:opacity-40 max-sm:w-[52px] max-sm:flex-none max-sm:px-0"
        >
          <span className="max-sm:hidden">Suivant</span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {validation.etat === "termine" ? (
          <span
            data-control="cad-termine"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold max-sm:flex-1"
            style={{ background: "#D1FAE5", color: "#047857" }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Chapitre terminé
          </span>
        ) : validation.etat === "verrouille" ? (
          /* Un primaire délavé se lit comme un bug. Tant que le seuil n'est pas
             atteint, le bouton dit franchement qu'il est verrouillé, et quand
             il s'ouvrira. */
          <span
            data-control="cad-verrou"
            title={validation.explication}
            className="inline-flex min-h-[44px] cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-[13.5px] text-warm-500 max-sm:flex-1"
            style={{ borderColor: "#d4cbc0", background: "#fff" }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9} aria-hidden>
              <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
              <path strokeLinecap="round" d="M8 10.5V8a4 4 0 018 0v2.5" />
            </svg>
            {validation.libelle}
          </span>
        ) : (
          <button
            type="button"
            data-control="cad-valider"
            onClick={onTerminer}
            disabled={validation.etat === "enregistrement"}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 max-sm:flex-1"
            style={{ background: "var(--partner-primary, #4F46E5)" }}
          >
            {validation.etat === "enregistrement" ? (
              "Enregistrement…"
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Marquer comme terminé
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/* ═══════════ PANNEAUX ═══════════ */

function EnTetePanneau({
  titre,
  meta,
  onFermer,
}: {
  titre: string
  meta?: string
  onFermer: () => void
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-warm-50 px-3 py-2.5">
      <h4 className="flex-1 text-[13.5px] font-bold leading-tight">{titre}</h4>
      {meta && <span className="text-[11px] text-warm-400">{meta}</span>}
      {/* Cible 44 × 44, pastille visible de 28 : c'est le fond intérieur qui
          dessine le bouton, pas sa boîte. */}
      <button
        type="button"
        onClick={onFermer}
        aria-label="Fermer"
        className="-my-2 -mr-1 flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center"
      >
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-100 text-[12px] text-warm-600"
        >
          ✕
        </span>
      </button>
    </div>
  )
}

/**
 * Sommaire de la formation.
 *
 * Groupé par section, et seul le groupe du chapitre ouvert est déplié : sur une
 * formation de plusieurs dizaines de chapitres, tout ouvrir d'entrée noie
 * l'information. Chaque ligne fait 44 px : le sommaire EST la navigation.
 */
function Sommaire({
  entrees,
  courant,
  position,
  onNaviguer,
}: {
  entrees: EntreeCadran[]
  courant: string
  position: { vu: number; total: number } | null
  onNaviguer: (id: string) => void
}) {
  const moduleCourant = entrees.find((e) => e.id === courant)?.module ?? null
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({})

  const groupes: Array<{ nom: string; items: EntreeCadran[] }> = []
  for (const e of entrees) {
    const nom = e.module ?? "—"
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.nom === nom) dernier.items.push(e)
    else groupes.push({ nom, items: [e] })
  }

  return (
    <>
      {groupes.map((g, i) => {
        const estCourant = g.nom === (moduleCourant ?? "—")
        const ouvert = ouverts[g.nom] ?? estCourant
        const faits = g.items.filter((x) => x.termine).length
        const secondes = g.items.reduce((t, x) => t + x.secondes, 0)
        return (
          <div key={`${g.nom}-${i}`} className="border-b border-warm-100 last:border-b-0">
            <button
              type="button"
              onClick={() => setOuverts((o) => ({ ...o, [g.nom]: !ouvert }))}
              aria-expanded={ouvert}
              className="flex min-h-[44px] w-full items-center gap-2 px-1 py-2 text-left"
            >
              <span
                className="flex h-[21px] w-[21px] flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                style={{
                  background: estCourant
                    ? "var(--partner-primary, #4F46E5)"
                    : faits === g.items.length
                      ? "#E7F3EB"
                      : "#F1EEE8",
                  color: estCourant ? "#fff" : faits === g.items.length ? "#107C41" : "#8D8880",
                }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                {g.nom === "—" ? "Chapitres" : g.nom}
              </span>
              <span className="flex-shrink-0 text-[10.5px] tabular-nums text-warm-400">
                {faits}/{g.items.length}
                {secondes > 0 ? ` · ${dureeLisible(secondes)}` : ""}
              </span>
              <span aria-hidden className="flex-shrink-0 text-[10px] text-warm-400">
                {ouvert ? "▾" : "▸"}
              </span>
            </button>
            {ouvert && (
              <ul className="mb-1.5 list-none pl-7">
                {g.items.map((e) => {
                  const pa = PASTILLE[e.genre]
                  const actif = e.id === courant
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onNaviguer(e.id)}
                        className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-warm-50"
                        style={{
                          background: actif ? "#fff" : undefined,
                          boxShadow: actif ? "0 1px 2px rgba(0,0,0,.09)" : undefined,
                        }}
                      >
                        <span
                          className="flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded"
                          style={{ background: pa.f, color: pa.c, fontSize: 8, fontWeight: 700 }}
                        >
                          {pa.l}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span
                            className="min-w-0 truncate text-[12px]"
                            style={{ color: actif ? "#171a18" : "#6E6A62", fontWeight: actif ? 700 : 400 }}
                          >
                            {e.titre}
                          </span>
                          {actif && position && position.total > 0 && (
                            <>
                              <span
                                className="text-[10.5px] font-bold"
                                style={{ color: "var(--partner-primary, #3730A3)" }}
                              >
                                {mmssCourt(position.vu)} sur {mmssCourt(position.total)} ·{" "}
                                {Math.max(1, Math.ceil((position.total - position.vu) / 60))} min restantes
                              </span>
                              <span
                                aria-hidden
                                className="mt-0.5 overflow-hidden rounded-sm"
                                style={{ height: 3, background: "#E4E0D8" }}
                              >
                                <span
                                  className="block h-full rounded-sm"
                                  style={{
                                    width: `${Math.min(100, (position.vu / position.total) * 100)}%`,
                                    background: "var(--partner-primary, #4F46E5)",
                                    transition: "width .3s ease",
                                  }}
                                />
                              </span>
                            </>
                          )}
                        </span>
                        {!actif && e.secondes > 0 && (
                          <span className="flex-shrink-0 text-[10.5px] text-warm-400">
                            {dureeLisible(e.secondes)}
                          </span>
                        )}
                        {e.termine && (
                          <span aria-hidden className="flex-shrink-0 text-[11px] text-emerald-600">
                            ✓
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </>
  )
}
