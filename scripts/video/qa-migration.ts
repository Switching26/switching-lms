import { PrismaClient } from "@prisma/client"
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { r2Client } from "../../lib/video/r2"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { run } from "./transcode"
import assert from "node:assert/strict"

async function main() {
  if (new URL(process.env.DATABASE_URL || "").hostname !== "127.0.0.1" || new URL(process.env.DATABASE_URL || "").pathname !== "/video_r2_test") throw new Error("Base QA requise")
  const prisma = new PrismaClient()
  try {
    const job = await prisma.videoJob.findFirstOrThrow({ where: { status: "READY" }, orderBy: { createdAt: "desc" } })
    const client = r2Client({ endpoint: "http://127.0.0.1:4568", bucket: "video-r2-test", accessKey: "S3RVER", secretKey: "S3RVER" })
    const prefix = job.hlsKey!.slice(0, job.hlsKey!.lastIndexOf("/") + 1)
    const list = await client.send(new ListObjectsV2Command({ Bucket: "video-r2-test", Prefix: prefix }))
    for (const object of list.Contents || []) {
      const relative = object.Key!.slice(prefix.length)
      const local = path.join(".local/migration-hls/123456789", relative)
      await mkdir(path.dirname(local), { recursive: true })
      const body = await client.send(new GetObjectCommand({ Bucket: "video-r2-test", Key: object.Key }))
      await writeFile(local, await body.Body!.transformToByteArray())
    }
    await prisma.chapter.upsert({ where: { id: "r2-migration" }, update: {}, create: { id: "r2-migration", formationId: "r2-formation", title: "Migration de test", videoUrl: "123456789", videoDuration: 42, isPublished: true, order: 3 } })
    const args = ["scripts/video/migrate-r2.ts", "--dir", ".local/migration-hls", "--chapter", "r2-migration"]
    const before = JSON.stringify(await prisma.chapter.findUnique({ where: { id: "r2-migration" } }))
    await run("./node_modules/.bin/tsx", args)
    assert.equal(JSON.stringify(await prisma.chapter.findUnique({ where: { id: "r2-migration" } })), before)
    await run("./node_modules/.bin/tsx", [...args, "--upload", "--confirm", "UPLOAD_R2", "--receipt", `.local/qa-migration-upload-${Date.now()}.json`])
    assert.equal(JSON.stringify(await prisma.chapter.findUnique({ where: { id: "r2-migration" } })), before)
    await run("./node_modules/.bin/tsx", [...args, "--upload", "--apply", "--confirm", "MIGRATE_R2_CHAPTERS", "--receipt", `.local/qa-migration-apply-${Date.now()}.json`])
    const after = await prisma.chapter.findUniqueOrThrow({ where: { id: "r2-migration" } })
    assert.ok(after.videoR2Key)
    assert.equal(after.videoUrl, "123456789")
    const key = after.videoR2Key
    await run("./node_modules/.bin/tsx", args)
    assert.equal((await prisma.chapter.findUniqueOrThrow({ where: { id: "r2-migration" } })).videoR2Key, key)
    console.log("✓ Migration locale : dry-run sans mutation, dépôt sans bascule, activation explicite et référence Vimeo conservée")
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
