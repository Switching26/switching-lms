import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { APPS, validateInventory, validateTargets, localDatabaseOnly, type Target, type Inventory, type Application } from "./common"
import { validIntroKey } from "../../lib/video/intro-keys"

const targets: Target[] = JSON.parse(readFileSync(process.env.INTRO_TARGETS || "/Users/switchingformation/lms-intros-mission/bureautique/cibles.json", "utf8"))
export function fixture(app: Application): Inventory {
  const prefix = `introductions/${app}/2026-10-v1/`
  return { version: 1, application: app, prefix, entries: targets.filter(t => t.app === APPS[app].app).map(t => ({ ...t, durationSeconds: 1,
    objects: ["mp4", "jpg"].map(ext => ({ key: `${prefix}${t.id}.${ext}`, size: 32, sha256: "a".repeat(64) })) })) }
}
test("207 identités uniques, 51 modules et 156 leçons", () => {
  assert.equal(targets.length, 207)
  for (const app of Object.keys(APPS) as Application[]) validateInventory(fixture(app))
})
test("refus des cibles manquantes, doublons, mélange d'applications et première leçon fausse", () => {
  for (const mutate of [
    (t: Target[]) => t.pop(), (t: Target[]) => { t[1] = t[0] },
    (t: Target[]) => { t[0].app = "EXCEL" }, (t: Target[]) => { t[0].formationId = "autre" },
    (t: Target[]) => { t.find(t => t.sectionId)!.firstChapterId = "autre" },
    (t: Target[]) => { t.find(t => t.chapterId)!.chapterOrder = 999 },
  ]) {
    const t = structuredClone(fixture("word").entries); mutate(t)
    assert.throws(() => validateTargets(t, "word"))
  }
})
test("clés Excel historiques conservées et frontières des trois applications", () => {
  assert.equal(validIntroKey("introductions/excel/2026-10-v1/m27-l123.mp4", "video", "EXCEL"), true)
  for (const [app, spec] of Object.entries(APPS)) {
    for (const id of ["m01-intro", `m${spec.modules}-l01`]) {
      assert.equal(validIntroKey(`introductions/${app}/2026-10-v1/${id}.mp4`, "video", spec.app), true)
      assert.equal(validIntroKey(`introductions/${app}/2026-10-v1/${id}.jpg`, "poster", spec.app), true)
    }
    for (const key of ["m00-intro.mp4", "m99-intro.mp4", "m01-l00.mp4", "m01-l001.mp4", "../m01-intro.mp4", "m01-l01.mp4?x", "m01-l01.jpg"]) {
      assert.equal(validIntroKey(`introductions/${app}/2026-10-v1/${key}`, "video", spec.app), false)
    }
    assert.equal(validIntroKey(`introductions/${app}/2026-10-v1/m01-l01.mp4`, "video", "EXCEL"), false)
  }
})
test("inventaire : mauvais préfixe, hash, extension et durée refusés", () => {
  for (const mutate of [
    (i: Inventory) => { i.prefix = "videos/" }, (i: Inventory) => { i.entries[0].durationSeconds = 0 },
    (i: Inventory) => { i.entries[0].objects[0].sha256 = "faux" },
    (i: Inventory) => { i.entries[0].objects[1].key = i.entries[0].objects[0].key },
  ]) {
    const inventory = fixture("word"); mutate(inventory)
    assert.throws(() => validateInventory(inventory))
  }
})
test("l'application locale refuse la production et toute autre base", () => {
  const previous = process.env.DATABASE_URL
  try {
    for (const url of ["postgres://user:pw@remote.invalid/lms_bureautique_intros_test_20261007", "postgres://localhost/production"]) {
      process.env.DATABASE_URL = url; assert.throws(localDatabaseOnly)
    }
    process.env.DATABASE_URL = "postgres://localhost/lms_bureautique_intros_test_20261007"; localDatabaseOnly()
  } finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous }
})
