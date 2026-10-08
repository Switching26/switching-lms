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
 * partagent. La barre de commandes est commune ; les bandes gardent leur
 * vocabulaire propre au contenu.
 *
 * En revanche tout ce qui pouvait être repris SANS modification l'est :
 * `BarreCommune`, `PanneauRessources`, `DocumentActions`, `PdfViewer`.
 *
 * ⚠️ Ce composant ne calcule RIEN. Comme le châssis de l'atelier, il ne reçoit
 * que du texte, des booléens et des gestes : c'est ce qui garantit qu'il ne
 * peut pas se désynchroniser de la progression, du verrou de visionnage ou de
 * l'autosave des notes, qui restent la propriété du player.
 */

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import PanneauRessources from "@/components/simulation/PanneauRessources"
import type { LearnerDocument } from "@/lib/learner-files"
import { filtrerDocuments } from "@/lib/learner-files"
import { LigneDocument } from "@/components/learner/DocumentActions"
import PdfViewer from "@/components/learner/PdfViewer"
import SlidingTrack from "@/components/ui/SlidingTrack"
import { useImmersion } from "./useImmersion"
import BarreCommune, { type ActionBarre, type SonBarre } from "./barre/BarreCommune"

import LessonList from "./LessonList"
import { useLessonPanel, useSmallLessonScreen } from "./useLessonPanel"
import type { LessonMetadata } from "@/lib/lessons/model"

/* ═══════════ COMMANDES DU CADRAN ═══════════ */

/**
 * Les rares gestes du cadran qu'un enfant de la zone de travail doit pouvoir
 * déclencher.
 *
 * Le panneau des leçons est un état INTERNE au cadran, et il doit le rester :
 * le remonter au player obligerait chaque appelant à le porter alors qu'aucun
 * n'a de raison de s'en occuper. Un contexte suffit, et il ne traverse que la
 * distance qui sépare le cadran de ses propres enfants.
 *
 * Hors cadran, `ouvrirLecons` ne fait rien plutôt que de lever : un écran rendu
 * en aperçu ou dans un test n'a pas à connaître son châssis.
 */
type CommandesCadran = { ouvrirLecons: () => void; ouvrirNotes: () => void; ouvrirRessources: () => void; immersion: (active: boolean) => void }

const ContexteCadran = createContext<CommandesCadran>({ ouvrirLecons: () => {}, ouvrirNotes: () => {}, ouvrirRessources: () => {}, immersion: () => {} })

export function useCadranActions(): CommandesCadran {
  return useContext(ContexteCadran)
}

/* ═══════════ CONTRAT ═══════════ */

/**
 * `atelier` n'apparaît que dans le SOMMAIRE : une formation peut mêler
 * chapitres classiques et chapitres de simulation, et le sommaire doit alors
 * les distinguer. La bande de consigne, elle, n'est jamais rendue pour un
 * atelier — c'est le player de simulation qui prend l'écran entier.
 */
export type GenreChapitre = "video" | "quiz" | "document" | "texte" | "atelier" | "anglais"

export type EntreeCadran = LessonMetadata & {
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
  formationTitle?: string
  dureeAfficheeMinutes?: number | null
  filModule: string | null
  filChapitre: string
  /** Position du chapitre dans l'ordre d'apprentissage, à partir de 1. */
  index: number
  total: number
  /** Part des chapitres terminés, 0-100, pour la jauge du cockpit. */
  progression: number
  son?: SonBarre
  outils?: ActionBarre[]
  etapeAnglais?: { rang: number; total: number } | null
  titreLecteur?: string
  moduleLecteur?: string

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
   * travail héberge l'hôte HLS persistant du player. Le démonter au passage
   * sur un chapitre d'atelier laisserait des lecteurs orphelins empilés dans le
   * document — le défaut de suppression silencieux constaté en production.
   */
  visible: boolean
  children: ReactNode
}

/* ═══════════ CONSTANTES VISUELLES ═══════════ */

const COCKPIT = 56
/** La salle. Le noir du simulateur, refroidi pour un contenu vidéo. */
const FOND_SALLE = "#0E1218"

const NATURE: Record<GenreChapitre, { badge: string; icone: string; teinte: string; fond: string; filet: string }> = {
  anglais: { badge: "Anglais", icone: "EN", teinte: "#1B2A4A", fond: "#EEF1F7", filet: "#C8102E" },
  video: { badge: "À regarder", icone: "▶", teinte: "#3730A3", fond: "#EEF2FF", filet: "var(--partner-primary, #4F46E5)" },
  quiz: { badge: "À vous de jouer", icone: "✋", teinte: "#8A5A12", fond: "#FBF1DF", filet: "#C6902A" },
  document: { badge: "À consulter", icone: "👁", teinte: "#3E5A67", fond: "#E8F0F3", filet: "#3E5A67" },
  texte: { badge: "À lire", icone: "👁", teinte: "#3E5A67", fond: "#E8F0F3", filet: "#3E5A67" },
  atelier: { badge: "Atelier", icone: "✋", teinte: "#107C41", fond: "#E7F3EB", filet: "#107C41" },
}





/* ═══════════ COMPOSANT ═══════════ */

export default function CadranFormation(p: Props) {
  const [immersif, setImmersif] = useState(false)
  const anglais = p.genre === "anglais"
  const apercuAnglais = anglais && !p.pleinCadre
  const apercu = useRef<HTMLDivElement>(null)
  // L'aperçu reste dans le flux ; sa scène absolue a besoin d'une hauteur
  // propre. Ne pas déplacer l'iframe : cela perdrait l'exercice en cours.
  useEffect(() => {
    if (!apercuAnglais || !immersif || !p.visible) return
    const scroll = window.scrollY
    const overflow = document.body.style.overflow
    window.scrollTo(0, 0)
    document.body.style.overflow = "hidden"
    const mesurer = () => apercu.current?.style.setProperty("--anglais-apercu-top", `${Math.max(0, apercu.current.getBoundingClientRect().top)}px`)
    mesurer()
    const frame = requestAnimationFrame(mesurer)
    window.addEventListener("resize", mesurer)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", mesurer)
      document.body.style.overflow = overflow
      window.scrollTo(0, scroll)
    }
  }, [apercuAnglais, immersif, p.visible])
  const [panneau, setPanneau] = useState<"lecons" | "notes" | "ressources" | null>(null)
  const immersion = useImmersion(p.visible)
  const petitEcran = useSmallLessonScreen()
  const leconsModales = immersion.active || (anglais && immersif) || petitEcran
  const leconsRef = useLessonPanel(panneau === "lecons", leconsModales, () => setPanneau(null))
  const [replie, setReplie] = useState(false)
  // Préférence locale commune aux lecteurs classiques ; aucun enregistrement métier.
  useEffect(() => { try { setReplie(localStorage.getItem("lms-player-lecons-repliees") === "1") } catch {} }, [])
  const basculerListe = () => {
    if (leconsModales) { setPanneau(panneau === "lecons" ? null : "lecons"); return }
    setReplie(avant => {
      try { localStorage.setItem("lms-player-lecons-repliees", avant ? "0" : "1") } catch {}
      return !avant
    })
  }
  const fermerListe = () => {
    setPanneau(null)
    if (!leconsModales) {
      setReplie(true)
      try { localStorage.setItem("lms-player-lecons-repliees", "1") } catch {}
    }
  }
  const [onglet, setOnglet] = useState<"notes" | "documents" | "description">("description")
  const [documentOuvert, setDocumentOuvert] = useState<LearnerDocument | null>(null)
  const documents = filtrerDocuments([...(p.documentsChapitre || []), ...(p.documentsFormation || [])]).filter((doc, i, all) => all.findIndex((other) => other.id === doc.id) === i)
  const idRessources = useId()

  useEffect(() => {
    if (!panneau) return
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); setPanneau(null) }
    }
    window.addEventListener("keydown", echap)
    return () => window.removeEventListener("keydown", echap)
  }, [panneau])

  // Le portail n'existe qu'après l'hydratation : `document` est absent au rendu
  // serveur. Même contrat que le conteneur d'atelier.
  const [monte, setMonte] = useState(false)
  useEffect(() => { setMonte(true) }, [])

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

  /*
   * Les commandes offertes aux enfants de la zone de travail.
   *
   * Référence stable : sans elle, chaque rendu du cadran ferait re-rendre tout
   * ce qui consomme le contexte — dont l'hôte HLS persistant.
   */
  const commandes = useMemo<CommandesCadran>(() => ({ ouvrirLecons: () => { setReplie(false); setPanneau("lecons") }, ouvrirNotes: () => setPanneau("notes"), ouvrirRessources: () => setPanneau("ressources"), immersion: setImmersif }), [])

  const carte = (
    <ContexteCadran.Provider value={commandes}>
    <div
      className={
        p.pleinCadre
          ? `lms-reader lms-portail ${anglais ? "lms-reader-anglais" : ""} ${anglais && immersif ? "anglais-immersif" : ""} ${replie ? "lms-reader-collapsed" : ""} relative h-full min-h-0 bg-white`
          : `lms-reader lms-portail ${anglais ? "lms-reader-anglais anglais-apercu" : ""} ${anglais && immersif ? "anglais-immersif" : ""} ${replie ? "lms-reader-collapsed" : ""} relative border border-border bg-white shadow-sm`
      }
      style={p.pleinCadre ? undefined : { borderRadius: 16 }}
      data-cadran-formation=""
      data-immersion-panel-open={panneau ? "" : undefined}
      data-lecons-ouvertes={panneau === "lecons" ? "" : undefined}
    >
      <BarreCommune
        module={p.moduleLecteur || p.filModule}
        titre={p.titreLecteur || p.filChapitre}
        compteur={p.etapeAnglais ? { ...p.etapeAnglais, unite: "Étape" } : { rang: p.index, total: p.total, unite: "Chapitre" }}
        progression={{ pourcentage: p.progression }}
        leconsOuvertes={leconsModales ? panneau === "lecons" : !replie}
        onLecons={basculerListe}
        son={p.son}
        outils={p.outils}
        onNotes={p.onNote ? () => setPanneau(panneau === "notes" ? null : "notes") : undefined}
        notesOuvertes={panneau === "notes"}
        onDocuments={() => setPanneau(panneau === "ressources" ? null : "ressources")}
        documentsOuverts={panneau === "ressources"}
        immersion={immersion}
        onQuitter={p.onQuitter}
      />

      {/* La salle. `flex-1 min-h-0` : c'est elle qui absorbe la place restante,
          et c'est ce qui rend le débordement structurellement impossible. */}
      <div
        className={`lms-reader-scene ${p.bilan ? "lms-reader-scene-bilan" : p.genre === "video" ? "lms-reader-scene-video" : "lms-reader-scene-content"} relative flex min-h-0 items-center justify-center${
          /* Écran en portrait (téléphone, tablette tenue droite) : une vidéo 16/9
             n'occupe qu'un tiers de la salle, le reste faisait deux grandes bandes
             noires. La salle se réduit alors à la vidéo et la bande du chapitre
             remonte juste dessous, comme sur une appli vidéo. Les autres genres
             (quiz, PDF) gardent toute la hauteur dont ils ont besoin. */
          p.genre === "video" && !p.bilan ? " portrait:flex-none" : ""
        }`}
        style={{
          /*
           * La salle CLIPPE son contenu. Ce n'est pas une précaution
           * cosmétique : sans elle, une surface plus haute que la salle
           * recouvre le cockpit et en intercepte les clics — mesuré, une vidéo
           * de 790 px dans une salle de 624 rendait le bouton « Leçons »
           * inatteignable sans qu'aucune erreur ne soit levée.
           */
          /*
           * En aperçu admin la carte n'a pas de hauteur définie, donc `h-full`
           * de la vidéo se résoudrait à zéro : elle disparaîtrait sans lever la
           * moindre erreur. La salle se donne alors une hauteur explicite.
           */
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

      <div className="lms-reader-band"><BandeChapitre {...p} description={null} contenu={null} /></div>
      <div className="lms-reader-details">
        <SlidingTrack className="lms-reader-tabs" activeKey={onglet} label="Contenu de la leçon" role="tablist">

          {p.onNote && <button role="tab" aria-selected={onglet === "notes"} onClick={() => setOnglet("notes")}>Notes</button>}
          <button role="tab" aria-selected={onglet === "documents"} onClick={() => setOnglet("documents")}>Documents</button>
          <button role="tab" aria-selected={onglet === "description"} onClick={() => setOnglet("description")}>À propos</button>
        </SlidingTrack>
        <div className="lms-reader-tab-content" role="tabpanel">

          {onglet === "notes" && <>
            <textarea aria-label="Mes notes de la leçon" value={p.note ?? ""} onChange={(e) => p.onNote?.(e.target.value)} placeholder="Écrivez ici ce que vous voulez retenir de ce chapitre…" />
            <p className="mt-2 text-xs">Enregistré automatiquement</p>
            {p.notesHref && <a className="inline-flex min-h-11 items-center text-sm" href={p.notesHref}>Voir toutes mes notes →</a>}
          </>}
          {onglet === "documents" && <>
            {documents.length ? documents.map((doc) => <LigneDocument key={doc.id} doc={doc} onConsulter={setDocumentOuvert} />) : <p>Aucun document disponible.</p>}
            {p.documentsHref && <a className="ml-3 inline-flex min-h-11 items-center text-sm" href={p.documentsHref}>Tous mes documents →</a>}
          </>}
          {onglet === "description" && <>
            <p className="whitespace-pre-line">{p.description || "Aucune description pour cette leçon."}</p>
            {p.contenu && <p className="mt-3 whitespace-pre-wrap">{p.contenu}</p>}
          </>}
        </div>
      </div>

      <div className="lms-reader-footer">
        <button
          type="button"
          data-control="cad-precedent"
          onClick={p.precedent}
          disabled={!p.precedent}
          aria-label="Chapitre précédent"
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border px-3.5 text-[13.5px] font-medium text-warm-600 transition-colors hover:bg-warm-50 disabled:cursor-not-allowed disabled:opacity-40 "
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          <span >Précédent</span>
        </button>
        <button
          type="button"
          data-control="cad-suivant"
          onClick={p.suivant}
          disabled={!p.suivant}
          aria-label="Chapitre suivant"
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border px-3.5 text-[13.5px] font-medium text-warm-600 transition-colors hover:bg-warm-50 disabled:cursor-not-allowed disabled:opacity-40 "
        >
          <span >Suivant</span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

      </div>

      <PdfViewer doc={documentOuvert} onClose={() => setDocumentOuvert(null)} />

      {/* ── Panneaux ─────────────────────────────────────────────────────── */}
      {panneau && panneau !== "lecons" && (
        <div
          role="presentation"
          onClick={() => setPanneau(null)}
          className="lms-reader-overlay absolute inset-0"
          style={{ top: COCKPIT, background: "rgba(8,12,20,.52)", zIndex: 60 }}
        />
      )}

      <button type="button" tabIndex={-1} aria-label="Fermer les leçons" aria-hidden={!(leconsModales && panneau === "lecons")} data-lesson-veil="" data-open={leconsModales && panneau === "lecons"} className="lms-lesson-veil" onClick={() => setPanneau(null)}/>
      <aside ref={leconsRef} aria-label="Toutes les leçons" role={leconsModales?"dialog":undefined} aria-modal={leconsModales && panneau === "lecons"?true:undefined} aria-hidden={leconsModales ? panneau !== "lecons" : replie} data-modal={leconsModales} data-open={panneau === "lecons"} className={`lms-reader-sidebar lms-lesson-panel ${replie ? "lms-reader-sidebar-collapsed" : ""}`}>
        <LessonList entrees={p.sommaire} courant={p.chapterId} anglais={anglais} active={leconsModales?panneau === "lecons":!replie} title={p.formationTitle} minutes={p.dureeAfficheeMinutes} onClose={fermerListe} onNaviguer={id => {setPanneau(null);p.onNaviguer(id)}}/>
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
              className="w-full rounded-xl border border-border p-3 text-[13px] leading-relaxed text-ink outline-none lms-note-focus"
              style={{ minHeight: 170, resize: "vertical" }}
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warm-400">
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9, background: "var(--lesson-brand-accent)" }} />
              Enregistré automatiquement
            </p>
            {p.notesHref && (
              <a
                href={p.notesHref}
                className="mt-1 inline-flex min-h-[44px] items-center text-[12.5px] font-semibold"
                style={{ color: "var(--lesson-brand-accent)" }}
              >
                Voir toutes mes notes →
              </a>
            )}
          </div>
        </aside>
      )}

      {(
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
    </ContexteCadran.Provider>
  )

  if (!p.pleinCadre) return <div ref={apercu} style={{ display: p.visible ? undefined : "none" }}><div ref={immersion.cadre} className={`lms-immersion-cadre lms-immersion-apercu ${immersion.active ? "lms-immersion-active" : ""}`}>{carte}</div></div>
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
   * Le conteneur reste rendu même masqué, pour ne jamais démonter l'hôte HLS.
   */
  return createPortal(
    <div
      ref={immersion.cadre}
      style={{
        position: "fixed",
        top: "calc(var(--app-impersonation-offset, 0px) + var(--app-nav-height, 64px))",
        left: "var(--app-sidebar-offset, 0px)",
        right: 0,
        bottom: 0,
        zIndex: 30,
        background: FOND_SALLE,
        overflow: "hidden",
        display: p.visible ? undefined : "none",
      }}
      className={`lms-portail lms-immersion-cadre ${immersion.active ? "lms-immersion-active" : ""} ${anglais && immersif ? "anglais-portail-immersif" : ""}`}
      data-cadran-portail=""
    >
      {carte}
    </div>,
    document.body,
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
      className="relative flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden px-4 py-3"
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div ref={texteRef} className="min-w-0" style={{ maxHeight: "17vh", overflowY: "auto" }}>
          <span
            data-control="cad-badge"
            className="mb-1.5 inline-flex items-center gap-1.5 rounded-md uppercase"
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: ".03em",
              padding: "4px 8px",
              color: "var(--lms-accent)",
              background: "var(--lms-soft)",
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
            background: "linear-gradient(transparent, var(--surface))",
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
            style={{ borderColor: "var(--lms-line)", background: "var(--lms-paper)" }}
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
            style={{ background: "var(--lms-ink)" }}
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
