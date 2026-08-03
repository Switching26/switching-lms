/**
 * Garde-fou du journal de tentative (`SimulationAttempt.stepLog`).
 *
 *   npx tsx scripts/simulation/check-journal-eval.ts
 *
 * Trois propriétés, chacune adossée à un défaut réel :
 *
 *  A. Le résumé affiché est EN POINTS, comme le barème. Compter les étapes
 *     produisait un détail qui contredit le score affiché à côté — la tentative
 *     d'Éric NABET vaut 15,4 % (2 points sur 13) sur un scénario qui compte
 *     moins d'actions notées que de points.
 *
 *  B. Le serveur ne croit du navigateur que les booléens de réussite. Le rang,
 *     le type et le barème sont reconstruits depuis le scénario : sinon un
 *     client peut s'attribuer cent points ou déguiser une étape notée en écran
 *     de lecture.
 *
 *  C. Le journal ne remplace le précédent que s'il décrit la tentative dont la
 *     note est affichée — une évaluation terminée dont le score atteint le
 *     meilleur. Sans cela un retake moins bon, ou un PUT fabriqué en cours de
 *     parcours, écrasait la preuve.
 *
 * Le LMS n'a pas de lanceur de tests et on n'en ajoute pas pour ça : ce script
 * est autonome, comme les autres `check-*` du dossier.
 */

import {
  doitRemplacerJournal,
  resumeJournal,
  sanitizeStepLog,
  type EntreeJournal,
} from "../../lib/simulation/journal"

let echecs = 0
let total = 0

function verifie(intitule: string, condition: boolean) {
  total++
  if (!condition) {
    echecs++
    console.error(`  ✗ ${intitule}`)
  }
}

/* ── Scénario de référence : barème volontairement NON uniforme ──────────────
   Deux actions à 1 point, une à 3 points, plus un écran de lecture et une étape
   déclarée à 0 point. Total notable = 5 points pour 3 étapes notées : compter
   les étapes donnerait 2/3 = 67 % là où le barème dit 4/5 = 80 %. */
const scenario = {
  steps: [
    { id: "s1", points: 1, action: { type: "TYPE" } },
    { id: "s2", points: 3, action: { type: "EXPECT_STATE" } },
    { id: "s3", points: 1, action: { type: "CLICK_CONTROL" } },
    { id: "s4", action: { type: "READ" } },
    { id: "s5", points: 0, action: { type: "CLICK_CELL" } },
  ],
}

/* ── A. Résumé pondéré par les points ─────────────────────────────────────── */
{
  const journal = sanitizeStepLog(
    [
      { id: "s1", premierEssai: true, tentee: true },
      { id: "s2", premierEssai: false, tentee: true },
      { id: "s3", premierEssai: true, tentee: true },
      { id: "s4", premierEssai: true, tentee: true },
      { id: "s5", premierEssai: true, tentee: true },
    ],
    scenario,
  )
  const r = resumeJournal(journal)
  verifie("A1 · le résumé existe", r != null)
  verifie("A2 · le total ignore READ et les étapes à 0 point (5 points)", r?.pointsTotal === 5)
  verifie("A3 · les points réussis sont pondérés, pas comptés en étapes (2)", r?.pointsReussis === 2)
  // Le piège que ce contrôle existe pour attraper : un comptage par étapes
  // aurait rendu 2 réussies sur 3, soit 67 %, à côté d'un score de 40 %.
  const parEtapes = (journal ?? []).filter((e) => e.type !== "READ" && e.points > 0)
  verifie(
    "A4 · le comptage par étapes diverge bien du barème (piège du détecteur)",
    parEtapes.length === 3 && r?.pointsTotal === 5,
  )
  // Cohérence avec le barème de computeScore : earned / total.
  verifie("A5 · le résumé retrouve exactement le score (2/5 = 40 %)", (r!.pointsReussis / r!.pointsTotal) === 0.4)
}

/* ── B. Le navigateur ne dicte ni le barème ni le type ────────────────────── */
{
  const journal = sanitizeStepLog(
    [
      // Barème et type mensongers, plus un rang fantaisiste.
      { id: "s2", n: 999, type: "READ", points: 100, premierEssai: true, tentee: true },
      // Identifiant inconnu du scénario.
      { id: "s-inexistant", premierEssai: true, tentee: true, points: 50 },
      // Doublon du premier.
      { id: "s2", premierEssai: false, tentee: false },
      // Entrées mal formées.
      null,
      "s1",
      { premierEssai: true },
    ],
    scenario,
  )
  verifie("B1 · seule l'étape connue est retenue", journal?.length === 1)
  const e = journal?.[0] as EntreeJournal
  verifie("B2 · le barème vient du scénario, pas du client (3 et non 100)", e?.points === 3)
  verifie("B3 · le type vient du scénario (EXPECT_STATE et non READ)", e?.type === "EXPECT_STATE")
  verifie("B4 · le rang est reconstruit (2 et non 999)", e?.n === 2)
  verifie("B5 · le booléen de réussite, lui, est bien celui du client", e?.premierEssai === true)
  // Un barème forgé à 100 points aurait écrasé le résumé.
  const r = resumeJournal(journal)
  verifie("B6 · le résumé reste borné par le scénario", r?.pointsTotal === 3)

  verifie("B7 · une entrée non tableau est refusée", sanitizeStepLog("nope", scenario) === undefined)
  verifie("B8 · un scénario vide refuse tout journal", sanitizeStepLog([{ id: "s1" }], {}) === undefined)
  verifie(
    "B9 · un journal sans étape connue ne crée pas de trace vide",
    sanitizeStepLog([{ id: "zzz", premierEssai: true }], scenario) === undefined,
  )
  // Le journal ne doit contenir QUE les clés attendues : aucune cible, aucune
  // réponse ne doit pouvoir transiter par ce canal.
  const clesAttendues = ["n", "id", "type", "points", "premierEssai", "tentee"].sort().join(",")
  const journalPropre = sanitizeStepLog(
    [{ id: "s1", premierEssai: true, tentee: true, accept: ["=SOMME(A1:A3)"], cells: { A1: 1 } }],
    scenario,
  )
  verifie(
    "B10 · aucune clé étrangère ne survit (pas de fuite de réponse attendue)",
    Object.keys(journalPropre![0]).sort().join(",") === clesAttendues,
  )
}

/* ── C. Quand remplacer le journal ────────────────────────────────────────── */
{
  const journal = sanitizeStepLog([{ id: "s1", premierEssai: true, tentee: true }], scenario)
  const base = { mode: "EVALUATION", termine: true, journal, score: 0.8 }

  verifie(
    "C1 · première tentative terminée : on écrit",
    doitRemplacerJournal({ ...base, bestScoreExistant: null }) === true,
  )
  verifie(
    "C2 · retake MEILLEUR : on remplace",
    doitRemplacerJournal({ ...base, score: 0.9, bestScoreExistant: 0.8 }) === true,
  )
  verifie(
    "C3 · retake à égalité : on remplace (journal plus frais, même note)",
    doitRemplacerJournal({ ...base, score: 0.8, bestScoreExistant: 0.8 }) === true,
  )
  // LE cas signalé : la page affiche bestScore, un journal moins bon le
  // contredirait.
  verifie(
    "C4 · retake MOINS BON : on garde le journal du meilleur passage",
    doitRemplacerJournal({ ...base, score: 0.3, bestScoreExistant: 0.8 }) === false,
  )
  verifie(
    "C5 · évaluation NON terminée : aucun dépôt (PUT fabriqué en cours de route)",
    doitRemplacerJournal({ ...base, termine: false, bestScoreExistant: null }) === false,
  )
  verifie(
    "C6 · leçon : pas de journal noté",
    doitRemplacerJournal({ ...base, mode: "LESSON", bestScoreExistant: null }) === false,
  )
  verifie(
    "C7 · exercice : pas de journal noté",
    doitRemplacerJournal({ ...base, mode: "EXERCISE", bestScoreExistant: null }) === false,
  )
  verifie(
    "C8 · sans score, rien n'est déposé",
    doitRemplacerJournal({ ...base, score: undefined, bestScoreExistant: null }) === false,
  )
  verifie(
    "C9 · journal vide : rien n'est déposé",
    doitRemplacerJournal({ ...base, journal: undefined, bestScoreExistant: null }) === false,
  )
}

/* ── D. Tentatives antérieures au journal ─────────────────────────────────── */
{
  // La tentative d'Éric NABET a un stepLog NULL : le détail ne doit pas être
  // reconstitué, seulement omis.
  verifie("D1 · un journal absent ne produit aucun résumé", resumeJournal(null) === null)
  verifie("D2 · un journal vide non plus", resumeJournal([]) === null)
  verifie(
    "D3 · un journal fait uniquement de lectures ne produit pas un 0 sur 0",
    resumeJournal([{ id: "s4", type: "READ", points: 1, premierEssai: false }]) === null,
  )
}

if (echecs > 0) {
  console.error(`\n✗ ${echecs} vérification(s) en échec sur ${total}.`)
  process.exit(1)
}
console.log(`✓ ${total} vérifications, 0 échec — journal de tentative conforme.`)
