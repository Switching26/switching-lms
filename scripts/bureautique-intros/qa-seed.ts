import { PrismaClient } from "@prisma/client"
import { execFileSync, spawnSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import assert from "node:assert/strict"
import { localDatabaseOnly, APPS, type Inventory } from "./common"

async function main() {
  localDatabaseOnly()
  const [privateFolder, output] = process.argv.slice(2)
  const prisma = new PrismaClient()
  const seed = (app: string, flag: string) => execFileSync("node_modules/.bin/tsx", ["scripts/bureautique-intros/seed.ts", `${privateFolder}/fixture-${app}.json`, "unused", flag], { encoding: "utf8", timeout: 75000 })
  try {
    const before = await prisma.introVideo.findMany({ where: { videoKey: { startsWith: "introductions/excel/" } }, orderBy: { id: "asc" } })
    assert.equal(before.length, 150)
    for (const app of Object.keys(APPS)) {
      assert.match(seed(app, "--dry-run"), /lecture seule/)
      assert.match(seed(app, "--apply-local"), /enregistré/)
      assert.match(seed(app, "--apply-local"), /0 à créer/)
    }
    const inventory: Inventory = JSON.parse(await readFile(`${privateFolder}/fixture-word.json`, "utf8"))
    const module = inventory.entries.find(e => e.sectionId)!, lesson = inventory.entries.find(e => e.chapterId)!
    await prisma.introVideo.delete({ where: { id: module.introId } })
    await prisma.chapter.update({ where: { id: lesson.chapterId! }, data: { title: "Titre altéré pour contre-test local" } })
    try {
      const refused = spawnSync("node_modules/.bin/tsx", ["scripts/bureautique-intros/seed.ts", `${privateFolder}/fixture-word.json`, "unused", "--apply-local"], { timeout: 75000 })
      assert.equal(refused.status, 1)
      assert.equal(await prisma.introVideo.findUnique({ where: { id: module.introId } }), null, "Aucune insertion partielle avant contrôle complet")
    } finally {
      await prisma.chapter.update({ where: { id: lesson.chapterId! }, data: { title: lesson.title } })
    }
    seed("word", "--apply-local")
    assert.equal(await prisma.introVideo.count({ where: { OR: Object.keys(APPS).map(app => ({ videoKey: { startsWith: `introductions/${app}/` } })) } }), 207)
    const after = await prisma.introVideo.findMany({ where: { videoKey: { startsWith: "introductions/excel/" } }, orderBy: { id: "asc" } })
    assert.deepEqual(after, before)
    await writeFile(output, JSON.stringify({ entries: 207, repeat: "207 identiques", changedTitleRefused: true, noPartialInsert: true, excelUnchanged: 150 }, null, 2) + "\n")
    console.log("207 insertions locales idempotentes ; cible altérée refusée sans lot partiel ; Excel 150 inchangées")
  } finally { await prisma.$disconnect() }
}
main().catch(() => { console.error("Recette seed interrompue ; consulter uniquement le clone local"); process.exitCode = 1 })
