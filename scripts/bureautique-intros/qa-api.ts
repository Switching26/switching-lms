/** GET uniquement en production ; contre-test de clé uniquement sur le clone exact. */
import { readFile, writeFile } from "node:fs/promises"
import { PrismaClient } from "@prisma/client"
import assert from "node:assert/strict"
import { readInventory, localDatabaseOnly, type Inventory } from "./common"

async function main() {
  const [base, cookiePath, output, ...inventoryPaths] = process.argv.slice(2)
  const url = new URL(base)
  const local = ["localhost", "127.0.0.1", "127.0.0.2"].includes(url.hostname)
  if (!local && (process.env.INTRO_PHASE2_GO !== "BUREAUTIQUE_207" || url.protocol !== "https:" || !["switching-lms-production.up.railway.app", "plateforme-elearning.up.railway.app"].includes(url.hostname))) throw new Error("URL/GO de recette invalide")
  if (local) localDatabaseOnly()
  if (inventoryPaths.length !== 3) throw new Error("Trois inventaires exigés")
  const manifests: Inventory[] = await Promise.all(inventoryPaths.map(readInventory))
  assert.equal(new Set(manifests.map(m => m.application)).size, 3)
  const cookies = JSON.parse(await readFile(cookiePath, "utf8"))
  const cookieName = local ? "authjs.session-token" : "__Secure-authjs.session-token"
  const request = (path: string, name?: string) => fetch(base + path, { redirect: "manual", headers: name ? { Cookie: `${cookieName}=${cookies[name]}` } : {}, signal: AbortSignal.timeout(10000) })
  const deadline = Date.now() + 260000
  const checkHeaders = (response: Response) => {
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.equal(response.headers.get("referrer-policy")?.split(",").at(-1)?.trim(), "no-referrer")
  }
  const checkLink = (response: Response, key: string) => {
    assert.equal(response.status, 307); checkHeaders(response)
    const signed = new URL(response.headers.get("location")!)
    assert.equal(signed.searchParams.get("X-Amz-Expires"), "300")
    assert.ok(decodeURIComponent(signed.pathname).endsWith("/" + key))
    if (local) assert.ok(["localhost", "127.0.0.1", "127.0.0.2"].includes(signed.hostname))
    else assert.match(signed.hostname, /\.r2\.cloudflarestorage\.com$/)
  }
  let lessons = 0, modules = 0, assets = 0, permissions = 0
  for (const inventory of manifests) {
    for (const entry of inventory.entries) {
      if (Date.now() > deadline - 12000) throw new Error("Recette limitée à cinq minutes : reprendre séparément")
      for (const asset of ["video", "poster"] as const) {
        const response = await request(`/api/intro-videos/${entry.introId}/${asset}`, "learner")
        checkLink(response, entry.objects.find(o => o.key.endsWith(asset === "video" ? ".mp4" : ".jpg"))!.key); assets++
      }
      if (!entry.chapterId) continue
      const response = await request(`/api/intro-videos/chapter/${entry.chapterId}`, "learner")
      assert.equal(response.status, 200); checkHeaders(response)
      const data = await response.json(); assert.equal(data.lesson.id, entry.introId); assert.equal(data.lesson.durationSeconds, entry.durationSeconds)
      const module = inventory.entries.find(e => e.firstChapterId === entry.chapterId)
      if (module) { assert.equal(data.module.id, module.introId); assert.equal(data.module.title, module.title); assert.equal(data.module.number, module.moduleNumber); modules++ }
      else assert.equal(data.module, null)
      lessons++
    }
    const entries = [inventory.entries.find(e => e.sectionId)!, inventory.entries.find(e => e.chapterId)!]
    const cases = local ? [[undefined,401],["learner",307],["cnfdi",307],["admin",307],["licensed-partner",307],
      ["outsider",403],["expired",403],["future",403],["inactive",401],["archived",401]] as const : [[undefined,401],["learner",307],...(cookies.outsider ? [["outsider",403] as const] : []),...(cookies.expired ? [["expired",403] as const] : [])] as const
    for (const [account, status] of cases) for (const entry of entries) {
      const response = await request(`/api/intro-videos/${entry.introId}/video`, account)
      assert.equal(response.status, status); checkHeaders(response)
      if (status !== 307) assert.equal(response.headers.get("location"), null)
      permissions++
    }
  }
  assert.equal(lessons, 156); assert.equal(modules, 51); assert.equal(assets, 414)
  let exercises = 0, crossAppRefused = false, excel = 0
  if (local) {
    const prisma = new PrismaClient()
    try {
      const chapters = await prisma.chapter.findMany({ where: { isPublished: true, simulation: { app: { in: ["WORD", "POWERPOINT", "OUTLOOK"] }, mode: { in: ["EXERCISE", "EVALUATION"] } } } })
      for (const c of chapters) {
        const response = await request(`/api/intro-videos/chapter/${c.id}`, "learner")
        assert.equal(response.status, 200); assert.deepEqual(await response.json(), { lesson: null, module: null }); exercises++
      }
      const entry = manifests.find(i => i.application === "word")!.entries.find(e => e.chapterId)!
      const video = await prisma.introVideo.findUniqueOrThrow({ where: { id: entry.introId } })
      await prisma.introVideo.update({ where: { id: entry.introId }, data: { videoKey: "introductions/powerpoint/2026-10-v1/m01-l01.mp4" } })
      try { assert.equal((await request(`/api/intro-videos/${entry.introId}/video`, "learner")).status, 404); crossAppRefused = true }
      finally { await prisma.introVideo.update({ where: { id: entry.introId }, data: { videoKey: video.videoKey } }) }
      const historical = await prisma.introVideo.findMany({ where: { videoKey: { startsWith: "introductions/excel/" } } })
      assert.equal(historical.length, 150)
      for (const intro of historical) {
        checkLink(await request(`/api/intro-videos/${intro.id}/video`, "admin"), intro.videoKey); excel++
      }
    } finally { await prisma.$disconnect() }
  }
  assert.equal((await request(`/api/intro-videos/${manifests[0].entries[0].introId}/other`, "learner")).status, 404)
  await writeFile(output, JSON.stringify({ lessons, modules, assets, permissions, exercises, crossAppRefused, excel, signedExpirySeconds: 300, realMediaPlayback: "À contrôler après envoi R2 en phase 2" }, null, 2) + "\n")
  console.log(`${lessons} leçons, ${modules} modules, ${assets} liens signés ; ${permissions} contrôles d'accès ; Excel ${excel} ; exercices/évaluations ${exercises}`)
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "Recette interrompue ; aucun secret affiché"); process.exitCode = 1 })
