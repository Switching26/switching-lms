/**
 * Excel, vu comme une application parmi les autres.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * C'est la seule façon de prouver que le registre fonctionne : s'il ne porte pas
 * Excel — 246 chapitres, 1 883 étapes, publiés, avec de vrais apprenants — il ne
 * portera rien. Un mécanisme d'extension qu'on n'a branché que sur du vide est
 * un mécanisme non testé.
 *
 * CE FICHIER NE RÉIMPLÉMENTE RIEN. Il délègue, fonction par fonction, au code
 * existant, sans le modifier. C'est un point de contrat, pas un détail de
 * style : une seconde implémentation du jugement d'Excel, ce serait deux notes
 * possibles pour le même parcours — et la divergence serait SILENCIEUSE, la
 * formation continuant de se jouer normalement avec des notes fausses.
 *
 * SENS DES DÉPENDANCES — à ne pas inverser
 *
 *   registre.ts → excel-adaptateur.ts → validate/attendu/demonstration/expurge/frappe
 *
 * Un seul sens. Aucun fichier de couture n'importe le registre : cela fermerait
 * un cycle d'initialisation, dont le symptôme serait un adaptateur `undefined`
 * au chargement — donc, sur la route de correction serveur, une évaluation
 * jugée par personne. Quand la couture a besoin d'un comportement d'app, on le
 * lui INJECTE en paramètre (voir `expurgerScenarioNote`).
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
} from "./contrats"
import type { SimulationAction, SimulationStep } from "./types"
import type { ActionChannel, ObservedAction } from "./validate"

import { validateStep } from "./validate"
import {
  LIBELLE_CONTROLE,
  cibleDemonstration,
  reponseAttendue,
  resumerAttendu,
  resumerFait,
} from "./attendu"
import { planDemonstration } from "./demonstration"
import { actionPublique } from "./expurge"
import {
  EST_NAVIGATION_EXCEL,
  EST_OBSERVATION_ETAT_EXCEL,
  SE_JUGE_SUR_ETAT_EXCEL,
} from "./frappe"

/**
 * Gestes que `ExcelGrid` et les couches maison ÉMETTENT réellement.
 *
 * Cette liste faisait doublon dans `check-scenario.ts` ; elle vit désormais ici,
 * avec l'application qu'elle décrit, et le contrôle la lit par l'adaptateur.
 *
 * ⚠️ `CLICK_CELL_MODIFIER` est ABSENT volontairement. Il y figurait sur une
 * supposition non testée jusqu'au banc d'essai du 28/07/2026 : un Ctrl+clic ne
 * déclenche AUCUN événement côté Univer — seul le clic précédent est vu. Une
 * étape qui l'exigerait bloquerait l'apprenant sans message. C'est le rappel le
 * plus utile de ce contrat pour les trois applications à venir : ce qu'une
 * surface émet se PROUVE au navigateur, il ne se déduit pas d'un nom de type.
 */
const OBSERVABLES_EXCEL: ReadonlySet<string> = new Set([
  "READ",
  "TYPE",
  "CLICK_CELL",
  "CLICK_CONTROL",
  "DRAG_RANGE",
  "EXPECT_STATE",
  "SELECT_COLUMN",
  "SELECT_ROW",
  "SELECT_SHEET",
  "GOTO_REF",
  "DEFINE_NAME",
  "SORT_RANGE",
  "FILTER_COLUMN",
  "EXPECT_FORMAT",
  // Modules 13, 17, 18, 20 et 27 : ces gestes passent par nos propres couches
  // (graphiques, tableaux croisés, mise en page, macros) plutôt que par Univer,
  // dont les modules correspondants sont payants. Ils sont observables par
  // construction : c'est nous qui émettons l'observation.
  "EXPECT_CHART",
  "SELECT_CHART_ELEMENT",
  "EXPECT_PIVOT",
  "EXPECT_PAGE_SETUP",
  "EXPECT_MACRO",
  "RECORD_MACRO",
  // Poste de travail (direction C) : bureau, menu Démarrer et boîtes de dialogue
  // sont notre couche, qui émet `posteChange` à chaque geste.
  "EXPECT_POSTE",
])

export const adaptateurExcel: AdaptateurApp = {
  app: "EXCEL",
  /**
   * Excel n'a pas de préfixe : ses 27 types sont l'existant, et les 246
   * scénarios publiés les portent. Les préfixer aurait imposé une migration de
   * contenu sur une formation vivante pour un bénéfice nul.
   */
  prefixe: "",

  juger(step, observed, requiredChannel) {
    return validateStep(
      step as unknown as SimulationStep,
      observed as unknown as ObservedAction,
      requiredChannel as ActionChannel | undefined,
    )
  },

  attendu: (action) => resumerAttendu(action as unknown as SimulationAction),
  fait: (action) => resumerFait(action as unknown as SimulationAction),
  reponse: (action) => reponseAttendue(action as unknown as SimulationAction),

  cible(action): CibleGenerique {
    // `cibleDemonstration` parle « cellule » ; le contrat parle « zone », pour
    // qu'une application non tabulaire — un paragraphe Word, un champ « À : »
    // d'Outlook — puisse répondre à la même question sans grille.
    const c = cibleDemonstration(action as unknown as SimulationAction)
    return { zone: c.cellule, controle: c.controle }
  },

  demonstration: (action, ctx) =>
    planDemonstration(action as unknown as SimulationAction, ctx),

  publier: (action) => actionPublique(action) as Record<string, unknown> | null,

  estNavigation: (observed) => EST_NAVIGATION_EXCEL(observed as unknown as ObservedAction),
  seJugeSurEtat: (actionType) => SE_JUGE_SUR_ETAT_EXCEL(actionType),
  estObservationEtat: (observed) =>
    EST_OBSERVATION_ETAT_EXCEL(observed as unknown as ObservedAction),

  observables: OBSERVABLES_EXCEL,
  libellesControles: LIBELLE_CONTROLE,
}

/* Vérifications de forme, à la compilation, sans coût à l'exécution. */
const _typesCompatibles: (a: EtapeApp, o: ObservationApp, x: ActionApp) => void = (a, o, x) => {
  void adaptateurExcel.juger(a, o)
  void adaptateurExcel.attendu(x)
}
void _typesCompatibles
const _retours: [Verdict | null, PlanDemo | null, ContexteDemo | null] = [null, null, null]
void _retours
