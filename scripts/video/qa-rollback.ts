import { PrismaClient } from "@prisma/client"
import { readFile } from "node:fs/promises"
import assert from "node:assert/strict"
async function main() {
  if (new URL(process.env.DATABASE_URL || "").hostname !== "127.0.0.1" || new URL(process.env.DATABASE_URL || "").pathname !== "/video_r2_test") throw new Error("Base QA requise")
  const prisma = new PrismaClient()
  try {
    const cookies = JSON.parse(await readFile(".local/qa-cookies.json", "utf8"))
    const before = await prisma.chapter.findUniqueOrThrow({ where: { id: "r2-chapter" } })
    const progressBefore = JSON.stringify(await prisma.progress.findMany({ where: { chapterId: "r2-chapter" } }))
    async function put(body: unknown) {
      const response = await fetch("http://127.0.0.1:3412/api/chapitres/r2-chapter", { method: "PUT", headers: { Cookie: `authjs.session-token=${cookies.admin}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      assert.equal(response.status, 200)
      return response.json()
    }
    const rolled = await put({ videoR2Key: null, videoUrl: before.videoUrl, videoDuration: before.videoDuration })
    assert.equal(rolled.videoR2Key, null)
    assert.equal(rolled.videoDuration, before.videoVimeoDuration)
    assert.equal(rolled.videoUrl, before.videoUrl)
    const restored = await put({ videoR2Key: before.videoR2Key, videoDuration: before.videoDuration })
    assert.equal(restored.videoR2Key, before.videoR2Key)
    assert.equal(JSON.stringify(await prisma.progress.findMany({ where: { chapterId: "r2-chapter" } })), progressBefore)
    assert.equal(await prisma.progress.count({ where: { userId: "r2-admin" } }), 0)
    console.log("✓ Retour Vimeo/restauration R2 : identifiant et durée d’origine conservés, progression intacte, aperçu admin sans trace de progression")
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
