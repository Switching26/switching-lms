/**
 * PowerPoint — ce que la surface ÉMET réellement quand l'apprenant agit.
 *
 * ⚠️ CE FICHIER N'IMPORTE RIEN, pas même un `import type` (contrat §2.a,
 * `check-frontieres.ts` règle 1). Les types de données qu'il manipule sont donc
 * redéclarés localement, en version structurelle.
 *
 * Les `kind` portent le préfixe `p:` (contrat §2.e).
 *
 * ⚠️ Une action attendue dont la surface n'émet JAMAIS l'observation
 * correspondante rend l'étape injouable : l'apprenant fait exactement ce qu'on
 * lui demande et rien ne se passe. Excel l'a payé — `CLICK_CELL_MODIFIER`
 * figurait dans la liste des gestes observables sur une supposition non testée,
 * alors que Ctrl+clic n'émet rien du tout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE CANAL EST TRANSPORTÉ
 *
 * 30 % des exercices de la formation de référence imposent le MOYEN — « à l'aide
 * d'un bouton du ruban », « sans utiliser le clavier ». Valider le seul résultat
 * laisserait passer un apprenant qui a contourné le geste enseigné. Le canal
 * doit donc être journalisé À L'ÉMISSION, jamais reconstitué après coup.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX OBSERVATIONS PAR GESTE, ET C'EST VOULU
 *
 * Chaque geste produit son observation SPÉCIFIQUE — qui dit ce que l'apprenant
 * a fait, et sert au journal comme au classement — puis `p:deckChange`, qui
 * porte l'état complet du document et sert aux étapes à chemin libre.
 *
 * C'est le modèle d'Excel (`typed` puis `stateChange`), à une différence près :
 * ici l'état n'a pas besoin d'être temporisé. Excel devait attendre 350 ms parce
 * que `SheetValueChanged` était émis AVANT la fin du recalcul, ce qui faisait
 * échouer par intermittence des étapes justes — le pire type de défaut. Sans
 * moteur de recalcul, l'état est complet à l'instant du geste.
 */

export type PptChannel = "mouse" | "keyboard" | "ribbon" | "contextMenu" | "panel" | "unknown"

/* Types de données, redéclarés en version structurelle — voir l'en-tête. */
type Rect = { x: number; y: number; w: number; h: number }
type LayoutId = string
type ObjectType = string
type Shape = string
type ViewMode = string
type TextStyle = Record<string, unknown>
type Transition = { kind: string; duree?: number; direction?: string; apresSecondes?: number }
type Animation = { objectId: string; kind: string; ordre: number; [k: string]: unknown }
type ShowState = { actif: boolean; index: number; [k: string]: unknown }

export type PptObservation =
  | { kind: "p:slideSelect"; index: number; channel: PptChannel }
  | { kind: "p:slideAdd"; index: number; layout: LayoutId; channel: PptChannel }
  | { kind: "p:slideDelete"; index: number; channel: PptChannel }
  | { kind: "p:slideDuplicate"; index: number; channel: PptChannel }
  | { kind: "p:slideMove"; from: number; to: number; channel: PptChannel }
  | { kind: "p:layoutChange"; index: number; layout: LayoutId; channel: PptChannel }
  | { kind: "p:viewChange"; view: ViewMode; channel: PptChannel }
  | { kind: "p:objectSelect"; objectId: string; multiple?: boolean; channel: PptChannel }
  | { kind: "p:objectAdd"; objectId: string; objectType: ObjectType; shape?: Shape; channel: PptChannel }
  | { kind: "p:objectDelete"; objectId: string; channel: PptChannel }
  /** `rect` est le cadre APRÈS le geste, en unités de scène. */
  | { kind: "p:objectMove"; objectId: string; rect: Rect; resize: boolean; channel: PptChannel }
  /**
   * `cible` porte la forme d'auteur (`ph:titre`), `objectId` la forme réelle.
   * Les deux, parce qu'un scénario désigne « le titre » quand le moteur, lui, ne
   * connaît que des identifiants générés.
   */
  | { kind: "p:typed"; cible: string; objectId: string; paragraphe: number; text: string; channel: PptChannel }
  | { kind: "p:formatChange"; objectId: string; style: TextStyle; fill?: string; channel: PptChannel }
  | { kind: "p:transitionChange"; index: number; transition: Transition; channel: PptChannel }
  | { kind: "p:animationChange"; index: number; animations: Animation[]; channel: PptChannel }
  | { kind: "p:notesChange"; index: number; notes: string; channel: PptChannel }
  | { kind: "p:showChange"; show: ShowState; channel: PptChannel }
  /**
   * L'ÉTAT COMPLET du document après le geste — pendant de `stateChange`.
   *
   * C'est la seule observation sur laquelle se jugent les quatre actions à
   * chemin libre (`P_EXPECT_DECK`, `…_FORMAT`, `…_ANIMATIONS`, `…_SHOW`) : leur
   * juge lit ce `deck` et rien d'autre. `unknown` parce qu'une feuille n'importe
   * rien ; `document.ts` le rétrécit et se défend d'une forme inattendue.
   *
   * ⚠️ Comme le `stateChange` d'Excel, cet état est RAPPORTÉ PAR LE CLIENT. Ce
   * n'est pas une régression de sécurité — Excel a la même propriété, faute de
   * pouvoir exécuter Univer côté serveur — mais ce n'en est pas moins une limite
   * à connaître : ce qui rend une note infalsifiable, c'est que le VERDICT est
   * écrit par le serveur (`run.ts`), pas que l'observation soit vérifiable.
   */
  | { kind: "p:deckChange"; deck: unknown; channel: PptChannel }

export type PptObservationKind = PptObservation["kind"]

/**
 * Observations qui rapportent un ÉTAT plutôt qu'un geste.
 *
 * Sur une étape jugée par l'état, une telle observation qui ne satisfait pas
 * encore l'attendu ne doit JAMAIS compter de faute : l'apprenant construit son
 * résultat en plusieurs gestes. C'est la troisième règle de classement, à côté
 * de « c'est une navigation » et « cette étape se juge sur l'état » — et la
 * seule que le noyau ne demande pas encore aux applications (voir le rapport de
 * phase 2 : `frappe.ts` en tient une liste Excel en dur).
 */
export const OBSERVATIONS_ETAT_PPT: ReadonlySet<string> = new Set<string>([
  "p:deckChange",
  "p:formatChange",
  "p:animationChange",
  "p:showChange",
  "p:transitionChange",
])

/**
 * Observations de simple repérage : changer de diapositive, sélectionner un
 * objet, changer de mode d'affichage.
 *
 * Se déplacer n'est pas se tromper. Excel a payé l'absence de cette
 * distinction : sélectionner une colonne avant d'agir comptait une faute, et
 * l'évaluation de son module 4 plafonnait à 95 % pour un parcours parfait.
 */
export const NAVIGATION_PPT: ReadonlySet<string> = new Set<string>([
  "p:slideSelect",
  "p:objectSelect",
  "p:viewChange",
])
