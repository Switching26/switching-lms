import { PrismaClient } from "@prisma/client"
import assert from "node:assert/strict"
async function main() {
  if (new URL(process.env.DATABASE_URL || "").hostname !== "127.0.0.1" || new URL(process.env.DATABASE_URL || "").pathname !== "/video_r2_test") throw new Error("Base QA requise")
  const prisma = new PrismaClient()
  async function api(body: Record<string, unknown>) {
    const response = await fetch("http://127.0.0.1:3412/api/internal/video-worker", { method: "POST", headers: { Authorization: "Bearer video-r2-local-worker-token-2026-only", "Content-Type": "application/json" }, body: JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  try {
    await prisma.videoJob.deleteMany({ where: { fileName: "queue-test", sourceKey: "sources/queue-test/original" } })
    const created = await prisma.videoJob.create({ data: { chapterId: "r2-chapter", createdBy: "r2-admin", fileName: "queue-test", fileSize: 1n, sourceKey: "sources/queue-test/original", multipartId: "queue-test", status: "QUEUED" } })
    const first = await api({ action: "claim" })
    assert.equal(first.data.id, created.id)
    assert.equal((await api({ action: "claim" })).data, null)
    assert.equal((await api({ action: "heartbeat", id: created.id, leaseToken: first.data.leaseToken })).status, 200)
    await prisma.videoJob.update({ where: { id: created.id }, data: { leaseUntil: new Date(Date.now() - 1000) } })
    const second = await api({ action: "claim" })
    assert.equal(second.data.id, created.id)
    assert.notEqual(second.data.leaseToken, first.data.leaseToken)
    assert.equal((await api({ action: "heartbeat", id: created.id, leaseToken: first.data.leaseToken })).status, 409)
    await api({ action: "fail", id: created.id, leaseToken: second.data.leaseToken })
    assert.equal((await prisma.videoJob.findUniqueOrThrow({ where: { id: created.id } })).status, "QUEUED")
    const third = await api({ action: "claim" })
    await prisma.videoJob.update({ where: { id: created.id }, data: { leaseUntil: new Date(Date.now() - 1000) } })
    assert.equal((await api({ action: "claim" })).data, null)
    assert.equal((await prisma.videoJob.findUniqueOrThrow({ where: { id: created.id } })).status, "FAILED")
    assert.equal((await api({ action: "heartbeat", id: created.id, leaseToken: third.data.leaseToken })).status, 409)
    // Keep the latest real READY upload visible in the admin after this fixture.
    await prisma.videoJob.delete({ where: { id: created.id } })
    console.log("✓ File durable : un seul propriétaire, heartbeat, reprise après bail expiré, ancien worker refusé, arrêt après trois tentatives")
  } finally {
    await prisma.videoJob.deleteMany({ where: { fileName: "queue-test", sourceKey: "sources/queue-test/original" } })
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
