/**
 * Les trois prédicats de classement, vus depuis une application NON Excel.
 *
 * POURQUOI CE CONTRÔLE EXISTE
 *
 * `check-note-nonregression.ts` protège la note d'Excel, et il le fait bien.
 * Mais il ne peut PAS voir la famille de défauts corrigée ici : l'adaptateur
 * Excel répond exactement comme le code d'Excel, donc les deux chemins
 * concordent quoi qu'il arrive. Le défaut n'apparaît que pour une application
 * dont les observations sont préfixées `w:` / `p:` / `o:`.
 *
 * LE DÉFAUT MESURÉ — signalé par l'agent PowerPoint, avec contre-épreuve Excel
 *
 * `jugerEtape` testait EN DUR les cinq `kind` d'état d'Excel (`stateChange`,
 * `chartChange`, `pivotChange`, `pageSetupChange`, `macroChange`). Aucune
 * observation d'une autre application ne pouvait y figurer. Conséquence : une
 * observation d'état qui ne satisfait pas encore l'étape comptait FAUTE hors
 * d'Excel, là où Excel compte tâtonnement. Un parcours PowerPoint parfait
 * ressortait à 57 %.
 *
 * C'est le même défaut que les trois étages qui plafonnaient 18 évaluations
 * Excel sur 27 le 02/08/2026, et il se serait révélé de la même façon :
 * silencieusement, par des notes basses sur des parcours justes.
 *
 * CE QUE CE CONTRÔLE PROUVE, ET COMMENT
 *
 * Chaque propriété est vérifiée DEUX FOIS : avec un adaptateur correct, qui doit
 * passer ; et avec un adaptateur volontairement défaillant, qui doit ÉCHOUER.
 * Un contrôle qu'on n'a pas piégé ne prouve rien — il confirme seulement
 * l'implémentation depuis laquelle on l'a écrit.
 */

import { jugerEtape } from "../../lib/simulation/frappe"
import type { AdaptateurApp, ObservationApp } from "../../lib/simulation/contrats"
import type { SimulationStep } from "../../lib/simulation/types"
import type { ObservedAction } from "../../lib/simulation/validate"

/* ═══════════ UNE APPLICATION FACTICE, RÉDUITE AU CLASSEMENT ═══════════ */

/**
 * Application d'essai : les gestes d'un simulateur de diapositives, sans en
 * dépendre. Écrite ici plutôt qu'importée de `ppt/` pour que ce contrôle du
 * socle reste valable même si l'agent PowerPoint change son vocabulaire — et
 * pour qu'il ne franchisse aucune frontière d'écriture.
 */
const ETAT_FACTICE = new Set(["p:slideChange", "p:objectChange"])
const NAV_FACTICE = new Set(["p:selectSlide", "p:selectObject"])
const ACTIONS_SUR_ETAT = new Set(["P_EXPECT_SLIDE", "P_EXPECT_OBJECT"])

/** Ce que l'application répond quand elle a correctement rempli le contrat. */
function adaptateurCorrect(): AdaptateurApp {
  return {
    app: "POWERPOINT",
    prefixe: "P_",
    /*
     * Deux règles, et la seconde a failli m'échapper.
     *
     * 1. `null` sur un type qui n'est pas le sien — c'est le contrat de retour,
     *    et c'est ce qui fait exister le repli sur le juge générique. Un
     *    adaptateur qui répondrait à tout rendrait ce contrôle aveugle au
     *    défaut qu'il cherche.
     * 2. Un `reason` qui NE commence PAS par `no_`. Le noyau traite `no_…` sur
     *    une étape d'état comme un passage obligé, donc comme un tâtonnement :
     *    avec un tel motif, les mesures ci-dessous passeraient au vert même
     *    avec le prédicat saboté. C'est précisément ce que le contrôle a
     *    signalé à sa première exécution.
     */
    juger: (step) =>
      String(step.action.type).startsWith("P_")
        ? { ok: false, reason: "wrong_position", message: "Pas encore." }
        : null,
    attendu: () => null,
    fait: () => null,
    reponse: () => null,
    cible: () => ({}),
    demonstration: () => null,
    publier: () => null,
    estNavigation: (o) => NAV_FACTICE.has(o.kind),
    seJugeSurEtat: (t) => ACTIONS_SUR_ETAT.has(t),
    estObservationEtat: (o) => ETAT_FACTICE.has(o.kind),
    observables: new Set<string>(),
    libellesControles: {},
  }
}

/** Le même, avec UN prédicat saboté — pour piéger le contrôle. */
function adaptateurSabote(quoi: "etat" | "navigation" | "surEtat"): AdaptateurApp {
  const a = adaptateurCorrect()
  if (quoi === "etat") return { ...a, estObservationEtat: () => false }
  if (quoi === "navigation") return { ...a, estNavigation: () => false }
  return { ...a, seJugeSurEtat: () => false }
}

/* ═══════════ FABRIQUES ═══════════ */

/**
 * Une étape réduite au strict nécessaire pour être JUGÉE.
 *
 * Les actions Excel portent des champs obligatoires que `validateStep` lit sans
 * les défendre (`expected.cells`, `expected.chart`…) : une action nue le fait
 * lever. On fournit donc le minimum, jamais satisfait par l'observation — c'est
 * précisément le cas qui nous intéresse.
 */
const CHAMPS_MINIMAUX: Record<string, Record<string, unknown>> = {
  EXPECT_STATE: { cells: { A1: { v: 1 } } },
  EXPECT_CHART: { chart: { type: "bar" } },
  EXPECT_PIVOT: { pivot: { rows: ["Ville"] } },
  EXPECT_PAGE_SETUP: { pageSetup: { orientation: "landscape" } },
  EXPECT_MACRO: { macro: { name: "Cloture" } },
  // Jamais la cellule ni le bouton de l'observation : l'étape doit échouer,
  // c'est son classement qu'on mesure.
  CLICK_CELL: { cell: "B2" },
  CLICK_CONTROL: { control: "acc-gras" },
}

function etape(type: string): SimulationStep {
  return {
    id: `T-${type}`,
    consigne: "peu importe",
    action: { type, ...(CHAMPS_MINIMAUX[type] ?? {}) },
  } as unknown as SimulationStep
}

/**
 * Une observation minimale mais BIEN FORMÉE. Comme pour les actions,
 * `validateStep` lit les champs de l'observation sans les défendre : un
 * `stateChange` sans `readings` le fait lever avant d'atteindre le classement,
 * et le contrôle mesurerait alors une exception plutôt qu'un verdict.
 */
const CHAMPS_OBSERVATION: Record<string, Record<string, unknown>> = {
  stateChange: { readings: { A1: { formula: "", value: "" } } },
  chartChange: { chart: null },
  pivotChange: { pivot: null },
  pageSetupChange: { pageSetup: {} },
  macroChange: { macro: null },
  cellClick: { cell: "Z99", channel: "mouse" },
  typed: { target: "Z99", text: "x", channel: "keyboard" },
}

function obs(kind: string, extra: Record<string, unknown> = {}): ObservedAction {
  return { kind, ...(CHAMPS_OBSERVATION[kind] ?? {}), ...extra } as unknown as ObservedAction
}

function compte(
  step: SimulationStep,
  observed: ObservedAction,
  adaptateur?: AdaptateurApp,
): string {
  return jugerEtape(step, observed, adaptateur).compte
}

/* ═══════════ LES PROPRIÉTÉS ═══════════ */

type Cas = {
  titre: string
  /** Ce que le noyau doit répondre quand l'application dit vrai. */
  attendu: "reussite" | "faute" | "tatonnement" | "rien"
  mesure: (a?: AdaptateurApp) => string
  /** Le prédicat dont le sabotage doit faire basculer le résultat. */
  sabotage: "etat" | "navigation" | "surEtat"
  /** Ce que le sabotage doit produire — la preuve que la mesure détecte. */
  siSabote: "reussite" | "faute" | "tatonnement" | "rien"
}

const CAS: Cas[] = [
  {
    titre: "observation d'état non satisfaite → tâtonnement (le trou signalé par PPT)",
    attendu: "tatonnement",
    siSabote: "faute",
    sabotage: "etat",
    mesure: (a) => compte(etape("P_EXPECT_SLIDE"), obs("p:slideChange"), a),
  },
  {
    titre: "seconde observation d'état de la même application",
    attendu: "tatonnement",
    siSabote: "faute",
    sabotage: "etat",
    mesure: (a) => compte(etape("P_EXPECT_OBJECT"), obs("p:objectChange"), a),
  },
  {
    titre: "déplacement → tâtonnement, jamais faute",
    attendu: "tatonnement",
    siSabote: "faute",
    sabotage: "navigation",
    mesure: (a) => compte(etape("P_EXPECT_SLIDE"), obs("p:selectSlide"), a),
  },
  {
    titre: "frappe hors canal sur une étape jugée sur l'état → tâtonnement",
    attendu: "tatonnement",
    siSabote: "faute",
    sabotage: "surEtat",
    // `typed` sur une action préfixée : `frappe` reste nul (le calcul des
    // cellules est propre à `EXPECT_STATE`), donc seul `seJugeSurEtat` décide.
    mesure: (a) => compte(etape("P_EXPECT_SLIDE"), obs("typed"), a),
  },
  {
    // Le troisième étage corrigé sur Excel le 02/08/2026, ici hors d'Excel :
    // ouvrir un panneau ÉMET une observation avant que l'état jugé n'existe.
    // Compter ce geste plafonnait l'évaluation du module 27 à 78 %.
    titre: "passage obligé (motif « no_… ») sur une étape d'état → tâtonnement",
    attendu: "tatonnement",
    siSabote: "faute",
    sabotage: "surEtat",
    mesure: (a) =>
      jugerEtape(
        etape("P_EXPECT_SLIDE"),
        obs("p:control"),
        a
          ? { ...a, juger: () => ({ ok: false, reason: "no_slide", message: "" }) }
          : undefined,
      ).compte,
  },
]

/* ═══════════ PARITÉ EXCEL — le comportement de référence ═══════════ */

/**
 * Les mêmes questions posées à Excel, SANS adaptateur : c'est le chemin des 246
 * chapitres publiés. Si l'une de ces lignes bouge, la correction a débordé de
 * son périmètre.
 */
const PARITE_EXCEL: Array<[string, string]> = [
  [compte(etape("EXPECT_STATE"), obs("stateChange")), "tatonnement"],
  [compte(etape("EXPECT_CHART"), obs("chartChange")), "tatonnement"],
  [compte(etape("EXPECT_PIVOT"), obs("pivotChange")), "tatonnement"],
  [compte(etape("EXPECT_PAGE_SETUP"), obs("pageSetupChange")), "tatonnement"],
  [compte(etape("EXPECT_MACRO"), obs("macroChange")), "tatonnement"],
  [compte(etape("CLICK_CELL"), obs("cellClick")), "faute"],
  [compte(etape("CLICK_CONTROL"), obs("cellClick")), "tatonnement"],
]

/* ═══════════ ACTIONS GÉNÉRIQUES DU SOCLE ═══════════ */

/**
 * `READ`, `MONTRER` et `KEY` appartiennent au socle, pas aux applications : un
 * adaptateur rend `null` dessus. Sans repli sur le juge générique, tout écran de
 * lecture devenait infranchissable dans les trois applications — alors que
 * `check-montrer` en exige un sur CHAQUE écran `READ`.
 */
function verifierGeneriques(): string[] {
  const ec: string[] = []
  const a = adaptateurCorrect()
  const j = jugerEtape(etape("READ"), obs("next"), a)
  if (!j.ok) {
    ec.push(
      `un écran de lecture reste infranchissable avec un adaptateur d'application ` +
        `(verdict « ${j.reason ?? "?"} ») : le repli sur le juge générique manque`,
    )
  }
  return ec
}

/* ═══════════ EXÉCUTION ═══════════ */

const echecs: string[] = []
const piegesMuets: string[] = []

for (const c of CAS) {
  const reel = c.mesure(adaptateurCorrect())
  if (reel !== c.attendu) {
    echecs.push(`${c.titre}\n      attendu « ${c.attendu} », obtenu « ${reel} »`)
  }
  // Le piège : saboter le prédicat doit changer le résultat. Sinon la mesure ne
  // regarde pas ce qu'elle prétend regarder.
  const sabote = c.mesure(adaptateurSabote(c.sabotage))
  if (sabote !== c.siSabote) {
    piegesMuets.push(
      `${c.titre}\n      saboter « ${c.sabotage} » aurait dû donner « ${c.siSabote} », ` +
        `donne « ${sabote} » : cette mesure ne prouve rien`,
    )
  }
}

for (const [reel, attendu] of PARITE_EXCEL) {
  if (reel !== attendu) {
    echecs.push(`parité Excel rompue : attendu « ${attendu} », obtenu « ${reel} »`)
  }
}

echecs.push(...verifierGeneriques())

if (echecs.length || piegesMuets.length) {
  for (const e of echecs) console.error(`  ✗ ${e}`)
  for (const p of piegesMuets) console.error(`  ✗ PIÈGE MUET — ${p}`)
  console.error(
    `\n✗ ${echecs.length} défaut(s), ${piegesMuets.length} mesure(s) non probante(s).`,
  )
  process.exit(1)
}

console.log(
  `  ${CAS.length} propriété(s) de classement · ${PARITE_EXCEL.length} lignes de parité Excel · ` +
    `actions génériques du socle`,
)
console.log(
  `✓ les trois prédicats de classement sont bien portés par l'adaptateur, ` +
    `chaque mesure vérifiée par sabotage, Excel inchangé.`,
)
