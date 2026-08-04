/**
 * L'annuaire des applications simulées, et la façade que l'atelier appelle.
 *
 * REGISTRE STATIQUE, JAMAIS PEUPLÉ À L'EXÉCUTION — le point le plus important
 * de ce fichier. Un `enregistrerAdaptateur()` appelé au montage d'un composant
 * client ne serait pas exécuté côté serveur : la route de correction d'une
 * évaluation Word ne trouverait pas son juge, et la note serait fausse SANS
 * ERREUR VISIBLE. L'import statique rend l'oubli impossible à la compilation.
 *
 * SENS DES DÉPENDANCES — invariant à ne jamais inverser
 *
 *     consommateurs (player, route /verify, contrôles)
 *          ↓
 *     registre.ts
 *          ↓
 *     excel-adaptateur.ts        <app>/adaptateur.ts
 *          ↓                          ↓
 *     validate · attendu ·       contrats.ts (aucun import de valeur)
 *     demonstration · expurge ·
 *     frappe
 *
 * Aucune flèche ne remonte. Un fichier de couture qui importerait ce registre
 * fermerait un cycle d'initialisation : au chargement, `adaptateurExcel` vaudrait
 * `undefined` et l'atelier jugerait avec rien. Quand la couture a besoin d'un
 * comportement propre à une application, on le lui INJECTE en paramètre — c'est
 * ce que font `jugerEtape(step, observed, adaptateur)` et
 * `expurgerScenarioNote(scenario, publier)`.
 *
 * `check-frontieres.ts` fait respecter cet invariant.
 */

import type {
  ActionApp,
  AdaptateurApp,
  AppSimulee,
  CibleGenerique,
  ContexteDemo,
  EtapeApp,
  ObservationApp,
  PlanDemo,
  Verdict,
} from "./contrats"
import { prefixeDeType } from "./contrats"
import { adaptateurExcel } from "./excel-adaptateur"
import { adaptateurWord } from "./word/adaptateur"
import { adaptateurPpt } from "./ppt/adaptateur"
import { adaptateurOutlook } from "./outlook/adaptateur"

/* ═══════════ L'ANNUAIRE ═══════════ */

/**
 * Une entrée par application, ajoutée quand son adaptateur est livré.
 *
 * Les trois autres applications sont volontairement ABSENTES : leur adaptateur
 * appartient à l'agent de phase 2, et le socle n'écrit pas dans leur dossier.
 * Livrer un adaptateur factice ici aurait donné un mécanisme qui « marche »
 * contre du vide — exactement le genre de vérification qui ne prouve rien.
 *
 * Pour brancher une application, DEUX lignes : l'import, et l'entrée ci-dessous.
 *
 *     import { adaptateurWord } from "./word/adaptateur"
 *     const ANNUAIRE = { EXCEL: adaptateurExcel, WORD: adaptateurWord, … }
 */
const ANNUAIRE: Partial<Record<AppSimulee, AdaptateurApp>> = {
  EXCEL: adaptateurExcel,
  WORD: adaptateurWord,
  POWERPOINT: adaptateurPpt,
  OUTLOOK: adaptateurOutlook,
}

/** Les applications réellement branchées à ce jour. */
export function appsBranchees(): AppSimulee[] {
  return Object.keys(ANNUAIRE) as AppSimulee[]
}

/**
 * L'adaptateur d'une application, ou `null` si elle n'est pas encore branchée.
 *
 * Volontairement `null` plutôt qu'un repli silencieux sur Excel : servir un
 * chapitre Word avec le juge d'Excel produirait des verdicts absurdes qu'aucun
 * apprenant ne pourrait s'expliquer. Mieux vaut un échec net.
 */
export function adaptateurPourApp(app: string): AdaptateurApp | null {
  return ANNUAIRE[app as AppSimulee] ?? null
}

/**
 * L'adaptateur qui sait juger ce TYPE d'action, déduit de son préfixe.
 *
 * Excel n'ayant pas de préfixe, tout type non préfixé lui revient — c'est ce qui
 * fait que les 246 chapitres publiés empruntent exactement le même chemin
 * qu'avant.
 */
export function adaptateurPourType(type: string): AdaptateurApp | null {
  const p = prefixeDeType(type)
  if (p === "") return adaptateurExcel
  for (const a of Object.values(ANNUAIRE)) if (a && a.prefixe === p) return a
  return null
}

/* ═══════════ LA FAÇADE ═══════════ */

/**
 * Ce que renvoie la façade quand aucune application ne réclame le type.
 *
 * Cas réaliste : un scénario semé en base porte une action `W_…` alors que le
 * déploiement en cours n'a pas encore l'adaptateur Word. Échec BRUYANT et
 * traçable, jamais un jugement approximatif.
 */
const INCONNU: Verdict = {
  ok: false,
  reason: "app_non_branchee",
  message: "Cette étape ne peut pas être corrigée : son application n'est pas disponible.",
}

const VIDE: CibleGenerique = {}

function pour(action: ActionApp): AdaptateurApp | null {
  return adaptateurPourType(String(action?.type ?? ""))
}

/** Le juge, client ET serveur. Aucune autre implémentation ne doit exister. */
export function jugerAction(
  step: EtapeApp,
  observed: ObservationApp,
  requiredChannel?: string,
): Verdict {
  const a = pour(step.action)
  if (!a) return INCONNU
  return a.juger(step, observed, requiredChannel) ?? INCONNU
}

/** Ligne « Attendu : … » sous la consigne. */
export function attenduPour(action: ActionApp): string | null {
  return pour(action)?.attendu(action) ?? null
}

/** Rappel de geste sur la carte de franchissement. */
export function faitPour(action: ActionApp): string | null {
  return pour(action)?.fait(action) ?? null
}

/** Réponse exacte, révélée au cinquième essai — jamais en évaluation. */
export function reponsePour(action: ActionApp): string | null {
  return pour(action)?.reponse(action) ?? null
}

/** Où poser le halo d'aide et la démonstration. */
export function ciblePour(action: ActionApp): CibleGenerique {
  return pour(action)?.cible(action) ?? VIDE
}

/** Plan de « Montrez-moi ». */
export function demonstrationPour(action: ActionApp, ctx: ContexteDemo): PlanDemo | null {
  return pour(action)?.demonstration(action, ctx) ?? null
}

/**
 * Ce qui a le droit de partir au navigateur en évaluation notée.
 *
 * `null` ⇒ seul le `type` sera publié. C'est le défaut sûr : une étape privée de
 * ses champs devient injouable, donc bruyante, alors qu'une réponse laissée
 * passer serait silencieuse et compromettrait la note.
 */
export function publierPour(action: ActionApp): Record<string, unknown> | null {
  const a = pour(action)
  if (!a) return null
  return a.publier(action)
}

/**
 * Les gestes réellement émis par la surface d'une application.
 * Consommé par les contrôles statiques, qui n'ont plus à tenir leur propre liste.
 */
export function observablesPour(app: string): ReadonlySet<string> {
  return adaptateurPourApp(app)?.observables ?? new Set<string>()
}

/** `data-control` → libellé lisible, pour la ligne « Attendu : … ». */
export function libellesControlesPour(app: string): Readonly<Record<string, string>> {
  return adaptateurPourApp(app)?.libellesControles ?? {}
}
