/**
 * Upload séquentiel des vidéos disque → Vimeo + update Chapter en DB.
 *
 * Usage : npx tsx scripts/upload-vimeo.ts [--code SEO|SEA|VBA] [--limit N] [--dry-run]
 *
 * Stratégie :
 *  - Lit /tmp/riseup-explore/matches-final.json pour la liste des couples (chapter, disk_path)
 *  - Filtre par code formation (SEO d'abord)
 *  - Pour chaque match :
 *      1. POST /me/videos (upload.approach=tus + size + name + description + privacy=unlisted)
 *      2. PATCH upload_link avec le fichier (full one-shot via fetch + Buffer)
 *      3. UPDATE Chapter SET videoUrl, description, videoDuration en DB locale
 *      4. Re-fetch /me upload_quota pour monitoring throttling
 *      5. Si HTTP 429 ou quota.periodic apparaît → STOP
 *  - Log /tmp/lms-upload.log
 */
import { PrismaClient } from "@prisma/client"
import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"

const MATCHES_PATH = "/tmp/riseup-explore/matches-final.json"
const DISK_DUR_PATH = "/tmp/riseup-explore/disk-durations.json"
const LOG_PATH = "/tmp/lms-upload.log"

// Parse args
const args = process.argv.slice(2)
const codeArg = args.includes("--code") ? args[args.indexOf("--code") + 1] : null
const limitArg = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1]) : null
const dryRun = args.includes("--dry-run")

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_PATH, line + "\n")
}

// Decrypt vimeo token from DB
function getVimeoToken(): string {
  const authSecret = process.env.AUTH_SECRET
  if (!authSecret) throw new Error("AUTH_SECRET missing")
  const enc = execSync(
    `PGPASSWORD= /opt/homebrew/opt/postgresql@16/bin/psql switching_lms -t -A -c "SELECT value FROM \\"SystemConfig\\" WHERE key='vimeo_token'"`,
    { encoding: "utf8" }
  ).trim()
  const [ivHex, ctHex] = enc.split(":")
  const crypto = require("crypto")
  const key = crypto.createHash("sha256").update(authSecret).digest()
  const iv = Buffer.from(ivHex, "hex")
  const dec = crypto.createDecipheriv("aes-256-cbc", key, iv)
  return Buffer.concat([dec.update(Buffer.from(ctHex, "hex")), dec.final()]).toString()
}

async function checkQuota(token: string) {
  const r = await fetch("https://api.vimeo.com/me?fields=upload_quota,account", {
    headers: { Authorization: `bearer ${token}` },
  })
  const d: any = await r.json()
  return d.upload_quota
}

const EMBED_DOMAINS = [
  "switching-lms-production.up.railway.app",
  "plateforme-elearning.up.railway.app",
  "localhost",
  "mac-mini-de-switching.tail09d208.ts.net",
]

async function createVideo(token: string, size: number, name: string, description: string) {
  const body = {
    upload: { approach: "tus", size: String(size) },
    name,
    description: description || "",
    privacy: {
      view: "disable",       // page vimeo.com refuse l'accès direct
      embed: "whitelist",    // embed uniquement depuis domaines whitelistés
      download: false,
      add: false,
      comments: "nobody",
    },
  }
  const r = await fetch("https://api.vimeo.com/me/videos", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.vimeo.*+json;version=3.4",
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`create video ${r.status}: ${txt.slice(0, 200)}`)
  }
  const d: any = await r.json()
  return { uri: d.uri as string, uploadLink: d.upload.upload_link as string, link: d.link as string, videoId: d.uri.split("/").pop() }
}

async function addEmbedDomains(token: string, videoId: string) {
  // Retry chaque domaine jusqu'à 3 fois avec 2s d'attente (Vimeo a un petit délai d'init)
  for (const domain of EMBED_DOMAINS) {
    let ok = false
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await fetch(`https://api.vimeo.com/videos/${videoId}/privacy/domains/${domain}`, {
        method: "PUT",
        headers: { Authorization: `bearer ${token}` },
      })
      if (r.ok || r.status === 204) { ok = true; break }
      await new Promise(res => setTimeout(res, 2000))
    }
    if (!ok) console.error(`  ⚠️ whitelist domain ${domain} failed after 3 retries`)
  }
  // Vérif finale : la liste réelle des domains
  const check = await fetch(`https://api.vimeo.com/videos/${videoId}/privacy/domains`, {
    headers: { Authorization: `bearer ${token}` },
  })
  if (check.ok) {
    const data: any = await check.json()
    const got = (data.data || []).map((x: any) => x.domain)
    const missing = EMBED_DOMAINS.filter(d => !got.includes(d))
    if (missing.length) console.error(`  ⚠️ whitelist incomplete: missing ${missing.join(", ")}`)
  }
}

async function uploadFileTus(uploadLink: string, filePath: string, size: number) {
  // TUS upload : chunked PATCH for resilience on big files
  const CHUNK_SIZE = 64 * 1024 * 1024 // 64 MB
  const fd = fs.openSync(filePath, "r")
  let offset = 0
  try {
    while (offset < size) {
      const len = Math.min(CHUNK_SIZE, size - offset)
      const buf = Buffer.allocUnsafe(len)
      fs.readSync(fd, buf, 0, len, offset)

      const r = await fetch(uploadLink, {
        method: "PATCH",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: buf,
      })
      if (!r.ok) {
        throw new Error(`tus patch ${r.status} at offset=${offset}: ${(await r.text()).slice(0, 200)}`)
      }
      const newOffset = parseInt(r.headers.get("upload-offset") || "0")
      offset = newOffset
      const pct = ((offset / size) * 100).toFixed(1)
      process.stdout.write(`\r    ⬆ ${pct}% (${(offset / 1024 / 1024).toFixed(0)} MB / ${(size / 1024 / 1024).toFixed(0)} MB)`)
    }
    process.stdout.write("\n")
  } finally {
    fs.closeSync(fd)
  }
}

async function main() {
  const matches = JSON.parse(fs.readFileSync(MATCHES_PATH, "utf8")).matches as any[]
  const durations = JSON.parse(fs.readFileSync(DISK_DUR_PATH, "utf8")) as Record<string, number>
  const token = getVimeoToken()
  const prisma = new PrismaClient()

  let work = matches
  if (codeArg) work = work.filter(m => m.code === codeArg)
  if (limitArg) work = work.slice(0, limitArg)

  log(`🚀 Démarrage upload Vimeo`)
  log(`   Code: ${codeArg || "ALL"}  Limit: ${limitArg || "none"}  Dry-run: ${dryRun}`)
  log(`   ${work.length} vidéos à uploader`)

  const initialQuota = await checkQuota(token)
  log(`   Quota initial: ${(initialQuota.lifetime.free / 1024 / 1024 / 1024).toFixed(2)} GB libres`)

  let okCount = 0
  let errCount = 0

  for (let i = 0; i < work.length; i++) {
    const m = work[i]
    const fname = path.basename(m.disk_path)
    const size = fs.statSync(m.disk_path).size
    const dur = Math.round(durations[m.disk_path] || 0)

    log(`\n[${i + 1}/${work.length}] ${m.code} · ${m.title.slice(0, 60)}`)
    log(`    📁 ${fname} (${(size / 1024 / 1024).toFixed(0)} MB · ${dur}s)`)

    // Need chapter ID in DB to match
    const chapter = await prisma.chapter.findFirst({
      where: {
        title: m.title,
        formation: {
          title: m.code === "VBA"
            ? "FORMATION Excel VBA (Visual Basic for Applications)"
            : m.code === "SEA"
            ? "Formation SEA - search engine advertising"
            : "Formation SEO - Search Engine Optimization",
        },
      },
    })
    if (!chapter) {
      log(`    ⚠️  Chapter introuvable en DB - skip`)
      errCount++
      continue
    }

    if (chapter.videoUrl && chapter.videoUrl.includes("vimeo.com")) {
      log(`    ✓ Déjà uploadé (${chapter.videoUrl}) - skip`)
      okCount++
      continue
    }

    if (dryRun) {
      log(`    [dry-run] would upload + update chapter ${chapter.id}`)
      continue
    }

    // Strip HTML from description
    const cleanDesc = (m.description || "").replace(/<[^>]+>/g, "").trim()

    try {
      const t0 = Date.now()
      const { uri, uploadLink, link, videoId } = await createVideo(token, size, m.title.trim() || fname, cleanDesc)
      log(`    🎬 vidéo créée: ${uri} (${link})`)

      // Whitelist embed domains
      await addEmbedDomains(token, videoId)
      log(`    🔒 embed whitelist appliquée (${EMBED_DOMAINS.length} domaines)`)

      await uploadFileTus(uploadLink, m.disk_path, size)
      const dt = ((Date.now() - t0) / 1000).toFixed(0)
      log(`    ✅ upload OK en ${dt}s`)

      // Update DB
      await prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          videoUrl: videoId,
          videoDuration: dur,
          ...(cleanDesc ? { description: cleanDesc } : {}),
        },
      })
      log(`    💾 Chapter ${chapter.id} updated`)

      okCount++

      // Monitor quota after each
      const q = await checkQuota(token)
      const freeGB = (q.lifetime.free / 1024 / 1024 / 1024).toFixed(2)
      log(`    📊 quota restant: ${freeGB} GB`)
      if (q.periodic && q.periodic.max) {
        log(`    ⚠️ QUOTA PÉRIODIQUE DÉTECTÉ: ${JSON.stringify(q.periodic)}`)
        log(`    🛑 STOP — Vimeo throttling activé`)
        break
      }
    } catch (e: any) {
      errCount++
      log(`    ❌ ERREUR: ${e.message}`)
      if (e.message.includes("429") || e.message.toLowerCase().includes("rate")) {
        log(`    🛑 STOP — rate-limit Vimeo détecté`)
        break
      }
      // continue on other errors
    }
  }

  log(`\n🏁 Terminé : ${okCount} ✅ / ${errCount} ❌ / ${work.length} total`)
  await prisma.$disconnect()
}

main().catch(e => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})
