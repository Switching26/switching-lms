import { PrismaClient } from "@prisma/client"
import { createReadStream } from "node:fs"
import { stat, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getR2Config, r2Client, validateRemotePackage } from "../../lib/video/r2"
import { validateLocalPackage } from "./transcode"

async function main() {
  const args = process.argv.slice(2)
  const value = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
  const upload = args.includes("--upload")
  const apply = args.includes("--apply")
  const db = new URL(process.env.DATABASE_URL || "")
  const local = ["localhost", "127.0.0.1", "127.0.0.2", "[::1]"].includes(db.hostname)
  if ((upload || apply) && !local && !args.includes("--allow-production")) throw new Error("Base distante : --allow-production requis pour toute écriture")
  if (apply && (!upload || value("--confirm") !== "MIGRATE_R2_CHAPTERS" || !value("--chapter"))) throw new Error("Activation : --upload --apply --chapter <id> --confirm MIGRATE_R2_CHAPTERS requis")
  if (upload && !apply && value("--confirm") !== "UPLOAD_R2") throw new Error("Dépôt : --upload --confirm UPLOAD_R2 requis")
  const root = path.resolve(value("--dir") || "/Users/switchingformation/lms-video-mission/hls")
  const clientDb = new PrismaClient()
  try {
    const chapters = await clientDb.chapter.findMany({ where: { ...(value("--chapter") ? { id: value("--chapter") } : {}), videoUrl: { not: null }, formation: { deletedAt: null } }, include: { formation: { select: { title: true } } }, orderBy: [{ formationId: "asc" }, { order: "asc" }] })
    const plan: { chapterId: string; title: string; formation: string; vimeoId: string; previousR2Key: string | null; previousDuration: number; masterKey: string; files: number; bytes: number }[] = []
    const packages = new Map<string, { root: string; files: string[] }>()
    for (const chapter of chapters) {
      const id = chapter.videoUrl!
      if (!/^\d+$/.test(id)) { console.log(`IGNORÉ ${chapter.id} : identifiant Vimeo non numérique`); continue }
      const dir = path.join(root, id)
      if (!await stat(dir).then(s => s.isDirectory()).catch(() => false)) { console.log(`MANQUANT ${chapter.id} ${id} ${chapter.title}`); continue }
      const checked = await validateLocalPackage(dir)
      const hash = createHash("sha256")
      for (const file of [...checked.files].sort()) { hash.update(file); for await (const chunk of createReadStream(path.join(dir, file))) hash.update(chunk) }
      const prefix = `videos/migration/${id}/${hash.digest("hex").slice(0, 24)}/`
      packages.set(prefix, { root: dir, files: checked.files })
      plan.push({ chapterId: chapter.id, title: chapter.title, formation: chapter.formation.title, vimeoId: id, previousR2Key: chapter.videoR2Key, previousDuration: chapter.videoDuration, masterKey: prefix + "master.m3u8", files: checked.files.length, bytes: checked.bytes })
    }
    console.log(JSON.stringify({ mode: apply ? "ACTIVATION" : upload ? "DÉPÔT SANS BASCULE" : "DRY-RUN · aucune écriture", chapters: plan }, null, 2))
    if (!upload) return
    if (!plan.length) throw new Error("Aucun paquet disponible : aucune écriture")
    // Refuse accidental remigration before any object write.
    if (apply && plan.some(item => item.previousR2Key && item.previousR2Key !== item.masterKey) && !args.includes("--replace")) throw new Error("Chapitre déjà migré : --replace requis")
    const config = await getR2Config()
    const client = r2Client(config)
    for (const [prefix, pkg] of packages) {
      for (const file of pkg.files) await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: prefix + file, Body: createReadStream(path.join(pkg.root, file)), ContentType: file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith(".ts") ? "video/mp2t" : "application/octet-stream", CacheControl: "private, max-age=3600" }))
      await validateRemotePackage(client, config.bucket, prefix + "master.m3u8")
    }
    const receipt = path.resolve(value("--receipt") || `.local/migration-${Date.now()}.json`)
    await mkdir(path.dirname(receipt), { recursive: true })
    // Receipt must be durable BEFORE the DB switch; failure means no switch.
    await writeFile(receipt, JSON.stringify({ at: new Date().toISOString(), chapters: plan }, null, 2), { flag: "wx", mode: 0o600 })
    if (apply) {
      for (const item of plan) {
        const result = await clientDb.chapter.updateMany({ where: { id: item.chapterId, videoUrl: item.vimeoId, videoR2Key: item.previousR2Key, videoDuration: item.previousDuration }, data: { videoR2Key: item.masterKey, ...(!item.previousR2Key && { videoVimeoDuration: item.previousDuration }) } })
        if (!result.count) throw new Error(`Chapitre modifié simultanément : ${item.chapterId}. Bascule refusée.`)
      }
    }
    console.log(`Terminé. Reçu de bascule/retour arrière : ${receipt}`)
  } finally { await clientDb.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Migration impossible"); process.exitCode = 1 })
