/**
 * PowerPoint — l'adaptateur d'application.
 *
 * Implémente `AdaptateurApp` (CONTRAT MULTI-APP §3). C'est la SEULE pièce que
 * les fichiers de couture appellent : `validate.ts`, les quatre `switch`
 * d'`attendu.ts`, `demonstration.ts` et `expurge.ts` ne connaissent pas
 * PowerPoint — ils appellent l'adaptateur. Sans cette inversion, ajouter une
 * application demanderait un `case` dans six fichiers partagés, et l'oubli d'un
 * seul produit un atelier MUET : pas de ligne « Attendu : … », pas de carte de
 * franchissement, pas de réponse au cinquième essai, pas de cible d'aide.
 *
 * ⚠️ Ce fichier n'importe de la couture que des TYPES (`import type`), jamais
 * une valeur : c'est ce qui empêche le cycle
 * `registre.ts → ppt/adaptateur.ts → validate.ts`. Vérifié par
 * `check-frontieres.ts` (règle 4).
 */

import type {
  ActionApp,
  AdaptateurApp,
  CibleGenerique,
  ContexteDemo,
  EtapeApp,
  ObservationApp,
  PlanDemo,
  Verdict,
} from "../contrats"
import type { PptAction, PptTextStyle } from "./actions"
import { JUGEES_SUR_ETAT_PPT, OBSERVABLES_PPT } from "./actions"
import type { PptObservation } from "./observations"
import { NAVIGATION_PPT, OBSERVATIONS_ETAT_PPT } from "./observations"
import {
  CONTROLES_PPT,
  LAYOUTS,
  LAYOUTS_ORDRE,
  LIBELLE_ONGLET_PPT,
  ONGLETS_PPT,
  ongletDuControle,
  validerGeste,
} from "./document"

/* ═══════════ LIBELLÉS DES BOUTONS ═══════════ */

/**
 * Nom lisible de chaque bouton.
 *
 * Sur Excel, « Attendu : un clic sur le bouton indiqué » occupait 239 étapes
 * sans rien apprendre à l'apprenant. Un libellé par contrôle est le remède, et
 * `check-controles` vérifie les DEUX sens : un bouton cliqué par un scénario
 * porte un nom, un nom déclaré désigne un bouton qui existe encore.
 */
export const LIBELLES_CONTROLES_PPT: Readonly<Record<string, string>> = {
  [CONTROLES_PPT.nouvelleDiapo]: "Nouvelle diapositive",
  [CONTROLES_PPT.disposition]: "Disposition",
  [CONTROLES_PPT.supprimerDiapo]: "Supprimer la diapositive",
  [CONTROLES_PPT.dupliquerDiapo]: "Dupliquer la diapositive",
  [CONTROLES_PPT.monterDiapo]: "Monter la diapositive",
  [CONTROLES_PPT.descendreDiapo]: "Descendre la diapositive",
  [CONTROLES_PPT.supprimerObjet]: "Supprimer l'élément",
  [CONTROLES_PPT.gras]: "Gras",
  [CONTROLES_PPT.italique]: "Italique",
  [CONTROLES_PPT.souligne]: "Souligné",
  [CONTROLES_PPT.alignGauche]: "Aligner à gauche",
  [CONTROLES_PPT.alignCentre]: "Centrer",
  [CONTROLES_PPT.alignDroite]: "Aligner à droite",
  [CONTROLES_PPT.zoneTexte]: "Zone de texte",
  [CONTROLES_PPT.image]: "Image",
  [CONTROLES_PPT.forme]: "Formes",
  [CONTROLES_PPT.lancerDebut]: "Diaporama depuis le début",
  [CONTROLES_PPT.lancerCourante]: "Diaporama depuis cette diapositive",
  [CONTROLES_PPT.masquerDiapo]: "Masquer la diapositive",
  [CONTROLES_PPT.quitterShow]: "Quitter le diaporama",
  [CONTROLES_PPT.voletBascule]: "Volet des diapositives",
  [CONTROLES_PPT.notes]: "Notes de l'orateur",
  [CONTROLES_PPT.notesBascule]: "Ouvrir les notes de l'orateur",
  [CONTROLES_PPT.vue("normal")]: "Affichage Normal",
  [CONTROLES_PPT.vue("trieuse")]: "Trieuse de diapositives",
  [CONTROLES_PPT.transition("fondu")]: "Transition Fondu",
  [CONTROLES_PPT.transition("balayage")]: "Transition Balayage",
  [CONTROLES_PPT.transition("aucune")]: "Aucune transition",
  [CONTROLES_PPT.animation("apparaitre")]: "Animation Apparaître",
  [CONTROLES_PPT.animation("fondu")]: "Animation Fondu",
  /* Les onglets sont des boutons comme les autres : ils se pressent, une
     démonstration les ouvre, et « Attendu : … » doit pouvoir les nommer. */
  ...Object.fromEntries(ONGLETS_PPT.map((o) => [CONTROLES_PPT.onglet(o), `Onglet ${LIBELLE_ONGLET_PPT[o]}`])),
  ...Object.fromEntries(
    LAYOUTS_ORDRE.map((id) => [CONTROLES_PPT.dispositionChoix(id), `Disposition « ${LAYOUTS[id].nom} »`]),
  ),
  ...Object.fromEntries(
    (["rectangle", "rectangle-arrondi", "ellipse", "fleche", "bulle", "triangle"] as const).map((s) => [
      CONTROLES_PPT.formeChoix(s),
      `Forme « ${s.replace("-", " ")} »`,
    ]),
  ),
}

/* ═══════════ CE QUE L'ATELIER DIT ═══════════ */

const nomLayout = (id: string) => LAYOUTS[id as keyof typeof LAYOUTS]?.nom ?? id

/**
 * L'action porte-t-elle encore les champs dont les fonctions d'atelier ont
 * besoin ?
 *
 * 🔴 SANS CE GARDE, LES QUATRE ÉVALUATIONS RENDAIENT UN ÉCRAN BLANC.
 *
 * `publierPpt` rend `null` sur `P_TYPE_TEXT`, `P_EXPECT_DECK`,
 * `P_EXPECT_FORMAT` et `P_EXPECT_ANIMATIONS` : en évaluation notée, seule leur
 * espèce circule, jamais leur contenu — c'est ce qui empêche de lire la réponse
 * dans l'onglet réseau. Mais `attendu`, `fait`, `reponse`, `cible` et
 * `demonstration` sont appelées sur cette action réduite, et lisaient
 * `action.cible.startsWith(…)`, `action.deck.nbSlides`, `action.style.bold` :
 * `TypeError` au premier rendu, atelier mort, passage perdu.
 *
 * Invisible en leçon, invisible au banc — seul le chemin SERVI expurge. Prouvé
 * en appelant les cinq fonctions sur la sortie de `publierPpt` pour les seize
 * types.
 */
function complete(action: PptAction): boolean {
  const a = action as unknown as Record<string, unknown>
  switch (action.type) {
    case "P_TYPE_TEXT":
      return typeof a.cible === "string"
    case "P_EXPECT_DECK":
      return !!a.deck
    case "P_EXPECT_FORMAT":
      return !!a.style
    case "P_EXPECT_ANIMATIONS":
      return Array.isArray(a.animations)
    case "P_EXPECT_SHOW":
      return !!a.show
    case "P_SELECT_OBJECT":
    case "P_MOVE_OBJECT":
    case "P_DELETE_OBJECT":
      return typeof a.objectId === "string"
    case "P_MONTRER":
      return typeof a.cible === "string" && typeof a.texte === "string"
    default:
      return true
  }
}

/**
 * La cible d'auteur d'un `P_MONTRER`, traduite pour le calque.
 *
 * Les formes sont celles que les scénarios emploient déjà ailleurs, plus deux
 * qui n'ont de sens que pour une illustration : `ecran`, quand le propos ne se
 * situe nulle part en particulier, et `diapo:<n>`, qui désigne une vignette du
 * volet.
 *
 * ⚠️ `ecran` se traduit par `{ k: "clavier" }`, ce qui ne veut pas dire
 * « clavier » : c'est la forme SANS LIEU du socle, que le calque rend au centre
 * et sans curseur. Une flèche de souris pointée sur rien était l'un des défauts
 * corrigés sur Excel — onze bulles y dessinaient un cadre au milieu du vide.
 */
/**
 * Le type d'une cible de démonstration, DÉRIVÉ du plan plutôt qu'importé.
 *
 * `contrats.ts` ne réexporte que `PlanDemo` et `ContexteDemo` ; aller chercher
 * `CibleDemo` dans `demonstration.ts` ajouterait une arête au graphe de
 * dépendances pour un simple alias de type. La dérivation reste exacte par
 * construction : si le socle change la forme d'une cible, ce fichier suit sans
 * qu'on ait à y penser.
 */
type CibleDemo = PlanDemo["gestes"][number]["cible"]

function cibleMontrer(brut: string): CibleDemo {
  const c = brut.trim()
  if (c === "" || c === "ecran") return { k: "clavier" }
  if (c.startsWith("ctrl:")) return { k: "dom", sel: `[data-control="${c.slice(5)}"]` }
  if (c.startsWith("dom:")) return { k: "dom", sel: c.slice(4) }
  if (c.startsWith("diapo:")) return { k: "dom", sel: `[data-control="${CONTROLES_PPT.miniature(Number(c.slice(6)))}"]` }
  /**
   * ⚠️ LE VOLET N'EXISTE PAS SUR UN PETIT ÉCRAN.
   *
   * Sous le seuil, il devient un TIROIR fermé : `[data-zone="volet"]` ne
   * désigne alors rien, et les 40 bulles qui parlent du volet des miniatures se
   * jouaient à blanc — le compteur allait jusqu'au bout, l'apprenant sur
   * téléphone ne voyait aucun repère. Mesuré au banc à 390 px, invisible à
   * toute lecture du code.
   *
   * Le sélecteur désigne donc le volet OU le bouton qui l'ouvre. `querySelector`
   * rend le premier nœud PRÉSENT : le volet sur grand écran, le bouton du
   * tiroir sur petit — sans que le contenu ait à connaître la largeur.
   */
  if (c === "zone:volet") return { k: "dom", sel: `[data-zone="volet"], [data-control="${CONTROLES_PPT.voletBascule}"]` }
  if (c.startsWith("zone:")) return { k: "dom", sel: `[data-zone="${c.slice(5)}"]` }
  if (c.startsWith("ph:")) return { k: "dom", sel: `[data-ph="${c}"]` }
  if (c.startsWith("[")) return { k: "dom", sel: c }
  return { k: "dom", sel: `[data-object="${c}"]` }
}

/**
 * Désignation lisible d'une cible de saisie : `ph:titre` → « le titre ».
 *
 * ⚠️ `cible` peut être ABSENTE. En évaluation notée, `publierPpt` rend `null`
 * sur `P_TYPE_TEXT` — c'est voulu, la cible fait partie de la réponse — et
 * l'action qui parvient au navigateur ne porte plus que son `type`.
 */
function nommerCible(cible: string | undefined): string {
  if (!cible) return "la zone demandée"
  if (!cible.startsWith("ph:")) return "la zone sélectionnée"
  const noms: Record<string, string> = {
    titre: "le titre",
    "sous-titre": "le sous-titre",
    contenu: "la zone de contenu",
    texte: "la zone de texte",
    pied: "le pied de page",
  }
  const [nom, rang] = cible.slice(3).split("#")
  const base = noms[nom] ?? `la zone « ${nom} »`
  if (!rang || rang === "1") return base
  return rang === "2" ? `${base} de droite` : `${base} n° ${rang}`
}

function decrireStyle(style: Partial<PptTextStyle>): string {
  const bouts: string[] = []
  if (style.bold) bouts.push("en gras")
  if (style.italic) bouts.push("en italique")
  if (style.underline) bouts.push("souligné")
  if (style.align)
    bouts.push(
      { left: "aligné à gauche", center: "centré", right: "aligné à droite", justify: "justifié" }[style.align],
    )
  if (style.size) bouts.push(`en ${style.size} points`)
  return bouts.join(", ") || "mis en forme"
}

/**
 * « Attendu : … » — le repère de réussite.
 *
 * La consigne dit quoi faire ; elle ne dit jamais à quoi on reconnaît que c'est
 * fait. Ces phrases sont DÉDUITES de l'action, jamais rédigées : en écrire une
 * par étape sur des milliers d'étapes est ingérable, et une formulation dérivée
 * suit automatiquement quand le scénario change.
 */
export function attenduPpt(action: PptAction): string | null {
  if (!complete(action)) return null
  switch (action.type) {
    case "P_SELECT_SLIDE":
      return `la diapositive ${action.index + 1} sélectionnée dans le volet`
    case "P_ADD_SLIDE":
      return action.layout
        ? `une diapositive de plus, en « ${nomLayout(action.layout)} »`
        : "une diapositive de plus dans le volet"
    case "P_DELETE_SLIDE":
      return `la diapositive ${action.index + 1} retirée de la présentation`
    case "P_DUPLICATE_SLIDE":
      return `une copie de la diapositive ${action.index + 1}, juste après elle`
    case "P_MOVE_SLIDE":
      return `la diapositive ${action.from + 1} en position ${action.to + 1}`
    case "P_SET_LAYOUT":
      return `la disposition « ${nomLayout(action.layout)} » appliquée`
    case "P_SET_VIEW":
      return action.view === "trieuse"
        ? "l'affichage en trieuse, toutes les diapositives côte à côte"
        : `l'affichage en mode « ${action.view} »`
    case "P_SELECT_OBJECT":
      return "l'élément entouré de ses poignées"
    case "P_TYPE_TEXT":
      return `${nommerCible(action.cible)} renseigné`
    case "P_ADD_OBJECT":
      return action.shape
        ? `une forme « ${action.shape.replace("-", " ")} » posée sur la diapositive`
        : `un élément « ${action.objectType} » posé sur la diapositive`
    case "P_DELETE_OBJECT":
      return "l'élément retiré de la diapositive"
    case "P_MOVE_OBJECT":
      return "l'élément à sa nouvelle place"
    case "P_EXPECT_DECK":
      if (action.deck.nbSlides !== undefined)
        return `une présentation de ${action.deck.nbSlides} diapositives`
      return "la présentation dans l'état décrit par la consigne"
    case "P_EXPECT_FORMAT":
      return `le texte ${decrireStyle(action.style)}`
    case "P_EXPECT_ANIMATIONS":
      return action.animations.length === 1
        ? "une animation dans le volet Animations"
        : `${action.animations.length} animations dans le volet Animations`
    case "P_EXPECT_SHOW":
      if (action.show.actif === false) return "le diaporama terminé, de retour à l'édition"
      if (action.show.index !== undefined)
        return `le diaporama sur la diapositive ${action.show.index + 1}`
      return "le diaporama lancé, en plein cadre"
    /* Une illustration n'attend rien de l'apprenant : lui afficher
       « Attendu : … » lui ferait chercher un geste qui n'existe pas. */
    case "P_MONTRER":
      return null
    default: {
      // Exhaustivité de l'APPLICATION, garantie ici et non dans `validate.ts` :
      // c'est ce qui permet d'ajouter une action sans toucher un fichier gelé.
      const _exhaustif: never = action
      void _exhaustif
      return null
    }
  }
}

/** Rappel du geste, sur la carte de franchissement. */
export function faitPpt(action: PptAction): string | null {
  if (!complete(action)) return null
  switch (action.type) {
    case "P_TYPE_TEXT":
      return `Vous avez renseigné ${nommerCible(action.cible)}`
    case "P_ADD_SLIDE":
      return "Vous avez ajouté une diapositive"
    case "P_DELETE_SLIDE":
      return `Vous avez supprimé la diapositive ${action.index + 1}`
    case "P_DUPLICATE_SLIDE":
      return `Vous avez dupliqué la diapositive ${action.index + 1}`
    case "P_SET_LAYOUT":
      return `Vous avez appliqué la disposition « ${nomLayout(action.layout)} »`
    case "P_SET_VIEW":
      return `Vous êtes passé en mode « ${action.view} »`
    case "P_MOVE_OBJECT":
      return "Vous avez déplacé l'élément"
    case "P_ADD_OBJECT":
      return action.shape
        ? `Vous avez inséré une forme « ${action.shape.replace("-", " ")} »`
        : `Vous avez inséré un élément « ${action.objectType} »`
    case "P_MOVE_SLIDE":
      return `Vous avez déplacé la diapositive ${action.from + 1} en position ${action.to + 1}`
    case "P_EXPECT_SHOW":
      return action.show.actif === false ? "Vous avez quitté le diaporama" : "Vous avez lancé le diaporama"
    /**
     * Les étapes à chemin libre n'ont pas de geste unique à rappeler — c'est
     * leur définition. On dit donc ce qui a été OBTENU, à la voix active.
     *
     * 🔴 Défaut vu sur une capture, pas dans un compteur : la carte annonçait
     * « Étape 8 franchie » puis, en dessous, « la présentation dans l'état décrit
     * par la consigne » — le texte d'`attendu`, recraché tel quel par le repli.
     * Une carte de franchissement qui redit l'attendu n'apprend rien : elle doit
     * dire ce que l'apprenant vient de faire. Samuel a validé cette forme sur
     * Excel (« Vous avez saisi =3+2 dans A1 »).
     */
    case "P_EXPECT_DECK":
      return action.deck.nbSlides !== undefined
        ? `Votre présentation compte maintenant ${action.deck.nbSlides} diapositives`
        : "Vous avez mis la présentation dans l'état demandé"
    case "P_EXPECT_FORMAT":
      return `Vous avez mis le texte ${decrireStyle(action.style)}`
    case "P_EXPECT_ANIMATIONS":
      return "Vous avez réglé les animations"
    case "P_SELECT_OBJECT":
      return "Vous avez sélectionné l'élément"
    case "P_SELECT_SLIDE":
      return `Vous avez ouvert la diapositive ${action.index + 1}`
    case "P_DELETE_OBJECT":
      return "Vous avez supprimé l'élément"
    /* Rien n'a été « fait » : l'apprenant a regardé. Une carte de franchissement
       qui lui prêterait un geste serait fausse. */
    case "P_MONTRER":
      return null
    default: {
      const _exhaustif: never = action
      void _exhaustif
      return null
    }
  }
}

/**
 * La réponse exacte, servie au cinquième essai.
 *
 * ⚠️ Jamais appelée en mode EVALUATION : le noyau y remplace ce palier par
 * « Passer la question ». Ne pas rétablir ce chemin sans reprendre la règle.
 */
export function reponsePpt(action: PptAction): string | null {
  if (!complete(action)) return null
  switch (action.type) {
    case "P_TYPE_TEXT":
      return `Cliquez dans ${nommerCible(action.cible)} et saisissez « ${action.accept[0]} ».`
    case "P_SET_LAYOUT":
      return `Ouvrez « Disposition » et choisissez « ${nomLayout(action.layout)} ».`
    case "P_ADD_SLIDE":
      return "Cliquez sur « Nouvelle diapositive » dans le ruban."
    case "P_DUPLICATE_SLIDE":
      return "Cliquez sur « Dupliquer » dans le ruban."
    case "P_SELECT_SLIDE":
      return `Cliquez sur la miniature ${action.index + 1} dans le volet de gauche.`
    case "P_MOVE_SLIDE": {
      const pas = Math.abs(action.to - action.from)
      const sens = action.to < action.from ? "Monter" : "Descendre"
      return `Affichez la diapositive ${action.from + 1}, puis cliquez ${pas} fois sur « ${sens} ».`
    }
    case "P_DELETE_OBJECT":
      return "Sélectionnez l'élément, puis appuyez sur Suppr ou cliquez sur « Supprimer l'élément »."
    case "P_SET_VIEW":
      return `Cliquez sur « ${LIBELLES_CONTROLES_PPT[CONTROLES_PPT.vue(action.view)] ?? action.view} ».`
    case "P_EXPECT_SHOW":
      return action.show.actif === false
        ? "Appuyez sur Échap pour quitter le diaporama."
        : "Cliquez sur « Diaporama depuis le début »."
    default:
      return attenduPpt(action)
  }
}

/**
 * Où poser le halo d'aide et la démonstration.
 *
 * C'est ici que le choix du DOM se paie en clair : une cible est un SÉLECTEUR,
 * directement résoluble par `querySelector`. Excel a dû reconstruire
 * `getCellRect` depuis les métriques internes du squelette Univer, parce que son
 * rendu est un canvas et qu'il n'existe aucun élément par cellule — une première
 * version cherchait `[data-row][data-col]` et renvoyait toujours `null`.
 */
export function ciblePpt(action: PptAction): CibleGenerique {
  if (!complete(action)) return {}
  switch (action.type) {
    case "P_TYPE_TEXT":
      return action.cible.startsWith("ph:")
        ? { dom: `[data-ph="${action.cible}"]`, zone: action.cible }
        : { dom: `[data-object="${action.cible}"]`, zone: action.cible }
    case "P_SELECT_OBJECT":
    case "P_MOVE_OBJECT":
    case "P_DELETE_OBJECT":
      return { dom: `[data-object="${action.objectId}"]`, zone: action.objectId }
    case "P_SELECT_SLIDE":
      return { controle: CONTROLES_PPT.miniature(action.index) }
    case "P_MOVE_SLIDE":
      return { controle: CONTROLES_PPT.miniature(action.from) }
    case "P_ADD_SLIDE":
      return { controle: CONTROLES_PPT.nouvelleDiapo }
    case "P_DUPLICATE_SLIDE":
      return { controle: CONTROLES_PPT.dupliquerDiapo }
    case "P_DELETE_SLIDE":
      return { controle: CONTROLES_PPT.supprimerDiapo }
    case "P_SET_LAYOUT":
      return { controle: CONTROLES_PPT.dispositionChoix(action.layout) }
    case "P_SET_VIEW":
      return { controle: CONTROLES_PPT.vue(action.view) }
    case "P_ADD_OBJECT":
      return {
        controle: action.shape
          ? CONTROLES_PPT.formeChoix(action.shape)
          : action.objectType === "image"
            ? CONTROLES_PPT.image
            : CONTROLES_PPT.zoneTexte,
      }
    case "P_EXPECT_FORMAT":
      return { dom: `[data-object="${action.objectId}"]`, zone: action.objectId }
    case "P_EXPECT_SHOW":
      return { controle: action.show.actif === false ? CONTROLES_PPT.quitterShow : CONTROLES_PPT.lancerDebut }
    default:
      return { zone: "scene", dom: '[data-zone="scene"]' }
  }
}

/* ═══════════ DÉMONSTRATION « MONTREZ-MOI » ═══════════ */

const domObjet = (ref: string) =>
  ref.startsWith("ph:")
    ? ({ k: "dom", sel: `[data-ph="${ref}"]` } as const)
    : ({ k: "dom", sel: `[data-object="${ref}"]` } as const)

const domControle = (id: string) => ({ k: "dom", sel: `[data-control="${id}"]` }) as const

/**
 * Le plan de la démonstration, déduit de l'action.
 *
 * Le spike avait laissé ce point non traité, et le signalait plutôt que de le
 * bâcler. Il est écrit ici, et il est effectivement PLUS SIMPLE que sur Excel :
 * toutes les cibles sont des sélecteurs CSS, il n'y a aucune géométrie à
 * recalculer depuis un moteur canvas.
 *
 * ⚠️ Deux règles héritées d'Excel, chacune payée par un défaut réel :
 *
 *  1. un geste qui ouvre un MENU doit être joué pour de vrai (`presser`), sinon
 *     le bouton du geste suivant n'existe pas dans le DOM et se joue à blanc —
 *     le compteur va jusqu'au bout et rien n'a été montré ;
 *  2. la démonstration n'écrit PAS le résultat d'une étape jugée sur l'état, sauf
 *     à neutraliser la validation : elle se saborderait en faisant passer
 *     l'étape au milieu de son explication.
 */
export function demonstrationPpt(action: PptAction, ctx: ContexteDemo): PlanDemo | null {
  const plan = planBrutPpt(action, ctx)
  return plan ? avecOuvertureDOnglet(plan) : null
}

/**
 * Ouvre l'onglet du ruban avant de presser un bouton qui y vit.
 *
 * LE défaut que les onglets rouvrent, et la seule raison pour laquelle le lot 1
 * les avait écartés : sur Excel, 55 gestes de démonstration visaient un bouton
 * logé sous un autre onglet. Le ruban ne rend que son onglet actif, donc le
 * bouton n'existait pas dans le DOM : le curseur se promenait sur rien, le
 * compteur allait jusqu'au bout, et l'apprenant qui venait de demander
 * « Montrez-moi » — c'est-à-dire précisément celui qui n'avait pas trouvé
 * l'onglet — ne voyait rien du tout.
 *
 * L'onglet est ouvert POUR DE VRAI (`presser`), jamais seulement désigné : même
 * règle que les menus, où un geste qui se contente de pointer laisse le bouton
 * suivant hors du DOM.
 *
 * L'ouverture est INCONDITIONNELLE, sans consulter l'onglet courant. C'est
 * volontaire à double titre : presser un onglet déjà ouvert ne change rien, et
 * surtout le chemin complet « onglet Insertion, puis Formes » EST la compétence
 * à enseigner. Une démonstration qui sauterait l'étape parce que l'onglet se
 * trouve déjà ouvert apprendrait un geste tronqué.
 */
function avecOuvertureDOnglet(plan: PlanDemo): PlanDemo {
  const premier = plan.gestes[0]
  const id = premier?.presser?.id
  if (!id) return plan
  const onglet = ongletDuControle(id)
  if (!onglet) return plan
  const ctrl = CONTROLES_PPT.onglet(onglet)
  return {
    gestes: [
      {
        cible: domControle(ctrl),
        bulle: `Ouvrez l'onglet « ${LIBELLE_ONGLET_PPT[onglet]} ».`,
        presser: { id: ctrl },
      },
      ...plan.gestes,
    ],
    pas: [`onglet ${LIBELLE_ONGLET_PPT[onglet]}`, ...plan.pas],
  }
}

function planBrutPpt(action: PptAction, _ctx: ContexteDemo): PlanDemo | null {
  if (!complete(action)) return null
  switch (action.type) {
    case "P_TYPE_TEXT":
      return {
        gestes: [
          {
            cible: domObjet(action.cible),
            bulle: `Cliquez dans ${nommerCible(action.cible)}.`,
            selectionner: action.cible,
          },
          {
            cible: domObjet(action.cible),
            bulle: `Saisissez « ${action.accept[0]} ».`,
            frappe: action.accept[0],
            ecrire: { ref: action.cible, valeur: action.accept[0] },
          },
        ],
        pas: ["cliquer", "saisir"],
      }

    case "P_SELECT_SLIDE":
      return {
        gestes: [
          {
            cible: domControle(CONTROLES_PPT.miniature(action.index)),
            bulle: `Cliquez sur la miniature ${action.index + 1}.`,
            presser: { id: CONTROLES_PPT.miniature(action.index) },
          },
        ],
        pas: ["choisir la diapositive"],
      }

    case "P_ADD_SLIDE":
      return {
        gestes: action.layout
          ? [
              {
                cible: domControle(CONTROLES_PPT.nouvelleDiapo),
                bulle: "Cliquez sur « Nouvelle diapositive ».",
                presser: { id: CONTROLES_PPT.nouvelleDiapo },
              },
              {
                cible: domControle(CONTROLES_PPT.disposition),
                bulle: "Ouvrez « Disposition ».",
                presser: { id: CONTROLES_PPT.disposition },
              },
              {
                cible: domControle(CONTROLES_PPT.dispositionChoix(action.layout)),
                bulle: `Choisissez « ${nomLayout(action.layout)} ».`,
                presser: { id: CONTROLES_PPT.dispositionChoix(action.layout) },
              },
            ]
          : [
              {
                cible: domControle(CONTROLES_PPT.nouvelleDiapo),
                bulle: "Cliquez sur « Nouvelle diapositive ».",
                presser: { id: CONTROLES_PPT.nouvelleDiapo },
              },
            ],
        pas: action.layout ? ["ajouter", "ouvrir Disposition", "choisir"] : ["ajouter"],
      }

    case "P_SET_LAYOUT":
      return {
        gestes: [
          {
            cible: domControle(CONTROLES_PPT.disposition),
            bulle: "Ouvrez le menu « Disposition ».",
            // Le menu doit s'ouvrir POUR DE VRAI, sinon le bouton du geste
            // suivant n'est pas dans le DOM et le curseur se promène sur rien.
            presser: { id: CONTROLES_PPT.disposition },
          },
          {
            cible: domControle(CONTROLES_PPT.dispositionChoix(action.layout)),
            bulle: `Choisissez « ${nomLayout(action.layout)} ».`,
            presser: { id: CONTROLES_PPT.dispositionChoix(action.layout) },
          },
        ],
        pas: ["ouvrir Disposition", "choisir"],
      }

    case "P_DUPLICATE_SLIDE":
    case "P_DELETE_SLIDE": {
      const id =
        action.type === "P_DUPLICATE_SLIDE" ? CONTROLES_PPT.dupliquerDiapo : CONTROLES_PPT.supprimerDiapo
      return {
        gestes: [
          {
            cible: domControle(CONTROLES_PPT.miniature(action.index)),
            bulle: `Sélectionnez la diapositive ${action.index + 1}.`,
            presser: { id: CONTROLES_PPT.miniature(action.index) },
          },
          {
            cible: domControle(id),
            bulle: `Cliquez sur « ${LIBELLES_CONTROLES_PPT[id]} ».`,
            // Ni la duplication ni la suppression ne sont idempotentes : les
            // rejouer changerait la présentation une seconde fois. On les montre
            // sans les exécuter — l'apprenant refait le geste ensuite.
          },
        ],
        pas: ["choisir la diapositive", "agir"],
      }
    }

    case "P_SET_VIEW":
      return {
        gestes: [
          {
            cible: domControle(CONTROLES_PPT.vue(action.view)),
            bulle: `Cliquez sur « ${LIBELLES_CONTROLES_PPT[CONTROLES_PPT.vue(action.view)] ?? action.view} ».`,
            presser: { id: CONTROLES_PPT.vue(action.view) },
          },
        ],
        pas: ["changer d'affichage"],
      }

    case "P_ADD_OBJECT": {
      const c = ciblePpt(action).controle
      if (!c) return null
      const viaMenu = !!action.shape
      return {
        gestes: viaMenu
          ? [
              {
                cible: domControle(CONTROLES_PPT.forme),
                bulle: "Ouvrez le menu « Formes ».",
                presser: { id: CONTROLES_PPT.forme },
              },
              { cible: domControle(c), bulle: `Choisissez la forme demandée.` },
            ]
          : [{ cible: domControle(c), bulle: `Cliquez sur « ${LIBELLES_CONTROLES_PPT[c] ?? c} ».` }],
        pas: viaMenu ? ["ouvrir Formes", "choisir"] : ["insérer"],
      }
    }

    case "P_SELECT_OBJECT":
      return {
        gestes: [
          {
            cible: domObjet(action.objectId),
            bulle: "Cliquez sur cet élément.",
            selectionner: action.objectId,
          },
        ],
        pas: ["sélectionner"],
      }

    case "P_MOVE_OBJECT": {
      const dest = action.rect
      return {
        gestes: [
          {
            cible: domObjet(action.objectId),
            bulle: "Sélectionnez l'élément…",
            selectionner: action.objectId,
          },
          {
            cible: domObjet(action.objectId),
            bulle:
              dest.w !== undefined || dest.h !== undefined
                ? "…puis tirez la poignée du coin pour le redimensionner."
                : "…puis faites-le glisser à l'endroit demandé.",
          },
        ],
        pas: ["sélectionner", "déplacer"],
      }
    }

    case "P_DELETE_OBJECT":
      return {
        gestes: [
          {
            cible: domObjet(action.objectId),
            bulle: "Sélectionnez l'élément…",
            selectionner: action.objectId,
          },
          {
            cible: domControle(CONTROLES_PPT.supprimerObjet),
            bulle: "…puis appuyez sur Suppr, ou cliquez sur « Supprimer l'élément ».",
            presser: { id: CONTROLES_PPT.supprimerObjet },
          },
        ],
        pas: ["sélectionner", "supprimer"],
      }

    case "P_EXPECT_SHOW": {
      const id = action.show.actif === false ? CONTROLES_PPT.quitterShow : CONTROLES_PPT.lancerDebut
      return action.show.actif === false
        ? {
            gestes: [{ cible: { k: "clavier" }, bulle: "Appuyez sur Échap pour revenir à l'édition.", touches: ["Échap"] }],
            pas: ["quitter"],
          }
        : {
            gestes: [{ cible: domControle(id), bulle: `Cliquez sur « ${LIBELLES_CONTROLES_PPT[id]} ».` }],
            pas: ["lancer"],
          }
    }

    case "P_EXPECT_FORMAT": {
      const gestes: PlanDemo["gestes"] = [
        {
          cible: domObjet(action.objectId),
          bulle: "Sélectionnez d'abord l'élément à mettre en forme.",
          selectionner: action.objectId,
        },
      ]
      if (action.style.bold)
        gestes.push({ cible: domControle(CONTROLES_PPT.gras), bulle: "Cliquez sur « Gras »." })
      if (action.style.italic)
        gestes.push({ cible: domControle(CONTROLES_PPT.italique), bulle: "Cliquez sur « Italique »." })
      if (action.style.align === "center")
        gestes.push({ cible: domControle(CONTROLES_PPT.alignCentre), bulle: "Cliquez sur « Centrer »." })
      return { gestes, pas: gestes.map((_, i) => (i === 0 ? "sélectionner" : "mettre en forme")) }
    }

    /**
     * Un état à atteindre par un chemin LIBRE ne se montre pas comme un geste :
     * il n'y en a pas un seul. La bande de consigne garde alors sa ligne
     * « Attendu : … », qui dit à quoi on reconnaît que c'est fait — un plan
     * inventé désignerait un chemin parmi d'autres et ferait croire qu'il est le
     * bon.
     */
    /**
     * Le déplacement d'une diapositive A un chemin unique depuis la décision
     * D11 : afficher la diapositive, puis presser Monter ou Descendre autant de
     * fois qu'il faut. Il rendait `null` quand ce geste n'existait pas — une
     * démonstration ne s'invente pas, mais elle se doit d'exister dès que le
     * chemin est déterminé.
     */
    case "P_MOVE_SLIDE": {
      const pas = Math.abs(action.to - action.from)
      const monte = action.to < action.from
      const bouton = monte ? CONTROLES_PPT.monterDiapo : CONTROLES_PPT.descendreDiapo
      const gestes: PlanDemo["gestes"] = [
        {
          cible: domControle(CONTROLES_PPT.miniature(action.from)),
          bulle: `Affichez la diapositive ${action.from + 1}.`,
          presser: { id: CONTROLES_PPT.miniature(action.from) },
        },
      ]
      for (let i = 0; i < pas; i += 1) {
        gestes.push({
          cible: domControle(bouton),
          bulle:
            pas === 1
              ? `Cliquez sur « ${monte ? "Monter" : "Descendre"} ».`
              : `Cliquez sur « ${monte ? "Monter" : "Descendre"} » (${i + 1} sur ${pas}).`,
          presser: { id: bouton },
        })
      }
      return { gestes, pas: ["afficher", ...Array.from({ length: pas }, () => (monte ? "monter" : "descendre"))] }
    }

    /**
     * Illustration pure : on désigne, on explique, on ne feint aucun geste.
     * C'est ce qui permet d'équiper les 191 écrans « À comprendre », dont pas un
     * seul ne pouvait montrer ce qu'il racontait.
     */
    case "P_MONTRER":
      return {
        gestes: [
          {
            cible: cibleMontrer(action.cible),
            bulle: action.texte,
            illustration: true,
            ...(action.ecrire
              ? { ecrire: { ref: action.ecrire.objet, valeur: action.ecrire.texte } }
              : {}),
          },
        ],
        // Aucun pas : une illustration ne se décompose pas en gestes à refaire,
        // et quatre pastilles « Regarder » identiques ne diraient rien. Le
        // compteur « i / n » suffit à situer l'avancement.
        pas: [],
      }

    case "P_EXPECT_DECK":
    case "P_EXPECT_ANIMATIONS":
      return null

    default: {
      const _exhaustif: never = action
      void _exhaustif
      return null
    }
  }
}

/* ═══════════ SÉCURITÉ DES ÉVALUATIONS ═══════════ */

/**
 * Ce qui a le droit de partir au navigateur en évaluation notée.
 *
 * L'expurgation d'Excel prétendait retirer les réponses et ne retirait RIEN :
 * sa liste de clés secrètes en nommait cinq dont une seule existait, si bien que
 * `action.accept` et `action.cells` partaient intacts — un apprenant pouvait
 * lire la réponse dans l'onglet réseau, dans un organisme certifié Qualiopi.
 *
 * On procède donc par LISTE BLANCHE : ce qui n'est pas nommé ici ne sort pas. Un
 * champ ajouté demain à une action est secret par défaut, jamais l'inverse.
 *
 * ⚠️ Retirer les réponses n'a de sens QUE parce que la correction se fait côté
 * serveur (`POST /api/simulations/[chapterId]/verify`). Sans elle, masquer
 * rendrait toutes les évaluations infranchissables — d'où l'ordre imposé par la
 * décision D4 : route de correction d'abord, expurgation ensuite.
 */
export function publierPpt(action: PptAction): Record<string, unknown> | null {
  switch (action.type) {
    // Aucun champ ne peut être divulgué : seul le `type` circule.
    case "P_TYPE_TEXT":
    case "P_EXPECT_DECK":
    case "P_EXPECT_FORMAT":
    case "P_EXPECT_ANIMATIONS":
      return null
    // Ces champs-là ne sont pas des réponses : la consigne les nomme déjà, et la
    // surface en a besoin pour rendre l'étape jouable.
    case "P_SELECT_SLIDE":
    case "P_DELETE_SLIDE":
    case "P_DUPLICATE_SLIDE":
      return { index: action.index }
    case "P_MOVE_SLIDE":
      return { from: action.from, to: action.to }
    case "P_SET_VIEW":
      return { view: action.view }
    case "P_SELECT_OBJECT":
    case "P_DELETE_OBJECT":
    case "P_MOVE_OBJECT":
      return { objectId: action.objectId }
    /**
     * `null`, et surtout PAS `{}`.
     *
     * Les deux se ressemblent — « aucun champ ne sort » — et n'ont pas du tout le
     * même effet : `expurgerScenarioNote` ne remet le `type` que sur `null`
     * (`expurge.ts:459`). Avec `{}`, l'étape partait au navigateur en
     * `action: {}`, SANS MÊME SON TYPE : l'atelier ne pouvait plus savoir de
     * quelle sorte d'action il s'agissait, donc ne pouvait ni la rendre, ni
     * l'expliquer, ni la juger. Défaut trouvé par `check-expurgation-ppt` à sa
     * toute première exécution.
     *
     * Ici, chaque champ EST la réponse : la disposition demandée, l'état du
     * diaporama à atteindre. Seul le type circule.
     */
    case "P_ADD_SLIDE":
    case "P_SET_LAYOUT":
    case "P_EXPECT_SHOW":
      return null
    case "P_ADD_OBJECT":
      return { objectType: action.objectType, shape: action.shape }
    /**
     * Le texte ET la cible partent au navigateur, y compris en évaluation
     * notée : une illustration n'est pas une aide sur une question, c'est le
     * contenu lui-même — un énoncé d'ouverture qui désigne où lire les
     * consignes ne souffle aucune réponse. Même règle que sur Excel, où les
     * 26 énoncés d'évaluation sont équipés comme les autres.
     */
    case "P_MONTRER":
      return { cible: action.cible, texte: action.texte, ecrire: action.ecrire }
    default: {
      const _exhaustif: never = action
      void _exhaustif
      return null
    }
  }
}

/* ═══════════ CLASSIFICATION ═══════════ */

/**
 * Un geste de repérage n'est ni une réussite ni une faute.
 *
 * Excel a payé cher l'absence de cette distinction : sélectionner une colonne
 * avant d'agir comptait une faute, et l'évaluation de son module 4 plafonnait à
 * 95 % pour un parcours parfait. Changer de diapositive ou cliquer un élément
 * pour le regarder n'est pas une erreur.
 */
export function estNavigationPpt(obs: PptObservation): boolean {
  return NAVIGATION_PPT.has(obs.kind)
}

export function seJugeSurEtatPpt(actionType: string): boolean {
  return JUGEES_SUR_ETAT_PPT.has(actionType)
}

/**
 * Cette OBSERVATION rapporte-t-elle un état plutôt qu'un geste ?
 *
 * Symétrique de `seJugeSurEtat`, qui interroge l'action ATTENDUE. Les deux
 * questions sont distinctes : la première dit comment l'étape se juge, la
 * seconde ce que l'observation reçue apporte.
 *
 * Sans ce prédicat, le noyau testait à sa place les cinq `kind` d'Excel en dur.
 * Un `p:deckChange` n'y figurait jamais : chaque état intermédiaire d'une étape
 * à chemin libre comptait une FAUTE, et un parcours PowerPoint parfait sortait
 * à 57 %. Mesuré, puis corrigé dans le socle.
 */
export function estObservationEtatPpt(obs: PptObservation): boolean {
  return OBSERVATIONS_ETAT_PPT.has(obs.kind)
}

/* ═══════════ L'ADAPTATEUR ═══════════ */

export const adaptateurPpt: AdaptateurApp = {
  app: "POWERPOINT",
  prefixe: "P_",

  /**
   * `null` = ce n'est pas mon type d'action, le noyau poursuit.
   *
   * L'état du document voyage DANS l'observation (`p:deckChange`), et non en
   * troisième paramètre : c'est ce qui permet au même juge de tourner côté
   * serveur, où aucune surface n'existe. Même principe que le `stateChange`
   * d'Excel.
   */
  juger(step: EtapeApp, observed: ObservationApp, requiredChannel?: string): Verdict | null {
    const action = step.action as unknown as PptAction
    if (!String(action?.type ?? "").startsWith("P_")) return null
    return validerGeste(action, observed as unknown as PptObservation, requiredChannel)
  },

  attendu: (action: ActionApp) => attenduPpt(action as unknown as PptAction),
  fait: (action: ActionApp) => faitPpt(action as unknown as PptAction),
  reponse: (action: ActionApp) => reponsePpt(action as unknown as PptAction),
  cible: (action: ActionApp) => ciblePpt(action as unknown as PptAction),
  demonstration: (action: ActionApp, ctx: ContexteDemo) =>
    demonstrationPpt(action as unknown as PptAction, ctx),
  publier: (action: ActionApp) => publierPpt(action as unknown as PptAction),

  estNavigation: (observed: ObservationApp) => estNavigationPpt(observed as unknown as PptObservation),
  seJugeSurEtat: seJugeSurEtatPpt,
  estObservationEtat: (observed: ObservationApp) =>
    estObservationEtatPpt(observed as unknown as PptObservation),

  observables: OBSERVABLES_PPT,
  libellesControles: LIBELLES_CONTROLES_PPT,
}
