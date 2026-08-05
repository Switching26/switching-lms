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
  /**
   * `style` porte l'état FUSIONNÉ de l'objet après le geste ; `applique` porte
   * les seuls attributs que ce geste vient de poser.
   *
   * La distinction décide de la note. Le style d'un objet appartient aussi au
   * SCÉNARIO — une zone de texte peut arriver centrée alors que la consigne
   * demande de l'aligner à gauche. Juger la contradiction sur l'état fusionné
   * revient donc à reprocher à l'apprenant un choix qu'il n'a pas fait : mesuré
   * sur `m03-ev01`, où deux étapes comptaient une faute avant le moindre geste
   * de mise en forme. Seul `applique` dit ce que l'apprenant a VOULU.
   */
  | {
      kind: "p:formatChange"
      objectId: string
      style: TextStyle
      applique?: Record<string, unknown>
      fill?: string
      fillApplique?: string
      channel: PptChannel
    }
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
/**
 * 🔴 VIDÉE LE 05/08/2026 — elle rendait 144 points sur 309 imperdables.
 *
 * `frappe.ts` envoie toute observation déclarée « d'état » dans une branche dont
 * AUCUNE sortie ne classe en faute. Un apprenant qui posait délibérément une
 * autre mise en forme, un autre nombre de diapositives ou une autre transition
 * que celle demandée ne payait donc rien : PowerPoint ne rendait perdables que
 * 53 % de ses points, contre 70 % pour Excel à socle identique, et l'évaluation
 * du module 3 tombait à 12 % — se tromper partout y laissait 88 %.
 *
 * La protection dont ces observations avaient besoin — ne rien coûter pendant
 * que l'apprenant CONSTRUIT son résultat en plusieurs gestes — est désormais
 * portée par le VERDICT, motif par motif : `no_deck`, `no_object`, `no_count`,
 * `no_format`, `no_text`, `no_show`… restent gratuits via le passage obligé de
 * `frappe.ts`, et seuls les `wrong_…` coûtent. C'est plus fin qu'une liste de
 * `kind`, qui ne peut pas distinguer « pas encore » de « autre chose ».
 *
 * Ne pas la re-remplir : ce serait rendre imperdable tout ce qui s'y trouve.
 */
export const OBSERVATIONS_ETAT_PPT: ReadonlySet<string> = new Set<string>([])

/**
 * Observations de simple repérage : changer de diapositive, sélectionner un
 * objet, changer de mode d'affichage.
 *
 * Se déplacer n'est pas se tromper. Excel a payé l'absence de cette
 * distinction : sélectionner une colonne avant d'agir comptait une faute, et
 * l'évaluation de son module 4 plafonnait à 95 % pour un parcours parfait.
 */
/**
 * 🔴 VIDÉE LE 05/08/2026 — mais l'intention qu'elle portait est CONSERVÉE.
 *
 * Se déplacer n'est pas se tromper : cliquer une vignette pour regarder,
 * sélectionner un objet avant d'agir, changer de mode d'affichage en explorant
 * ne doit rien coûter. Cela reste vrai — c'est maintenant `no_gesture` qui
 * l'assure : sur une étape qui attend AUTRE CHOSE, `validerGeste` rend ce motif
 * dès que l'observation n'est pas du genre jugé, et le passage obligé de
 * `frappe.ts` le rend gratuit.
 *
 * Ce que la liste rendait impossible, en revanche : compter une faute quand
 * l'étape juge PRÉCISÉMENT ce déplacement. « Sélectionnez la deuxième
 * diapositive » et l'apprenant en choisit une autre — c'est un geste nommé et
 * raté, pas une exploration. Excel le sait depuis toujours et apparie en dur
 * `selectColumn`+`SELECT_COLUMN` dans `frappe.ts` ; PowerPoint n'avait aucun
 * équivalent, si bien que ses 55 étapes `P_SELECT_SLIDE` — 4 points sur 15 pour
 * la seule évaluation du module 1 — étaient imperdables.
 *
 * Le tri se fait donc au verdict, qui connaît l'étape : `no_gesture` quand
 * l'observation ne s'adresse pas à cette étape, `wrong_slide` / `wrong_object` /
 * `wrong_view` quand elle s'y adresse et se trompe de cible.
 */
export const NAVIGATION_PPT: ReadonlySet<string> = new Set<string>([])
