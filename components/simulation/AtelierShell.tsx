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
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import PanneauRessources, { LIBELLE_RESSOURCES } from "./PanneauRessources"
import GuideFormation from "./GuideFormation"
import { dureeLisible, estimatedSimulationMinutes } from "@/lib/simulation/duree"
import type { LearnerDocument } from "@/lib/learner-files"

/* ═══════════ BALISAGE DES CONSIGNES ═══════════ */

/**
 * Rend une consigne : `**gras**` pour le vocabulaire métier, `==action==` pour le
 * geste à effectuer, et `` `code` `` pour les formules et références.
 *
 * ⚠️ Les quantificateurs sont NON GREEDY et acceptent n'importe quel caractère à
 * l'intérieur. Une version antérieure utilisait `==[^=]+==`, ce qui échouait dès
 * qu'une consigne contenait un signe égal — donc sur toutes les consignes citant
 * une formule, c'est-à-dire les plus importantes. Le balisage s'affichait alors
 * en clair à l'écran. Le prototype PowerPoint a reproduit ce défaut dans son
 * banc, faute d'avoir ce rendu sous la main : c'est précisément pour cela qu'il
 * appartient au châssis et non à chaque application.
 */
const CONSIGNE_RE = /(\*\*[\s\S]+?\*\*|==[\s\S]+?==|`[^`]+`)/g

/**
 * Rendu RÉCURSIF du balisage : une action mise en évidence contient presque
 * toujours une formule ou une référence entre accents graves
 * (« ==saisissez `=3+2`== »). Un découpage à un seul niveau affichait les accents
 * graves en clair à l'intérieur des blocs.
 */
function renderConsigne(text: string, depth = 0): ReactNode[] {
  if (depth > 3) return [text]
  return text
    .split(CONSIGNE_RE)
    .filter(Boolean)
    .map((p, i) => {
      if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-neutral-900">
            {renderConsigne(p.slice(2, -2), depth + 1)}
          </strong>
        )
      }
      if (p.length > 4 && p.startsWith("==") && p.endsWith("==")) {
        return (
          <span key={i} className="font-medium text-emerald-700">
            {renderConsigne(p.slice(2, -2), depth + 1)}
          </span>
        )
      }
      if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) {
        return (
          <code
            key={i}
            className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[12.5px] text-neutral-900"
          >
            {p.slice(1, -1)}
          </code>
        )
      }
      return <span key={i}>{p}</span>
    })
}

export function Consigne({ text }: { text: string }) {
  const nodes = useMemo(() => renderConsigne(text), [text])
  return <p className="text-[13.5px] leading-relaxed text-neutral-800">{nodes}</p>
}

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

/* ═══════════ CIBLES TACTILES DU COCKPIT ═══════════ */

/**
 * LA BOÎTE DU BOUTON FAIT 44 px, SA PASTILLE VISIBLE EN GARDE 28.
 *
 * Le LMS impose 44 px de cible tactile. Les contrôles du cockpit mesuraient
 * 30 × 28 sur téléphone, où leur libellé disparaît et où il ne reste que
 * l'icône — c'est précisément là que la cible compte le plus. Les agrandir
 * visuellement aurait épaissi une barre haute de 44 px déjà pleine.
 *
 * La solution était déjà dans ce fichier, écrite pour le bouton du guide : le
 * BOUTON occupe toute la hauteur de la barre et 44 px de large, sans fond ; le
 * fond est porté par un `<span>` intérieur, qui dessine seul ce que l'apprenant
 * voit. La barre ne change pas d'allure, la cible devient réglementaire.
 *
 * ⚠️ Mesurer LARGEUR ET HAUTEUR en contrôle. Un test qui ne vérifiait que la
 * hauteur a laissé passer des pastilles de 18 × 44 px lors de la QA du guide.
 */
const CIBLE_COCKPIT: React.CSSProperties = {
  height: 44,
  minWidth: 44,
  padding: 0,
  background: "none",
}

/** Le fond visible d'un contrôle du cockpit, selon qu'il est actif ou non. */
function pastilleCockpit(actif: boolean): React.CSSProperties {
  return {
    height: 28,
    background: actif ? "#fff" : "rgba(255,255,255,.09)",
    color: actif ? "#10201B" : "#DCE6E1",
    fontSize: 11.5,
    fontWeight: actif ? 600 : 400,
  }
}

/* ═══════════ LA BANDE DE CONSIGNE ═══════════ */

/**
 * Ce que la bande de consigne doit savoir de l'étape courante.
 *
 * TOUT EST DÉJÀ CALCULÉ PAR LE PLAYER. Le châssis ne reçoit ni action, ni
 * scénario, ni adaptateur : uniquement du texte, des booléens et des gestes. Il
 * ne peut donc rien déduire d'une application particulière — c'est ce qui le
 * rend utilisable tel quel par Word, PowerPoint et Outlook, dont les actions
 * n'ont rien de commun avec une cellule.
 *
 * Les trois applications s'en étaient chacune écrit une version provisoire.
 * C'était du châssis, pas du contenu d'application : le rendre trois fois aurait
 * fait diverger trois fois le badge de nature, le balisage et l'aide.
 */
export type ConsigneAtelier = {
  /* — Ce que l'étape dit — */

  /** Consigne brute, AVEC son balisage `**gras**` / `==action==` / `` `code` ``. */
  texte: string
  /**
   * Nature de l'étape — la question qu'un débutant se pose en premier : « dois-je
   * faire quelque chose, ou seulement regarder ? ». Elle n'avait aucune réponse à
   * l'écran avant l'audit du 29/07/2026 ; le seul indice était NÉGATIF, la
   * présence ou l'absence d'un bouton.
   */
  nature: "lecture" | "action" | "evaluee"
  /** Cette étape n'attend aucun geste (`READ`) : elle se regarde et se comprend. */
  lecture: boolean
  /** L'étape porte une démonstration jouable ; l'atelier le dit explicitement. */
  aDemonstration: boolean
  /**
   * Ligne « Attendu : … ». La consigne dit quoi faire, jamais à quoi on
   * reconnaît que c'est fait. Vient de l'adaptateur de l'application.
   */
  attendu: string | null
  /** Réponse exacte, révélée au cinquième essai. Jamais en évaluation. */
  reponse: string | null

  /* — Aide — */

  /** Texte d'aide de l'étape, `null` s'il n'y en a pas. */
  aide: string | null
  /** L'apprenant a demandé l'indice, ou un palier l'a déclenché. */
  aideVisible: boolean
  /**
   * Une bulle d'aide est DÉJÀ ancrée sur la surface de travail.
   *
   * ⚠️ L'aide ne s'affiche qu'à UN endroit : bulle ancrée si un repère existe,
   * ligne sous la consigne sinon. Les deux se sont affichées mot pour mot, en
   * même temps. Ne jamais supprimer la ligne sans cette condition : sans repère
   * ancré, l'aide disparaîtrait complètement.
   */
  aideAncree: boolean
  /** Bouton « Un indice » : mode exercice, aide pas encore révélée. */
  indiceDisponible: boolean

  /* — État de l'atelier — */

  evaluationNotee: boolean
  /** Compteur d'avancées : sert de clé d'animation, et rejoue l'entrée du texte. */
  relais: number
  /** Le jalon de franchissement est en cours : la coche remplace le reste. */
  relaisActif: boolean
  verdict: { ok: boolean; message?: string } | null
  /**
   * Le message du verdict est DÉJÀ annoncé sur la surface de travail.
   *
   * Même règle que `aideAncree`, pour la même raison : une phrase ne s'affiche
   * qu'à UN endroit. Les applications annoncent une FAUTE par un effet ancré
   * (`lancerFx(kind, rect, message)`) ; la répéter sous la consigne ferait lire
   * deux fois le même mot, ce que l'atelier a déjà payé sur l'aide.
   *
   * ⚠️ Le tâtonnement, lui, ne lance AUCUN effet : le juge pose un verdict
   * porteur d'un message — « Ce n'est pas le message demandé : vérifiez
   * l'expéditeur… » — et ce message mourait ici, faute d'être un écran de
   * lecture. C'est le cas que ce drapeau ouvre.
   *
   * Absent ⇒ l'application n'annonce rien ailleurs, donc on affiche.
   */
  verdictAncre?: boolean
  /** Message de remise d'aplomb du document, `null` s'il n'y a rien à dire. */
  aplomb: string | null
  /** Le juge serveur n'a pas répondu — ni faute, ni silence. */
  panneJuge: "reseau" | "passage" | null
  /** Un enregistrement serveur est en vol : les boutons se verrouillent. */
  passageEnCours: boolean

  /* — Aide progressive — */

  /** Les paliers sont atteints : on propose une issue (essais, tâtonnements, temps). */
  aideProposee: boolean
  /** Une démonstration est en cours ou terminée sur cette étape. */
  demonstration: boolean
  demoFinie: boolean
  /** La démonstration peut être rejouée depuis le début. */
  demoRejouable: boolean

  /* — Repérage et retour — */

  index: number
  total: number
  reculPossible: boolean

  /* — Gestes — le châssis n'en décide aucun, il les déclenche — */

  /** « Montrez-moi » hors évaluation, « Passer la question » en évaluation. */
  onMontrer: () => void
  /** « J'ai compris — continuer » / « Question suivante ». */
  onDebloquer: () => void
  onRejouerDemo: () => void
  onIndice: () => void
  /** « J'ai compris, continuer » d'un écran de lecture. */
  onSuivant: () => void
  onReculer: () => void
}

/**
 * La bande de consigne : pleine largeur sous la zone de travail, filet de
 * couleur à gauche qui porte le verdict.
 *
 * ⚠️ CE BANDEAU EST EN `overflow:hidden` — CE QUI DÉPASSE EST INATTEIGNABLE.
 *
 * Ni défilement, ni clic. Seul le TEXTE défile, dans un bloc plafonné en `vh` ;
 * les BOUTONS vivent hors de ce bloc. Enfermer « Montrez-moi » dans la zone
 * plafonnée l'avait fait passer sous le pli — mesuré à 646 px pour un écran de
 * 639. Un bouton d'action ne se cache pas derrière un défilement.
 */
function BandeConsigne({ c }: { c: ConsigneAtelier }) {
  /**
   * Voile de fondu : le texte est plafonné, et sans lui il se coupait au milieu
   * d'une phrase sans que rien n'annonce la suite.
   */
  const [deborde, setDeborde] = useState(false)
  const texteRef = useRef<HTMLDivElement>(null)
  const majFondu = useCallback(() => {
    const el = texteRef.current
    if (!el) return
    setDeborde(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
  }, [])
  useEffect(majFondu, [majFondu, c.index])

  return (
    <div
      // Repère de mesure : un contrôle automatique doit pouvoir retrouver ce
      // bandeau même quand aucun bouton de progression n'est rendu.
      data-bandeau-consigne=""
      className="relative flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden border-t border-border px-4 py-3"
      style={{
        borderLeft: `4px solid ${
          c.relaisActif ? "#22A75A"
          : c.lecture ? "#3E5A67"
          : c.verdict ? (c.verdict.ok ? "#059669" : "#e11d48")
          : "#107C41"
        }`,
        background:
          c.relaisActif ? "#F2FBF6"
          : c.lecture ? "#fff"
          : c.verdict ? (c.verdict.ok ? "#F2FBF6" : "#FEF4F5")
          : "#fff",
        transition: "background-color .3s ease, border-color .3s ease",
      }}
    >
      {/* Coche de franchissement : elle prend la place du numéro d'étape le temps
          que la nouvelle consigne s'installe. */}
      {c.relaisActif && (
        <span
          aria-hidden
          data-relais="coche"
          className="absolute flex items-center justify-center rounded-full text-white"
          style={{
            left: 16,
            top: "50%",
            width: 26,
            height: 26,
            background: "#22A75A",
            fontSize: 14,
            fontWeight: 700,
            zIndex: 3,
            // Purement décorative : elle ne doit jamais intercepter un clic.
            pointerEvents: "none",
            animation: "sim-coche .78s cubic-bezier(.2,.9,.2,1) both",
          }}
        >
          ✓
        </span>
      )}
      {/* Enveloppe relative : le voile doit rester FIXE en bas du cadre. Posé
          dans le bloc défilant, il glisserait avec le texte. */}
      <div className="relative min-w-0 flex-1">
        <div
          // La clé force le remontage à chaque étape : sans elle, React réutilise
          // le nœud et l'animation d'entrée ne rejoue jamais.
          key={`tx${c.index}`}
          ref={texteRef}
          onScroll={majFondu}
          className="min-w-0 flex-1"
          style={{
            animation: c.relais ? "sim-consigne-in .34s cubic-bezier(.2,.85,.25,1) both" : undefined,
            /**
             * La consigne prenait toute la place dont elle avait besoin, et la
             * zone de travail récupérait le reste. Sur un écran de portable avec
             * une consigne de 600 signes, il ne restait que SEPT lignes de
             * tableau — l'apprenant ne voit plus ce dont on lui parle (audit
             * visuel du 31/07/2026, mesuré à 192 px de feuille sur 1280×720).
             *
             * Elle est donc plafonnée et défile à l'intérieur. Le plafond est en
             * `vh` : sur un grand écran il n'entre jamais en jeu, sur un petit il
             * rend sa place au travail. Les boutons sont hors de ce bloc et
             * restent atteignables sans défiler.
             */
            maxHeight: "17vh",
            overflowY: "auto",
          }}
        >
          <span
            className="mb-1.5 inline-flex items-center gap-1.5 rounded-md uppercase"
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: ".07em",
              padding: "4px 8px",
              color: c.nature === "lecture" ? "#3E5A67" : c.nature === "evaluee" ? "#8A5A12" : "#107C41",
              background:
                c.nature === "lecture" ? "#E8F0F3" : c.nature === "evaluee" ? "#FBF1DF" : "#E7F3EB",
              visibility: c.relaisActif ? "hidden" : undefined,
              animation: c.relais ? "sim-etape-pop .5s cubic-bezier(.2,.9,.2,1) both" : undefined,
            }}
            data-control="sim-badge-etape"
          >
            <span aria-hidden>{c.nature === "lecture" ? "👁" : c.nature === "evaluee" ? "★" : "✋"}</span>
            {/* « À lire » datait du temps où ces écrans n'étaient qu'un
                paragraphe. Ils portent maintenant une démonstration jouée : on y
                REGARDE et on COMPREND, il n'y a rien à lire seul. */}
            {c.nature === "lecture"
              ? c.evaluationNotee
                ? "Énoncé"
                : "À comprendre"
              : c.nature === "evaluee"
              ? "Évalué"
              : "À vous de jouer"}
          </span>
          <div style={{ fontSize: 15, lineHeight: 1.45 }}>
            <Consigne text={c.texte} />
          </div>
          {/* Dire explicitement qu'on n'attend rien : sans cette ligne,
              l'apprenant cherche ce qu'il doit faire pendant que la
              démonstration se joue. */}
          {c.nature === "lecture" && c.aDemonstration ? (
            <p className="mt-1.5 text-[12.5px] text-warm-500">
              <span aria-hidden>👁 </span>
              Démonstration à l’écran — <b className="font-semibold">aucune action attendue</b>.
            </p>
          ) : null}
          {/* Critère de réussite, déduit de l'étape par l'application. */}
          {c.attendu && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-warm-500">
              <span aria-hidden>◎</span>
              Attendu : <b className="font-semibold text-ink">{c.attendu}</b>
            </p>
          )}
          {c.evaluationNotee && c.nature !== "lecture" && (
            <p className="mt-1 text-[12px]" style={{ color: "#8A5A12" }}>
              <span aria-hidden>★ </span>Compté dans votre note
            </p>
          )}
          {/* L'aide ne vit qu'à UN endroit : dans la bulle ancrée à la cible
              quand elle peut l'être, ici sinon. Les deux s'affichaient, mot pour
              mot, sous la consigne et sur la surface de travail. */}
          {!c.evaluationNotee && c.aide && c.aideVisible && !c.aideAncree && (
            <p className="mt-1.5 text-[13px] text-warm-600">
              <span aria-hidden>👉 </span>
              {c.aide}
            </p>
          )}
          {/* Écran de lecture : l'apprenant qui tape ou clique par réflexe ne
              voyait RIEN — la saisie est refusée en silence, et le verdict ne
              sert qu'à teinter le fond. On le lui dit, en gris, sans le moindre
              air de reproche.

              LE MÊME RAISONNEMENT VAUT SUR UNE ÉTAPE D'ACTION. Le test portait
              sur `c.lecture` seul, alors que le refus muet ne lui est pas
              propre : un geste classé TÂTONNEMENT pose un verdict porteur d'une
              phrase utile SANS lancer d'effet ancré, et cette phrase n'était
              rendue nulle part. Chez Outlook, `o:selectMessage` et
              `o:selectFolder` sont toujours de la navigation, donc toujours des
              tâtonnements : 127 étapes sur 728 refusaient le geste sans dire
              pourquoi, alors que l'adaptateur avait écrit l'explication.

              `verdictAncre` empêche le doublon : quand l'application affiche
              déjà le message sur sa surface — ce que fait le flash de FAUTE —,
              on ne le répète pas ici. Un message vide ne rend plus une bulle
              orpheline. */}
          {(c.lecture || !c.verdictAncre) && c.verdict && !c.verdict.ok && c.verdict.message && (
            <p className="mt-1.5 text-[13px] text-warm-600">
              <span aria-hidden>💡 </span>
              {c.verdict.message}
            </p>
          )}
        </div>
        {/* HORS du bloc plafonné à partir d'ici : tout ce qui explique un
            changement que l'apprenant n'a pas demandé, et tout bouton d'action,
            doit rester atteignable sans défiler. */}
        {/* PANNE DU JUGE — ni faute, ni silence. Le verdict d'une évaluation
            vient du serveur : s'il ne revient pas, rien n'est compté et le geste
            reste à refaire. Sans ce bandeau, l'apprenant retape indéfiniment une
            réponse juste devant un atelier muet. */}
        {c.evaluationNotee && c.panneJuge && (
          <p
            data-panne-juge=""
            className="mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "#FDEDEC", border: "1px solid #F3D2CE", color: "#7A2620" }}
          >
            <span aria-hidden>⚠</span>
            <span className="min-w-0 flex-1">
              {c.panneJuge === "reseau" ? (
                <>
                  <b>La correction n&apos;a pas pu être demandée.</b> Rien n&apos;a été compté comme
                  faute : refaites le geste quand la connexion est revenue.
                </>
              ) : (
                <>
                  <b>Ce passage n&apos;est plus actif.</b> Rechargez la page pour en ouvrir un
                  nouveau — rien de ce que vous ferez ici ne serait enregistré.
                </>
              )}
            </span>
          </p>
        )}
        {/* REMISE D'APLOMB : on le DIT, et on le dit là où ça se voit. Le ton
            reste neutre et le score n'est pas touché — explorer n'est pas une
            faute. Cette ligne vivait DANS le bloc plafonné, en quatrième
            position : sur un portable elle passait sous le pli, des cases
            disparaissaient et l'explication était hors champ. */}
        {c.aplomb && (
          <p
            data-aplomb=""
            className="mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "#F4F1EA", border: "1px solid #E4DFD3", color: "#5C574E" }}
          >
            <span aria-hidden>↺</span>
            <span className="min-w-0 flex-1">{c.aplomb}</span>
          </p>
        )}
        {/* Aide progressive : l'apprenant coincé n'est jamais laissé sans issue. */}
        {!c.lecture && c.aideProposee && !c.demonstration && (
          <div
            className="mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "#FDEDEC", border: "1px solid #F3D2CE", color: "#7A2620" }}
          >
            <span className="min-w-0 flex-1">
              <b>Vous bloquez ?</b>{" "}
              {c.evaluationNotee
                ? "Vous pouvez passer cette question — elle sera comptée comme non réussie."
                : "Je peux vous montrer comment faire, vous pourrez ensuite continuer."}
            </span>
            {/* EN ÉVALUATION, CE BOUTON RENONCE VRAIMENT. Il déclenchait une
                démonstration dans les deux modes ; en évaluation le plan vaut
                `null`, donc rien n'était révélé, mais l'atelier annonçait une
                question passée SANS l'avoir dite au serveur. Fermer l'onglet
                entre les deux laissait une interface et un passage en
                désaccord. Un seul clic désormais, et le verrou d'envoi ferme le
                double tap. */}
            <button
              type="button"
              data-control="sim-montrer"
              onClick={c.onMontrer}
              disabled={c.evaluationNotee && c.passageEnCours}
              aria-busy={c.evaluationNotee && c.passageEnCours}
              className="flex-shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold"
              style={{
                border: "1px solid currentColor",
                color: "inherit",
                opacity: c.evaluationNotee && c.passageEnCours ? 0.6 : 1,
              }}
            >
              {c.evaluationNotee
                ? c.passageEnCours
                  ? "Enregistrement…"
                  : "Passer la question"
                : "Montrez-moi"}
            </button>
          </div>
        )}
        {/* Bloc de démonstration : hors évaluation seulement. En évaluation le
            plan vaut `null` et le renoncement se fait d'un seul clic ci-dessus —
            ce bloc y était devenu un cul-de-sac. */}
        {c.demonstration && !c.evaluationNotee && !c.lecture && (
          <div
            className="mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "#E7F3EB", border: "1px solid #BFE3CD", color: "#0C5B31" }}
          >
            <span className="min-w-0 flex-1">
              <span aria-hidden>👉 </span>
              <b>Voici la réponse.</b>{" "}
              {c.reponse ?? "Suivez le repère affiché à l'écran, puis reprenez le geste."}
            </span>
            {/* Rejouer la démonstration : elle dure quelques secondes et un
                apprenant qui a regardé ailleurs n'avait aucun moyen de la revoir
                — il fallait recharger le chapitre. */}
            {c.demoRejouable && (
              <button
                type="button"
                data-control="sim-revoir-demo"
                onClick={c.onRejouerDemo}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold"
                style={{ border: "1px solid currentColor", color: "inherit" }}
              >
                <span aria-hidden>↻</span> Revoir la démonstration
              </button>
            )}
            <button
              type="button"
              data-control="sim-debloquer"
              onClick={c.onDebloquer}
              className="flex-shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold"
              style={{ border: "1px solid currentColor", color: "inherit" }}
            >
              J&apos;ai compris — continuer ›
            </button>
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-200"
          style={{
            // Blanc sur blanc, un dégradé de 26 px ne se voyait pas. Il monte
            // plus haut et finit opaque : la dernière ligne s'efface
            // franchement, ce qui se lit comme « ça continue ».
            height: 40,
            opacity: deborde ? 1 : 0,
            background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,.75) 45%, #fff 100%)",
          }}
        />
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {/* Retour en arrière. Il ne portait qu'un chevron « ‹ » gris pâle, sans
            libellé : personne ne comprenait que c'était le retour à l'étape
            précédente. Il dit maintenant ce qu'il fait, et où il ramène. */}
        {c.reculPossible && (
          <button
            type="button"
            data-control="sim-reculer"
            onClick={c.onReculer}
            aria-label={`Revenir à l'étape ${c.index} sur ${c.total}`}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
            style={{ border: "1px solid #D6D0C5", color: "#3C433F", background: "#fff" }}
          >
            <span aria-hidden style={{ fontSize: 15, lineHeight: 1, marginTop: -1 }}>
              ‹
            </span>
            <span className="hidden sm:inline">Étape précédente</span>
            <span className="sm:hidden">Précédent</span>
            <span
              aria-hidden
              className="rounded px-1.5 py-0.5 text-[10.5px] font-bold"
              style={{ background: "#F0EDE6", color: "#6b6862" }}
            >
              {c.index} / {c.total}
            </span>
          </button>
        )}
        {c.indiceDisponible && (
          <button
            type="button"
            data-control="sim-indice"
            onClick={c.onIndice}
            className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium text-warm-700 hover:bg-warm-50"
          >
            Un indice
          </button>
        )}
        {/* Écran de lecture qui décrit un geste : on le MONTRE. Le paragraphe
            devient une démonstration jouée, rejouable, sans rien exiger de
            l'apprenant — il regarde, puis il continue. Elle se joue seule à
            l'ouverture ; ce bouton ne sert qu'au cas où l'apprenant arrive après
            coup. */}
        {c.lecture && c.aDemonstration && !c.demonstration && (
          <button
            type="button"
            data-control="sim-voir-geste"
            onClick={c.onMontrer}
            className="rounded-lg px-4 py-2 text-[12.5px] font-bold text-white"
            style={{ background: "#107C41" }}
          >
            <span aria-hidden>▶</span> Voir le geste
          </button>
        )}
        {c.lecture && c.aDemonstration && c.demonstration && c.demoFinie && (
          <button
            type="button"
            data-control="sim-revoir-geste"
            onClick={c.onRejouerDemo}
            className="rounded-lg border px-4 py-2 text-[12.5px] font-bold"
            style={{ borderColor: "#107C41", color: "#107C41" }}
          >
            <span aria-hidden>↻</span> Revoir
          </button>
        )}
        {c.lecture && (
          <button
            type="button"
            // Identifiant stable : le libellé a changé, un test qui vise le
            // texte se casse à chaque reformulation.
            data-control="sim-suivant"
            onClick={c.onSuivant}
            // « Suivant » n'indiquait pas qu'il n'y avait rien d'autre à faire
            // sur cette étape : le libellé le dit maintenant. Couleur d'action
            // propre au simulateur : `bg-primary` prenait la couleur du
            // partenaire (violette, puis turquoise) au milieu d'un univers vert.
            className="rounded-lg px-4 py-2 text-[12.5px] font-bold text-white"
            style={{ background: c.evaluationNotee ? "#10201B" : "#3E5A67" }}
          >
            J&apos;ai compris, continuer ›
          </button>
        )}
      </div>
    </div>
  )
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

  /**
   * La bande de consigne, rendue par le châssis SOUS la zone de travail.
   *
   * Absente — écran de fin, page de garde, aperçu admin — la bande n'est pas
   * rendue du tout : la zone de travail occupe alors toute la colonne.
   */
  consigne?: ConsigneAtelier | null

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
  consigne,
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
            data-control="sim-notes"
            onClick={() => setPanneau((p) => (p === "notes" ? null : "notes"))}
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
            data-control="sim-ressources"
            onClick={() => setPanneau((p) => (p === "ressources" ? null : "ressources"))}
            aria-label={LIBELLE_RESSOURCES}
            title={LIBELLE_RESSOURCES}
            aria-expanded={panneau === "ressources"}
            aria-controls={idPanneauRessources}
            className="flex flex-shrink-0 items-center justify-center"
            style={CIBLE_COCKPIT}
          >
            <span
              className="flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3"
              style={pastilleCockpit(panneau === "ressources")}
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
            </span>
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
            className="flex flex-shrink-0 items-center justify-center"
            style={CIBLE_COCKPIT}
          >
            <span
              className="flex items-center justify-center rounded-lg"
              style={{ width: 28, height: 28, background: "rgba(255,255,255,.07)", color: "#CFDAD5", fontSize: 13 }}
            >
              ✕
            </span>
          </button>
        )}
      </div>

      {children}

      {/* La bande de consigne est le DERNIER élément de la colonne, sous la zone
          de travail. Sa place dans le flux fait partie de la garantie
          zéro-scroll : `flex-shrink-0` ici, `flex-1 min-h-0` pour la zone de
          travail au-dessus. Un player qui la rendrait lui-même, enveloppée dans
          un conteneur, romprait la colonne sans qu'aucun compteur s'en aperçoive. */}
      {consigne && <BandeConsigne c={consigne} />}

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
