/**
 * Le contrat que chaque application simulée doit remplir.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * Sans lui, ajouter une application au simulateur obligerait à poser des `case`
 * dans SIX fichiers partagés : `validate.ts`, les quatre `switch` d'`attendu.ts`,
 * `demonstration.ts`, `expurge.ts` et `frappe.ts`. Trois agents multipliés par
 * six fichiers, c'est un conflit permanent — et l'oubli d'un seul `case` produit
 * un atelier MUET : pas de ligne « Attendu : … », pas de carte de franchissement,
 * pas de réponse au cinquième essai, pas de cible de démonstration. Exactement le
 * défaut de clarté que l'audit du 29/07/2026 avait corrigé pour Excel.
 *
 * Le registre inverse la dépendance : les fichiers de couture appellent
 * l'adaptateur de l'application au lieu de connaître les applications.
 *
 * RÈGLE D'IMPORT — la seule qui compte ici
 *
 * Ce fichier n'a AUCUN import de valeur. Les quelques `import type` sont effacés
 * à la compilation : ils ne peuvent donc pas créer de cycle d'initialisation à
 * l'exécution, qui est le danger réel. La chaîne
 * `registre.ts → <app>/adaptateur.ts → contrats.ts` doit rester ouverte, sans
 * quoi la route de correction serveur d'une évaluation ne trouverait pas son
 * juge — et la note serait fausse sans erreur visible.
 *
 * `check-frontieres.ts` impose cette règle.
 */

import type { PlanDemo, ContexteDemo } from "./demonstration"
import type { WordAction } from "./word/actions"
import type { PptAction } from "./ppt/actions"
import type { OutlookAction } from "./outlook/actions"

export type { PlanDemo, ContexteDemo }

/**
 * Toutes les actions qui n'appartiennent pas à Excel.
 *
 * Déclarée ICI et non dans `registre.ts` pour une raison précise : `validate.ts`
 * a besoin de la garde typée ci-dessous, et importer le registre depuis la
 * couture fermerait le cycle `registre → excel-adaptateur → validate`. Les trois
 * fichiers d'actions étant des feuilles sans aucun import, les tirer d'ici ne
 * crée aucune dépendance nouvelle.
 *
 * Vaut `never` — l'union vide — tant qu'aucune application n'a livré ses
 * variantes.
 */
export type ActionApplication = WordAction | PptAction | OutlookAction

/* ═══════════ IDENTITÉ D'UNE APPLICATION ═══════════ */

/** Doit rester aligné sur l'enum Prisma `SimulationApp`. */
export type AppSimulee = "EXCEL" | "WORD" | "POWERPOINT" | "OUTLOOK"

/**
 * Préfixe réservé des types d'action d'une application.
 *
 * Excel n'en a pas : ses 27 variantes sont l'existant, et les 246 scénarios
 * publiés les portent. Les préfixer aurait imposé une migration de contenu sur
 * une formation vivante, pour un gain nul.
 */
export type PrefixeApp = "" | "W_" | "P_" | "O_"

/**
 * Ce type d'action appartient-il à une application autre qu'Excel ?
 *
 * Version « chaîne », pour le registre et les contrôles statiques. La version
 * typée qui sert de garde à `validate.ts` vit dans `registre.ts`, où l'union
 * complète est connue.
 *
 * Vérifié : aucun des 27 types Excel actuels ne commence par `W_`, `P_` ou `O_`,
 * et `check-frontieres.ts` refuse qu'un futur type Excel le fasse.
 */
export function estTypeApp(type: string): boolean {
  return /^[WPO]_/.test(type)
}

/**
 * La même question, sous forme de GARDE TYPÉE — et c'est elle qui sauve le seul
 * filet TypeScript du simulateur.
 *
 * `validate.ts:874` porte l'unique `const _exhaustive: never` de tout le code :
 * ajouter une variante à `SimulationAction` casse la compilation là, et nulle
 * part ailleurs. Sans cette garde, la première action Word ferait échouer cette
 * ligne, et la tentation serait de retirer le `never` — Excel perdrait alors son
 * seul garde-fou de compilation.
 *
 * Avec elle, TypeScript restreint le `switch` à l'union Excel : le `never` d'Excel
 * continue de protéger Excel, et chaque application pose le sien dans SON
 * adaptateur.
 */
export function estActionApp<A extends { type: string }>(
  action: A,
): action is Extract<A, ActionApplication> {
  return estTypeApp(action.type)
}

/** Préfixe d'un type d'action, ou `""` pour Excel. */
export function prefixeDeType(type: string): PrefixeApp {
  const p = type.slice(0, 2)
  return p === "W_" || p === "P_" || p === "O_" ? p : ""
}

/* ═══════════ CE QUE L'ADAPTATEUR MANIPULE ═══════════ */

/**
 * Une action, vue du contrat : seul le discriminant est garanti.
 *
 * Chaque adaptateur re-type son action chez lui, où son union est connue.
 * Le contrat ne peut pas connaître les unions des quatre applications sans les
 * importer toutes — ce qui rouvrirait le cycle que ce fichier existe pour
 * fermer.
 */
export type ActionApp = { type: string } & Record<string, unknown>

/** Une observation, vue du contrat. Même raisonnement que `ActionApp`. */
export type ObservationApp = { kind: string } & Record<string, unknown>

/** Une étape, vue du contrat : ce dont un juge a besoin, rien de plus. */
export type EtapeApp = {
  id: string
  action: ActionApp
  points?: number
  [k: string]: unknown
}

/* ═══════════ VERDICT ═══════════ */

/**
 * Résultat d'un jugement. Défini ici plutôt que dans `validate.ts` pour que les
 * adaptateurs n'aient pas à importer la couture.
 *
 * `validate.ts` le ré-exporte : tous les imports existants continuent de
 * fonctionner sans être touchés.
 */
export type Verdict =
  | { ok: true }
  /** `reason` est destiné au journal pédagogique, `message` à l'apprenant. */
  | { ok: false; reason: string; message: string }

/* ═══════════ CIBLE GÉNÉRIQUE ═══════════ */

/**
 * Où se trouve, à l'écran, ce que l'étape attend — décrit sans supposer une
 * grille. `cibleDemonstration` d'Excel renvoie `{ cell, range, control, dom }` ;
 * une application non tabulaire n'a ni cellule ni plage, mais a bien une zone
 * nommée (un paragraphe Word, une diapositive, un champ « À : » d'Outlook).
 */
export type CibleGenerique = {
  /** Zone nommée de la surface de travail, au vocabulaire de l'application. */
  zone?: string
  /** Identifiant d'un bouton du ruban (`data-control`). */
  controle?: string
  /** Sélecteur CSS, dernier recours. */
  dom?: string
}

/* ═══════════ L'ADAPTATEUR ═══════════ */

/**
 * Ce qu'une application doit fournir pour que l'atelier sache la faire jouer.
 *
 * Chaque méthode correspond à un `switch` qu'il aurait fallu, sans ce contrat,
 * étendre dans un fichier partagé.
 *
 * CONTRAT DE RETOUR `null` : « ce n'est pas mon type d'action ». Le noyau
 * enchaîne alors sur son comportement par défaut. Ne jamais rendre `null` pour
 * dire « je ne sais pas faire » — cela produirait précisément l'atelier muet
 * décrit en tête de fichier.
 */
export type AdaptateurApp = {
  app: AppSimulee
  prefixe: PrefixeApp

  /* — JUGEMENT — le juge unique, client ET serveur — */

  /**
   * Confronte l'observation à l'action attendue. `null` si le type d'action
   * n'appartient pas à cette application.
   *
   * C'est LA méthode qui ne doit jamais être dupliquée : deux implémentations du
   * jugement pour un même parcours, ce sont deux notes différentes, et la
   * divergence serait silencieuse — la formation continuerait de se jouer
   * normalement avec des notes fausses.
   */
  juger(step: EtapeApp, observed: ObservationApp, requiredChannel?: string): Verdict | null

  /* — CE QUE L'ATELIER DIT — les quatre fonctions d'`attendu.ts` — */

  /** Ligne « Attendu : … » sous la consigne. */
  attendu(action: ActionApp): string | null
  /** Rappel de geste sur la carte de franchissement. */
  fait(action: ActionApp): string | null
  /** Réponse exacte, révélée au cinquième essai (jamais en évaluation). */
  reponse(action: ActionApp): string | null
  /** Où poser le halo d'aide et la démonstration. */
  cible(action: ActionApp): CibleGenerique

  /* — DÉMONSTRATION — « Montrez-moi » — */

  demonstration(action: ActionApp, ctx: ContexteDemo): PlanDemo | null

  /* — SÉCURITÉ — expurgation des évaluations notées — */

  /**
   * Ce qui peut être envoyé au navigateur en évaluation notée.
   *
   * `null` ⇒ seul le `type` est publié. C'est le défaut sûr : une étape privée
   * de ses champs devient INJOUABLE, ce qui est bruyant — alors qu'une réponse
   * laissée passer serait silencieuse et compromettrait la note.
   */
  publier(action: ActionApp): Record<string, unknown> | null

  /* — CLASSIFICATION — réussite / faute / tâtonnement / rien — */

  /**
   * Cette observation est-elle un simple déplacement ?
   *
   * Une navigation ne compte jamais comme une faute. Sur Excel, avoir oublié
   * `selectColumn` et `selectRow` plafonnait une évaluation entière à 95 %.
   */
  estNavigation(observed: ObservationApp): boolean

  /**
   * Cette étape se juge-t-elle sur l'ÉTAT du document plutôt que sur le geste ?
   *
   * Sur ces étapes, une frappe juste ne doit pas compter de faute : c'était le
   * premier des trois étages qui plafonnaient 18 évaluations Excel sur 27.
   */
  seJugeSurEtat(actionType: string): boolean

  /* — CONTRÔLES STATIQUES — */

  /**
   * Gestes que la surface de travail ÉMET réellement.
   *
   * Une action absente de cet ensemble rend l'étape injouable : l'apprenant fait
   * ce qu'on lui demande et rien ne se passe. C'est ce qui a fait retirer
   * `CLICK_CELL_MODIFIER` d'Excel — il y figurait sur une supposition non
   * testée, et Ctrl+clic n'émet rien.
   */
  observables: ReadonlySet<string>

  /** `data-control` → libellé lisible, pour la ligne « Attendu : … ». */
  libellesControles: Readonly<Record<string, string>>
}
