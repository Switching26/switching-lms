/**
 * NON-RÉGRESSION DE LA NOTE — le contrôle qui protège le risque n°1 du chantier.
 *
 * POURQUOI IL EXISTE
 *
 * La partie la plus sensible du simulateur — persistance, registre de passage,
 * CALCUL DE NOTE — a été durcie les 2 et 3 août, après qu'une requête fabriquée
 * eut obtenu 100 % sans jouer une seule étape. Une régression y serait
 * SILENCIEUSE : la formation continuerait de se jouer normalement et les notes
 * seraient fausses. En contrôle Qualiopi, c'est indéfendable.
 *
 * Le critère de sortie de la phase 0 était adossé à `joueur-evals.cjs`, un
 * harnais NAVIGATEUR. Or ce harnais date du 02/08, et le passage d'évaluation
 * est passé côté serveur le 03/08 (`a596cd2`) : un banc statique ne peut plus
 * ouvrir de passage, et l'atelier refuse — à juste titre — de démarrer une
 * évaluation dont rien ne serait enregistré. Le critère était donc périmé avant
 * ce chantier.
 *
 * CE CONTRÔLE VISE PLUS JUSTE, ET IL EST REJOUABLE
 *
 * `jugerEtape` et `computeScore` sont PURS : ni React, ni DOM, ni réseau. On
 * peut donc rejouer les 27 évaluations en Node, en quelques secondes, sans le
 * bruit du rendu, du canvas et du pilotage au pixel. Ce qui est mesuré est
 * exactement ce qui compte : le CLASSEMENT de chaque observation
 * (réussite / faute / tâtonnement / rien) et la note qui en découle.
 *
 * CE QU'IL NE PROUVE PAS — à dire, pas à taire
 *
 *  · il ne prouve pas qu'une étape est JOUABLE à l'écran (cible atteignable,
 *    bouton rendu, geste réellement émis) : c'est le rôle de `check-jouabilite`,
 *    `check-controles` et d'un rejeu navigateur ;
 *  · il ne prouve pas la justesse ARITHMÉTIQUE des attendus : l'observation
 *    canonique d'un `EXPECT_STATE` est construite depuis l'attente elle-même,
 *    donc circulaire sur ce point. C'est l'audit de valeurs, qui recalcule dans
 *    le vrai moteur, qui couvre ce risque ;
 *  · il ne prouve pas la persistance côté serveur (`run.ts`), seulement le
 *    jugement et le calcul qui l'alimentent.
 *
 * USAGE
 *   npx tsx scripts/simulation/check-note-nonregression.ts            # contrôle
 *   npx tsx scripts/simulation/check-note-nonregression.ts --json     # empreinte
 *
 * `--json` écrit l'empreinte complète sur la sortie standard : c'est elle qu'on
 * compare entre deux versions du code (`diff` avant/après). Un écart, même d'un
 * millième sur une seule évaluation, est une régression de note.
 */

import * as fs from "fs"
import * as path from "path"
import { observationCanonique } from "./observation-canonique"
import { jugerEtape } from "../../lib/simulation/frappe"

/**
 * L'adaptateur, chargé de façon TOLÉRANTE.
 *
 * Ce contrôle sert à comparer deux versions du code : lancé contre une version
 * antérieure au registre, l'import statique ferait échouer le script au
 * chargement et la comparaison serait impossible — or c'est précisément ce
 * pour quoi il existe. Absent, le second passage est simplement sauté et
 * `viaAdaptateur` vaut `null`, ce qui se lit dans l'empreinte.
 */
let adaptateurExcel: unknown = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  adaptateurExcel = require("../../lib/simulation/excel-adaptateur").adaptateurExcel
} catch {
  adaptateurExcel = null
}
import { computeScore } from "../../lib/simulation/validate"
import type { ObservedAction } from "../../lib/simulation/validate"
import type { SimulationScenario, SimulationStep } from "../../lib/simulation/types"

const DIR = path.join(__dirname, "scenarios")
const JSON_SEUL = process.argv.includes("--json")

/** Une étape notable : celles qui composent le dénominateur de la note. */
function notable(s: SimulationStep): boolean {
  return s.action.type !== "READ" && (s.points ?? 1) > 0
}

/**
 * Une observation VRAIMENT fausse pour cette étape-là.
 *
 * Première version : une frappe dans une cellule hors sujet, pour toutes les
 * étapes. Elle ne coûtait rien sur 6 évaluations sur 27 — et c'était le contrôle
 * qui avait tort, pas le produit : une frappe hors des cellules attendues d'une
 * étape jugée sur l'ÉTAT vaut tâtonnement, règle délibérée du 02/08 qui a
 * débloqué 18 évaluations plafonnées. Un contre-test qui injecte une non-faute
 * ne mesure rien.
 *
 * On CORROMPT donc l'observation canonique dans le canal même de l'étape : un
 * état faux là où un état est attendu, le mauvais bouton là où un bouton est
 * attendu. C'est ce qu'un apprenant qui se trompe produit réellement.
 */
function observationFausse(s: SimulationStep): ObservedAction | null {
  // Une étape jugée sur l'ÉTAT ne peut PAS être ratée par un état faux : la
  // règle du 02/08 classe cela en tâtonnement, pour ne pas punir l'apprenant qui
  // construit son résultat en plusieurs gestes. La seule faute qu'un
  // `EXPECT_STATE` sait compter est une VALEUR FAUSSE tapée dans une cellule
  // attendue — c'est donc celle-là qu'il faut injecter.
  if (s.action.type === "EXPECT_STATE") {
    const premiere = Object.keys(s.action.cells ?? {})[0]
    if (premiere) {
      return {
        kind: "typed",
        target: premiere,
        text: "☠ valeur volontairement fausse",
        channel: "keyboard",
      }
    }
  }

  const juste = observationCanonique(s)
  if (!juste) return null
  switch (juste.kind) {
    case "typed":
      return { ...juste, text: "valeur volontairement fausse" }
    case "stateChange":
      return {
        kind: "stateChange",
        readings: Object.fromEntries(
          Object.keys(juste.readings).map((r) => [r, { formula: "", value: "☠ faux" }]),
        ),
      }
    case "formatChange":
      return {
        kind: "formatChange",
        readings: Object.fromEntries(
          Object.keys(juste.readings).map((r) => [
            r,
            { background: "", fontSize: null, hAlign: "", vAlign: "", wrap: null, numberFormat: "" },
          ]),
        ),
      }
    case "control":
      return { ...juste, control: "bouton-inexistant" }
    case "cellClick":
      return { ...juste, cell: "ZZ99" }
    case "dragRange":
      return { kind: "dragRange", range: "ZZ90:ZZ99" }
    case "selectColumn":
      return { kind: "selectColumn", column: "ZZ" }
    case "selectRow":
      return { kind: "selectRow", row: 9999 }
    case "selectSheet":
      return { kind: "selectSheet", name: "Feuille inexistante" }
    case "gotoRef":
      return { kind: "gotoRef", ref: "ZZ99" }
    case "defineName":
      return { kind: "defineName", name: "NomFaux", ref: "ZZ99" }
    case "sort":
      return { ...juste, ascending: !juste.ascending }
    case "filter":
      return { ...juste, values: ["☠ valeur absente"] }
    case "key":
      return { kind: "key", key: "F13" }
    case "contextMenu":
      return { kind: "contextMenu", target: "ZZ99" }
    case "doubleClick":
      return { kind: "doubleClick", target: "ZZ99" }
    case "fillHandle":
      return { kind: "fillHandle", from: "ZZ90", to: "ZZ99" }
    case "chartChange":
      return { kind: "chartChange", chart: null }
    case "chartElement":
      return { kind: "chartElement", element: "element-inexistant" }
    case "pivotChange":
      return { kind: "pivotChange", pivot: null }
    case "macroChange":
      return { kind: "macroChange", macro: null, code: "" }
    case "recorder":
      return { kind: "recorder", state: juste.state === "started" ? "stopped" : "started" }
    case "pageSetupChange":
      // Un réglage d'impression franchement faux : orientation inversée et
      // aucune des options attendues.
      return {
        kind: "pageSetupChange",
        pageSetup: { orientation: "paysage", margins: "etroites" } as never,
      }
    case "posteChange":
      return { kind: "posteChange", poste: { excel: "ferme" } as never }
    default:
      return null
  }
}

/**
 * Ce qu'un apprenant produit AVANT la bonne réponse, sans se tromper.
 *
 * Ces gestes ne sont pas décoratifs : ils sont le seul moyen d'exercer les
 * branches de classement qui ne se voient pas sur un parcours parfait, et donc
 * de faire de ce contrôle un vrai filet pour la note.
 */
function gestesNaturels(s: SimulationStep): ObservedAction[] {
  const a = s.action
  if (a.type === "TYPE" && a.target !== "formula-bar") {
    // On clique la cellule avant d'y taper. Une navigation ne se trompe jamais.
    return [{ kind: "cellClick", cell: a.target, channel: "mouse" }]
  }
  if (a.type === "EXPECT_FORMAT") {
    // On presse le bouton du ruban : l'observation de format ne vient qu'après.
    // Ce `control` est un PASSAGE OBLIGÉ, jamais une faute — la règle qui a
    // débloqué l'évaluation du module 27, plafonnée à 78 %.
    return [{ kind: "control", control: "acc-format-monetaire", channel: "ribbon" }]
  }
  if (a.type === "EXPECT_STATE") {
    // La frappe JUSTE arrive avant l'observation d'état. Elle ne doit rien
    // coûter — c'était le premier des trois étages du plafonnement du 02/08.
    const [ref, attendu] = Object.entries(a.cells ?? {})[0] ?? []
    if (!ref || !attendu) return []
    const texte =
      attendu.anyOf?.[0] ?? attendu.f ?? (attendu.v !== undefined ? String(attendu.v) : null)
    if (texte === null) return []
    return [
      { kind: "cellClick", cell: ref, channel: "mouse" },
      { kind: "typed", target: ref, text: texte, channel: "keyboard" },
    ]
  }
  return []
}

/**
 * Rejoue une évaluation et rend la note.
 *
 * `fauteSur` injecte une faute VOLONTAIRE : avant de jouer l'étape juste, on
 * envoie une observation fausse. C'est le contre-test — sans lui, un contrôle
 * qui rendrait toujours 100 % passerait pour vert alors qu'il ne mesure rien.
 */
function rejouer(
  steps: SimulationStep[],
  fauteSur?: string,
  /**
   * Juger PAR L'ADAPTATEUR plutôt qu'en appelant le juge directement.
   *
   * C'est la vérification centrale du registre : « Excel devient un adaptateur
   * comme les autres » n'a de valeur que si on prouve qu'il rend EXACTEMENT les
   * mêmes verdicts. Sans ce second passage, une régression dans
   * `excel-adaptateur.ts` — le fichier même qui porte le mécanisme d'extension —
   * ne se voyait pas : le contrôle n'empruntait jamais ce chemin.
   */
  parAdaptateur = false,
): { note: number; nonJouables: string[]; comptes: Record<string, number> } {
  const premierEssaiReussi: Record<string, boolean> = {}
  const nonJouables: string[] = []
  const comptes: Record<string, number> = { reussite: 0, faute: 0, tatonnement: 0, rien: 0 }

  for (const s of steps) {
    // La faute volontaire arrive AVANT la bonne réponse : c'est ce que fait un
    // apprenant qui se trompe puis se corrige. Elle doit coûter le point
    // « premier essai » sans empêcher l'étape d'être franchie ensuite.
    if (fauteSur && s.id === fauteSur && notable(s)) {
      const fausse = observationFausse(s)
      if (fausse) {
        const j = jugerEtape(s, fausse, parAdaptateur && adaptateurExcel ? (adaptateurExcel as never) : undefined)
        comptes[j.compte] = (comptes[j.compte] ?? 0) + 1
        if (j.compte === "reussite" && premierEssaiReussi[s.id] === undefined) {
          premierEssaiReussi[s.id] = true
        } else if (j.compte === "faute") {
          premierEssaiReussi[s.id] = false
        }
      }
    }

    /* LES GESTES NATURELS QUI PRÉCÈDENT LA BONNE RÉPONSE.
     *
     * Sans eux, ce contrôle ne parcourait que le chemin de la réussite : trois
     * régressions injectées volontairement dans le classement — « une navigation
     * redevient une faute », « une frappe juste sur une étape d'état recompte
     * une faute » — passaient inaperçues, parce que ces branches n'étaient
     * jamais atteintes. Or ce sont précisément les deux règles dont l'oubli a
     * plafonné 18 évaluations sur 27 le 02/08.
     *
     * On rejoue donc ce qu'un apprenant fait vraiment : il clique la cellule
     * avant d'y taper, et il tape la bonne valeur avant que l'état ne se pose
     * (la grille n'émet `stateChange` que ~350 ms plus tard). Aucun de ces
     * gestes ne doit coûter de point. */
    for (const prealable of gestesNaturels(s)) {
      const jp = jugerEtape(s, prealable, parAdaptateur && adaptateurExcel ? (adaptateurExcel as never) : undefined)
      comptes[jp.compte] = (comptes[jp.compte] ?? 0) + 1
      if (jp.compte === "faute") premierEssaiReussi[s.id] = false
      else if (jp.compte === "reussite" && premierEssaiReussi[s.id] === undefined) {
        premierEssaiReussi[s.id] = true
      }
    }

    const obs = observationCanonique(s)
    if (!obs) {
      // Aucune observation canonique : on ne peut pas affirmer que cette étape
      // est réussie. On le DIT plutôt que de la compter juste — un contrôle qui
      // suppose la réussite d'une étape qu'il ne sait pas jouer ment.
      nonJouables.push(`${s.id} (${s.action.type})`)
      continue
    }
    const j = jugerEtape(s, obs, parAdaptateur && adaptateurExcel ? (adaptateurExcel as never) : undefined)
    comptes[j.compte] = (comptes[j.compte] ?? 0) + 1
    if (j.compte === "reussite") {
      if (premierEssaiReussi[s.id] === undefined) premierEssaiReussi[s.id] = true
    } else if (j.compte === "faute") {
      premierEssaiReussi[s.id] = false
    }
  }

  return { note: computeScore(steps, premierEssaiReussi), nonJouables, comptes }
}

/* ═══════════ EXÉCUTION ═══════════ */

const fichiers = fs
  .readdirSync(DIR)
  .filter((f) => /-ev\d*\.json$/i.test(f))
  .sort()

const empreinte: Record<string, unknown> = {}
const echecs: string[] = []
let totalEtapes = 0
let totalPoints = 0

for (const f of fichiers) {
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))
  const notables = sc.steps.filter(notable)
  const points = notables.reduce((n, s) => n + (s.points ?? 1), 0)
  totalEtapes += sc.steps.length
  totalPoints += points

  const parfait = rejouer(sc.steps)
  const parAdapt = adaptateurExcel ? rejouer(sc.steps, undefined, true) : null
  const memeChemin =
    !parAdapt ||
    (parAdapt.note === parfait.note &&
      JSON.stringify(parAdapt.comptes) === JSON.stringify(parfait.comptes))

  /* CONTRE-TEST : une faute volontaire sur la PREMIÈRE étape notable.
   * La note attendue est arithmétique — (points − points de cette étape) / points —
   * et non un chiffre écrit à la main : c'est ce qui rend le contre-test valable
   * sur les 27 évaluations, quel que soit leur barème. */
  /* Quelle étape peut RÉELLEMENT être ratée ?
   *
   * Certains types — graphique, tableau croisé, mise en page — ne comptent
   * jamais de faute : leur résultat se construit en plusieurs gestes, et punir
   * chaque état intermédiaire punirait un apprenant qui fait juste. Viser
   * aveuglément la première étape notable donnait donc un contre-test inerte sur
   * 5 évaluations, et c'était le contrôle qui avait tort.
   *
   * On cherche la première étape notable dont une faute coûte effectivement son
   * point. S'il n'y en a aucune, on le DIT : c'est une information sur
   * l'évaluation, pas un échec du contrôle. */
  const cible =
    notables.find((s) => {
      const f = observationFausse(s)
      return f ? jugerEtape(s, f).compte === "faute" : false
    }) ?? null
  const avecFaute = cible ? rejouer(sc.steps, cible.id) : null
  const attenduAvecFaute = cible ? (points - (cible.points ?? 1)) / points : null

  empreinte[f] = {
    etapes: sc.steps.length,
    notables: notables.length,
    points,
    note: Number(parfait.note.toFixed(6)),
    comptes: parfait.comptes,
    nonJouables: parfait.nonJouables,
    /* Le chemin registre rend-il le même verdict que le chemin direct ? */
    viaAdaptateur: parAdapt
      ? { note: Number(parAdapt.note.toFixed(6)), identique: memeChemin }
      : null,
    contreTest: avecFaute && cible
      ? { etape: cible.id, note: Number(avecFaute.note.toFixed(6)) }
      : null,
    /* Aucune étape notable de cette évaluation ne peut être ratée par un geste
     * simple : à signaler au chef d'orchestre, un apprenant pourrait y tâtonner
     * sans jamais perdre de point. Hors périmètre de la phase 0. */
    aucuneEtapeRatable: cible === null,
  }

  if (!memeChemin) {
    echecs.push(`${f} (adaptateur)`)
    if (!JSON_SEUL) {
      console.log(
        `  ✗ ${f.padEnd(16)} l'adaptateur Excel ne rend PAS le même verdict que le juge direct : ` +
          `${((parAdapt?.note ?? 0) * 100).toFixed(1)} % contre ${(parfait.note * 100).toFixed(1)} %. ` +
          `Le registre ne porte plus Excel à l'identique.`,
      )
    }
  }

  if (JSON_SEUL) continue

  const pct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`
  const ok = parfait.note === 1 && parfait.nonJouables.length === 0
  if (!ok) {
    echecs.push(f)
    console.log(`  ✗ ${f.padEnd(16)} ${pct(parfait.note)}`)
    if (parfait.nonJouables.length) {
      console.log(`      étapes non jouables par ce contrôle : ${parfait.nonJouables.join(", ")}`)
    }
    if (parfait.comptes.faute) {
      console.log(`      ${parfait.comptes.faute} faute(s) comptée(s) sur un parcours SANS erreur`)
    }
  }

  // Le contre-test doit descendre exactement du barème de l'étape fautée.
  if (avecFaute && attenduAvecFaute !== null) {
    const conforme = Math.abs(avecFaute.note - attenduAvecFaute) < 1e-9
    if (!conforme) {
      echecs.push(`${f} (contre-test)`)
      console.log(
        `  ✗ ${f.padEnd(16)} contre-test : ${pct(avecFaute.note)} au lieu de ` +
          `${pct(attenduAvecFaute)} — une faute volontaire ne coûte pas ce qu'elle devrait.`,
      )
    } else if (avecFaute.note === 1) {
      // Le piège du piège : si la faute ne change rien, le contrôle ne mesure rien.
      echecs.push(`${f} (contre-test inerte)`)
      console.log(`  ✗ ${f.padEnd(16)} contre-test INERTE : la faute volontaire n'a rien coûté.`)
    }
  }
}

if (JSON_SEUL) {
  console.log(JSON.stringify(empreinte, null, 1))
  process.exit(0)
}

const contreTests = Object.values(empreinte)
  .map((e) => (e as { contreTest: { note: number } | null }).contreTest)
  .filter(Boolean) as { note: number }[]
const plage = contreTests.length
  ? `${(Math.min(...contreTests.map((c) => c.note)) * 100).toFixed(0)}–${(
      Math.max(...contreTests.map((c) => c.note)) * 100
    ).toFixed(0)} %`
  : "—"

console.log()
console.log(
  `  ${fichiers.length} évaluation(s) · ${totalEtapes} étapes · ${totalPoints} points au total`,
)
console.log(`  contre-tests (une faute volontaire) : ${plage}`)

if (echecs.length) {
  console.error(`\n✗ ${echecs.length} anomalie(s) de note : ${echecs.join(", ")}`)
  process.exit(1)
}
console.log(
  `✓ ${fichiers.length}/${fichiers.length} évaluations à 100 % sur un parcours sans faute, ` +
    `verdicts identiques par le juge direct et par l'adaptateur.`,
)
