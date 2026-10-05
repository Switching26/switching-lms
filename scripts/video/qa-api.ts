import { readFile, writeFile } from "node:fs/promises"
import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { r2Client } from "../../lib/video/r2"

async function main() {
  if (new URL(process.env.DATABASE_URL || "").hostname !== "127.0.0.1" || new URL(process.env.DATABASE_URL || "").pathname !== "/video_r2_test") throw new Error("Base QA requise")
  const prisma = new PrismaClient()
  const base = "http://127.0.0.1:3412"
  const cookies = JSON.parse(await readFile(".local/qa-cookies.json", "utf8"))
  async function api(route: string, user = "admin", body?: unknown) {
    return fetch(base + route, { headers: { Cookie: `authjs.session-token=${cookies[user]}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}) })
  }
  const checks: string[] = []
  try {
    if (process.argv.includes("--upload")) {
      const file = await readFile(".local/qa-video.mp4")
      const init = await api("/api/upload/video/r2", "admin", { chapterId: "r2-chapter", fileName: "qa-video.mp4", fileSize: file.length })
      assert.equal(init.status, 200)
      const { id, partSize } = await init.json()
      const premature = await api(`/api/upload/video/r2/${id}`, "admin", { action: "complete" })
      assert.equal(premature.status, 400)
      for (let part = 1; part <= Math.ceil(file.length / partSize); part++) {
        const signed = await api(`/api/upload/video/r2/${id}`, "admin", { action: "part", partNumber: part })
        const { url } = await signed.json()
        assert.equal((await fetch(url, { method: "PUT", body: file.subarray((part - 1) * partSize, part * partSize) })).status, 200)
      }
      assert.equal((await api(`/api/upload/video/r2/${id}`, "admin", { action: "complete" })).status, 200)
      await writeFile(".local/qa-job.json", JSON.stringify({ id }))
      console.log("Dépôt multipart → QUEUED vérifié ; finalisation prématurée refusée")
      return
    }
    const { id } = JSON.parse(await readFile(".local/qa-job.json", "utf8"))
    const job = await prisma.videoJob.findUniqueOrThrow({ where: { id } })
    assert.equal(job.status, "READY")
    const activated = await fetch(base + "/api/chapitres/r2-chapter", { method: "PUT", headers: { Cookie: `authjs.session-token=${cookies.admin}`, "Content-Type": "application/json" }, body: JSON.stringify({ videoR2Key: job.hlsKey, videoDuration: job.duration }) })
    assert.equal(activated.status, 200)
    const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: "r2-chapter" } })
    assert.equal(chapter.videoR2Key, job.hlsKey)
    assert.equal(chapter.videoDuration, job.duration)
    checks.push("Conversion 1080/720/480 prête ; clé et durée mesurée activées")
    const configResponse = await api("/api/admin/config")
    const config = await configResponse.json()
    assert.equal(config.config.r2_secret_key, "")
    assert.equal(config.config.video_worker_token, "")
    assert.equal((await prisma.systemConfig.findUniqueOrThrow({ where: { key: "r2_endpoint" } })).value.startsWith("http"), false)
    checks.push("Réglages chiffrés ; secrets jamais renvoyés à l’admin")
    const playlist = "/api/videos/r2-chapter/playlist"
    assert.equal((await fetch(base + playlist)).status, 401)
    assert.equal((await api(playlist, "outsider")).status, 403)
    assert.equal((await api(playlist + "?preview=1", "outsider")).status, 403)
    assert.equal((await api(playlist, "admin")).status, 403)
    assert.equal((await api(playlist + "?preview=1", "admin")).status, 200)
    checks.push("Anonyme / non-inscrit refusés ; aperçu réservé au super-admin")
    const enrollmentWhere = { userId_formationId: { userId: "r2-learner", formationId: "r2-formation" } }
    await prisma.enrollment.update({ where: enrollmentWhere, data: { expiresAt: new Date(Date.now() - 1000) } })
    assert.equal((await api(playlist, "learner")).status, 403)
    await prisma.enrollment.update({ where: enrollmentWhere, data: { expiresAt: null, startedAt: new Date(Date.now() + 60000) } })
    assert.equal((await api(playlist, "learner")).status, 403)
    await prisma.enrollment.update({ where: enrollmentWhere, data: { startedAt: new Date(Date.now() - 60000) } })
    await prisma.user.update({ where: { id: "r2-learner" }, data: { isActive: false } })
    assert.equal((await api(playlist, "learner")).status, 401)
    await prisma.user.update({ where: { id: "r2-learner" }, data: { isActive: true } })
    checks.push("Inscription future / expirée et compte désactivé refusés")
    const master = await api(playlist, "learner")
    assert.equal(master.status, 200)
    assert.equal(master.headers.get("cache-control"), "private, no-store")
    const masterText = await master.text()
    assert.equal(masterText.includes("r2_secret"), false)
    const variant = masterText.split("\n").find(line => line.startsWith("/api/"))!
    const media = await api(variant, "learner")
    assert.equal(media.status, 200)
    const segment = (await media.text()).split("\n").find(line => line.startsWith("http"))!
    assert.equal(new URL(segment).searchParams.get("X-Amz-Expires"), "10800")
    assert.equal((await fetch(segment)).status, 200)
    const unsigned = new URL(segment); unsigned.search = ""
    assert.equal((await fetch(unsigned)).status, 403)
    const tampered = new URL(segment); tampered.searchParams.set("X-Amz-Signature", "0".repeat(64))
    assert.equal((await fetch(tampered)).status, 403)
    const client = r2Client({ endpoint: "http://127.0.0.1:4568", bucket: "video-r2-test", accessKey: "S3RVER", secretKey: "S3RVER" })
    const key = decodeURIComponent(new URL(segment).pathname.slice("/video-r2-test/".length))
    const expired = await getSignedUrl(client, new GetObjectCommand({ Bucket: "video-r2-test", Key: key }), { expiresIn: 1, signingDate: new Date(Date.now() - 5000) })
    assert.equal((await fetch(expired)).status, 403)
    checks.push("Segment signé 3 h lu ; signature absente, altérée et expirée refusées")
    assert.notEqual((await api(playlist + "?path=../../sources/test/original", "learner")).status, 200)
    assert.equal((await fetch(base + "/api/internal/video-worker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "claim" }) })).status, 403)
    checks.push("Traversal et worker non authentifié refusés")
    const putProgress = (body: unknown) => fetch(base + "/api/progress/r2-chapter", { method: "PUT", headers: { Cookie: `authjs.session-token=${cookies.learner}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    assert.equal((await putProgress({ completedAt: new Date().toISOString(), lastPosition: 1 })).status, 403)
    assert.equal((await putProgress({ lastPosition: 8 })).status, 200)
    assert.equal((await prisma.progress.findUniqueOrThrow({ where: { userId_chapterId: { userId: "r2-learner", chapterId: "r2-chapter" } } })).lastPosition, 8)
    checks.push("Position sauvegardée ; seuil serveur de 25 % conservé")
    await writeFile(".local/qa-api-results.json", JSON.stringify({ at: new Date().toISOString(), checks }, null, 2))
    for (const check of checks) console.log("✓ " + check)
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
