/**
 * Jugement d'une observation : le verdict de l'étape, et le sort d'une frappe.
 *
 * Ce module existe pour être appelé DES DEUX CÔTÉS avec le même code :
 *
 *  • en leçon et en exercice, par l'atelier lui-même — le scénario y est servi
 *    complet, la correction est locale et le retour instantané ;
 *  • en ÉVALUATION notée, par `POST /api/simulations/[chapterId]/verify` — le
 *    navigateur n'a plus les réponses (voir `expurge.ts`), il envoie ce que
 *    l'apprenant a FAIT et reçoit le seul verdict.
 *
 * Deux implémentations finiraient par donner deux verdicts différents sur le
 * même geste, et l'apprenant aurait raison de s'en plaindre. D'où ce module.
 *
 * ⚠️ Ce que le résultat ne contient JAMAIS : la valeur attendue, la formule
 * acceptée, la cellule visée. `message` est rédigé par `validateStep` pour être
 * lu par l'apprenant sans lui donner la réponse ; `ref` désigne la cellule où
 * il vient lui-même de taper, il ne lui apprend rien.
 */

import { normalizeFormula } from "./types"
import { frToEngine } from "./formula-fr"
import { lireDateOuHeureFr } from "./date-fr"
import { lireNombreFr } from "./nombre-fr"
import { validateStep, type ObservedAction, type Verdict } from "./validate"
import type { SimulationStep } from "./types"
import type { AdaptateurApp, EtapeApp, ObservationApp } from "./contrats"

export type VerdictFrappe = { verdict: "juste" | "fausse" | "hors-sujet"; ref?: string }

/**
 * LA FRAPPE SE JUGE SUR SON CONTENU (choix Samuel du 02/08/2026).
 *
 * Une étape jugée sur l'état du classeur reçoit la saisie AVANT son
 * observation : la frappe émet `typed`, la grille n'émet `stateChange` que
 * ~350 ms plus tard. Ce `typed` n'était ni une « navigation » ni une
 * observation « d'état » : il tombait dans la catégorie vraie faute — chaque
 * saisie, MÊME JUSTE, coûtait le point « premier essai » et déclenchait un
 * flash rouge sans message. Un apprenant parfait plafonnait à 46 % sur
 * l'évaluation du module 1 ; 18 évaluations sur 27 étaient plafonnées, 56 des
 * 483 points étant imprenables.
 *
 * La règle : une frappe juste dans une cellule attendue n'est pas une faute
 * (l'observation d'état valide l'étape juste après) ; une frappe fausse dans
 * une cellule attendue en est une — « premier essai » garde son sens ; une
 * frappe hors des cellules attendues reste un tâtonnement, comme les
 * réglages intermédiaires des modèles.
 */
export function jugerFrappeSurEtat(
  cells: Record<string, { f?: string; v?: string | number; anyOf?: string[] }>,
  target: string,
  text: string,
): VerdictFrappe {
  const cible = String(target || "").trim().toUpperCase().replace(/\$/g, "")
  const entree = Object.entries(cells ?? {}).find(
    ([r]) => r.trim().toUpperCase().replace(/\$/g, "") === cible,
  )
  if (!entree) return { verdict: "hors-sujet" }
  const [ref, want] = entree
  const t = String(text ?? "").trim()
  const candidates = want.anyOf ?? (want.f !== undefined ? [want.f] : null)

  if (t.startsWith("=")) {
    if (candidates) {
      const typedN = normalizeFormula(t)
      const ok = candidates.some(
        (c) => normalizeFormula(c) === typedN || normalizeFormula(frToEngine(c)) === typedN,
      )
      return { verdict: ok ? "juste" : "fausse", ref }
    }
    // Chemin libre : seule la valeur compte, et le résultat de cette formule
    // n'existe pas encore au moment de la frappe. L'observation d'état
    // tranchera — on ne compte rien.
    return { verdict: "juste", ref }
  }

  // Une valeur brute là où une écriture précise est exigée : l'état ne
  // validera jamais sans la formule, c'est une réponse fausse au sens du
  // contrat de l'étape.
  if (candidates) return { verdict: "fausse", ref }

  if (want.v === undefined) {
    // L'étape effaçait cette cellule : y écrire la contredit.
    return { verdict: t === "" ? "juste" : "fausse", ref }
  }

  // Mêmes tolérances que la grille : décimale à virgule, date/heure française
  // (la cellule stockera le numéro de série, pas la chaîne tapée).
  //
  // ⚠️ Le NOMBRE se tente AVANT la date : le `text` observé peut être la
  // valeur re-sérialisée par le moteur en convention américaine (« 18.5 »
  // pour une frappe « 18,50 »), et `lireDateOuHeureFr` lirait « 18.5 » comme
  // le 18 mai — la saisie juste redevenait une faute, exactement le défaut
  // qu'on corrige. Une vraie date tapée (« 03/01/2026 ») n'est pas un nombre
  // et suit bien le chemin date.
  const attendu = want.v
  const na =
    typeof attendu === "number" ? attendu : Number(String(attendu).replace(",", ".").trim())
  const nbUS = t !== "" && Number.isFinite(Number(t.replace(",", "."))) ? Number(t.replace(",", ".")) : null
  const nb = lireNombreFr(t) ?? nbUS
  const dateFr = nb === null ? lireDateOuHeureFr(t) : null
  const tapee = nb !== null ? nb : dateFr ? dateFr.valeur : NaN
  if (Number.isFinite(na) && typeof tapee === "number" && Number.isFinite(tapee)) {
    return { verdict: Math.abs(na - tapee) < 1e-9 ? "juste" : "fausse", ref }
  }
  const ok =
    String(attendu).trim().toLocaleUpperCase("fr-FR") === t.toLocaleUpperCase("fr-FR")
  return { verdict: ok ? "juste" : "fausse", ref }
}

/**
 * Ce que l'atelier a besoin de savoir d'une observation, et rien de plus.
 *
 * `frappe` est nul dès que l'observation n'est pas une saisie sur une étape
 * jugée par l'état du classeur — le seul cas où la question se pose.
 */
export type JugementEtape = {
  ok: boolean
  reason?: string
  message?: string
  frappe: VerdictFrappe | null
  /**
   * Ce que cette observation VAUT pour la note. C'est la moitié du jugement qui
   * vivait dans l'atelier (`isRealMistake`), et qui devait rejoindre le serveur :
   * tant qu'elle restait côté navigateur, la note se calculait depuis des
   * booléens déclarés par le client, et une requête fabriquée obtenait 100 %.
   *
   * `reussite` — l'étape est franchie ;
   * `faute` — vraie erreur : elle retire le point « premier essai » ;
   * `tatonnement` — geste de repérage, réglage intermédiaire, saisie hors canal :
   *   il ne coûte rien, il sert seulement à savoir quand proposer de l'aide ;
   * `rien` — l'observation ne concerne pas cette étape.
   */
  compte: "reussite" | "faute" | "tatonnement" | "rien"
}

/**
 * Les étapes jugées sur un ÉTAT (classeur, format, modèle, poste) : une frappe
 * n'y est jamais le canal attendu — hors des cellules attendues d'un
 * `EXPECT_STATE`, elle vaut tâtonnement, pas faute.
 */
const ETAPES_SUR_ETAT = new Set([
  "EXPECT_STATE",
  "EXPECT_FORMAT",
  "EXPECT_CHART",
  "EXPECT_PIVOT",
  "EXPECT_PAGE_SETUP",
  "EXPECT_MACRO",
  "EXPECT_POSTE",
])

/**
 * Les deux prédicats de classement d'Excel, exposés pour son adaptateur.
 *
 * Ils sont EXPORTÉS plutôt que recopiés : `excel-adaptateur.ts` doit rendre le
 * comportement d'Excel à l'identique, pas une seconde version qui en dérivera
 * un jour. Le contrat les demande à chaque application parce que ce sont
 * précisément les deux règles dont l'oubli a plafonné des évaluations entières.
 */

/**
 * Se déplacer n'est pas se tromper. Avoir oublié `selectColumn` et `selectRow`
 * plafonnait l'évaluation du module 4 à 95 % pour un parcours parfait.
 */
export function EST_NAVIGATION_EXCEL(observed: ObservedAction): boolean {
  return (
    observed.kind === "cellClick" ||
    observed.kind === "dragRange" ||
    observed.kind === "gotoRef" ||
    observed.kind === "selectColumn" ||
    observed.kind === "selectRow"
  )
}

/**
 * Cette étape se juge-t-elle sur l'ÉTAT du document plutôt que sur le geste ?
 * Sur ces étapes, une frappe juste ne doit pas coûter le point « premier
 * essai » : c'était le premier des trois étages qui plafonnaient 18 évaluations
 * Excel sur 27.
 */
export function SE_JUGE_SUR_ETAT_EXCEL(actionType: string): boolean {
  return ETAPES_SUR_ETAT.has(actionType)
}

/**
 * Le juge complet d'une observation. Pur : mêmes entrées, même sortie.
 *
 * Les règles de classement ci-dessous ne sont pas des choix d'écriture : chacune
 * corrige un défaut mesuré sur le corpus, et les commentaires disent lequel.
 */
export function jugerEtape(
  step: SimulationStep,
  observed: ObservedAction,
  /**
   * Application qui juge cette étape. Absente — le cas des 246 chapitres Excel —
   * le juge et les prédicats d'Excel s'appliquent, exactement comme avant : ce
   * ne sont pas des variantes, ce sont les mêmes fonctions.
   *
   * L'adaptateur est passé en PARAMÈTRE plutôt qu'importé depuis le registre :
   * `registre.ts → excel-adaptateur.ts → frappe.ts`, donc importer le registre
   * ici fermerait un cycle d'initialisation. Le symptôme serait un adaptateur
   * `undefined` au chargement — donc une évaluation jugée par personne, sans
   * erreur visible.
   */
  adaptateur?: AdaptateurApp,
): JugementEtape {
  const v: Verdict = adaptateur
    ? adaptateur.juger(step as unknown as EtapeApp, observed as unknown as ObservationApp) ?? {
        ok: false,
        reason: "unknown_action",
        message: "Action non reconnue.",
      }
    : validateStep(step, observed)
  const frappe =
    observed.kind === "typed" && step.action.type === "EXPECT_STATE"
      ? jugerFrappeSurEtat(step.action.cells, observed.target, observed.text)
      : null

  const base = {
    ok: v.ok,
    ...(v.ok ? {} : { reason: v.reason, message: v.message }),
    frappe,
  }

  if (v.ok) return { ...base, compte: "reussite" as const }

  // Une frappe JUSTE dans une cellule attendue ne compte rien : l'observation
  // d'état validera l'étape 350 ms plus tard. Sans cette règle, chaque saisie —
  // même juste — coûtait le point « premier essai », et 18 évaluations sur 27
  // étaient plafonnées.
  if (frappe?.verdict === "juste") return { ...base, compte: "rien" as const }

  // Se déplacer n'est pas se tromper : cliquer une cellule, sélectionner une
  // plage, une ligne, une colonne ou sauter par la zone Nom ne compte comme
  // faute que si l'étape jugeait précisément ce geste.
  const navigation = adaptateur
    ? adaptateur.estNavigation(observed as unknown as ObservationApp)
    : EST_NAVIGATION_EXCEL(observed)

  const surEtatAttendu = adaptateur
    ? adaptateur.seJugeSurEtat(step.action.type)
    : SE_JUGE_SUR_ETAT_EXCEL(step.action.type)

  // Les étapes jugées sur un ÉTAT se construisent souvent en plusieurs gestes —
  // centrer horizontalement PUIS verticalement : compter une faute à chaque état
  // intermédiaire punirait un apprenant qui fait juste.
  const surEtat =
    observed.kind === "stateChange" ||
    observed.kind === "chartChange" ||
    observed.kind === "pivotChange" ||
    observed.kind === "pageSetupChange" ||
    observed.kind === "macroChange"

  const frappeHorsCanal =
    observed.kind === "typed" && surEtatAttendu && frappe?.verdict !== "fausse"

  // Un verdict `no_…` sur une étape d'état est un passage obligé, pas une faute :
  // ouvrir la boîte Macros ÉMET un `control` avant que l'état jugé n'existe.
  // Compter ce clic plafonnait l'évaluation du module 27 à 78 % pour un parcours
  // parfait. Un verdict `wrong_…` reste une faute.
  const passageOblige =
    typeof v.reason === "string" &&
    v.reason.startsWith("no_") &&
    (surEtatAttendu || step.action.type === "RECORD_MACRO")

  // Une étape de LECTURE ne peut pas être ratée : il n'y a rien à y faire.
  const faute =
    step.action.type === "READ"
      ? false
      : frappe?.verdict === "fausse"
      ? true
      : frappeHorsCanal || passageOblige
      ? false
      : !navigation && !surEtat
      ? true
      : (observed.kind === "cellClick" && step.action.type === "CLICK_CELL") ||
        (observed.kind === "dragRange" && step.action.type === "DRAG_RANGE") ||
        (observed.kind === "gotoRef" && step.action.type === "GOTO_REF") ||
        (observed.kind === "selectColumn" && step.action.type === "SELECT_COLUMN") ||
        (observed.kind === "selectRow" && step.action.type === "SELECT_ROW")

  return { ...base, compte: faute ? ("faute" as const) : ("tatonnement" as const) }
}
