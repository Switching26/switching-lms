/**
 * Match les vidéos du disque dur Samuel avec les chapters de la DB.
 *
 * Disque dur : /Volumes/DISQUE DUR SAM 1/
 *   ├── VBA/*.mp4 (videos)
 *   ├── FORMATION SEA/VIDEO FINAL/{SEQ 1..5, QCM, BONUS}/*.mp4
 *   └── FORMATION SEO/FINAL - FORMATION SEO/{SEQ 1..5, BONUS 1/2, QUIZ}/*.mp4
 *
 * DB : 124 chapters (video / quiz / document)
 *
 * Output : /tmp/riseup-explore/video-matching.json
 */

import { PrismaClient } from "@prisma/client"
import * as fs from "fs"
import * as path from "path"

const prisma = new PrismaClient()

const DISK = "/Volumes/DISQUE DUR SAM 1"

// ─── 1. Lister TOUTES les vidéos du disque dur ───
function walkVideos(dir: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  let entries: string[]
  try { entries = fs.readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "$RECYCLE.BIN" || entry === "System Volume Information") continue
    const full = path.join(dir, entry)
    let stat: fs.Stats
    try { stat = fs.statSync(full) } catch { continue } // skip broken symlinks / unreadable files
    if (stat.isDirectory()) {
      out.push(...walkVideos(full))
    } else if (/\.(mp4|mov|m4v)$/i.test(entry)) {
      out.push(full)
    }
  }
  return out
}

// ─── 2. Normalize string for fuzzy matching ───
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// ─── 3. Score similarity (Jaccard sur mots) ───
function score(a: string, b: string): number {
  const wordsA = new Set(normalize(a).split(" ").filter((w) => w.length > 1))
  const wordsB = new Set(normalize(b).split(" ").filter((w) => w.length > 1))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let common = 0
  for (const w of wordsA) if (wordsB.has(w)) common++
  return common / Math.max(wordsA.size, wordsB.size)
}

// ─── 4. Identifier la formation cible d'un fichier vidéo (par chemin) ───
function formationFromPath(filePath: string): "VBA" | "SEA" | "SEO" | null {
  if (/\/VBA\//i.test(filePath)) return "VBA"
  if (/FORMATION SEA/i.test(filePath)) return "SEA"
  if (/FORMATION SEO/i.test(filePath)) return "SEO"
  return null
}

// ─── 5. Identifier module/seq depuis le chemin ───
function moduleFromPath(filePath: string): string | null {
  const m = filePath.match(/SEQ\s*(\d+|BON(?:N)?US)/i)
  if (m) return m[1].toUpperCase()
  // VBA n'a pas de module hiérarchique — tout est flat
  return null
}

async function main() {
  console.log("\n🎬 MATCH VIDÉOS DISQUE ↔ CHAPTERS DB\n")

  // Disk videos
  const diskVideos = walkVideos(DISK)
  console.log(`📁 ${diskVideos.length} vidéos trouvées sur disque dur :\n`)
  const byFormation = { VBA: 0, SEA: 0, SEO: 0, OTHER: 0 } as Record<string, number>
  for (const v of diskVideos) {
    const f = formationFromPath(v) || "OTHER"
    byFormation[f]++
  }
  for (const [k, v] of Object.entries(byFormation)) console.log(`   ${k}: ${v}`)

  // DB chapters (only video type)
  const formations = await prisma.formation.findMany({
    include: {
      sections: { orderBy: { order: "asc" } },
      chapters: {
        orderBy: { order: "asc" },
        include: { section: true, exercises: { select: { id: true } }, attachments: { select: { id: true } } },
      },
    },
  })

  // Build list of chapters to match (only video chapters = no exercise + no attachment)
  type DBChapter = {
    chapterId: string
    formationCode: "VBA" | "SEA" | "SEO" | null
    sectionTitle: string
    chapterTitle: string
    isVideo: boolean
  }
  const dbChapters: DBChapter[] = []
  for (const f of formations) {
    const code = /VBA/i.test(f.title) ? "VBA" : /SEA/i.test(f.title) ? "SEA" : /SEO/i.test(f.title) ? "SEO" : null
    for (const c of f.chapters) {
      const isQuiz = c.exercises.length > 0
      const isDoc = c.attachments.length > 0
      const isVideo = !isQuiz && !isDoc
      dbChapters.push({
        chapterId: c.id,
        formationCode: code,
        sectionTitle: c.section?.title || "(no section)",
        chapterTitle: c.title,
        isVideo,
      })
    }
  }

  const videoChapters = dbChapters.filter((c) => c.isVideo)
  console.log(`\n📚 ${dbChapters.length} chapters totaux dont ${videoChapters.length} vidéo (sans quiz/PDF)\n`)

  // ─── Matching ───
  type Match = {
    chapterId: string
    formationCode: string | null
    chapterTitle: string
    sectionTitle: string
    diskPath: string
    diskFilename: string
    score: number
    confidence: "high" | "medium" | "low" | "manual"
  }
  const matches: Match[] = []
  const unmatchedChapters: typeof videoChapters = []
  const usedDisk = new Set<string>()

  for (const ch of videoChapters) {
    const candidates = diskVideos.filter((p) => formationFromPath(p) === ch.formationCode && !usedDisk.has(p))
    if (candidates.length === 0) {
      unmatchedChapters.push(ch)
      continue
    }
    const scored = candidates
      .map((p) => ({ p, s: score(path.basename(p, path.extname(p)), ch.chapterTitle) }))
      .sort((a, b) => b.s - a.s)
    const best = scored[0]
    if (!best || best.s < 0.15) {
      unmatchedChapters.push(ch)
      continue
    }
    const confidence: Match["confidence"] = best.s > 0.5 ? "high" : best.s > 0.3 ? "medium" : "low"
    matches.push({
      chapterId: ch.chapterId,
      formationCode: ch.formationCode,
      chapterTitle: ch.chapterTitle,
      sectionTitle: ch.sectionTitle,
      diskPath: best.p,
      diskFilename: path.basename(best.p),
      score: Number(best.s.toFixed(2)),
      confidence,
    })
    usedDisk.add(best.p)
  }

  const unmatchedDisk = diskVideos.filter((p) => !usedDisk.has(p))

  // Save
  const out = {
    summary: {
      totalDiskVideos: diskVideos.length,
      totalDbChapters: dbChapters.length,
      videoChapters: videoChapters.length,
      matched: matches.length,
      unmatchedChapters: unmatchedChapters.length,
      unmatchedDiskVideos: unmatchedDisk.length,
      byConfidence: {
        high: matches.filter((m) => m.confidence === "high").length,
        medium: matches.filter((m) => m.confidence === "medium").length,
        low: matches.filter((m) => m.confidence === "low").length,
      },
    },
    matches: matches.sort((a, b) => {
      if (a.formationCode !== b.formationCode) return (a.formationCode || "").localeCompare(b.formationCode || "")
      return b.score - a.score
    }),
    unmatchedChapters,
    unmatchedDiskVideos: unmatchedDisk,
  }

  fs.writeFileSync("/tmp/riseup-explore/video-matching.json", JSON.stringify(out, null, 2))

  console.log("━".repeat(70))
  console.log("📊 RÉSULTATS")
  console.log("━".repeat(70))
  console.log(`   ✅ Matched           : ${matches.length}`)
  console.log(`      - High confidence : ${out.summary.byConfidence.high}`)
  console.log(`      - Medium          : ${out.summary.byConfidence.medium}`)
  console.log(`      - Low             : ${out.summary.byConfidence.low}`)
  console.log(`   ❌ Chapters non-matchés : ${unmatchedChapters.length}`)
  console.log(`   📁 Vidéos disque non utilisées : ${unmatchedDisk.length}`)
  console.log("\n🟢 Mapping écrit : /tmp/riseup-explore/video-matching.json")
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
