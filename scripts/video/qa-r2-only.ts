import { PrismaClient } from "@prisma/client"
import { readFile } from "node:fs/promises"
import assert from "node:assert/strict"
async function main() {
  const db = new URL(process.env.DATABASE_URL || "")
  if (db.hostname !== "127.0.0.1" || db.pathname !== "/video_r2_test") throw new Error("Base QA locale requise")
  const prisma = new PrismaClient()
  try {
    const original = await prisma.chapter.findUniqueOrThrow({ where: { id: "r2-chapter" } })
    const cookies = JSON.parse(await readFile(".local/qa-cookies.json", "utf8"))
    await prisma.chapter.upsert({ where: { id: "r2-only" }, update: {}, create: { id: "r2-only", formationId: original.formationId, title: "Vidéo R2 sans Vimeo", videoR2Key: original.videoR2Key, videoDuration: 42, isPublished: true, order: 5 } })
    const completed = await fetch("http://127.0.0.1:3412/api/progress/r2-only", { method: "PUT", headers: { Cookie: `authjs.session-token=${cookies.learner}`, "Content-Type": "application/json" }, body: JSON.stringify({ completedAt: new Date().toISOString(), lastPosition: 0 }) })
    assert.equal(completed.status, 403)
    assert.equal((await completed.json()).requiredSeconds, 11)
    const playlist = await fetch("http://127.0.0.1:3412/api/videos/r2-only/playlist", { headers: { Cookie: `authjs.session-token=${cookies.learner}` } })
    assert.equal(playlist.status, 200)
    const realProgress = await prisma.progress.findUniqueOrThrow({ where: { userId_chapterId: { userId: "r2-learner", chapterId: "r2-chapter" } } })
    assert.ok(realProgress.completedAt)
    assert.equal(realProgress.lastPosition, 0)
    assert.ok(realProgress.timeSpentSeconds >= 11)
    console.log("✓ Chapitre R2 seul : lecture autorisée, complétion prématurée refusée ; vraie fin navigateur persistée (position 0)")
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
