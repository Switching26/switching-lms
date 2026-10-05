import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, mkdtemp, rm, statfs } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import path from "node:path"
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { r2Client, validateRemotePackage } from "../../lib/video/r2"
import { convertHls, validateLocalPackage } from "./transcode"

async function main() {
  const base = process.env.VIDEO_LMS_URL
  const token = process.env.VIDEO_WORKER_TOKEN
  if (!base || !token || token.length < 32) throw new Error("VIDEO_LMS_URL et VIDEO_WORKER_TOKEN (32 caractères minimum) requis")
  const url = new URL(base)
  if (url.protocol !== "https:" && !["127.0.0.1", "127.0.0.2", "localhost"].includes(url.hostname)) throw new Error("HTTPS requis")
  const root = path.resolve(process.env.VIDEO_WORK_DIR || ".local/video-worker")
  await mkdir(root, { recursive: true })
  async function api(body: Record<string, unknown>) {
    const response = await fetch(new URL("/api/internal/video-worker", base), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw new Error(`LMS worker : HTTP ${response.status}`)
    return response.json()
  }
  do {
    const job = await api({ action: "claim" })
    if (job) {
      const space = await statfs(root)
      if (Number(space.bavail) * Number(space.bsize) < 15 * 1024 ** 3) {
        await api({ action: "fail", id: job.id, leaseToken: job.leaseToken })
        throw new Error("15 Go libres requis pour convertir une vidéo")
      }
      const scratch = await mkdtemp(path.join(root, "conversion-"))
      const controller = new AbortController()
      const heartbeat = setInterval(() => { void api({ action: "heartbeat", id: job.id, leaseToken: job.leaseToken }).catch(() => controller.abort()) }, 30000)
      try {
        console.log(`Conversion ${job.id} : téléchargement puis trois qualités`)
        const client = r2Client(job.config)
        const original = path.join(scratch, "source")
        const object = await client.send(new GetObjectCommand({ Bucket: job.config.bucket, Key: job.sourceKey }), { abortSignal: controller.signal })
        if (!object.Body) throw new Error("Source absente")
        await pipeline(object.Body as NodeJS.ReadableStream, createWriteStream(original), { signal: controller.signal })
        const output = path.join(scratch, "hls")
        const duration = await convertHls(original, output, controller.signal)
        const { files } = await validateLocalPackage(output)
        const prefix = `videos/${job.id}/${job.leaseToken}/`
        for (const file of files) {
          await client.send(new PutObjectCommand({ Bucket: job.config.bucket, Key: prefix + file, Body: createReadStream(path.join(output, file)),
            ContentType: file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith(".ts") ? "video/mp2t" : "application/octet-stream",
            CacheControl: "private, max-age=3600" }), { abortSignal: controller.signal })
        }
        await validateRemotePackage(client, job.config.bucket, prefix + "master.m3u8")
        await api({ action: "finish", id: job.id, leaseToken: job.leaseToken, hlsKey: prefix + "master.m3u8", duration })
        console.log(`Conversion ${job.id} prête (${duration} secondes)`)
      } catch (error) {
        console.error(`Conversion ${job.id} échouée :`, error instanceof Error ? error.message : "erreur")
        await api({ action: "fail", id: job.id, leaseToken: job.leaseToken }).catch(() => {})
        if (process.argv.includes("--once")) throw error
      } finally {
        clearInterval(heartbeat)
        controller.abort()
        // Only our own mkdtemp directory is removed.
        await rm(scratch, { recursive: true, force: true })
      }
    }
    if (process.argv.includes("--once")) break
    await new Promise(resolve => setTimeout(resolve, 15000))
  } while (true)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Worker arrêté"); process.exitCode = 1 })
