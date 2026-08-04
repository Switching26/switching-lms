"use client"

/**
 * LE CHÂSSIS DE L'ATELIER — ce que voit l'apprenant, quelle que soit l'app.
 *
 * Extrait de `SimulationPlayer.tsx` en phase 0 du chantier multi-app. Tout ce
 * qui est ici ne parle NI de classeur, NI de cellule, NI de formule : c'est le
 * cadre commun à Excel, Word, PowerPoint et Outlook.
 *
 * Ce que le châssis porte aujourd'hui :
 *  - la CARTE elle-même, et avec elle la garantie « rien ne défile » ;
 *  - le cockpit, la barre haute qui tient le repérage et les commandes ;
 *  - les trois panneaux glissants (leçons / notes / ressources) ;
 *  - le guide transversal de la formation.
 *
 * La zone de travail — grille Excel, page Word, diapositive… — reste au player
 * de l'app, qui la passe en `children`.
 *
 * ⚠️ LA GARANTIE ZÉRO-SCROLL EST STRUCTURELLE, JAMAIS CALCULÉE.
 *
 * La carte est une colonne verticale en `overflow: clip` : le cockpit et la
 * bande de consigne y sont `flex-shrink-0`, la zone de travail `flex-1 min-h-0`,
 * et sa hauteur se MESURE (`useMesureZoneTravail`). C'est la structure qui rend
 * le débordement impossible — invariant n°2 du contrat multi-app. Toute formule
 * du type `window.innerHeight - 305` devient fausse dès qu'un élément change de
 * taille : c'est le défaut que la vidéo du 29/07 montrait.
 *
 * Un player d'app ne doit donc jamais insérer de conteneur intermédiaire entre
 * cette carte et ses trois enfants directs : la colonne se romprait, et le
 * défilement reviendrait sans qu'aucun compteur ne s'en aperçoive.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import PanneauRessources, { LIBELLE_RESSOURCES } from "./PanneauRessources"
import GuideFormation from "./GuideFormation"
import { dureeLisible, estimatedSimulationMinutes } from "@/lib/simulation/duree"
import type { LearnerDocument } from "@/lib/learner-files"

/**
 * Une entrée du sommaire, telle que l'atelier l'affiche dans son panneau
 * « Leçons ».
 *
 * Le type vivait dans `SimulationPlayer.tsx`, qui le réexporte encore pour ses
 * consommateurs (`SimulationChapter`, la page apprenant). Il appartient
 * désormais au châssis : c'est lui qui rend le sommaire, pour les quatre apps.
 */
export type EntreeSommaire = {
  id: string
  titre: string
  /** Module d'appartenance ; null pour un chapitre hors section. */
  module: string | null
  genre: "lecon" | "exercice" | "evaluation" | "autre"
  termine: boolean
  /** Nombre d'étapes du chapitre. 0 quand ce n'est pas une simulation. */
  etapes?: number
  /** Temps estimé, en secondes — même source que l'écran d'ouverture. */
  secondes?: number
}

export type AtelierShellProps = {
  /** Chapitre ouvert : sert à se repérer dans le sommaire. */
  chapterId: string
  /** Mode du chapitre courant, pour l'estimation de temps du sommaire. */
  mode: string
  /**
   * Évaluation notée : le cockpit change entièrement de couleur et porte un
   * badge. Le mode se signalait avant par un simple mot beige.
   */
  evaluationNotee: boolean
  /** Fil d'Ariane, déjà dédoublonné par l'appelant. */
  filModule: string
  filChapitre: string

  /* — Progression — affichage seulement : le châssis ne décide de rien. — */
  index: number
  total: number
  /**
   * Compteur de relais : il change à chaque avancée et sert de clé au segment
   * courant, ce qui rejoue son animation.
   */
  relais: number

  /* — Panneaux — */
  sommaire?: EntreeSommaire[]
  onNaviguer?: (chapterId: string) => void
  note?: string
  onNote?: (valeur: string) => void
  notesHref?: string
  afficherRessources?: boolean
  documentsChapitre?: LearnerDocument[]
  documentsFormation?: LearnerDocument[]
  documentsHref?: string

  /* — Guide — */
  /** L'écran d'ouverture est passé : avant, le guide n'a rien à commenter. */
  introVue: boolean
  cleGuide?: string | null
  /** Aperçu admin : pas de mémoire de première visite. */
  preview?: boolean

  /* — Cadre — */
  /**
   * Atelier plein cadre : la carte occupe toute la hauteur de son conteneur et
   * ne défile jamais. Faux en aperçu admin, où le player reste une carte dans
   * le flux de la page.
   */
  pleinCadre?: boolean
  /**
   * Le chapitre est terminé : l'écran de fin remplace la zone de travail. Le
   * châssis s'en sert pour remettre le cadre à zéro (voir plus bas).
   */
  finished?: boolean

  /* — Sortie — */
  onQuitter?: () => void

  /** La zone de travail de l'app, plus tout ce qui n'est pas encore extrait. */
  children: ReactNode
}

export default function AtelierShell({
  chapterId,
  mode,
  evaluationNotee,
  filModule,
  filChapitre,
  index,
  total,
  relais,
  sommaire,
  onNaviguer,
  note,
  onNote,
  notesHref,
  afficherRessources,
  documentsChapitre,
  documentsFormation,
  documentsHref,
  introVue,
  cleGuide,
  preview,
  pleinCadre,
  finished,
  onQuitter,
  children,
}: AtelierShellProps) {
  /** La carte de l'atelier : cadre du guide, et cible du recentrage ci-dessous. */
  const carteRef = useRef<HTMLDivElement>(null)
  /**
   * Panneau latéral ouvert dans l'atelier : sommaire des leçons, prise de notes
   * ou documents téléchargeables. Un seul à la fois — ils se superposent à la
   * zone de travail, en ouvrir deux la masquerait entièrement.
   */
  const [panneau, setPanneau] = useState<"lecons" | "notes" | "ressources" | null>(null)
  /** Guide transversal de la formation : ouvert/fermé, rien d'autre. */
  const [guideOuvert, setGuideOuvert] = useState(false)
  /** Cible du retour de focus quand le guide se ferme. */
  const boutonGuideRef = useRef<HTMLButtonElement | null>(null)
  /** Cible du `aria-controls` du bouton « Ressource pédagogique téléchargeable ». */
  const idPanneauRessources = useId()
  useEffect(() => {
    if (!panneau) return
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanneau(null)
    }
    window.addEventListener("keydown", echap)
    return () => window.removeEventListener("keydown", echap)
  }, [panneau])

  /**
   * L'ÉCRAN DE FIN REPART DU BORD GAUCHE.
   *
   * Le cadre de l'atelier ne défile pas verticalement, mais il peut défiler
   * HORIZONTALEMENT : la zone de travail est plus large qu'un téléphone, et
   * atteindre son bord droit laisse le conteneur décalé. Quand l'écran de fin la
   * remplace, il héritait de ce décalage — mesuré à 390 × 844 : `scrollLeft` à
   * 170, la carte de bilan commençait à −158 px et sa colonne gauche sortait de
   * l'écran. Le contrôle d'overflow ne le voyait pas : la largeur du document,
   * elle, était juste.
   */
  useEffect(() => {
    if (!finished) return
    const cadre = carteRef.current
    if (cadre) cadre.scrollLeft = 0
  }, [finished])

  return (
    <div
      ref={carteRef}
      // Plein cadre : une colonne verticale qui remplit exactement son conteneur
      // et n'a AUCUN défilement. C'est la structure elle-même qui rend le
      // débordement impossible — la consigne du bas ne peut plus être poussée
      // hors de l'écran, ni une barre de défilement apparaître.
      /**
       * `overflow-clip`, PAS `overflow-hidden`.
       *
       * Les trois panneaux glissants sont rendus en permanence, poussés hors du
       * cadre par `translateX(101%)` : ils portent le `scrollWidth` du conteneur
       * à 721 px pour 390 px visibles. `overflow: hidden` masque ce débordement
       * mais laisse un scrollport — il suffit alors qu'un élément prenne le
       * focus pour que le navigateur fasse défiler tout l'atelier de plusieurs
       * dizaines de pixels, cockpit compris (mesuré à 40 px sur 390 × 844).
       * `overflow: clip` supprime le scrollport : le débordement reste masqué et
       * `scrollLeft` ne peut plus jamais devenir non nul. C'est exactement
       * l'intention déjà écrite plus haut — cette structure « n'a AUCUN
       * défilement » — mais rendue impossible à contourner.
       */
      className={
        pleinCadre
          ? "relative flex h-full min-h-0 flex-col overflow-clip bg-white"
          : "relative overflow-clip border border-border bg-white shadow-sm"
      }
      style={pleinCadre ? undefined : { borderRadius: 16 }}
    >
      {/* Cockpit : une seule barre haute qui porte le repérage et les commandes.
          Avant, deux bandeaux se superposaient (en-tête ivoire pâle + barre de
          titre Excel) et la progression tenait dans un « 1 / 8 » gris de 12 px.
          Le mode évaluation se signalait par un mot beige : il colore désormais
          toute la barre. */}
      <div
        data-control="sim-cockpit"
        className="flex flex-shrink-0 items-center gap-2 px-2 sm:gap-3 sm:px-3"
        style={{
          height: 44,
          background: evaluationNotee ? "#3A2410" : "#10201B",
          color: "#fff",
          fontSize: 12,
        }}
      >
        {sommaire && sommaire.length > 0 && (
          <button
            type="button"
            data-control="sim-sommaire"
            onClick={() => setPanneau((p) => (p === "lecons" ? null : "lecons"))}
            aria-label="Toutes les leçons"
            // Bascule : sans cet état, ni un lecteur d'écran ni un contrôle
            // automatique ne savent si le panneau est ouvert.
            aria-pressed={panneau === "lecons"}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
            style={{
              height: 28,
              background: panneau === "lecons" ? "#fff" : "rgba(255,255,255,.09)",
              color: panneau === "lecons" ? "#10201B" : "#DCE6E1",
              fontSize: 11.5,
              fontWeight: panneau === "lecons" ? 600 : 400,
            }}
          >
            <span aria-hidden>☰</span>
            <span className="hidden sm:inline">Leçons</span>
          </button>
        )}
        {onNote && (
          <button
            type="button"
            data-control="sim-notes"
            onClick={() => setPanneau((p) => (p === "notes" ? null : "notes"))}
            aria-label="Mes notes"
            aria-pressed={panneau === "notes"}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
            style={{
              height: 28,
              background: panneau === "notes" ? "#fff" : "rgba(255,255,255,.09)",
              color: panneau === "notes" ? "#10201B" : "#DCE6E1",
              fontSize: 11.5,
              fontWeight: panneau === "notes" ? 600 : 400,
            }}
          >
            <span aria-hidden>✎</span>
            <span className="hidden sm:inline">Notes</span>
            {note && note.trim() !== "" && (
              <span aria-hidden style={{ width: 5, height: 5, borderRadius: 9, background: "#4ED08A" }} />
            )}
          </button>
        )}
        {afficherRessources && (
          <button
            type="button"
            data-control="sim-ressources"
            onClick={() => setPanneau((p) => (p === "ressources" ? null : "ressources"))}
            aria-label={LIBELLE_RESSOURCES}
            title={LIBELLE_RESSOURCES}
            aria-expanded={panneau === "ressources"}
            aria-controls={idPanneauRessources}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
            style={{
              height: 28,
              background: panneau === "ressources" ? "#fff" : "rgba(255,255,255,.09)",
              color: panneau === "ressources" ? "#10201B" : "#DCE6E1",
              fontSize: 11.5,
              fontWeight: panneau === "ressources" ? 600 : 400,
            }}
          >
            {/* Icône dessinée plutôt qu'un glyphe : les caractères de document
                ne sont pas rendus de la même façon d'un système à l'autre,
                alors que ce bouton n'a QUE son icône sous 1024 px. */}
            <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m0 0l-2-2m2 2l2-2" />
            </svg>
            {/* Le libellé exact ne tient qu'à partir du grand écran : à 640 px,
                il écraserait le fil d'Ariane, seule information dont l'apprenant
                a besoin en permanence. En dessous, il reste porté par
                `aria-label` et `title`. */}
            <span className="hidden lg:inline">{LIBELLE_RESSOURCES}</span>
          </button>
        )}
        <div className="min-w-0 flex-1 truncate text-left sm:text-center" style={{ color: "#8FA49C" }}>
          {evaluationNotee && (
            <span
              className="mr-2 rounded-full"
              style={{ background: "#C6902A", color: "#231604", fontSize: 9.5, fontWeight: 800, padding: "2px 7px", letterSpacing: ".08em" }}
            >
              ÉVALUATION NOTÉE
            </span>
          )}
          {/* Sur téléphone la barre ne peut pas tout porter : le module cède la
              place au titre du chapitre, la seule information dont l'apprenant a
              besoin en permanence. */}
          {filModule && filModule !== filChapitre && (
            <span className="hidden sm:inline">{filModule}&nbsp;&nbsp;|&nbsp;&nbsp;</span>
          )}
          <b style={{ color: "#fff", fontWeight: 600 }}>{filChapitre}</b>
        </div>
        {/* Progression : segments quand le chapitre est court (on voit le chemin
            entier), barre continue au-delà — vingt segments ne se lisent plus. */}
        {total <= 14 ? (
          <div className="hidden flex-shrink-0 items-center gap-[3px] sm:flex" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span
                // La clé du segment courant embarque le compteur de relais : elle
                // change à chaque avancée, ce qui rejoue son animation.
                key={i === index ? `cur${relais}` : i}
                style={{
                  display: "block",
                  width: 13,
                  height: 4,
                  borderRadius: 9,
                  background: i < index ? "#4ED08A" : i === index ? "#fff" : "rgba(255,255,255,.16)",
                  transition: "background-color .3s ease",
                  animation: i === index && relais ? "sim-seg-pop .5s cubic-bezier(.2,.9,.2,1) both" : undefined,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="hidden flex-shrink-0 sm:block" aria-hidden style={{ width: 96, height: 4, borderRadius: 9, background: "rgba(255,255,255,.16)" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 9, background: "#4ED08A", width: `${Math.round((index / Math.max(1, total)) * 100)}%` }} />
          </div>
        )}
        <span
          data-control="sim-progression"
          className="flex-shrink-0 tabular-nums"
          style={{ color: "#8FA49C" }}
        >
          {Math.min(index + 1, total)}/{total}
        </span>
        {/* Guide de la formation. Il vit ICI plutôt que dans la navigation du
            LMS : c'est dans l'atelier qu'on se demande comment revoir une
            démonstration, pas sur la page d'accueil. Sous 640 px le libellé
            cède la place au fil d'Ariane, le `aria-label` le porte seul. */}
        {/* Le BOUTON fait 44 px de haut et de large — toute la hauteur de la
            barre — tandis que sa pastille visible en garde 28, comme les autres
            contrôles du cockpit. La cible tactile est donc réglementaire sans
            que la barre change d'allure : c'est le fond intérieur qui dessine le
            bouton, pas sa boîte. */}
        <button
          type="button"
          data-control="sim-guide"
          ref={boutonGuideRef}
          onClick={() => setGuideOuvert((v) => !v)}
          aria-pressed={guideOuvert}
          aria-label="Guide de la formation"
          title="Guide de la formation"
          className="flex flex-shrink-0 items-center justify-center"
          style={{ height: 44, minWidth: 44, padding: 0, background: "none" }}
        >
          <span
            className="flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
            style={{
              height: 28,
              fontSize: 11.5,
              background: guideOuvert ? "#fff" : "rgba(78,208,138,.15)",
              color: guideOuvert ? "#10201B" : "#BFF0D4",
              fontWeight: guideOuvert ? 600 : 400,
              boxShadow: guideOuvert ? undefined : "inset 0 0 0 1px rgba(78,208,138,.35)",
            }}
          >
            <span aria-hidden>?</span>
            <span className="hidden sm:inline">Guide</span>
          </span>
        </button>
        {onQuitter && (
          <button
            type="button"
            data-control="sim-quitter"
            onClick={onQuitter}
            title="Quitter l'atelier"
            aria-label="Quitter l'atelier"
            className="flex flex-shrink-0 items-center justify-center rounded-lg"
            style={{ width: 28, height: 28, background: "rgba(255,255,255,.07)", color: "#CFDAD5", fontSize: 13 }}
          >
            ✕
          </button>
        )}
      </div>

      {children}

      {/* ── Panneaux de l'atelier ──────────────────────────────────────────────
          Ils se SUPERPOSENT au lieu de pousser le contenu : l'écran garde ses
          dimensions, donc la règle du « rien ne défile » tient même panneau
          ouvert. */}
      {panneau && (
        <div
          role="presentation"
          onClick={() => setPanneau(null)}
          className="absolute inset-0"
          style={{ top: 44, background: "rgba(8,17,14,.5)", zIndex: 60 }}
        />
      )}
      {sommaire && sommaire.length > 0 && (
        <aside
          aria-label="Toutes les leçons"
          aria-hidden={panneau !== "lecons"}
          className="absolute bottom-0 left-0 flex flex-col bg-white shadow-2xl"
          style={{
            top: 44,
            // 460 px : en dessous, « 16 ét. · 11 min » chasse le titre. Au-dessus,
            // le panneau mange la zone de travail, qui reste l'écran de travail.
            width: "min(460px, 86%)",
            zIndex: 70,
            transform: panneau === "lecons" ? "translateX(0)" : "translateX(-101%)",
            transition: "transform .26s cubic-bezier(.32,.72,0,1)",
            visibility: panneau === "lecons" ? "visible" : "hidden",
          }}
        >
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-warm-50 px-3 py-2.5">
            <h4 className="flex-1 text-[13.5px] font-bold">Toutes les leçons</h4>
            <span className="text-[11px] text-warm-400">
              {sommaire.length} chapitres · {dureeLisible(sommaire.reduce((t, e) => t + (e.secondes ?? 0), 0))}
            </span>
            <button
              type="button"
              onClick={() => setPanneau(null)}
              aria-label="Fermer"
              className="rounded-lg bg-warm-100 px-2 py-1 text-[12px] text-warm-600"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <SommaireAtelier
              entrees={sommaire}
              courant={chapterId}
              etapeCourante={index + 1}
              etapesTotal={total}
              modeCourant={mode}
              onNaviguer={(id) => {
                setPanneau(null)
                onNaviguer?.(id)
              }}
            />
          </div>
        </aside>
      )}
      {onNote && (
        <aside
          aria-label="Mes notes"
          aria-hidden={panneau !== "notes"}
          className="absolute bottom-0 right-0 flex flex-col bg-white shadow-2xl"
          style={{
            top: 44,
            width: "min(340px, 84%)",
            zIndex: 70,
            transform: panneau === "notes" ? "translateX(0)" : "translateX(101%)",
            transition: "transform .26s cubic-bezier(.32,.72,0,1)",
            visibility: panneau === "notes" ? "visible" : "hidden",
          }}
        >
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-warm-50 px-3 py-2.5">
            <h4 className="flex-1 text-[13.5px] font-bold">Mes notes</h4>
            <button
              type="button"
              onClick={() => setPanneau(null)}
              aria-label="Fermer"
              className="rounded-lg bg-warm-100 px-2 py-1 text-[12px] text-warm-600"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[11.5px] text-warm-400">
              {filModule && filModule !== filChapitre ? `${filModule} · ` : ""}
              {filChapitre}
            </p>
            <textarea
              value={note ?? ""}
              onChange={(e) => onNote(e.target.value)}
              placeholder="Écrivez ici ce que vous voulez retenir de ce chapitre…"
              className="w-full rounded-xl border border-border p-3 text-[13px] leading-relaxed text-ink outline-none focus:border-emerald-600"
              style={{ minHeight: 170, resize: "vertical" }}
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warm-400">
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9, background: "#107C41" }} />
              Enregistré automatiquement
            </p>
            {notesHref && (
              <a href={notesHref} className="mt-3 inline-block text-[12.5px] font-semibold text-emerald-700">
                Voir toutes mes notes →
              </a>
            )}
          </div>
        </aside>
      )}
      {afficherRessources && (
        <PanneauRessources
          id={idPanneauRessources}
          ouvert={panneau === "ressources"}
          onFermer={() => setPanneau(null)}
          documentsChapitre={documentsChapitre}
          documentsFormation={documentsFormation}
          documentsHref={documentsHref}
        />
      )}
      {/* Guide transversal. Il ne reçoit AUCUN setter du player : ni `setPanneau`,
          ni `goNext`, ni la moindre fonction métier. Il lit le cockpit et
          reconnaît les gestes ; il ne peut donc toucher ni la progression, ni
          les tentatives, ni la note. */}
      {introVue && (
        <GuideFormation
          ouvert={guideOuvert}
          onOuvrir={() => setGuideOuvert(true)}
          onFermer={() => setGuideOuvert(false)}
          conteneur={carteRef}
          declencheur={boutonGuideRef}
          cleGuide={cleGuide}
          sansPremiereVisite={!!preview}
        />
      )}
    </div>
  )
}

/**
 * Sommaire de la formation dans l'atelier.
 *
 * Groupé par module, et seul le module en cours est déplié : sur 27 modules et
 * 246 chapitres, tout ouvrir d'entrée noie l'information (choix Samuel du 29/07).
 */
function SommaireAtelier({
  entrees,
  courant,
  etapeCourante,
  etapesTotal,
  modeCourant,
  onNaviguer,
}: {
  entrees: EntreeSommaire[]
  courant: string
  /** Position dans le chapitre OUVERT — connue du player seul. */
  etapeCourante: number
  etapesTotal: number
  modeCourant: string
  onNaviguer: (id: string) => void
}) {
  const moduleCourant = entrees.find((e) => e.id === courant)?.module ?? null
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({ [moduleCourant ?? "—"]: true })

  const groupes: Array<{ nom: string; items: EntreeSommaire[] }> = []
  for (const e of entrees) {
    const nom = e.module ?? "—"
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.nom === nom) dernier.items.push(e)
    else groupes.push({ nom, items: [e] })
  }

  const PASTILLE: Record<EntreeSommaire["genre"], { l: string; c: string; f: string }> = {
    lecon: { l: "L", c: "#2C6BB0", f: "#E9F1FB" },
    exercice: { l: "E", c: "#107C41", f: "#E7F3EB" },
    evaluation: { l: "★", c: "#8A5A12", f: "#FBF1DF" },
    autre: { l: "·", c: "#8D8880", f: "#F1EEE8" },
  }

  return (
    <>
      {groupes.map((g, i) => {
        const ouvert = ouverts[g.nom] ?? false
        const faits = g.items.filter((x) => x.termine).length
        const estCourant = g.nom === moduleCourant
        return (
          <div key={`${g.nom}-${i}`} className="border-b border-warm-100 last:border-b-0">
            <button
              type="button"
              onClick={() => setOuverts((o) => ({ ...o, [g.nom]: !ouvert }))}
              className="flex w-full items-center gap-2 px-1 py-2 text-left"
            >
              <span
                className="flex flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                style={{
                  width: 21,
                  height: 21,
                  background: estCourant ? "#107C41" : faits === g.items.length ? "#E7F3EB" : "#F1EEE8",
                  color: estCourant ? "#fff" : faits === g.items.length ? "#107C41" : "#8D8880",
                }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{g.nom === "—" ? "Chapitres" : g.nom}</span>
              <span className="flex-shrink-0 text-[10.5px] text-warm-400">
                {faits}/{g.items.length}
                {(() => {
                  const t = g.items.reduce((n, x) => n + (x.secondes ?? 0), 0)
                  return t > 0 ? ` · ${dureeLisible(t)}` : ""
                })()}
              </span>
              <span aria-hidden className="flex-shrink-0 text-[10px] text-warm-400">
                {ouvert ? "▾" : "▸"}
              </span>
            </button>
            {ouvert && (
              <ul className="mb-1.5 list-none pl-7">
                {g.items.map((e) => {
                  const p = PASTILLE[e.genre]
                  const actif = e.id === courant
                    // Le chapitre OUVERT s'étale : on y montre la position exacte
                    // et le temps qu'il reste. Les autres tiennent sur une ligne,
                    // pour qu'une dizaine reste visible sans défiler.
                    const reste = actif
                      ? Math.max(1, estimatedSimulationMinutes(modeCourant, Math.max(0, etapesTotal - etapeCourante + 1)))
                      : 0
                    return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onNaviguer(e.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left"
                        style={{
                          background: actif ? "#fff" : undefined,
                          boxShadow: actif ? "0 1px 2px rgba(0,0,0,.09)" : undefined,
                        }}
                      >
                        <span
                          className="flex flex-shrink-0 items-center justify-center rounded"
                          style={{ width: 15, height: 15, background: p.f, color: p.c, fontSize: 8, fontWeight: 700 }}
                        >
                          {p.l}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span
                            className="min-w-0 truncate text-[12px]"
                            style={{ color: actif ? "#171a18" : "#6E6A62", fontWeight: actif ? 700 : 400 }}
                          >
                            {e.titre}
                          </span>
                          {actif && etapesTotal > 0 && (
                            <>
                              <span className="text-[10.5px] font-bold" style={{ color: "#0b5c30" }}>
                                étape {etapeCourante} sur {etapesTotal} · ≈ {reste} min restantes
                              </span>
                              <span
                                aria-hidden
                                className="mt-0.5 overflow-hidden rounded-sm"
                                style={{ height: 3, background: "#E4E0D8" }}
                              >
                                <span
                                  className="block h-full rounded-sm"
                                  style={{
                                    width: `${Math.round(((etapeCourante - 1) / etapesTotal) * 100)}%`,
                                    background: "#107C41",
                                    transition: "width .3s ease",
                                  }}
                                />
                              </span>
                            </>
                          )}
                        </span>
                        {!actif && !!e.etapes && (
                          <span className="flex-shrink-0 text-[10.5px] text-warm-400">
                            {e.etapes} ét. · {estimatedSimulationMinutes(
                              e.genre === "exercice" ? "EXERCISE" : e.genre === "evaluation" ? "EVALUATION" : "LESSON",
                              e.etapes,
                            )} min
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
