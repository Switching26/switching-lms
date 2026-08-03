/**
 * LE REGISTRE DE VERDICTS, ÉPROUVÉ SUR UNE VRAIE BASE.
 *
 *   createdb lms_verdicts_test
 *   DATABASE_URL=postgresql://…/lms_verdicts_test npx prisma db push
 *   DATABASE_URL=postgresql://…/lms_verdicts_test npx tsx scripts/simulation/check-registre.ts
 *
 * Les règles du registre — un verdict par étape et par passage, `premierEssai`
 * immuable, ordre imposé, passage borné à son propriétaire — ne sont pas des
 * vérifications applicatives : ce sont des contraintes de base et des écritures
 * conditionnelles. Les tester sur un objet simulé ne prouverait rien. Ce contrôle
 * exige donc une base PostgreSQL RÉELLE, jetable, et refuse de s'exécuter sans.
 *
 * ⚠️ Base de TEST uniquement. Le script refuse toute base dont le nom ne contient
 * pas « test », pour qu'une variable d'environnement mal placée ne puisse pas le
 * lancer sur des données réelles.
 */

import * as fs from "fs"
import * as path from "path"
import { PrismaClient } from "@prisma/client"
import {
  cloturerPassage,
  enregistrerVerdict,
  marquerPassee,
  noterDepuisVerdicts,
  ouvrirPassage,
  passageActif,
  passageDeclare,
  passagePourCloture,
  passagePourVerdict,
  reporterUneSeuleFois,
  verdictsDuPassage,
} from "../../lib/simulation/run"

const url = process.env.DATABASE_URL ?? ""
if (!/test/i.test(url)) {
  console.error(
    "\n✗ Ce contrôle exige une base de TEST jetable.\n" +
      "  Attendu : DATABASE_URL pointant sur une base dont le nom contient « test ».\n" +
      "  Reçu : " + (url ? "une base sans « test » dans son nom" : "rien") + "\n",
  )
  process.exit(2)
}

const prisma = new PrismaClient()

let echecs = 0
let total = 0
function verifie(intitule: string, condition: boolean, detail?: string) {
  total++
  if (!condition) {
    echecs++
    console.error(`  ✗ ${intitule}${detail ? ` — ${detail}` : ""}`)
  }
}

const SCENARIOS = path.resolve(__dirname, "../../scripts/simulation/scenarios")
const m10 = JSON.parse(fs.readFileSync(path.join(SCENARIOS, "m10-ev01.json"), "utf8"))

async function main() {
  /* ── Décor minimal : deux apprenants, une formation, une évaluation ─────── */
  await prisma.simulationStepVerdict.deleteMany({})
  await prisma.simulationRun.deleteMany({})
  await prisma.simulation.deleteMany({})
  await prisma.chapter.deleteMany({})
  await prisma.section.deleteMany({})
  await prisma.formation.deleteMany({})
  await prisma.user.deleteMany({})

  const alice = await prisma.user.create({
    data: { email: "alice@test.local", password: "x", firstName: "Alice", lastName: "T", role: "LEARNER" },
  })
  const bob = await prisma.user.create({
    data: { email: "bob@test.local", password: "x", firstName: "Bob", lastName: "T", role: "LEARNER" },
  })
  const formation = await prisma.formation.create({ data: { title: "Excel", description: "t" } })
  const section = await prisma.section.create({ data: { formationId: formation.id, title: "M10", order: 10 } })
  const chapitre = await prisma.chapter.create({
    data: { formationId: formation.id, sectionId: section.id, title: "S'évaluer", order: 301, isPublished: true },
  })
  const sim = await prisma.simulation.create({
    data: { chapterId: chapitre.id, mode: "EVALUATION", scenario: m10, stepCount: m10.steps.length, version: 1 },
  })

  const notables = (m10.steps as any[]).filter(
    (s) => s.action?.type !== "READ" && (typeof s.points === "number" ? s.points : 1) > 0,
  )
  const rang = (id: string) => (m10.steps as any[]).findIndex((s) => s.id === id)

  /* ═══ R1 · Ouverture et REPRISE ══════════════════════════════════════════ */
  console.log(`\n=== R. Registre de verdicts ===`)
  {
    const a = await ouvrirPassage({ simulationId: sim.id, userId: alice.id, scenarioVersion: 1 })
    const b = await ouvrirPassage({ simulationId: sim.id, userId: alice.id, scenarioVersion: 1 })
    verifie("R1a · recharger la page reprend LE MÊME passage", a.id === b.id)
    verifie("R1b · et n'incrémente pas le rang", b.passage === 1)
    const actif = await passageActif(sim.id, alice.id)
    verifie("R1c · le passage actif est bien celui-là", actif?.id === a.id)
  }

  /* ═══ R2 · ORDRE imposé ══════════════════════════════════════════════════ */
  {
    const run = (await passageActif(sim.id, alice.id))!

    /* UN PASSAGE NEUF N'ACCEPTE QUE L'ÉTAPE 0.
     *
     * `maxStepIndex` vaut -1 sur un passage neuf, et non 0. À 0, l'étape 1
     * aurait déjà été recevable (1 <= 0 + 1) alors que l'étape 0 n'avait pas été
     * franchie — et un scénario à une seule étape aurait été clôturable sans le
     * moindre verdict. */
    verifie("R2-0a · un passage neuf part à -1", run.maxStepIndex === -1, `${run.maxStepIndex}`)
    const zero = await passagePourVerdict({
      runId: run.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 1, stepIndex: 0,
    })
    verifie("R2-0b · l'étape 0 est recevable", !("refus" in zero))
    const une = await passagePourVerdict({
      runId: run.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 1, stepIndex: 1,
    })
    verifie("R2-0c · l'étape 1 ne l'est pas encore", "refus" in une && une.refus === "hors-ordre")

    /* Et un scénario à UNE SEULE étape ne se clôture pas sur un passage neuf. */
    const cloturable = await passagePourCloture({
      runId: run.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 1, stepCount: 1,
    })
    verifie("R2-0d · un scénario à une étape n'est pas clôturable d'emblée",
      "refus" in cloturable && cloturable.refus === "inacheve")

    // Une fois l'étape 0 franchie, l'étape 1 devient recevable — et le scénario
    // à une étape, clôturable. C'est la contre-épreuve : la garde n'est pas un
    // blocage permanent.
    const premiere = (m10.steps as any[])[0].id
    await enregistrerVerdict({ runId: run.id, stepId: premiere, stepIndex: 0, compte: "reussite" })
    const apres = await passagePourVerdict({
      runId: run.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 1, stepIndex: 1,
    })
    verifie("R2-0e · après l'étape 0, l'étape 1 passe", !("refus" in apres))
    const cloturable2 = await passagePourCloture({
      runId: run.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 1, stepCount: 1,
    })
    verifie("R2-0f · et le scénario à une étape se clôture", !("refus" in cloturable2))
    const loin = await passagePourVerdict({
      runId: run.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 1, stepIndex: 9,
    })
    verifie("R2a · on ne peut pas sauter à l'étape 9", "refus" in loin && loin.refus === "hors-ordre")
    const suivante = await passagePourVerdict({
      runId: run.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 1, stepIndex: 1,
    })
    verifie("R2b · l'étape suivante, elle, est recevable", !("refus" in suivante))
  }

  /* ═══ R3 · ACCÈS D'UN AUTRE APPRENANT ════════════════════════════════════ */
  {
    const run = (await passageActif(sim.id, alice.id))!
    const vole = await passagePourVerdict({
      runId: run.id, simulationId: sim.id, userId: bob.id, scenarioVersion: 1, stepIndex: 1,
    })
    verifie("R3a · le passage d'un autre est introuvable", "refus" in vole && vole.refus === "run-inconnu")
    // Le motif est le même que pour un identifiant inventé : un passage ne doit
    // pas révéler son existence à qui n'en est pas propriétaire.
    const invente = await passagePourVerdict({
      runId: "cl-inexistant", simulationId: sim.id, userId: bob.id, scenarioVersion: 1, stepIndex: 1,
    })
    verifie("R3b · et indistinguable d'un identifiant inventé", "refus" in invente && invente.refus === "run-inconnu")
  }

  /* ═══ R4 · `premierEssai` IMMUABLE ═══════════════════════════════════════ */
  {
    const run = (await passageActif(sim.id, alice.id))!
    const etape = notables[0].id
    // Une faute d'abord, une réussite ensuite : le point est perdu pour de bon.
    await enregistrerVerdict({ runId: run.id, stepId: etape, stepIndex: rang(etape), compte: "faute" })
    await enregistrerVerdict({ runId: run.id, stepId: etape, stepIndex: rang(etape), compte: "reussite" })
    const v = (await verdictsDuPassage(run.id)).find((x) => x.stepId === etape)!
    verifie("R4a · la faute retire le premier essai", v.premierEssai === false)
    verifie("R4b · la réussite qui suit ne le rend pas", v.premierEssai === false)
    verifie("R4c · mais l'étape est bien marquée franchie", v.reussie === true)
    verifie("R4d · et la faute est comptée", v.fautes === 1)

    // Réussite d'abord, faute ensuite : le point est perdu quand même. La règle
    // est MONOTONE, et c'est ce qui la rend juste sous concurrence (R5) — l'ordre
    // d'arrivée n'est pas l'ordre d'émission. Choix conservateur assumé : on ne
    // donne pas un point sur lequel il existe un doute.
    const etape2 = notables[1].id
    await enregistrerVerdict({ runId: run.id, stepId: etape2, stepIndex: rang(etape2), compte: "reussite" })
    const avantFaute = (await verdictsDuPassage(run.id)).find((x) => x.stepId === etape2)!
    verifie("R4e · une réussite seule accorde le point", avantFaute.premierEssai === true)
    await enregistrerVerdict({ runId: run.id, stepId: etape2, stepIndex: rang(etape2), compte: "faute" })
    const v2 = (await verdictsDuPassage(run.id)).find((x) => x.stepId === etape2)!
    verifie("R4f · une faute, même tardive, le retire (règle monotone)", v2.premierEssai === false)
  }

  /* ═══ R5 · CONCURRENCE ═══════════════════════════════════════════════════ */
  {
    const run = (await passageActif(sim.id, alice.id))!
    const etape = notables[2].id
    // Vingt écritures simultanées, dont une faute : le point ne doit pas être
    // accordé. C'est le cas que le registre en JSON n'aurait pas tenu — une
    // lecture suivie d'une écriture aurait pu perdre la faute.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        enregistrerVerdict({
          runId: run.id, stepId: etape, stepIndex: rang(etape),
          compte: i === 7 ? "faute" : "reussite",
        }),
      ),
    )
    const lignes = await prisma.simulationStepVerdict.findMany({ where: { runId: run.id, stepId: etape } })
    verifie("R5a · une seule ligne malgré vingt écritures", lignes.length === 1, `${lignes.length}`)
    verifie("R5b · la faute n'est pas perdue", lignes[0]?.premierEssai === false)

    // Le cas inverse : que des réussites concurrentes → le point est acquis.
    const propre = notables[3].id
    await Promise.all(
      Array.from({ length: 20 }, () =>
        enregistrerVerdict({ runId: run.id, stepId: propre, stepIndex: rang(propre), compte: "reussite" }),
      ),
    )
    const l2 = await prisma.simulationStepVerdict.findMany({ where: { runId: run.id, stepId: propre } })
    verifie("R5c · vingt réussites simultanées ne font qu'une ligne", l2.length === 1, `${l2.length}`)
    verifie("R5d · et le point est acquis", l2[0]?.premierEssai === true)
  }

  /* ═══ R6 · TÂTONNEMENT : aucune trace, aucun effet ═══════════════════════ */
  {
    const run = (await passageActif(sim.id, alice.id))!
    const etape = notables[4].id
    await enregistrerVerdict({ runId: run.id, stepId: etape, stepIndex: rang(etape), compte: "tatonnement" })
    await enregistrerVerdict({ runId: run.id, stepId: etape, stepIndex: rang(etape), compte: "rien" })
    const l = await prisma.simulationStepVerdict.findMany({ where: { runId: run.id, stepId: etape } })
    verifie("R6 · un tâtonnement n'écrit rien", l.length === 0)
  }

  /* ═══ R7 · QUESTION PASSÉE : le curseur avance, la note non ══════════════ */
  {
    const run = (await passageActif(sim.id, alice.id))!
    const avant = run.maxStepIndex
    const verdictsAvant = await prisma.simulationStepVerdict.count({ where: { runId: run.id } })
    await marquerPassee({ runId: run.id, stepId: (m10.steps as any[])[avant + 1].id, stepIndex: avant + 1 })
    const apres = (await passageActif(sim.id, alice.id))!
    verifie("R7a · le curseur avance", apres.maxStepIndex === avant + 1)
    // Le nombre de verdicts ne bouge pas : une question passée n'en écrit aucun.
    // On le mesure de part et d'autre plutôt qu'en dur, pour que le contrôle
    // survive à l'ajout d'un cas au-dessus.
    // Une question passée LAISSE une trace : c'est elle qui rend le renoncement
    // irréversible. Mais elle n'accorde aucun point.
    const apresPassage = await prisma.simulationStepVerdict.count({ where: { runId: run.id } })
    verifie("R7b · le renoncement laisse un marqueur", apresPassage === verdictsAvant + 1, `${apresPassage}`)
    const marque = (await verdictsDuPassage(run.id)).find((v) => v.stepId === (m10.steps as any[])[avant + 1].id)!
    verifie("R7c · marquée passée, non tentée, sans point", marque.passee && !marque.tentee && !marque.premierEssai)
  }

  /* ═══ R8 · NOTE : seuls les verdicts comptent ════════════════════════════ */
  {
    const run = (await passageActif(sim.id, alice.id))!
    const verdicts = await verdictsDuPassage(run.id)
    const r = noterDepuisVerdicts(m10, verdicts)
    // La note attendue est recalculée depuis le registre lui-même, pas écrite en
    // dur : c'est la propriété qu'on vérifie — la note ne dépend QUE des verdicts.
    const attendus = verdicts
      .filter((v) => v.premierEssai)
      .reduce((a, v) => {
        const s = (m10.steps as any[]).find((x) => x.id === v.stepId)
        return a + (typeof s?.points === "number" ? s.points : 1)
      }, 0)
    verifie("R8a · la note suit les seuls verdicts acquis", r.pointsObtenus === attendus, `${r.pointsObtenus} ≠ ${attendus}`)
    verifie("R8a' · et le registre contient bien des points", attendus > 0)
    verifie("R8b · le barème vient du scénario", r.pointsTotal === 25)
    verifie("R8c · le journal couvre toutes les étapes", r.journal.length === m10.steps.length)
  }

  /* ═══ R9 · REPASSER : un passage neuf, sans héritage ═════════════════════ */
  {
    const ancien = (await passageActif(sim.id, alice.id))!
    const neuf = await ouvrirPassage({ simulationId: sim.id, userId: alice.id, scenarioVersion: 1, nouveau: true })
    verifie("R9a · le rang augmente", neuf.passage === ancien.passage + 1)
    verifie("R9b · c'est un autre passage", neuf.id !== ancien.id)
    const v = await verdictsDuPassage(neuf.id)
    verifie("R9c · sans aucun verdict hérité", v.length === 0)
    const r = noterDepuisVerdicts(m10, v)
    verifie("R9d · donc une note nulle tant que rien n'est joué", r.score === 0)
    // L'ancien passage est clos : il ne reçoit plus rien.
    const refus = await passagePourVerdict({
      runId: ancien.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 1, stepIndex: 1,
    })
    verifie("R9e · l'ancien passage est clos et refuse tout verdict", "refus" in refus && refus.refus === "run-clos")
  }

  /* ═══ R10 · REJEU d'un passage clos, et SCÉNARIO PÉRIMÉ ══════════════════ */
  {
    const run = (await passageActif(sim.id, alice.id))!
    const perime = await passagePourVerdict({
      runId: run.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 2, stepIndex: 1,
    })
    verifie("R10a · un scénario corrigé rend le passage incomparable", "refus" in perime && perime.refus === "run-perime")
    // Et l'ouverture suivante en tient compte : elle clôt et repart.
    const apres = await ouvrirPassage({ simulationId: sim.id, userId: alice.id, scenarioVersion: 2 })
    verifie("R10b · un passage neuf est ouvert sur la nouvelle version", apres.id !== run.id && apres.scenarioVersion === 2)
  }

  /* ═══ R11 · DEUX APPRENANTS ne se mélangent pas ══════════════════════════ */
  {
    const runB = await ouvrirPassage({ simulationId: sim.id, userId: bob.id, scenarioVersion: 2 })
    const etape = notables[0].id
    await enregistrerVerdict({ runId: runB.id, stepId: etape, stepIndex: rang(etape), compte: "reussite" })
    const vA = await verdictsDuPassage((await passageActif(sim.id, alice.id))!.id)
    const vB = await verdictsDuPassage(runB.id)
    verifie("R11a · le passage de Bob porte son verdict", vB.length === 1)
    verifie("R11b · celui d'Alice n'en a pas hérité", vA.length === 0)
    verifie("R11c · le rang de Bob repart à 1", runB.passage === 1)
  }

  /* ═══ R12 · CLÔTURE : le curseur SERVEUR décide, pas le client ═══════════
   *
   * La clôture se contentait de reprendre « le passage ouvert » et de croire le
   * `currentStep` du navigateur. Une requête pouvait donc ouvrir un passage, n'y
   * jouer AUCUNE étape, puis annoncer « j'en suis à la dernière, j'ai fini » :
   * le chapitre était validé et une note de 0 % enregistrée. */
  {
    const nb = (m10.steps as any[]).length
    const vierge = await ouvrirPassage({ simulationId: sim.id, userId: bob.id, scenarioVersion: 2, nouveau: true })

    const forge = await passagePourCloture({
      runId: vierge.id, simulationId: sim.id, userId: bob.id, scenarioVersion: 2, stepCount: nb,
    })
    verifie("R12a · un passage vierge ne peut pas être clôturé", "refus" in forge && forge.refus === "inacheve")

    // Même avec des verdicts, mais pas jusqu'à la dernière étape.
    const premiere = (m10.steps as any[])[1].id
    await enregistrerVerdict({ runId: vierge.id, stepId: premiere, stepIndex: 1, compte: "reussite" })
    const partiel = await passagePourCloture({
      runId: vierge.id, simulationId: sim.id, userId: bob.id, scenarioVersion: 2, stepCount: nb,
    })
    verifie("R12b · un passage inachevé non plus", "refus" in partiel && partiel.refus === "inacheve")

    // Le curseur arrive au bout : la clôture devient possible.
    for (let i = 0; i <= nb - 1; i++) {
      if (i === 1) continue
      await marquerPassee({ runId: vierge.id, stepId: (m10.steps as any[])[i].id, stepIndex: i })
    }
    const fini = await passagePourCloture({
      runId: vierge.id, simulationId: sim.id, userId: bob.id, scenarioVersion: 2, stepCount: nb,
    })
    verifie("R12c · un passage arrivé au bout se clôture", !("refus" in fini))

    // ... et les autres refus, un par un.
    const autre = await passagePourCloture({
      runId: vierge.id, simulationId: sim.id, userId: alice.id, scenarioVersion: 2, stepCount: nb,
    })
    verifie("R12d · le passage d'un autre apprenant est introuvable", "refus" in autre && autre.refus === "run-inconnu")
    const invente = await passagePourCloture({
      runId: "cl-jamais-vu", simulationId: sim.id, userId: bob.id, scenarioVersion: 2, stepCount: nb,
    })
    verifie("R12e · un identifiant inventé est refusé", "refus" in invente && invente.refus === "run-inconnu")
    const perime = await passagePourCloture({
      runId: vierge.id, simulationId: sim.id, userId: bob.id, scenarioVersion: 99, stepCount: nb,
    })
    verifie("R12f · une version de scénario périmée est refusée", "refus" in perime && perime.refus === "run-perime")

    /* R12g — RECLORE EST PERMIS, ET IDEMPOTENT.
     *
     * Le PUT clôt le passage PUIS écrit la tentative. Si la seconde écriture
     * échoue, refuser de reclore laisserait l'apprenant devant une note perdue,
     * avec pour seule issue de tout refaire. Reclore rend donc la MÊME note,
     * sans rien modifier. */
    const noteAvant = await cloturerPassage({ runId: vierge.id, scenario: m10 })
    verifie("R12g1 · la première clôture ne se dit pas déjà close", noteAvant.dejaClos === false)
    const noteApres = await cloturerPassage({ runId: vierge.id, scenario: m10 })
    verifie("R12g2 · reclore est permis", noteApres.dejaClos === true)
    verifie(
      "R12g3 · et rend exactement la même note",
      noteApres.score === noteAvant.score && noteApres.pointsObtenus === noteAvant.pointsObtenus,
    )
    const encore = await passagePourCloture({
      runId: vierge.id, simulationId: sim.id, userId: bob.id, scenarioVersion: 2, stepCount: nb,
    })
    verifie("R12g4 · et la garde de clôture l'autorise", !("refus" in encore))

    // ... mais un passage clos n'accepte plus AUCUN verdict : c'est la garde qui
    // empêche d'écrire après que la note a été calculée.
    const apresCloture = await enregistrerVerdict({
      runId: vierge.id, stepId: (m10.steps as any[])[2].id, stepIndex: 2, compte: "reussite",
    })
    verifie("R12g5 · un passage clos refuse tout verdict", apresCloture === "passage-clos")
    const passeeApres = await marquerPassee({
      runId: vierge.id, stepId: (m10.steps as any[])[3].id, stepIndex: 3,
    })
    verifie("R12g6 · et tout renoncement", passeeApres === "passage-clos")
    const noteFinale = await cloturerPassage({ runId: vierge.id, scenario: m10 })
    verifie("R12g7 · la note n'a pas bougé", noteFinale.pointsObtenus === noteAvant.pointsObtenus)

    /* Et surtout : forcer le curseur ne fabrique AUCUN point. Ce passage n'a
       qu'un seul verdict — celui posé en R12b — et sa note ne vaut que celui-là,
       quoi qu'ait pu annoncer le navigateur sur sa progression. */
    const r = noterDepuisVerdicts(m10, await verdictsDuPassage(vierge.id))
    const pointsDeLaPremiere = (m10.steps as any[])[1].points ?? 1
    verifie("R12h · avancer le curseur ne donne aucun point", r.pointsObtenus === pointsDeLaPremiere, `${r.pointsObtenus}`)
    verifie("R12i · le barème reste entier", r.pointsTotal === 25)

    // Contre-épreuve : un passage réellement vierge vaut bien zéro.
    const neuf = await ouvrirPassage({ simulationId: sim.id, userId: bob.id, scenarioVersion: 2, nouveau: true })
    for (let i = 0; i <= nb - 1; i++) {
      await marquerPassee({ runId: neuf.id, stepId: (m10.steps as any[])[i].id, stepIndex: i })
    }
    const r0 = noterDepuisVerdicts(m10, await verdictsDuPassage(neuf.id))
    verifie("R12j · un passage tout passé vaut zéro", r0.pointsObtenus === 0 && r0.pointsTotal === 25)
  }

  /* ═══ R13 · attemptCount suit le rang du passage serveur ═════════════════ */
  {
    const run = await ouvrirPassage({ simulationId: sim.id, userId: bob.id, scenarioVersion: 2, nouveau: true })
    const declare = await passageDeclare(run.id, sim.id, bob.id)
    verifie("R13a · le rang du passage est lisible", declare?.passage === run.passage)
    const vole = await passageDeclare(run.id, sim.id, alice.id)
    verifie("R13b · pas depuis le compte d'un autre", vole === null)
    const rien = await passageDeclare("", sim.id, bob.id)
    verifie("R13c · ni sans identifiant", rien === null)
  }

  /* ═══ R14 · « PASSER » EST IRRÉVERSIBLE, DANS LES DEUX ORDRES ═══════════
   *
   * « Passer » se contentait d'avancer le curseur, sans laisser de trace. Une
   * correction déjà en vol pouvait donc revenir après coup, écrire une réussite,
   * et accorder le point d'une question à laquelle l'apprenant venait de
   * renoncer. Les deux ordres sont éprouvés, plus la rafale. */
  {
    const run = await ouvrirPassage({ simulationId: sim.id, userId: alice.id, scenarioVersion: 2, nouveau: true })
    const idx = (id: string) => (m10.steps as any[]).findIndex((s) => s.id === id)

    // Ordre A — passer PUIS une réussite qui arrive en retard.
    const a = notables[0].id
    await marquerPassee({ runId: run.id, stepId: a, stepIndex: idx(a) })
    await enregistrerVerdict({ runId: run.id, stepId: a, stepIndex: idx(a), compte: "reussite" })
    const va = (await verdictsDuPassage(run.id)).find((v) => v.stepId === a)!
    verifie("R14a · une réussite tardive ne rend pas le point d'une question passée", !va.premierEssai)
    verifie("R14b · l'étape reste marquée passée", va.passee && !va.tentee)

    // Ordre B — une réussite d'abord, puis « passer ».
    const b = notables[1].id
    await enregistrerVerdict({ runId: run.id, stepId: b, stepIndex: idx(b), compte: "reussite" })
    const avant = (await verdictsDuPassage(run.id)).find((v) => v.stepId === b)!
    verifie("R14c · la réussite seule accorde bien le point", avant.premierEssai)
    await marquerPassee({ runId: run.id, stepId: b, stepIndex: idx(b) })
    const vb = (await verdictsDuPassage(run.id)).find((v) => v.stepId === b)!
    verifie("R14d · renoncer ensuite retire le point", !vb.premierEssai && vb.passee)

    // Rafale — vingt écritures simultanées, dont un « passer ». Le point ne doit
    // jamais être accordé, quel que soit l'ordre d'arrivée.
    const c = notables[2].id
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i === 9
          ? marquerPassee({ runId: run.id, stepId: c, stepIndex: idx(c) })
          : enregistrerVerdict({ runId: run.id, stepId: c, stepIndex: idx(c), compte: "reussite" }),
      ),
    )
    const lignes = await prisma.simulationStepVerdict.findMany({ where: { runId: run.id, stepId: c } })
    verifie("R14e · une seule ligne malgré vingt écritures", lignes.length === 1, `${lignes.length}`)
    verifie("R14f · le renoncement l'emporte sur toutes les réussites", lignes[0]?.premierEssai === false)
    verifie("R14g · et l'étape reste passée", lignes[0]?.passee === true)

    // Contre-épreuve : sans « passer », la même rafale accorde bien le point.
    const d = notables[3].id
    await Promise.all(
      Array.from({ length: 20 }, () =>
        enregistrerVerdict({ runId: run.id, stepId: d, stepIndex: idx(d), compte: "reussite" }),
      ),
    )
    const vd = (await verdictsDuPassage(run.id)).find((v) => v.stepId === d)!
    verifie("R14h · contre-épreuve : sans renoncement, le point est acquis", vd.premierEssai === true)
  }

  /* ═══ R15 · CLÔTURE CONCURRENTE — aucune écriture après la note ═════════
   *
   * Lire les verdicts, calculer la note, puis marquer le passage clos laissait
   * une fenêtre : un verdict encore en vol pouvait s'écrire entre le calcul et
   * la clôture, et la note enregistrée ne décrivait alors plus le registre. */
  {
    const run = await ouvrirPassage({ simulationId: sim.id, userId: alice.id, scenarioVersion: 2, nouveau: true })
    const idx = (id: string) => (m10.steps as any[]).findIndex((s) => s.id === id)
    // Un premier point acquis, pour que la note ne soit pas nulle des deux côtés.
    await enregistrerVerdict({
      runId: run.id, stepId: notables[0].id, stepIndex: idx(notables[0].id), compte: "reussite",
    })

    // Clôture ET dix écritures lancées ensemble. Le verrou les sérialise :
    // celles qui passent avant sont dans la note, celles qui passent après sont
    // refusées. Dans les deux cas, la note enregistrée DÉCRIT le registre.
    const [note, ...ecritures] = await Promise.all([
      cloturerPassage({ runId: run.id, scenario: m10 }),
      ...notables.slice(1, 11).map((s: any) =>
        enregistrerVerdict({ runId: run.id, stepId: s.id, stepIndex: idx(s.id), compte: "reussite" }),
      ),
    ])
    /* Ce que la course garantit — et ce qu'elle NE garantit PAS.
     *
     * Combien d'écritures passent avant la clôture dépend de l'ordonnanceur :
     * l'exiger rendait ce contrôle intermittent (82/83 un tour, 83/83 le
     * suivant), et un contrôle intermittent ne prouve rien. L'invariant réel
     * n'est pas le NOMBRE de refus, c'est que chaque écriture ait une issue
     * franche — acceptée ou refusée, jamais perdue — et que la note décrive le
     * registre final (R15b). Le refus systématique après clôture, lui, est
     * éprouvé juste en dessous, dans un ordre imposé. */
    const closes = ecritures.filter((e) => e === "passage-clos").length
    verifie(
      "R15a · chaque écriture concurrente a une issue franche",
      ecritures.every((e) => e === "passage-clos" || e === "ecrit" || e === "rien-a-ecrire"),
      `${closes} refusées / ${ecritures.length}`,
    )

    /* R15a' — ORDRE IMPOSÉ, donc déterministe : la clôture est ATTENDUE, puis
     * les écritures partent. Aucune ne doit passer. */
    const apresCloture = await Promise.all([
      ...notables.slice(0, 3).map((s: any) =>
        enregistrerVerdict({ runId: run.id, stepId: s.id, stepIndex: idx(s.id), compte: "reussite" }),
      ),
      marquerPassee({ runId: run.id, stepId: notables[0].id, stepIndex: idx(notables[0].id) }),
    ])
    verifie(
      "R15a' · après une clôture terminée, plus AUCUNE écriture ne passe",
      apresCloture.length === 4 && apresCloture.every((e) => e === "passage-clos"),
      apresCloture.join(","),
    )

    const apres = noterDepuisVerdicts(m10, await verdictsDuPassage(run.id))
    verifie(
      "R15b · la note enregistrée décrit exactement le registre final",
      apres.pointsObtenus === note.pointsObtenus,
      `registre ${apres.pointsObtenus} ≠ note ${note.pointsObtenus}`,
    )
    const enBase = await prisma.simulationRun.findUnique({ where: { id: run.id }, select: { score: true, closedAt: true } })
    verifie("R15c · le passage est clos", enBase?.closedAt != null)
    verifie("R15d · et son score est celui du registre", enBase?.score === apres.score, `${enBase?.score} ≠ ${apres.score}`)

    // Double clôture simultanée : idempotente, une seule note.
    const run2 = await ouvrirPassage({ simulationId: sim.id, userId: alice.id, scenarioVersion: 2, nouveau: true })
    await enregistrerVerdict({
      runId: run2.id, stepId: notables[0].id, stepIndex: idx(notables[0].id), compte: "reussite",
    })
    const deux = await Promise.all([
      cloturerPassage({ runId: run2.id, scenario: m10 }),
      cloturerPassage({ runId: run2.id, scenario: m10 }),
    ])
    verifie("R15e · deux clôtures simultanées rendent la même note", deux[0].pointsObtenus === deux[1].pointsObtenus)
    verifie("R15f · une seule a posé la clôture", deux.filter((d) => !d.dejaClos).length === 1, JSON.stringify(deux.map((d) => d.dejaClos)))
  }

  /* ═══ R16 · REPRISE : un passage joué n'est jamais réutilisé ════════════
   *
   * L'atelier repart toujours de la première question sur une évaluation, et il
   * ne peut pas restituer le classeur au milieu — il n'a plus les réponses.
   * Reprendre le passage serveur laisserait donc l'apprenant rejouer des étapes
   * déjà jugées, sans pouvoir regagner ce qu'il avait perdu. */
  {
    const run = await ouvrirPassage({ simulationId: sim.id, userId: bob.id, scenarioVersion: 2, nouveau: true })
    // Rechargement AVANT d'avoir joué : rien n'a été coûté, on garde le passage.
    const rechargeVierge = await ouvrirPassage({ simulationId: sim.id, userId: bob.id, scenarioVersion: 2 })
    verifie("R16a · un rechargement avant tout geste garde le passage", rechargeVierge.id === run.id)
    verifie("R16b · et ne brûle pas de rang", rechargeVierge.passage === run.passage)

    // Un verdict, puis rechargement : le passage entamé est abandonné.
    const s0 = notables[0].id
    await enregistrerVerdict({
      runId: run.id, stepId: s0, stepIndex: (m10.steps as any[]).findIndex((x) => x.id === s0), compte: "reussite",
    })
    const apres = await ouvrirPassage({ simulationId: sim.id, userId: bob.id, scenarioVersion: 2 })
    verifie("R16c · un rechargement après un geste ouvre un passage neuf", apres.id !== run.id)
    verifie("R16d · au rang suivant", apres.passage === run.passage + 1)
    verifie("R16e · sans aucun verdict hérité", (await verdictsDuPassage(apres.id)).length === 0)

    // L'ancien garde ses verdicts intacts : rien n'est dégradé.
    const anciens = await verdictsDuPassage(run.id)
    verifie("R16f · l'ancien passage garde son premier essai", anciens.length === 1 && anciens[0].premierEssai)
    const ancienEnBase = await prisma.simulationRun.findUnique({ where: { id: run.id }, select: { closedAt: true } })
    verifie("R16g · et il est proprement clos", ancienEnBase?.closedAt != null)
  }

  /* ═══ R17 · AUCUN DRAPEAU CLIENT NE REND UN ESSAI GRATUIT ══════════════
   *
   * La route acceptait autrefois un `siJuste` dans le corps : posé, il faisait
   * qu'un ÉCHEC n'écrivait aucune faute. Le navigateur n'avait donc qu'à le
   * poser toujours pour essayer autant de fois qu'il voulait sans rien payer,
   * jusqu'à `ok: true` — puis empocher le point « premier essai ». Un drapeau
   * qui décide du coût d'un essai ne peut pas venir de celui qui essaie.
   *
   * Le contrôle porte sur la SOURCE : il n'existe plus aucun chemin par lequel
   * un champ du corps peut sauter l'écriture du verdict. */
  {
    const route = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/simulations/[chapterId]/verify/route.ts"),
      "utf8",
    )
    const code = route.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    verifie("R17a · plus aucun `siJuste` dans le code de la route", !/siJuste/.test(code), "présent")
    verifie(
      "R17b · l'écriture du verdict n'est plus conditionnelle",
      /const ecriture = await enregistrerVerdict\(/.test(code),
      "l'appel est encore sous condition",
    )
    // Et l'échec ne renvoie plus de classification : « faute » vs « tâtonnement »
    // dirait si le geste était du bon GENRE, donc renseignerait sur l'action.
    verifie(
      "R17c · une réponse fausse ne porte plus de classification",
      /\{ ok: false, message:/.test(code) &&
        !/compte/.test(code.slice(code.lastIndexOf("return NextResponse.json"))),
    )
    const joueur = fs.readFileSync(
      path.resolve(__dirname, "../../components/simulation/SimulationPlayer.tsx"),
      "utf8",
    )
    verifie(
      "R17d · l'atelier n'envoie plus le drapeau",
      !/siJuste: true \} : \{\}\),/.test(joueur.replace(/\/\*[\s\S]*?\*\//g, "")),
    )
  }

  /* ═══ R18 · LE REPORT DE LA TENTATIVE N'A LIEU QU'UNE FOIS ═════════════
   *
   * La clôture était idempotente, mais le report qui la suit ne l'était pas :
   * `errorCount`, `hintCount` et `timeSpentSeconds` s'y écrivent en incréments.
   * Une réponse perdue APRÈS le commit, puis le réessai que la clôture
   * idempotente autorise justement, les comptait deux fois. */
  {
    const run = await ouvrirPassage({ simulationId: sim.id, userId: bob.id, scenarioVersion: 2, nouveau: true })
    let appels = 0
    const reporter = async () => {
      appels++
      return appels
    }

    // Premier report : il a lieu.
    const cle = (n: string) => ({ runId: run.id, simulationId: sim.id, userId: bob.id, enveloppe: `r18-${n}` })
    const un = await reporterUneSeuleFois(cle("a"), reporter)
    verifie("R18a · le premier report est exécuté", un.reporte === true && appels === 1)

    // Réessai APRÈS commit : plus rien ne s'écrit, et le reçu le dit.
    // Clé d'enveloppe NEUVE : c'est bien le reçu du PASSAGE qui doit refuser.
    const deux = await reporterUneSeuleFois(cle("b"), reporter)
    verifie("R18b · le réessai ne réexécute rien", deux.reporte === false && appels === 1, `${appels}`)

    // Dix réessais simultanés : toujours un seul report.
    const rafale = await Promise.all(
      Array.from({ length: 10 }, (_, i) => reporterUneSeuleFois(cle(`c${i}`), reporter)),
    )
    verifie("R18c · dix réessais simultanés n'en refont aucun", appels === 1, `${appels}`)
    verifie("R18d · et tous se disent déjà reportés", rafale.every((r) => r.reporte === false))

    const recu = await prisma.simulationRun.findUnique({
      where: { id: run.id }, select: { attemptSyncedAt: true },
    })
    verifie("R18e · le reçu est posé en base", recu?.attemptSyncedAt != null)
  }

  /* R18' — RÉESSAI AVANT LE COMMIT. Si le report échoue, la transaction est
   * annulée AVEC le reçu : le réessai doit réussir, sinon une panne réseau au
   * mauvais moment ferait perdre définitivement la note. */
  {
    const run = await ouvrirPassage({ simulationId: sim.id, userId: bob.id, scenarioVersion: 2, nouveau: true })
    let essais = 0
    const casse = async () => {
      essais++
      throw new Error("écriture interrompue")
    }
    const cleB = (n: string) => ({ runId: run.id, simulationId: sim.id, userId: bob.id, enveloppe: `r18b-${n}` })
    await reporterUneSeuleFois(cleB("a"), casse).catch(() => undefined)
    const apresEchec = await prisma.simulationRun.findUnique({
      where: { id: run.id }, select: { attemptSyncedAt: true },
    })
    verifie("R18'a · un report interrompu ne laisse aucun reçu", apresEchec?.attemptSyncedAt == null)
    const rattrape = await reporterUneSeuleFois(cleB("b"), async () => "fait")
    verifie("R18'b · le réessai passe bien", rattrape.reporte === true, JSON.stringify(rattrape))
    verifie("R18'c · et l'appel cassé n'a eu lieu qu'une fois", essais === 1, `${essais}`)
  }

  /* ═══ R19 · UN RANG ANCIEN NE FAIT PAS RECULER LE COMPTEUR ═════════════
   *
   * `attemptCount` était recopié tel quel du rang du passage. Rejouer la
   * clôture d'un VIEUX passage clos — rang 1, alors que l'apprenant en est au
   * troisième — faisait donc reculer son nombre d'essais affiché. La route
   * applique désormais `Math.max`. */
  {
    const route = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/simulations/[chapterId]/route.ts"),
      "utf8",
    )
    const code = route.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    verifie(
      "R19a · le compteur d'essais ne peut que monter",
      /attemptCount: Math\.max\(/.test(code),
      "affectation sèche encore présente",
    )
    verifie(
      "R19b · le report est bien passé sous reçu",
      /reporterUneSeuleFois\(\s*\{/.test(code) && /enveloppe: cleEnveloppe/.test(code),
    )
  }

  /* ═══ R20 · DEUX PASSAGES DIFFÉRENTS NE REPORTENT PAS EN PARALLÈLE ═════
   *
   * Le défaut le plus vicieux de la série, et le verrou posé sur la LIGNE DU
   * PASSAGE ne l'attrapait pas : deux passages clos DISTINCTS du même couple
   * (simulation, apprenant), reçus vides tous les deux, verrouillent deux
   * lignes DIFFÉRENTES. Rien ne les sérialisait, ils reportaient tous les deux,
   * et ils écrivaient dans la MÊME tentative — chacun avec l'état qu'il avait lu
   * avant d'entrer. Reproduit : rang 1 retardé, rang 2 immédiat, `attemptCount`
   * retombé à 1 après être passé à 2.
   *
   * Le verrou porte désormais sur le COUPLE, pas sur la ligne. */
  {
    const cobaye = await prisma.user.create({
      data: { email: `r20-${Date.now()}-${Math.round(process.hrtime()[1])}@test.local`, password: "x", firstName: "QA", lastName: "T", role: "LEARNER" },
    })
    const r1 = await ouvrirPassage({ simulationId: sim.id, userId: cobaye.id, scenarioVersion: 2, nouveau: true })
    const r2 = await ouvrirPassage({ simulationId: sim.id, userId: cobaye.id, scenarioVersion: 2, nouveau: true })
    verifie("R20a · deux passages distincts, aux rangs 1 et 2", r1.id !== r2.id && r1.passage === 1 && r2.passage === 2)
    await cloturerPassage({ runId: r1.id, scenario: m10 })
    await cloturerPassage({ runId: r2.id, scenario: m10 })
    const recus = await prisma.simulationRun.findMany({
      where: { id: { in: [r1.id, r2.id] } }, select: { attemptSyncedAt: true },
    })
    verifie("R20b · les deux reçus sont vides", recus.every((r) => r.attemptSyncedAt == null))

    // Le rapporteur reproduit EXACTEMENT ce que fait la route : un Math.max sur
    // le rang, calculé depuis l'état relu dans la transaction.
    const reporte = (rang: number, retard: number) =>
      reporterUneSeuleFois(
        { runId: rang === 1 ? r1.id : r2.id, simulationId: sim.id, userId: cobaye.id, enveloppe: `r20-${rang}` },
        async (tx, frais) => {
          if (retard) await new Promise((r) => setTimeout(r, retard))
          return tx.simulationAttempt.upsert({
            where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
            create: { simulationId: sim.id, userId: cobaye.id, attemptCount: rang, bestScore: rang * 10 },
            update: {
              attemptCount: Math.max(frais?.attemptCount ?? 0, rang),
              bestScore: Math.max(frais?.bestScore ?? 0, rang * 10),
              errorCount: { increment: 1 },
            },
          })
        },
      )

    // Ordre A — le rang 1 est retardé DANS sa transaction, le rang 2 passe
    // devant. C'est la reproduction exacte du défaut.
    await Promise.all([reporte(1, 120), reporte(2, 0)])
    const a = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
    })
    verifie("R20c · le compteur d'essais n'a pas reculé", a?.attemptCount === 2, `${a?.attemptCount}`)
    verifie("R20d · la meilleure note non plus", a?.bestScore === 20, `${a?.bestScore}`)
    verifie("R20e · les deux reports ont bien eu lieu, une fois chacun", a?.errorCount === 1, `${a?.errorCount}`)
    const posesA = await prisma.simulationRun.findMany({
      where: { id: { in: [r1.id, r2.id] } }, select: { attemptSyncedAt: true },
    })
    verifie("R20f · les deux reçus sont posés", posesA.every((r) => r.attemptSyncedAt != null))

    // Ordre B — l'inverse : rang 2 retardé, rang 1 devant. Le résultat final
    // doit être le MÊME, quel que soit qui gagne la course.
    const cobaye2 = await prisma.user.create({
      data: { email: `r20b-${Date.now()}-${Math.round(process.hrtime()[1])}@test.local`, password: "x", firstName: "QA", lastName: "T", role: "LEARNER" },
    })
    const s1 = await ouvrirPassage({ simulationId: sim.id, userId: cobaye2.id, scenarioVersion: 2, nouveau: true })
    const s2 = await ouvrirPassage({ simulationId: sim.id, userId: cobaye2.id, scenarioVersion: 2, nouveau: true })
    await cloturerPassage({ runId: s1.id, scenario: m10 })
    await cloturerPassage({ runId: s2.id, scenario: m10 })
    const reporteB = (rang: number, retard: number) =>
      reporterUneSeuleFois(
        { runId: rang === 1 ? s1.id : s2.id, simulationId: sim.id, userId: cobaye2.id, enveloppe: `r20b-${rang}` },
        async (tx, frais) => {
          if (retard) await new Promise((r) => setTimeout(r, retard))
          return tx.simulationAttempt.upsert({
            where: { simulationId_userId: { simulationId: sim.id, userId: cobaye2.id } },
            create: { simulationId: sim.id, userId: cobaye2.id, attemptCount: rang, bestScore: rang * 10 },
            update: {
              attemptCount: Math.max(frais?.attemptCount ?? 0, rang),
              bestScore: Math.max(frais?.bestScore ?? 0, rang * 10),
              errorCount: { increment: 1 },
            },
          })
        },
      )
    await Promise.all([reporteB(2, 120), reporteB(1, 0)])
    const b = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye2.id } },
    })
    verifie("R20g · ordre inverse : même résultat", b?.attemptCount === 2 && b?.bestScore === 20,
      `${b?.attemptCount} / ${b?.bestScore}`)
    verifie("R20h · et toujours un seul report par passage", b?.errorCount === 1, `${b?.errorCount}`)

    // Six passages clos reportés d'un coup : le compteur monte à 6, jamais moins.
    const cobaye3 = await prisma.user.create({
      data: { email: `r20c-${Date.now()}-${Math.round(process.hrtime()[1])}@test.local`, password: "x", firstName: "QA", lastName: "T", role: "LEARNER" },
    })
    const runs = []
    for (let i = 0; i < 6; i++) {
      const r = await ouvrirPassage({ simulationId: sim.id, userId: cobaye3.id, scenarioVersion: 2, nouveau: true })
      await cloturerPassage({ runId: r.id, scenario: m10 })
      runs.push(r)
    }
    await Promise.all(runs.map((r, i) =>
      reporterUneSeuleFois(
        { runId: r.id, simulationId: sim.id, userId: cobaye3.id, enveloppe: `r20c-${i}` },
        async (tx, frais) =>
          tx.simulationAttempt.upsert({
            where: { simulationId_userId: { simulationId: sim.id, userId: cobaye3.id } },
            // La branche « create » compte aussi pour un report.
            create: { simulationId: sim.id, userId: cobaye3.id, attemptCount: r.passage, errorCount: 1 },
            update: {
              attemptCount: Math.max(frais?.attemptCount ?? 0, r.passage),
              errorCount: { increment: 1 },
            },
          }),
      ),
    ))
    const c = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye3.id } },
    })
    verifie("R20i · six passages simultanés : le compteur atteint 6", c?.attemptCount === 6, `${c?.attemptCount}`)
    verifie("R20j · et six reports, pas un de plus", c?.errorCount === 6, `${c?.errorCount}`)
  }

  /* ═══ R21 · LA REMONTÉE NON FINALE EST REJOUABLE ═══════════════════════
   *
   * `goNext` remonte la progression à CHAQUE étape, avec des deltas qui
   * s'ajoutent. Serveur qui commit, réponse perdue, navigateur qui renvoie la
   * même enveloppe : les trois compteurs étaient appliqués deux fois. Ces
   * remontées n'ont pas de passage à clore — le reçu du passage ne les couvrait
   * donc pas du tout. C'est la clé de l'enveloppe qui les couvre. */
  {
    const cobaye = await prisma.user.create({
      data: { email: `r21-${Date.now()}-${Math.round(process.hrtime()[1])}@test.local`, password: "x", firstName: "QA", lastName: "T", role: "LEARNER" },
    })
    const ajouter = (cle: string, n: number) =>
      reporterUneSeuleFois(
        { runId: null, simulationId: sim.id, userId: cobaye.id, enveloppe: cle },
        async (tx) =>
          tx.simulationAttempt.upsert({
            where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
            create: { simulationId: sim.id, userId: cobaye.id, errorCount: n, hintCount: n },
            update: { errorCount: { increment: n }, hintCount: { increment: n } },
          }),
      )

    const un = await ajouter("env-1", 3)
    verifie("R21a · une enveloppe neuve est comptée", un.reporte === true)

    // Réponse perdue puis réessai : MÊME clé, mêmes deltas. Rien ne doit bouger.
    const rejeux = []
    for (let i = 0; i < 4; i++) rejeux.push(await ajouter("env-1", 3))
    const apres1 = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
    })
    verifie("R21b · quatre réessais de la même enveloppe n'ajoutent rien",
      apres1?.errorCount === 3 && apres1?.hintCount === 3, `${apres1?.errorCount}/${apres1?.hintCount}`)
    verifie("R21c · et ils se disent tous déjà comptés",
      rejeux.every((r) => !r.reporte && r.motif === "enveloppe-deja-comptee"))

    // Une clé NEUVE : les nouveaux deltas s'ajoutent, exactement une fois.
    await ajouter("env-2", 5)
    const apres2 = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
    })
    verifie("R21d · une clé neuve ajoute ses deltas une fois",
      apres2?.errorCount === 8 && apres2?.hintCount === 8, `${apres2?.errorCount}/${apres2?.hintCount}`)

    // Concurrence sur une MÊME clé : dix envois simultanés, un seul compte.
    const rafale = await Promise.all(Array.from({ length: 10 }, () => ajouter("env-3", 7)))
    const apres3 = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
    })
    verifie("R21e · dix envois simultanés d'une même clé : un seul compte",
      apres3?.errorCount === 15, `${apres3?.errorCount}`)
    verifie("R21f · un seul se dit reporté", rafale.filter((r) => r.reporte).length === 1,
      `${rafale.filter((r) => r.reporte).length}`)

    // Et un rollback ne laisse aucun reçu derrière lui : le réessai doit passer.
    await reporterUneSeuleFois(
      { runId: null, simulationId: sim.id, userId: cobaye.id, enveloppe: "env-4" },
      async () => { throw new Error("écriture interrompue") },
    ).catch(() => undefined)
    const trace = await prisma.simulationFlush.findFirst({
      where: { simulationId: sim.id, userId: cobaye.id, cle: "env-4" },
    })
    verifie("R21g · une enveloppe interrompue ne laisse aucun reçu", trace === null)
    const rattrape = await ajouter("env-4", 2)
    const apres4 = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
    })
    verifie("R21h · et le réessai passe normalement",
      rattrape.reporte === true && apres4?.errorCount === 17, `${apres4?.errorCount}`)

    // Contre-épreuve : la clé est bien PORTÉE PAR LE COUPLE. Un autre apprenant
    // peut réutiliser la même clé sans être bloqué par celle du premier.
    const autre = await prisma.user.create({
      data: { email: `r21b-${Date.now()}-${Math.round(process.hrtime()[1])}@test.local`, password: "x", firstName: "QA", lastName: "T", role: "LEARNER" },
    })
    const chezLautre = await reporterUneSeuleFois(
      { runId: null, simulationId: sim.id, userId: autre.id, enveloppe: "env-1" },
      async (tx) =>
        tx.simulationAttempt.create({
          data: { simulationId: sim.id, userId: autre.id, errorCount: 1 },
        }),
    )
    verifie("R21i · la même clé chez un autre apprenant passe", chezLautre.reporte === true)
  }

  /* ═══ R22 · UNE CLÉ NE DÉSIGNE JAMAIS DEUX CORPS ══════════════════════
   *
   * `persist` part sans être attendu à chaque `goNext`. Quand la clé ne scellait
   * que les DELTAS, deux appels pouvaient se chevaucher, réutiliser la même clé
   * et porter un `currentStep` — voire un `finish` — différents. Cas critique :
   * une remontée intermédiaire lente, puis la clôture, sous la même clé. Si
   * l'intermédiaire arrivait la première, la clôture était rejetée comme
   * doublon, et la note n'était jamais écrite alors que la réponse continuait
   * d'annoncer « note enregistrée ».
   *
   * Deux gardes ferment le cas, et les deux sont éprouvées ici :
   *  · côté navigateur, le corps ENTIER est figé au scellage et les envois sont
   *    sérialisés — c'est ce que prouve le parcours réel (§9.5) ;
   *  · côté serveur, `noteEnregistree` décrit l'ÉTAT de la tentative, pas
   *    l'intention : un report refusé ne peut plus annoncer une note écrite. */
  {
    const cobaye = await prisma.user.create({
      data: { email: `r22-${Date.now()}@test.local`, password: "x", firstName: "QA", lastName: "T", role: "LEARNER" },
    })
    // On rejoue la collision : une MÊME clé employée d'abord par une remontée
    // intermédiaire, puis par ce qui aurait dû être la clôture.
    const intermediaire = await reporterUneSeuleFois(
      { runId: null, simulationId: sim.id, userId: cobaye.id, enveloppe: "collision" },
      async (tx) =>
        tx.simulationAttempt.create({
          data: { simulationId: sim.id, userId: cobaye.id, currentStep: 3, errorCount: 1 },
        }),
    )
    verifie("R22a · la remontée intermédiaire passe", intermediaire.reporte === true)

    const run = await ouvrirPassage({ simulationId: sim.id, userId: cobaye.id, scenarioVersion: 2, nouveau: true })
    const cloture = await reporterUneSeuleFois(
      { runId: run.id, simulationId: sim.id, userId: cobaye.id, enveloppe: "collision" },
      async (tx) =>
        tx.simulationAttempt.update({
          where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
          data: { score: 80, bestScore: 80, completedAt: new Date() },
        }),
    )
    verifie("R22b · la clôture sous la MÊME clé est bien refusée", cloture.reporte === false)
    const apres = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
    })
    verifie("R22c · et la note n'a effectivement PAS été écrite", apres?.score == null, `${apres?.score}`)
    // C'est exactement ce que la route doit refuser d'annoncer. La règle qu'elle
    // applique : la note est dite enregistrée seulement si la tentative la porte.
    const annonce = apres?.score === 80 && apres?.completedAt != null
    verifie("R22d · la réponse ne peut donc pas annoncer « note enregistrée »", annonce === false)
    const recu = await prisma.simulationRun.findUnique({
      where: { id: run.id }, select: { attemptSyncedAt: true },
    })
    verifie("R22e · le reçu du passage reste vide, la clôture reste rejouable", recu?.attemptSyncedAt == null)

    // Et la clôture rejouée sous une clé PROPRE aboutit : rien n'est perdu.
    const rattrape = await reporterUneSeuleFois(
      { runId: run.id, simulationId: sim.id, userId: cobaye.id, enveloppe: "cloture-propre" },
      async (tx) =>
        tx.simulationAttempt.update({
          where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
          data: { score: 80, bestScore: 80, completedAt: new Date() },
        }),
    )
    const fin = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
    })
    verifie("R22f · la clôture sous clé propre aboutit", rattrape.reporte === true && fin?.score === 80)
  }

  /* ═══ R23 · L'ACQUITTEMENT VIENT DU REÇU, PAS D'UNE ÉGALITÉ DE SCORE ═══
   *
   * Deux versions fausses ont précédé celle-ci. `termine` seul disait seulement
   * « la clôture est valide » : un report refusé annonçait quand même une note
   * écrite. Puis une comparaison `score === scoreServeur && completedAt != null`
   * — qui reste un faux positif dès qu'un passage ANTÉRIEUR portait exactement
   * la même note. Un score identique ne prouve pas que CE passage-ci a été
   * reporté. Seul son reçu le prouve. */
  {
    const cobaye = await prisma.user.create({
      data: { email: `r23-${Date.now()}@test.local`, password: "x", firstName: "QA", lastName: "T", role: "LEARNER" },
    })
    // Un premier passage, reporté pour de bon, note 80.
    const p1 = await ouvrirPassage({ simulationId: sim.id, userId: cobaye.id, scenarioVersion: 2, nouveau: true })
    const premier = await reporterUneSeuleFois(
      { runId: p1.id, simulationId: sim.id, userId: cobaye.id, enveloppe: "p1" },
      async (tx) =>
        tx.simulationAttempt.create({
          data: { simulationId: sim.id, userId: cobaye.id, score: 80, bestScore: 80, completedAt: new Date() },
        }),
    )
    const acquitte = (r: { reporte: boolean; motif?: string }) =>
      r.reporte === true || r.motif === "deja-reporte"
    verifie("R23a · le premier passage est bien acquitté", acquitte(premier) === true)

    // Un SECOND passage, même note 80, dont la clôture entre en collision de clé
    // avec une remontée intermédiaire déjà comptée.
    await reporterUneSeuleFois(
      { runId: null, simulationId: sim.id, userId: cobaye.id, enveloppe: "collision-23" },
      async (tx) =>
        tx.simulationAttempt.update({
          where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
          data: { currentStep: 4 },
        }),
    )
    const p2 = await ouvrirPassage({ simulationId: sim.id, userId: cobaye.id, scenarioVersion: 2, nouveau: true })
    const heurte = await reporterUneSeuleFois(
      { runId: p2.id, simulationId: sim.id, userId: cobaye.id, enveloppe: "collision-23" },
      async (tx) =>
        tx.simulationAttempt.update({
          where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
          data: { score: 80, bestScore: 80, completedAt: new Date() },
        }),
    )
    verifie("R23b · la clôture heurtée est refusée", heurte.reporte === false)
    const etat = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: sim.id, userId: cobaye.id } },
    })
    // Le PIÈGE : la tentative porte bien 80 et une date de fin — mais elles
    // viennent du passage PRÉCÉDENT. La comparaison de score dirait « oui ».
    verifie("R23c · le piège est bien armé : score et date identiques en base",
      etat?.score === 80 && etat?.completedAt != null)
    verifie("R23d · l'ancienne règle par égalité de score aurait dit OUI",
      (etat?.score === 80 && etat?.completedAt != null) === true)
    verifie("R23e · la règle par reçu dit NON", acquitte(heurte) === false, JSON.stringify(heurte))
    const recu2 = await prisma.simulationRun.findUnique({
      where: { id: p2.id }, select: { attemptSyncedAt: true },
    })
    verifie("R23f · et c'est exact : ce passage n'a pas de reçu", recu2?.attemptSyncedAt == null)

    // Réponse perdue puis réessai du MÊME passage déjà synchronisé : acquitté.
    const rejeu = await reporterUneSeuleFois(
      { runId: p1.id, simulationId: sim.id, userId: cobaye.id, enveloppe: "p1-rejeu" },
      async () => null,
    )
    verifie("R23g · le réessai d'un passage déjà reporté est acquitté",
      acquitte(rejeu) === true && rejeu.motif === "deja-reporte", JSON.stringify(rejeu))
  }

  /* ═══ R24 · LES DEUX RÈGLES SONT BIEN CELLES DU CODE ══════════════════ */
  {
    const route = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/simulations/[chapterId]/route.ts"),
      "utf8",
    )
    const code = route.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    verifie(
      "R24a · `noteEnregistree` vient du reçu du passage",
      /noteAcquittee\s*=\s*\n?\s*passageAClore !== null && \(fait\.reporte === true \|\| fait\.motif === "deja-reporte"\)/.test(code),
    )
    verifie(
      "R24b · et plus d'aucune égalité de score",
      !/report\.attempt\.score === scoreServeur/.test(code),
    )
    const joueur = fs.readFileSync(
      path.resolve(__dirname, "../../components/simulation/SimulationPlayer.tsx"),
      "utf8",
    )
    const jcode = joueur.replace(/\/\*[\s\S]*?\*\//g, "")
    verifie("R24c · le corps entier est scellé avec la clé", /corps: \{/.test(jcode) && /deposer\(\{/.test(jcode))
    verifie("R24d · l'ordonnancement est délégué au module pur", /creerFileEnvois</.test(jcode))
    verifie("R24e · plus aucune enveloppe mutable", !/envoiRef\.current/.test(jcode))
    /* R24f — LE RENONCEMENT SE FAIT EN UN SEUL CLIC.
     * Le bouton « Passer la question » appelait `demarrerDemonstration` : rien
     * n'était révélé (le plan vaut `null` en évaluation) mais rien n'était dit
     * au serveur non plus. Un second bouton s'en chargeait. Fermer l'onglet
     * entre les deux laissait une interface qui annonçait une question passée,
     * et un passage qui ne l'avait jamais enregistrée. */
    verifie(
      "R24f · en évaluation, « Passer la question » appelle bien le renoncement serveur",
      /data-control="sim-montrer"[\s\S]{0,120}onClick=\{evaluationNotee \? passerLaQuestion : demarrerDemonstration\}/.test(jcode),
    )
    verifie(
      "R24g · et le bloc de démonstration ne s'affiche plus en évaluation",
      /demonstration && !evaluationNotee &&/.test(jcode),
    )
  }

  console.log(`\n${echecs === 0 ? "✓" : "✗"} ${total - echecs}/${total} contrôles passés`)
}

main()
  .catch((e) => {
    console.error(e)
    echecs++
  })
  .finally(async () => {
    await prisma.$disconnect()
    if (echecs > 0) process.exit(1)
  })
