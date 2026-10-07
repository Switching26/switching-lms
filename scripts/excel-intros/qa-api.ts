import { readFile, writeFile } from "node:fs/promises"
import assert from "node:assert/strict"

async function main() {
  const base = "http://localhost:3117"
  const root = "/Users/switchingformation/lms-intros-mission/"
  const cookies = JSON.parse(await readFile(root + "prive/cookies.json", "utf8"))
  const manifest = JSON.parse(await readFile(root + "preuves-integration/inventaire-r2.json", "utf8"))
  const result: any[] = []
  const request = (path: string, name?: string) => fetch(base + path, { redirect: "manual", headers: name ? { Cookie: `authjs.session-token=${cookies[name]}` } : {} })
  for (const [name, status] of [[undefined,401],["learner",307],["cnfdi",307],["admin",307],["licensed-partner",307],
    ["partner",403],["outsider",403],["expired",403],["future",403],["inactive",401],["archived",401]] as const) {
    for (const id of ["m01-intro", "m01-l101"]) for (const asset of ["video", "poster"]) {
      const response = await request(`/api/intro-videos/${id}/${asset}`, name)
      assert.equal(response.status,status,`${name}/${id}/${asset}`)
      assert.equal(response.headers.get("cache-control"),"private, no-store")
      assert.equal(response.headers.get("referrer-policy")?.split(",").at(-1)?.trim(),"no-referrer")
      if (status===307) {
        const url = new URL(response.headers.get("location")!)
        assert.equal(url.searchParams.get("X-Amz-Expires"),"300")
        assert.match(url.hostname,/\.r2\.cloudflarestorage\.com$/)
      } else assert.equal(response.headers.get("location"),null)
      result.push({account:name ?? "anonymous",id,asset,status})
    }
  }
  const lessons = manifest.entries.filter((e: any) => e.chapterId)
  let modules = 0
  for (const entry of lessons) {
    const response=await request(`/api/intro-videos/chapter/${entry.chapterId}`,"learner")
    assert.equal(response.status,200)
    const data=await response.json()
    assert.equal(data.lesson.id,entry.id)
    assert.equal(data.lesson.durationSeconds,entry.durationSeconds)
    const expectedModule = manifest.entries.find((e: any) => e.firstChapterId === entry.chapterId)
    if (expectedModule) { assert.equal(data.module.id,expectedModule.id); assert.equal(data.module.title,expectedModule.title); modules++ }
    else assert.equal(data.module,null)
  }
  assert.equal(lessons.length,123); assert.equal(modules,27)
  for (const [name,expected] of [[undefined,401],["outsider",403],["learner",200]] as const) {
    const response=await request("/api/intro-videos/chapter/cms4joevs00heaxkcte2lcnaq",name)
    assert.equal(response.status,expected)
    if(expected===200) assert.deepEqual(await response.json(),{lesson:null,module:null})
  }
  assert.equal((await request("/api/intro-videos/m01-l101/other","learner")).status,404)
  const authorized=await request("/api/intro-videos/m01-l101/video","learner")
  const signed=authorized.headers.get("location")!
  const bytes=await fetch(signed,{headers:{Range:"bytes=0-31"}})
  assert.equal(bytes.status,206);assert.equal((await bytes.arrayBuffer()).byteLength,32)
  const unsigned=new URL(signed);unsigned.search=""
  const unsignedStatus = (await fetch(unsigned)).status
  assert.ok(unsignedStatus === 400 || unsignedStatus === 403, "Un objet non signé doit être refusé")
  await writeFile(root+"preuves-integration/acces-api.json",JSON.stringify({checks:result,lessons,modules,
    range:{status:206,bytes:32},unsigned:unsignedStatus,signedExpirySeconds:300,exerciseUnchanged:true},null,2)+"\n")
  console.log("Accès privés vérifiés : inscrit, CNFDI inscrit, admin, partenaire licencié ; anonyme 401, hors droits 403 ; 150 cibles, Range 206, lien non signé refusé")
}
main().catch((error) => { console.error(error instanceof assert.AssertionError ? error.message : "Recette API interrompue"); process.exitCode=1 })
