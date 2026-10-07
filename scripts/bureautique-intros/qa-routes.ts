/** Routes réelles sur le clone, session injectée seulement dans le bundle du banc. */
import { build } from "esbuild"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import assert from "node:assert/strict"
import { prisma } from "../../lib/prisma"
import { APPS, localDatabaseOnly, readInventory } from "./common"

async function main() {
  localDatabaseOnly()
  const [privateFolder, output] = process.argv.slice(2)
  const cache = resolve("node_modules/.cache/bureautique-intros")
  await mkdir(cache, { recursive: true })
  for (const [name, file] of [["chapter", "app/api/intro-videos/chapter/[chapterId]/route.ts"], ["asset", "app/api/intro-videos/[id]/[asset]/route.ts"]]) {
    await build({ entryPoints: [file], outfile: `${cache}/${name}.cjs`, bundle: true, platform: "node", format: "cjs", packages: "external", logLevel: "silent", tsconfig: "tsconfig.json",
      plugins: [{ name: "session-recette", setup(b) {
        b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: "session-recette", namespace: "recette" }))
        b.onLoad({ filter: /.*/, namespace: "recette" }, () => ({ contents: "export async function auth() { return globalThis.__introQaSession || null }", loader: "js" }))
      } }] })
  }
  const load = createRequire(resolve("package.json"))
  const chapter = load(`${cache}/chapter.cjs`).GET, asset = load(`${cache}/asset.cjs`).GET
  const globals = globalThis as typeof globalThis & { __introQaSession?: unknown }
  const users = await prisma.user.findMany({ where: { id: { startsWith: "bureautique-intro-qa-" } } })
  const session = (account?: string) => { const user = account ? users.find(u => u.id === `bureautique-intro-qa-${account}`) : null; globals.__introQaSession = user ? { user } : null }
  const request = new Request("http://localhost:3118/recette")
  const headers = (r: Response) => { assert.equal(r.headers.get("cache-control"), "private, no-store"); assert.equal(r.headers.get("referrer-policy"), "no-referrer") }
  let lessons = 0, modules = 0, assets = 0, rights = 0
  try {
    for (const app of Object.keys(APPS)) {
      const inventory = await readInventory(`${privateFolder}/fixture-${app}.json`)
      session("learner")
      for (const entry of inventory.entries) {
        for (const type of ["video", "poster"] as const) {
          const r: Response = await asset(request, { params: { id: entry.introId, asset: type } }); assert.equal(r.status, 307); headers(r)
          const signed = new URL(r.headers.get("location")!); assert.equal(signed.hostname, "localhost"); assert.equal(signed.searchParams.get("X-Amz-Expires"), "300")
          assert.equal(decodeURIComponent(signed.pathname), `/switching-lms-videos/${entry.objects.find(o => o.key.endsWith(type === "video" ? ".mp4" : ".jpg"))!.key}`); assets++
        }
        if (!entry.chapterId) continue
        const r: Response = await chapter(request, { params: { chapterId: entry.chapterId } }); assert.equal(r.status, 200); headers(r)
        const data = await r.json(); assert.equal(data.lesson.id, entry.introId)
        const expected = inventory.entries.find(e => e.firstChapterId === entry.chapterId)
        if (expected) { assert.equal(data.module.id, expected.introId); assert.equal(data.module.title, expected.title); assert.equal(data.module.number, expected.moduleNumber); modules++ }
        else assert.equal(data.module, null)
        lessons++
      }
      const sample = [inventory.entries.find(e => e.sectionId)!, inventory.entries.find(e => e.chapterId)!]
      for (const [account, expected] of [[undefined,401],["learner",307],["cnfdi",307],["admin",307],["licensed-partner",307],["outsider",403],["expired",403],["future",403]] as const) {
        session(account)
        for (const e of sample) { const r = await asset(request, { params: { id: e.introId, asset: "video" } }); assert.equal(r.status, expected); headers(r); rights++ }
      }
    }
    assert.equal(lessons, 156); assert.equal(modules, 51); assert.equal(assets, 414)
    session("learner")
    const others = await prisma.chapter.findMany({ where: { isPublished: true, simulation: { app: { in: ["WORD", "POWERPOINT", "OUTLOOK"] }, mode: { in: ["EXERCISE", "EVALUATION"] } } } })
    for (const c of others) { const r = await chapter(request, { params: { chapterId: c.id } }); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { lesson: null, module: null }) }
    const sample = await prisma.introVideo.findFirstOrThrow({ where: { id: { startsWith: "word-" }, chapterId: { not: null } } })
    await prisma.introVideo.update({ where: { id: sample.id }, data: { videoKey: "introductions/powerpoint/2026-10-v1/m01-l01.mp4" } })
    try { assert.equal((await asset(request, { params: { id: sample.id, asset: "video" } })).status, 404) }
    finally { await prisma.introVideo.update({ where: { id: sample.id }, data: { videoKey: sample.videoKey } }) }
    session("admin")
    const excel = await prisma.introVideo.findMany({ where: { videoKey: { startsWith: "introductions/excel/" } } }); assert.equal(excel.length, 150)
    for (const e of excel) assert.equal((await asset(request, { params: { id: e.id, asset: "video" } })).status, 307)
    await writeFile(output, JSON.stringify({ lessons, modules, assets, rights, exerciseEvaluationOpeningsUnchanged: others.length, crossAppRefused: true, excel: excel.length,
      signedExpirySeconds: 300, session: "injectée seulement dans le banc ; JWT HTTP à vérifier après démarrage local", actualR2Playback: "reporté en phase 2" }, null, 2) + "\n")
    console.log(`Routes sur clone PASS : ${lessons} leçons, ${modules} modules, ${assets} liens, ${rights} droits ; ${others.length} exercices/évaluations intacts ; Excel 150`)
  } finally { delete globals.__introQaSession; await prisma.$disconnect() }
}
main().catch(e => { console.error(e instanceof assert.AssertionError ? e.message : "Recette des routes interrompue ; aucun secret affiché"); process.exitCode = 1 })
