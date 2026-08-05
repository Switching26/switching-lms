/**
 * PowerPoint — union des actions de l'application.
 *
 * ⚠️ CE FICHIER N'IMPORTE RIEN. Pas même un `import type`. C'est une FEUILLE de
 * l'arbre de dépendances, imposée par le CONTRAT MULTI-APP §2.a et vérifiée par
 * `check-frontieres.ts` (règle 1).
 *
 * Ce n'est pas de la coquetterie : trois agents écrivent ces fichiers en
 * parallèle, et une feuille sans import ne dépend pas de l'ordre de livraison
 * des autres. C'est aussi ce qui interdit tout cycle d'import.
 *
 * Corollaire assumé : les types de DONNÉES nécessaires aux actions sont déclarés
 * ici plutôt qu'importés de `document.ts` — et c'est `document.ts` qui les
 * importe, jamais l'inverse. La dépendance ne descend que dans un sens.
 *
 * Toutes les variantes portent le préfixe `P_` (contrat §2.c). Aucun type Excel
 * existant ne commence ainsi, et `estTypeApp` teste `/^[WPO]_/`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CES PRIMITIVES-LÀ, ET PAS D'AUTRES
 *
 * Chacune est ÉMISE par la surface et a été jouée. Aucune n'est là par
 * déduction : `CLICK_CELL_MODIFIER` avait été inscrit au format d'Excel sur une
 * supposition, n'a jamais été émis par Univer, et aurait bloqué l'apprenant sans
 * le moindre message. `OBSERVABLES_PPT`, en fin de fichier, est le contrat que
 * `check-scenario` fait respecter — ce qu'une surface émet se PROUVE au
 * navigateur, il ne se déduit pas d'un nom de type.
 */

/* ═══════════ UNITÉS ET DONNÉES ═══════════ */

/**
 * Scène logique : 960 × 540 pour un 16:9, 960 × 720 pour un 4:3.
 *
 * Un auteur écrit `{ x: 80, y: 120, w: 800, h: 90 }` et obtient le même cadrage
 * à 1440 px comme à 390 px : la surface applique un facteur d'échelle unique.
 * Excel, lui, a dû RECALCULER sa géométrie depuis les métriques internes du
 * moteur canvas, et elle dérivait entre le banc et le lecteur — huit « limites
 * du pilote » au balayage final des 246 chapitres venaient de là. Ici la
 * géométrie est DÉCLARÉE, donc connue avant même le rendu.
 *
 * Pas les EMU d'OOXML (914 400 par pouce) : exacts mais illisibles — un titre
 * ferait `{ x: 838200, y: 365125 }`. On écrit des scénarios à la main par
 * centaines ; la conversion reste un simple facteur si un export arrive un jour.
 */
export const SCENE_16_9 = { w: 960, h: 540 } as const
export const SCENE_4_3 = { w: 960, h: 720 } as const

export type PptRect = { x: number; y: number; w: number; h: number }

export type PptLayoutId =
  | "diapositive-de-titre"
  | "titre-et-contenu"
  | "titre-seul"
  | "deux-contenus"
  | "comparaison"
  | "vide"

/**
 * Espaces réservés, vocabulaire repris d'`ISlideData` (Univer), donc de l'API
 * Google Slides et d'OOXML. C'est la notion centrale de PowerPoint, et celle que
 * les débutants ratent : on ne dessine pas une zone de texte au hasard, on
 * remplit l'emplacement que la disposition a prévu.
 */
export type PptPlaceholder =
  | "titre"
  | "sous-titre"
  | "contenu"
  | "texte"
  | "image"
  | "tableau"
  | "graphique"
  | "numero"
  | "pied"
  | "date"

export type PptObjectType = "texte" | "image" | "forme" | "tableau" | "graphique" | "trait"

/**
 * Six formes, pas les 187 `prst-geom-type` d'OOXML : l'inventaire des leçons de
 * référence ne fait jamais dessiner autre chose. En ajouter une est additif.
 */
export type PptShape = "rectangle" | "rectangle-arrondi" | "ellipse" | "fleche" | "bulle" | "triangle"

export type PptTextStyle = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** Taille en points, telle que l'apprenant la lit dans le ruban. */
  size?: number
  color?: string
  font?: string
  align?: "left" | "center" | "right" | "justify"
  /** Profondeur de puce. 0 = pas de puce. Le mode plan lit cette profondeur. */
  level?: number
  bullet?: "puce" | "numero" | "aucune"
}

export type PptTransitionKind =
  | "aucune"
  | "fondu"
  | "balayage"
  | "pousser"
  | "decouvrir"
  | "damier"
  | "morphose"

export type PptTransition = {
  kind: PptTransitionKind
  duree?: number
  direction?: "gauche" | "droite" | "haut" | "bas"
  /** Passage automatique après N secondes, au lieu du clic. */
  apresSecondes?: number
}

export type PptAnimationKind = "apparaitre" | "fondu" | "entree-brusque" | "zoom" | "rotation" | "estomper"

export type PptAnimation = {
  objectId: string
  kind: PptAnimationKind
  categorie?: "ouverture" | "emphase" | "fermeture"
  declencheur?: "clic" | "avec-precedent" | "apres-precedent"
  /** Rang d'exécution, ce que le volet Animations fait manipuler. */
  ordre: number
  duree?: number
}

/** Mode d'affichage. Trois modules du programme de référence ne parlent que de ça. */
export type PptViewMode = "normal" | "trieuse" | "plan" | "notes" | "lecture"

export type PptShowAttendu = {
  actif?: boolean
  index?: number
  ecran?: "normal" | "noir" | "blanc"
  presentateur?: boolean
}

/* ═══════════ TOLÉRANCES ═══════════ */

/**
 * Tolérance de position PAR DÉFAUT, en unités de scène — décision D2.
 *
 * Exiger le pixel exact d'un glissement rendrait toute étape de déplacement
 * infranchissable : le pire défaut d'un simulateur pédagogique est de refuser
 * une réponse correcte.
 *
 * 36 unités ≈ 3,75 % de la largeur. C'est la fourchette 30-40 arbitrée par le
 * chef d'orchestre, prise en son milieu — et elle vaut pour TOUS les écrans, pas
 * seulement pour le doigt.
 *
 * ⚠️ POURQUOI PAS UNE TOLÉRANCE QUI S'ÉLARGIT SUR PETIT ÉCRAN, qui semblait
 * pourtant le calque exact de la décision : parce que le juge tourne AUSSI côté
 * serveur, où aucune fenêtre n'existe. Il faudrait alors que le navigateur
 * déclare « je suis à l'étroit » dans l'observation — c'est-à-dire laisser le
 * client choisir la sévérité de sa propre correction, dans une évaluation notée.
 * Une valeur unique supprime la question : elle est reproductible partout, et un
 * seul corpus reste un seul corpus, ce que D2 demande d'abord.
 *
 * Chiffre qui justifie le niveau : à 390 px la scène tombe à ≈ 374 × 210 px,
 * donc à l'échelle 0,39. Les anciennes 12 unités n'y faisaient plus que 4,7 px
 * réels — le quart d'une pulpe de doigt. 36 unités en font 14.
 */
export const TOLERANCE_DEFAUT = 36

/**
 * Tolérance serrée, à réserver aux rares étapes où le placement EST la
 * compétence évaluée (aligner deux objets, caler une image sur une marge).
 *
 * À n'employer qu'en le disant dans la consigne : sinon l'apprenant est refusé
 * sans comprendre pourquoi la même précision passait à l'étape d'avant.
 */
export const TOLERANCE_FINE = 12

/* ═══════════ ACTIONS ═══════════ */

/**
 * Les primitives génériques du noyau qui gardent leur sens ici — `READ`,
 * `MONTRER`, `KEY`, `CLICK_CONTROL`, `CONTEXT_MENU`, `DOUBLE_CLICK` — ne sont
 * PAS redéclarées : elles restent celles du noyau, sans préfixe.
 */
export type PptAction =
  /* ── Diapositives ── */
  | { type: "P_SELECT_SLIDE"; index: number }
  | { type: "P_ADD_SLIDE"; index?: number; layout?: PptLayoutId }
  | { type: "P_DELETE_SLIDE"; index: number }
  | { type: "P_DUPLICATE_SLIDE"; index: number }
  /** Le geste de la trieuse. */
  | { type: "P_MOVE_SLIDE"; from: number; to: number }
  | { type: "P_SET_LAYOUT"; layout: PptLayoutId }
  | { type: "P_SET_VIEW"; view: PptViewMode }

  /* ── Objets ── */
  | { type: "P_SELECT_OBJECT"; objectId: string }
  /**
   * Saisie dans un espace réservé ou une zone de texte.
   *
   * `cible` accepte `ph:titre` autant qu'un identifiant d'objet : un auteur
   * écrit « le titre », pas « obj7 » — les identifiants d'objets sont générés,
   * donc inconnus au moment de la rédaction du scénario.
   */
  | {
      type: "P_TYPE_TEXT"
      cible: string
      accept: string[]
      /** Défaut false : casse et accents ignorés. `true` = orthographe stricte. */
      caseSensitive?: boolean
      /** Rang du paragraphe visé, pour les listes à puces. Défaut 0. */
      paragraphe?: number
    }
  | { type: "P_ADD_OBJECT"; objectType: PptObjectType; shape?: PptShape }
  | { type: "P_DELETE_OBJECT"; objectId: string }
  /**
   * Déplacement ou redimensionnement.
   *
   * `tolerance` en unités de scène ; défaut `TOLERANCE_DEFAUT` (36), identique
   * sur tous les écrans. Un auteur n'écrit donc jamais deux fois la même étape,
   * et n'a à préciser ce champ que pour SERRER la tolérance sur une étape dont
   * le placement est justement la compétence évaluée.
   */
  | { type: "P_MOVE_OBJECT"; objectId: string; rect: Partial<PptRect>; tolerance?: number }

  /* ── Validation par l'ÉTAT ── */
  /**
   * Pendant d'`EXPECT_STATE` d'Excel, et pour la même raison : c'est le mode des
   * exercices à chemin libre, et le seul praticable quand plusieurs gestes
   * mènent au même résultat. `slides[]` est indexé par POSITION, ce qui permet
   * de vérifier l'ordre après un déplacement dans la trieuse.
   */
  | {
      type: "P_EXPECT_DECK"
      deck: {
        nbSlides?: number
        slides?: Array<{
          index: number
          layout?: PptLayoutId
          masquee?: boolean
          transition?: Partial<PptTransition>
          notes?: string
          nbObjets?: number
          /** Textes attendus par espace réservé : `{ titre: ["Bilan 2026"] }`. */
          textes?: Partial<Record<PptPlaceholder, string[]>>
          objets?: Array<{
            placeholder?: PptPlaceholder
            id?: string
            objectType?: PptObjectType
            shape?: PptShape
            rect?: Partial<PptRect>
            tolerance?: number
            style?: Partial<PptTextStyle>
            fill?: string
            texte?: string[]
          }>
        }>
        master?: {
          numeroVisible?: boolean
          piedVisible?: boolean
          piedTexte?: string
          theme?: { fond?: string; accent?: string; police?: string; couleurTexte?: string }
        }
      }
    }
  /** Mise en forme obtenue, sans imposer le chemin. */
  | { type: "P_EXPECT_FORMAT"; objectId: string; style: Partial<PptTextStyle>; fill?: string }
  /** Les animations de la diapositive active. L'ordre compte. */
  | { type: "P_EXPECT_ANIMATIONS"; animations: Array<Partial<PptAnimation>> }
  /** L'état du diaporama : lancé, sur telle diapositive, terminé. */
  | { type: "P_EXPECT_SHOW"; show: PptShowAttendu }
  /**
   * DÉSIGNER un endroit de l'écran et l'expliquer, sans feindre un geste.
   *
   * Cette action ne se joue jamais comme une étape : elle vit uniquement dans le
   * tableau `montrer` d'un écran de lecture, où elle décrit ce que la
   * démonstration doit faire voir pendant que l'apprenant regarde. Elle n'est
   * donc PAS observable, et ne doit jamais figurer dans `OBSERVABLES_PPT` — une
   * étape dont l'action serait `P_MONTRER` attendrait un geste que rien
   * n'émettra.
   *
   * Les 191 écrans de lecture de la formation n'avaient aucun moyen de montrer
   * ce qu'ils racontaient : ils affirmaient « le volet des miniatures liste vos
   * diapositives » et rien à l'écran ne le désignait. C'est le même manque
   * qu'Excel avait sur ses 187 écrans avant de recevoir `MONTRER`.
   *
   * `cible` accepte les formes de `cibleDAuteur` (`ph:titre`, un identifiant
   * d'objet, `ctrl:<data-control>`, `diapo:<n>`, `ecran`) ; `ecrire` pose un
   * contre-exemple, que la démonstration efface ensuite.
   */
  | { type: "P_MONTRER"; cible: string; texte: string; ecrire?: { objet: string; texte: string } }

export type PptActionType = PptAction["type"]

/* ═══════════ CONTRAT D'OBSERVABILITÉ ═══════════ */

/**
 * Les actions que la surface ÉMET RÉELLEMENT — alimente `adaptateur.observables`
 * (contrat §3), donc `check-scenario` décliné PowerPoint.
 *
 * Ce n'est pas documentaire : le contrôle refuse toute étape dont l'action n'y
 * figure pas, et c'est ce qui empêche d'écrire du contenu injouable.
 */
export const OBSERVABLES_PPT: ReadonlySet<string> = new Set<string>([
  "P_SELECT_SLIDE",
  "P_ADD_SLIDE",
  "P_DELETE_SLIDE",
  "P_DUPLICATE_SLIDE",
  "P_MOVE_SLIDE",
  "P_SET_LAYOUT",
  "P_SET_VIEW",
  "P_SELECT_OBJECT",
  "P_TYPE_TEXT",
  "P_ADD_OBJECT",
  "P_DELETE_OBJECT",
  "P_MOVE_OBJECT",
  "P_EXPECT_DECK",
  "P_EXPECT_FORMAT",
  "P_EXPECT_ANIMATIONS",
  "P_EXPECT_SHOW",
])

/**
 * Actions jugées sur l'ÉTAT du document, et non sur le geste.
 *
 * Alimente `adaptateur.seJugeSurEtat`. Distinction indispensable : sur une telle
 * étape, un geste intermédiaire n'est PAS une faute — l'apprenant construit son
 * résultat, et le signaler en rouge à chaque clic apprendrait la méfiance, pas
 * PowerPoint. Excel a payé ce défaut : une frappe juste sur une étape
 * `EXPECT_STATE` comptait une faute avec flash rouge muet, et plafonnait
 * l'évaluation de son module 1 à 46 %.
 */
/**
 * ÉLARGIE À TOUTE L'APPLICATION LE 05/08/2026 — et ce n'est pas un abus de sens.
 *
 * Ce prédicat n'a qu'un seul lecteur utile côté PowerPoint : le PASSAGE OBLIGÉ
 * de `frappe.ts`, qui rend gratuit un verdict en `no_…` lorsqu'il est vrai.
 * (Son autre lecteur, `frappeHorsCanal`, est conditionné à `observed.kind ===
 * "typed"` — un `kind` d'Excel, qu'aucune observation `p:` ne porte : il ne
 * peut donc rien changer ici.)
 *
 * Depuis que `NAVIGATION_PPT` et `OBSERVATIONS_ETAT_PPT` sont vides, c'est ce
 * passage obligé qui porte TOUTE la gratuité : explorer le ruban, cliquer une
 * vignette pour regarder, laisser un attribut à sa valeur neutre. Le restreindre
 * aux quatre `P_EXPECT_*` ferait payer un point à l'apprenant qui clique à côté
 * pendant une étape de saisie — exactement le défaut qu'Excel a corrigé le
 * 02/08 sur son module 1, qui plafonnait à 46 %.
 *
 * Word a fait le même choix pour la même raison, et l'a documenté : « seJugeSurEtat
 * doit alors répondre true pour tous les types de l'app ».
 *
 * ⚠️ Ce n'est PAS un blanc-seing : seuls les motifs en `no_…` passent. Un
 * `wrong_…` reste une faute, quel que soit le type d'action.
 */
export const JUGEES_SUR_ETAT_PPT: ReadonlySet<string> = OBSERVABLES_PPT
