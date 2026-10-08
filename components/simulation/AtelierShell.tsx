"use client"
import LessonList from "@/components/learner/LessonList"
import { useLessonPanel } from "@/components/learner/useLessonPanel"
import type { LessonMetadata } from "@/lib/lessons/model"


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
import PanneauRessources from "./PanneauRessources"
import BarreCommune from "@/components/learner/barre/BarreCommune"
import GuideFormation from "./GuideFormation"
import { useGuideVocal } from "./hooks/useGuideVocal"
import { dureeLisible, estimatedSimulationMinutes } from "@/lib/simulation/duree"
import type { LearnerDocument } from "@/lib/learner-files"
import { C } from "@/lib/simulation/couleurs"

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
          // LE GESTE SOULIGNÉ — l'accent le plus vu de tout l'écran : chaque
          // consigne met en couleur le geste attendu. Il se rendait avec
          // `text-emerald-700`, un vert de Tailwind qui n'était même pas celui
          // d'Excel ; le repli de `C.souligne` conserve sa valeur exacte.
          <span key={i} className="font-medium" style={{ color: C.souligne }}>
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
export type EntreeSommaire = LessonMetadata & {
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
  /**
   * ⚠️ NE DÉCRIT QUE LES ÉCRANS DE LECTURE — son nom ment sur les autres.
   *
   * Le châssis ne le lit que sous `c.lecture`, et c'est la seule raison pour
   * laquelle personne n'a vu que les players le remplissent avec DEUX choses
   * différentes : Word et Outlook y mettent `!!plan`, Excel et PowerPoint
   * `!!step.montrer?.length`. Sur un écran `READ` les deux coïncident, le plan
   * étant justement bâti depuis `montrer`.
   *
   * Mesuré sur les scénarios du dépôt, étapes d'ACTION hors évaluation :
   * Excel 0/1354 et PowerPoint 0/939 portent un `montrer`. Gater quoi que ce
   * soit d'une étape d'action sur ce champ retirerait donc « Montrez-moi » à
   * 1354 étapes Excel et 863 étapes PowerPoint qui ont une VRAIE démonstration.
   * Pour savoir si un geste peut être montré, lire `demoJouable`.
   */
  aDemonstration: boolean
  /**
   * Un plan de démonstration existe RÉELLEMENT pour cette étape.
   *
   * Pourquoi ce champ n'est pas déductible ici : le châssis ne reçoit ni action,
   * ni adaptateur (voir l'en-tête de ce type). Seul le player calcule le plan —
   * `adaptateur.demonstration(action, ctx)` — et lui seul peut donc répondre.
   *
   * Le défaut qu'il ferme : « Montrez-moi » s'affichait sur des étapes où RIEN
   * ne pouvait s'animer, et le bloc de démonstration renvoyait alors l'apprenant
   * vers « le repère affiché à l'écran » — un repère que le calque, faute de
   * plan, n'a jamais dessiné. Mesuré : 316 étapes d'action hors évaluation, dont
   * Outlook 176/550, Word 64/439, PowerPoint 76/939, Excel 0/1354.
   *
   * Sur `O_EXPECT_BOITE`, `O_EXPECT_MAIL`, `P_EXPECT_DECK` et consorts, l'absence
   * de plan est un CHOIX délibéré : ranger un message peut passer par le ruban ou
   * par le menu, et une démonstration montrerait UN chemin en laissant croire
   * qu'il est le seul. Le défaut n'a jamais été l'absence de plan, mais la
   * promesse faite malgré elle.
   *
   * ABSENT ⇒ `true`, c'est-à-dire le comportement d'avant, à l'identique. Un
   * player qui n'a pas encore adopté le champ rend exactement ce qu'il rendait :
   * c'est ce qui garantit Excel inchangé par CONSTRUCTION, et non par prudence.
   */
  demoJouable?: boolean
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

  /**
   * Y a-t-il quelque chose à MONTRER ? Absent ⇒ oui, comme avant.
   *
   * Ce seul booléen sépare les deux visages de l'encart d'aide. Le laisser
   * indéfini rend exactement le code d'hier — c'est la garantie qu'un player non
   * adapté, Excel en tête, ne bouge pas d'un pixel.
   */
  const montrable = c.demoJouable !== false

  /**
   * La réponse exacte se mérite d'un clic, comme avant.
   *
   * Sans plan, l'ancien chemin était : « Montrez-moi » → bloc vert → la réponse.
   * L'animation n'existait pas, mais le clic, lui, existait bien. L'afficher
   * d'office ici la révélerait plus tôt qu'hier, sur la seule foi d'un palier que
   * l'apprenant n'a pas demandé à franchir.
   */
  const [reponseVue, setReponseVue] = useState(false)
  useEffect(() => setReponseVue(false), [c.index])

  return (
    <div
      // Repère de mesure : un contrôle automatique doit pouvoir retrouver ce
      // bandeau même quand aucun bouton de progression n'est rendu.
      data-bandeau-consigne=""
      className="relative flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden border-t border-border px-4 py-3"
      style={{
        borderLeft: `4px solid ${
          // Les trois premiers cas sont SÉMANTIQUES — franchissement, lecture,
          // verdict — et gardent leur couleur quelle que soit l'application.
          // Seul le dernier, l'étape d'action ordinaire, porte l'identité.
          c.relaisActif ? "#22A75A"
          : c.lecture ? "#3E5A67"
          : c.verdict ? (c.verdict.ok ? "#059669" : "#e11d48")
          : C.accent
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
              // « À COMPRENDRE » (bleu-gris) et « ÉVALUÉ » (ambre) disent la
              // NATURE de l'étape : intacts. Seul « À VOUS DE JOUER » porte
              // l'identité de l'application.
              color: c.nature === "lecture" ? "#3E5A67" : c.nature === "evaluee" ? "#8A5A12" : C.encreVoile,
              background:
                c.nature === "lecture" ? "#E8F0F3" : c.nature === "evaluee" ? "#FBF1DF" : C.voile,
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
          {/* Le bandeau suit la NATURE, seule source de la décision — le badge
              au-dessus en dépend déjà. Il testait auparavant « tout sauf une
              lecture », ce qui revenait au même tant que `natureEtape` ne
              connaissait pas le barème : en évaluation, une étape était soit
              une lecture, soit évaluée. Depuis qu'une étape hors barème
              (`points: 0`) est rendue comme une action, ce test-là aurait
              continué d'afficher « Compté dans votre note » sur une consigne
              qui affirme le contraire. Aucune divergence à la bascule : les
              trois valeurs de `nature` n'ont pas d'autre cas. */}
          {c.evaluationNotee && c.nature === "evaluee" && (
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
        {/* Aide progressive : l'apprenant coincé n'est jamais laissé sans issue.
            L'encart SURVIT à `demonstration` quand rien n'est montrable : sinon
            le démarrage automatique au cinquième essai le ferait disparaître au
            profit d'un bloc vert vide, et l'apprenant perdrait du même coup sa
            porte de sortie. */}
        {!c.lecture && c.aideProposee && (!c.demonstration || !montrable) && (
          <div
            /* Repère de contrôle posé UNIQUEMENT sur le nouveau visage : le
               poser toujours ajouterait un attribut au DOM d'Excel, et « rendu
               inchangé » ne se négocie pas, même sur un attribut inerte. */
            data-aide-sans-demo={!montrable && !c.evaluationNotee ? "" : undefined}
            className="mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "#FDEDEC", border: "1px solid #F3D2CE", color: "#7A2620" }}
          >
            <span className="min-w-0 flex-1">
              <b>Vous bloquez ?</b>{" "}
              {c.evaluationNotee
                ? "Vous pouvez passer cette question — elle sera comptée comme non réussie."
                : montrable
                ? "Je peux vous montrer comment faire, vous pourrez ensuite continuer."
                : /* NE JAMAIS DÉSIGNER UN REPÈRE ICI. Le calque n'a pas de plan à
                     jouer, donc il ne dessinera rien : renvoyer vers « le repère
                     affiché à l'écran » envoyait chercher ce qui n'existe pas.
                     Les 316 étapes concernées sont TOUTES des `*_EXPECT_*`, qui
                     se jugent sur l'état obtenu — la phrase ci-dessous décrit
                     donc leur nature exacte, et non un pis-aller.

                     LONGUEUR CALÉE SUR SES DEUX VOISINES (67 et 71 signes). Une
                     première rédaction en faisait 134 : le bandeau est en
                     `overflow:hidden`, et la phrase se coupait en deux à
                     l'écran. Ce qui dépasse ici n'est pas seulement illisible,
                     il est inatteignable. */
                  "Il n’y a pas un geste unique à vous montrer : c’est le résultat obtenu qui est vérifié."}
              {!montrable && !c.evaluationNotee && reponseVue && c.reponse && (
                <>
                  {" "}
                  <b>Ce qu’il faut obtenir :</b> {c.reponse}
                </>
              )}
            </span>
            {/* SANS PLAN, « Montrez-moi » PROMETTAIT CE QUI N'ARRIVERAIT PAS.
                Il reste la seule porte de sortie d'un apprenant coincé — le
                retirer sèchement l'enfermerait —, alors il change de nature au
                lieu de disparaître : la réponse exacte quand elle existe, sinon
                le droit de passer. En ÉVALUATION rien ne bouge : le bouton y
                renonce à la question, ce qui n'a jamais eu de rapport avec
                l'existence d'un plan. */}
            {!montrable && !c.evaluationNotee ? (
              c.reponse && !reponseVue ? (
                <button
                  type="button"
                  data-control="sim-voir-reponse"
                  onClick={() => setReponseVue(true)}
                  className="flex-shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold"
                  style={{ border: "1px solid currentColor", color: "inherit" }}
                >
                  Voir la réponse
                </button>
              ) : (
                <button
                  type="button"
                  data-control="sim-continuer-sans-demo"
                  onClick={c.onDebloquer}
                  className="flex-shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold"
                  style={{ border: "1px solid currentColor", color: "inherit" }}
                >
                  Continuer quand même ›
                </button>
              )
            ) : (
              /* EN ÉVALUATION, CE BOUTON RENONCE VRAIMENT. Il déclenchait une
                 démonstration dans les deux modes ; en évaluation le plan vaut
                 `null`, donc rien n'était révélé, mais l'atelier annonçait une
                 question passée SANS l'avoir dite au serveur. Fermer l'onglet
                 entre les deux laissait une interface et un passage en
                 désaccord. Un seul clic désormais, et le verrou d'envoi ferme le
                 double tap. */
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
            )}
          </div>
        )}
        {/* Bloc de démonstration : hors évaluation seulement. En évaluation le
            plan vaut `null` et le renoncement se fait d'un seul clic ci-dessus —
            ce bloc y était devenu un cul-de-sac.

            `montrable` FERME LE SEUL ENDROIT OÙ L'ATELIER MENTAIT. La phrase de
            repli ci-dessous — « Suivez le repère affiché à l'écran » — n'est
            atteinte que si `reponse` est nulle, et deux populations très
            différentes s'y croisaient. Mesuré sur les scénarios du dépôt, étapes
            d'action hors évaluation :

              · Excel  268 étapes  plan présent, pas de réponse → la phrase est
                                   VRAIE, le calque dessine bien un repère ;
              · Outlook 176 étapes AUCUN plan → le repère n'existait nulle part.

            (Word 64 et PowerPoint 76 sans plan portent tous une `reponse` : ils
            lisaient donc une réponse écrite, promesse non tenue mais pas fausse
            direction.) La phrase reste donc INTACTE — la corriger aurait dégradé
            les 268 étapes Excel où elle est juste. C'est l'ouverture du bloc qui
            était fautive, pas son texte. */}
        {c.demonstration && montrable && !c.evaluationNotee && !c.lecture && (
          <div
            className="mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
            // ⚠️ CET ENCART RESTE VERT, quelle que soit l'application.
            // Décision de Samuel du 07/08/2026 : il apparaît quand l'apprenant
            // a bloqué, juste au-dessus d'un encart rouge. Le passer au corail
            // de PowerPoint le rapprocherait de l'alerte. Ne pas « harmoniser ».
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
              className="rounded px-1.5 py-0.5 text-[11px] font-bold"
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
            style={{ background: C.accent }}
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
            style={{ borderColor: C.accent, color: C.accent }}
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
   * Étape courante, pour le GUIDE VOCAL — et pour lui seul.
   *
   * C'est la seule chose que le châssis ne peut pas déduire : il reçoit le
   * TEXTE de la consigne, jamais son identité. Chaque player la passe en une
   * ligne, comme `demoJouable` ou `verdictAncre`.
   *
   * ABSENT ⇒ aucune voix, aucun bouton, rendu strictement identique à celui
   * d'avant. Un player qui n'aurait pas adopté le champ n'a rien à craindre.
   */
  etapeId?: string | null

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
  etapeId,
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
  const leconsRef = useLessonPanel(panneau === "lecons", true, () => setPanneau(null))
  /** Cible du retour de focus quand le guide se ferme. */
  const boutonGuideRef = useRef<HTMLButtonElement | null>(null)

  /**
   * 🔴 UNE DÉMONSTRATION QUI DÉMARRE NE DOIT PAS SE JOUER DERRIÈRE UN PANNEAU.
   *
   * Le cas, sans aucun forçage : l'apprenant arrive sur un écran « À comprendre »,
   * ouvre le sommaire pour voir où il en est — le geste le plus banal qui soit —
   * et un peu plus d'une seconde plus tard la démonstration démarre TOUTE SEULE,
   * entièrement derrière le panneau. Il ne voit rien, le compteur affiche 3/3,
   * et il ne peut même pas la rejouer : le bouton est lui aussi sous le voile.
   *
   * La cause n'est ni dans le player ni dans le cliché — c'est une frontière que
   * personne ne surveillait :
   *
   *     calque de démonstration (DemonstrationGeste) ....... plan 40
   *     voile des panneaux (ici) ........................... plan 60
   *     panneau lui-même ................................... plan 70
   *
   * Mesuré par l'agent Excel en 1440×900 : sommaire ou notes ouverts, **0 repère
   * visible sur 24**. Guide ouvert : 19 sur 24. Sans rien ouvrir : 24 sur 24.
   * Ampleur : 233 écrans « À comprendre » sur Excel, 191 sur PowerPoint, 65 sur
   * Word — tous démarrent seuls. Outlook n'en a aucun (55 écrans de lecture,
   * mais aucun ne porte de démonstration).
   *
   * POURQUOI FERMER LE PANNEAU, ET NON REMONTER LE CALQUE.
   * Faire passer le calque au-dessus du panneau donnerait des repères flottant
   * par-dessus une surface blanche : ils désigneraient des cellules que le
   * panneau cache. Ce serait pire que le défaut — on verrait la démonstration
   * sans voir ce dont elle parle. Sur un écran « À comprendre », la
   * démonstration EST le contenu : elle dure quelques secondes, et le panneau se
   * rouvre d'un seul clic.
   *
   * ⚠️ ON NE FERME QU'AU DÉMARRAGE, jamais pendant. Ouvrir un panneau alors
   * qu'une démonstration joue déjà est un choix de l'apprenant : on ne lui
   * arrache pas ce qu'il vient d'ouvrir. C'est pour cela qu'on surveille la
   * BASCULE de `demonstration`, et non sa valeur.
   */
  const demoEnCours = !!consigne?.demonstration
  const demoPrecedenteRef = useRef(demoEnCours)
  useEffect(() => {
    const demarre = demoEnCours && !demoPrecedenteRef.current
    demoPrecedenteRef.current = demoEnCours
    if (!demarre) return
    setPanneau(null)
    setGuideOuvert(false)
  }, [demoEnCours])
  /** Cible du `aria-controls` du bouton « Ressource pédagogique téléchargeable ». */
  const idPanneauRessources = useId()
  useEffect(() => {
    if (!panneau) return
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); setPanneau(null) }
    }
    window.addEventListener("keydown", echap)
    return () => window.removeEventListener("keydown", echap)
  }, [panneau])

  /**
   * LE GUIDE VOCAL — la voix qui lit l'étape.
   *
   * Il est monté ICI, dans le châssis, pour la même raison que la bande de
   * consigne : lire un énoncé à voix haute ne parle d'aucune application. Les
   * quatre players lui passent une seule chose, l'identifiant de l'étape.
   *
   * ⚠️ `demonstrationAutomatique` mérite son détour. Un écran « À comprendre »
   * porteur d'un `montrer` lance sa démonstration TOUT SEUL, 1,2 s après
   * l'arrivée. Une voix qui démarrerait à 0,6 s serait donc couverte au bout
   * d'une demi-seconde, sur les 489 écrans concernés. La voix attend que la
   * démonstration soit finie — c'est la règle « jamais superposée », et c'est la
   * démonstration qui a la priorité : elle porte déjà son texte à l'écran.
   */
  const voix = useGuideVocal({
    chapterId,
    etapeId,
    // L'aperçu admin ne parle pas, et l'écran de fin n'a plus rien à dire.
    actif: !preview && !finished,
    introVue,
    demonstration: !!consigne?.demonstration,
    demoFinie: !!consigne?.demoFinie,
    demonstrationAutomatique: !!consigne?.lecture && !!consigne?.aDemonstration,
    aideVisible: !!consigne?.aideVisible,
    zoneRef: carteRef,
  })

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
      data-immersion-atelier=""
      data-immersion-panel-open={panneau || guideOuvert ? "" : undefined}
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
      {/* Le bloc-notes suit l'accent calculé de l'organisme. */}
      <style>{`.sim-focus-accent:focus { border-color: var(--lesson-brand-accent) }`}</style>
      <BarreCommune
        atelier
        module={filModule}
        titre={filChapitre}
        compteur={{ rang: Math.min(index + 1, total), total, unite: "Étape" }}
        progression={{ etapes: total, courant: index, accent: C.accent }}
        evaluationNotee={evaluationNotee}
        leconsOuvertes={panneau === "lecons"}
        onLecons={() => setPanneau(panneau === "lecons" ? null : "lecons")}
        onNotes={onNote ? () => setPanneau(panneau === "notes" ? null : "notes") : undefined}
        notesOuvertes={panneau === "notes"}
        onDocuments={afficherRessources ? () => setPanneau(panneau === "ressources" ? null : "ressources") : undefined}
        documentsOuverts={panneau === "ressources"}
        son={{
          disponible: voix.disponible && voix.etapeSonore, active: !voix.coupee, enLecture: voix.enLecture,
          rejouer: voix.rejouer, arreter: voix.arreter, basculer: voix.basculerCoupure,
        }}
        onGuide={() => setGuideOuvert(!guideOuvert)}
        guideOuvert={guideOuvert}
        guideRef={boutonGuideRef}
        onQuitter={onQuitter}
      />

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
      {panneau && panneau !== "lecons" && (
        <div
          role="presentation"
          onClick={() => setPanneau(null)}
          className="absolute inset-0"
          style={{ top: 56, background: "rgba(8,17,14,.5)", zIndex: 60 }}
        />
      )}
      <button type="button" tabIndex={-1} aria-label="Fermer les leçons" aria-hidden={panneau !== "lecons"} data-lesson-veil="" data-open={panneau === "lecons"} className="lms-lesson-veil" onClick={() => setPanneau(null)}/>
      {sommaire && sommaire.length > 0 && (
        <aside ref={leconsRef} aria-label="Toutes les leçons" role="dialog" aria-modal={panneau === "lecons"?true:undefined} aria-hidden={panneau !== "lecons"} className="lms-lesson-panel lms-atelier-lessons" data-open={panneau === "lecons"}>
          <LessonList entrees={sommaire} courant={chapterId} active={panneau === "lecons"} onClose={() => setPanneau(null)} onNaviguer={id => {setPanneau(null);onNaviguer?.(id)}}/>
        </aside>
      )}
      {onNote && (
        <aside
          aria-label="Mes notes"
          aria-hidden={panneau !== "notes"}
          className="absolute bottom-0 right-0 flex flex-col bg-white shadow-2xl"
          style={{
            top: 56,
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
              className="lms-panel-close rounded-lg bg-warm-100 text-[12px] text-warm-600"
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
              className="w-full rounded-xl border border-border p-3 text-[13px] leading-relaxed text-ink outline-none sim-focus-accent"
              style={{ minHeight: 170, resize: "vertical" }}
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warm-400">
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9, background: "var(--lesson-brand-accent)" }} />
              Enregistré automatiquement
            </p>
            {notesHref && (
              <a href={notesHref} className="mt-3 inline-flex min-h-11 items-center text-[12.5px] font-semibold" style={{ color: "var(--lesson-brand-accent)" }}>
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
