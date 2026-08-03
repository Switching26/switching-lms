/**
 * DÉCOR d'un parcours de vérification local — base JETABLE uniquement.
 *
 *   createdb lms_qa_test
 *   DATABASE_URL=postgresql://…/lms_qa_test npx prisma db push
 *   DATABASE_URL=postgresql://…/lms_qa_test npx tsx scripts/simulation/qa-decor-local.ts
 *
 * Pose une apprenante inscrite, une formation, les leçons du module 10 et son
 * évaluation, avec les scénarios RÉELS du corpus. C'est ce décor qui permet de
 * jouer une évaluation de bout en bout dans l'application — la seule vérification
 * qui exerce l'enchaînement complet : ouverture du passage, ordre des verdicts,
 * relevé borné, question passée, clôture, bilan.
 *
 * ⚠️ Refuse toute base dont le nom ne contient pas « test ».
 */

import * as fs from "fs"
import * as path from "path"
import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"

const url = process.env.DATABASE_URL ?? ""
if (!/test/i.test(url)) {
  console.error("\n✗ Base de TEST exigée (nom contenant « test »). Reçu : " + (url || "rien") + "\n")
  process.exit(2)
}

const prisma = new PrismaClient()
const SCENARIOS = path.resolve(__dirname, "../../scripts/simulation/scenarios")

/** Convention du semeur : leçon 100+n, exercice 200+n, évaluation 300+n. */
function place(code: string): { section: number; ordre: number } {
  const m = /^m(\d{2})-(ev|[le])(\d{2})$/i.exec(code)!
  const genre = m[2].toLowerCase()
  return {
    section: parseInt(m[1], 10),
    ordre: (genre === "l" ? 100 : genre === "e" ? 200 : 300) + parseInt(m[3], 10),
  }
}

export const IDENTIFIANTS = { email: "qa.apprenante@test.local", motDePasse: "qa-mot-de-passe-local" }

async function main() {
  await prisma.simulationStepVerdict.deleteMany({})
  await prisma.simulationRun.deleteMany({})
  await prisma.simulationAttempt.deleteMany({})
  await prisma.progress.deleteMany({})
  await prisma.simulation.deleteMany({})
  await prisma.enrollment.deleteMany({})
  await prisma.chapter.deleteMany({})
  await prisma.section.deleteMany({})
  await prisma.formation.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: IDENTIFIANTS.email,
      password: await hash(IDENTIFIANTS.motDePasse, 10),
      firstName: "Camille",
      lastName: "QA",
      role: "LEARNER",
      isActive: true,
    },
  })

  const formation = await prisma.formation.create({
    data: { title: "Excel 2024 — vérification locale", description: "Décor de QA", isPublished: true },
  })
  await prisma.enrollment.create({ data: { userId: user.id, formationId: formation.id } })

  const section = await prisma.section.create({
    data: { formationId: formation.id, title: "Module 10 · Fonctions avancées", order: 10 },
  })

  // Les leçons du module 10, plus son évaluation : les renvois du bilan doivent
  // pouvoir se résoudre en chapitres réels, sinon l'écran de fin n'aurait aucun
  // bouton à proposer.
  const codes = fs
    .readdirSync(SCENARIOS)
    .filter((f) => /^m10-(l\d{2}|ev01)\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()

  let evaluationChapterId = ""
  for (const code of codes) {
    const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, `${code}.json`), "utf8"))
    const p = place(code)
    const chapitre = await prisma.chapter.create({
      data: {
        formationId: formation.id,
        sectionId: section.id,
        title: sc.title ?? code,
        order: p.ordre,
        isPublished: true,
      },
    })
    await prisma.simulation.create({
      data: {
        chapterId: chapitre.id,
        mode: sc.mode ?? "LESSON",
        scenario: sc,
        stepCount: (sc.steps ?? []).length,
        version: 1,
      },
    })
    if (code === "m10-ev01") evaluationChapterId = chapitre.id
  }

  console.log(
    JSON.stringify(
      { formationId: formation.id, evaluationChapterId, email: IDENTIFIANTS.email, chapitres: codes.length },
      null,
      1,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
