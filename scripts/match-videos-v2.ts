/**
 * Matching positionnel v2 : associe chaque fichier vidéo du disque dur à un chapter DB précis.
 *
 * Conventions :
 * - VBA : titre fichier == titre chapter (déjà résolu en v1)
 * - SEA : `SEQ N/MODULE N VIDEO M.mp4` → section "Module N" / chapter vidéo position M
 *         `QCM/REPONSE MOD N.mp4`     → chapter "Vidéo réponse au questionnaire N"
 *         `QCM/QUESTION MOD N.mp4`    → vidéo intro du quiz (rattachée au chapter Exercise)
 * - SEO : `SEQ N/SEQ N - MOD M.mp4`   (parfois "SEDQ N - MOD M") → section module N / chapter M
 *         `QUIZ + REP/...REP N.mp4`   → chapter "Vidéo réponse" du module N
 *
 * Output : /tmp/riseup-explore/matching-v2.json + console pretty print
 */
import { PrismaClient } from "@prisma/client"
import * as fs from "fs"
import * as path from "path"

const prisma = new PrismaClient()

const DISK_ROOTS = [
  "/Volumes/DISQUE DUR SAM 1/VBA",
  "/Volumes/DISQUE DUR SAM 1/FORMATION SEA/VIDEO FINAL",
  "/Volumes/DISQUE DUR SAM 1/FORMATION SEO/FINAL - FORMATION SEO",
]

interface DiskVideo {
  fullPath: string
  filename: string
  formation: "VBA" | "SEA" | "SEO" | "UNKNOWN"
  subPath: string
}

function detectFormation(p: string): DiskVideo["formation"] {
  if (p.includes("/VBA/")) return "VBA"
  if (p.includes("/FORMATION SEA/")) return "SEA"
  if (p.includes("/FORMATION SEO/")) return "SEO"
  return "UNKNOWN"
}

function walkVideos(root: string, acc: DiskVideo[] = []): DiskVideo[] {
  if (!fs.existsSync(root)) return acc
  for (const entry of fs.readdirSync(root)) {
    if (entry.startsWith(".") || entry === "$RECYCLE.BIN") continue
    const full = path.join(root, entry)
    let stat
    try { stat = fs.statSync(full) } catch { continue }
    if (stat.isDirectory()) {
      walkVideos(full, acc)
    } else if (/\.mp4$/i.test(entry)) {
      acc.push({
        fullPath: full,
        filename: entry,
        formation: detectFormation(full),
        subPath: full.split("/").slice(-3).join("/"),
      })
    }
  }
  return acc
}

interface ChapterRow {
  chapterId: string
  formationCode: "VBA" | "SEA" | "SEO"
  sectionOrder: number
  sectionTitle: string
  chapterOrder: number
  chapterTitle: string
  isQuiz: boolean
  isResponseVideo: boolean
}

async function loadDbStructure(): Promise<ChapterRow[]> {
  const formations = await prisma.formation.findMany({
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          chapters: {
            orderBy: { order: "asc" },
            include: { exercises: true },
          },
        },
      },
    },
  })

  const rows: ChapterRow[] = []
  for (const f of formations) {
    let code: "VBA" | "SEA" | "SEO"
    // Ordre : VBA → SEO → SEA (car "Search" dans "SEO Search Engine Opt." contient la substring "sea")
    if (/VBA/i.test(f.title)) code = "VBA"
    else if (/\bSEO\b/i.test(f.title)) code = "SEO"
    else if (/\bSEA\b/i.test(f.title)) code = "SEA"
    else continue
    for (const s of f.sections) {
      for (const c of s.chapters) {
        rows.push({
          chapterId: c.id,
          formationCode: code,
          sectionOrder: s.order,
          sectionTitle: s.title,
          chapterOrder: c.order,
          chapterTitle: c.title,
          isQuiz: c.exercises.length > 0,
          isResponseVideo: /vidéo réponse|video réponse|reponse au quest/i.test(c.title),
        })
      }
    }
  }
  return rows
}

interface Match {
  diskFile: string
  chapterId: string
  chapterTitle: string
  sectionTitle: string
  reason: string
  confidence: "high" | "medium" | "low"
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Retirer préfixes type "1.\t", "12. ", "3. "
    .replace(/^\s*\d+[\.\)]\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function match(disk: DiskVideo[], db: ChapterRow[]): { matches: Match[]; unmatchedDisk: DiskVideo[]; unmatchedDb: ChapterRow[] } {
  const matches: Match[] = []
  const usedDisk = new Set<string>()
  const usedDb = new Set<string>()

  // ════════════ VBA : titre exact, sinon substring/levenshtein simple ════════════
  for (const v of disk.filter((x) => x.formation === "VBA")) {
    const fnClean = normalize(v.filename.replace(/\.mp4$/i, ""))
    // 1) match exact normalisé
    let cand = db.find(
      (c) => c.formationCode === "VBA" && !usedDb.has(c.chapterId) && normalize(c.chapterTitle) === fnClean
    )
    let reason = "VBA: titre exact"
    let confidence: Match["confidence"] = "high"
    // 2) substring (fichier contient titre OU titre contient fichier)
    if (!cand) {
      cand = db.find(
        (c) =>
          c.formationCode === "VBA" &&
          !usedDb.has(c.chapterId) &&
          (normalize(c.chapterTitle).includes(fnClean) || fnClean.includes(normalize(c.chapterTitle))) &&
          // garde-fou : différence pas trop grande
          Math.abs(normalize(c.chapterTitle).length - fnClean.length) < 25
      )
      if (cand) {
        reason = "VBA: titre substring"
        confidence = "medium"
      }
    }
    if (cand) {
      matches.push({
        diskFile: v.fullPath,
        chapterId: cand.chapterId,
        chapterTitle: cand.chapterTitle,
        sectionTitle: cand.sectionTitle,
        reason,
        confidence,
      })
      usedDisk.add(v.fullPath)
      usedDb.add(cand.chapterId)
    }
  }

  // ════════════ SEA : MODULE N VIDEO M / REPONSE MOD N / QUESTION MOD N ════════════
  // Get all SEA chapters grouped by section order
  const seaSections = new Map<number, ChapterRow[]>()
  for (const c of db.filter((x) => x.formationCode === "SEA")) {
    if (!seaSections.has(c.sectionOrder)) seaSections.set(c.sectionOrder, [])
    seaSections.get(c.sectionOrder)!.push(c)
  }

  for (const v of disk.filter((x) => x.formation === "SEA")) {
    if (usedDisk.has(v.fullPath)) continue
    const fn = v.filename.toUpperCase()

    // MODULE N VIDEO M  → section [Module N starts at order 1 in DB] / Mth video chapter
    let m = fn.match(/MODULE\s+(\d+)\s+VIDEO\s+(\d+)/)
    if (m) {
      const moduleN = parseInt(m[1])
      const videoM = parseInt(m[2])
      // SEA sections: 0=intro, 1=Module 1, 2=Module 2, ... → sectionOrder = moduleN
      const sectionChapters = seaSections.get(moduleN) || []
      // Videos = chapters non-quiz et non-réponse, dans l'ordre
      const videoChapters = sectionChapters.filter((c) => !c.isQuiz && !c.isResponseVideo)
      const target = videoChapters[videoM - 1]
      if (target && !usedDb.has(target.chapterId)) {
        matches.push({
          diskFile: v.fullPath,
          chapterId: target.chapterId,
          chapterTitle: target.chapterTitle,
          sectionTitle: target.sectionTitle,
          reason: `SEA positional: Module ${moduleN} / video ${videoM}`,
          confidence: "high",
        })
        usedDisk.add(v.fullPath)
        usedDb.add(target.chapterId)
        continue
      }
    }

    // REPONSE MOD N → chapter "Vidéo réponse" du module N
    m = fn.match(/REPONSE\s+MOD\s+(\d+)/)
    if (m) {
      const moduleN = parseInt(m[1])
      const sectionChapters = seaSections.get(moduleN) || []
      const responseChapter = sectionChapters.find((c) => c.isResponseVideo)
      if (responseChapter && !usedDb.has(responseChapter.chapterId)) {
        matches.push({
          diskFile: v.fullPath,
          chapterId: responseChapter.chapterId,
          chapterTitle: responseChapter.chapterTitle,
          sectionTitle: responseChapter.sectionTitle,
          reason: `SEA réponse module ${moduleN}`,
          confidence: "high",
        })
        usedDisk.add(v.fullPath)
        usedDb.add(responseChapter.chapterId)
        continue
      }
    }

    // QUESTION MOD N → vidéo intro du quiz du module N
    m = fn.match(/QUESTION\s+MOD\s+(\d+)/)
    if (m) {
      const moduleN = parseInt(m[1])
      const sectionChapters = seaSections.get(moduleN) || []
      const quizChapter = sectionChapters.find((c) => c.isQuiz)
      if (quizChapter && !usedDb.has(quizChapter.chapterId)) {
        matches.push({
          diskFile: v.fullPath,
          chapterId: quizChapter.chapterId,
          chapterTitle: quizChapter.chapterTitle,
          sectionTitle: quizChapter.sectionTitle,
          reason: `SEA question intro quiz module ${moduleN}`,
          confidence: "medium",
        })
        usedDisk.add(v.fullPath)
        usedDb.add(quizChapter.chapterId)
        continue
      }
    }

    // A. VIDEO INTRO GLOBAL → section 0 chapter "Présentation"
    if (/INTRO GLOBAL/i.test(v.filename)) {
      const introSection = seaSections.get(0) || []
      const intro = introSection[0]
      if (intro && !usedDb.has(intro.chapterId)) {
        matches.push({
          diskFile: v.fullPath,
          chapterId: intro.chapterId,
          chapterTitle: intro.chapterTitle,
          sectionTitle: intro.sectionTitle,
          reason: "SEA intro global formation",
          confidence: "high",
        })
        usedDisk.add(v.fullPath)
        usedDb.add(intro.chapterId)
        continue
      }
    }

    // B. CLOTURE → dernière section / chapter
    if (/CLOTURE/i.test(v.filename) && !/QUESTION|REPONSE/i.test(v.filename)) {
      const lastSectionIdx = Math.max(...Array.from(seaSections.keys()))
      const closingChapters = seaSections.get(lastSectionIdx) || []
      const closing = closingChapters.find((c) => !c.isQuiz && !usedDb.has(c.chapterId))
      if (closing) {
        matches.push({
          diskFile: v.fullPath,
          chapterId: closing.chapterId,
          chapterTitle: closing.chapterTitle,
          sectionTitle: closing.sectionTitle,
          reason: "SEA video clôture",
          confidence: "medium",
        })
        usedDisk.add(v.fullPath)
        usedDb.add(closing.chapterId)
      }
    }
  }

  // ════════════ SEO : SEQ N - MOD M / SEDQ N - MOD M / REP MOD N ════════════
  const seoSections = new Map<number, ChapterRow[]>()
  for (const c of db.filter((x) => x.formationCode === "SEO")) {
    if (!seoSections.has(c.sectionOrder)) seoSections.set(c.sectionOrder, [])
    seoSections.get(c.sectionOrder)!.push(c)
  }

  for (const v of disk.filter((x) => x.formation === "SEO")) {
    if (usedDisk.has(v.fullPath)) continue
    const fn = v.filename.toUpperCase()

    // SEQ N - MOD M  (typo SEDQ accepté)
    let m = fn.match(/SED?Q\s+(\d+)\s*-\s*MOD\s+(\d+)/)
    if (m) {
      const seqN = parseInt(m[1])
      const modM = parseInt(m[2])
      // SEO: section 0 = intro, section 1 = Module 1 → sectionOrder = seqN
      const sectionChapters = seoSections.get(seqN) || []
      const videoChapters = sectionChapters.filter((c) => !c.isQuiz && !c.isResponseVideo)
      const target = videoChapters[modM - 1]
      if (target && !usedDb.has(target.chapterId)) {
        matches.push({
          diskFile: v.fullPath,
          chapterId: target.chapterId,
          chapterTitle: target.chapterTitle,
          sectionTitle: target.sectionTitle,
          reason: `SEO positional: SEQ ${seqN} / module ${modM}`,
          confidence: "high",
        })
        usedDisk.add(v.fullPath)
        usedDb.add(target.chapterId)
        continue
      }
    }

    // SEO REPONSE N (avec ou sans MOD) → chapter "Réponse au QUESTIONNAIRE N"
    m = fn.match(/REPONSE\s+(?:MOD\s+)?(\d+)/)
    if (m) {
      const n = parseInt(m[1])
      const sectionChapters = seoSections.get(n) || []
      const response = sectionChapters.find((c) => /réponse|reponse/i.test(c.chapterTitle))
      if (response && !usedDb.has(response.chapterId)) {
        matches.push({
          diskFile: v.fullPath,
          chapterId: response.chapterId,
          chapterTitle: response.chapterTitle,
          sectionTitle: response.sectionTitle,
          reason: `SEO réponse module ${n}`,
          confidence: "high",
        })
        usedDisk.add(v.fullPath)
        usedDb.add(response.chapterId)
        continue
      }
    }

    // SEO QUESTIONNAIRE N → vidéo intro du quiz module N (rattachée au chapter quiz)
    m = fn.match(/QUESTIONNAIRE\s+(\d+)/)
    if (m) {
      const n = parseInt(m[1])
      const sectionChapters = seoSections.get(n) || []
      const quiz = sectionChapters.find((c) => c.isQuiz)
      if (quiz && !usedDb.has(quiz.chapterId)) {
        matches.push({
          diskFile: v.fullPath,
          chapterId: quiz.chapterId,
          chapterTitle: quiz.chapterTitle,
          sectionTitle: quiz.sectionTitle,
          reason: `SEO question intro quiz module ${n}`,
          confidence: "medium",
        })
        usedDisk.add(v.fullPath)
        usedDb.add(quiz.chapterId)
        continue
      }
    }

    // SEO Search console N → matche par position dans section "MODULE 6 : Search Console" (sectionOrder=6)
    m = fn.match(/Search\s+console\s+(\d+)/i)
    if (m) {
      const num = parseInt(m[1])
      // Section avec "Search Console" dans le titre
      const targetSection = Array.from(seoSections.values()).find((cs) =>
        cs.length > 0 && /search\s*console/i.test(cs[0].sectionTitle)
      )
      if (targetSection) {
        const videoChapters = targetSection.filter((c) => !c.isQuiz && !c.isResponseVideo && /chapitre/i.test(c.chapterTitle))
        const target = videoChapters[num - 1]
        if (target && !usedDb.has(target.chapterId)) {
          matches.push({
            diskFile: v.fullPath,
            chapterId: target.chapterId,
            chapterTitle: target.chapterTitle,
            sectionTitle: target.sectionTitle,
            reason: `SEO search console ${num}`,
            confidence: "high",
          })
          usedDisk.add(v.fullPath)
          usedDb.add(target.chapterId)
          continue
        }
      }
    }

    // SEO SEQ BONNUS 2 - MOD N → section "Module 7 : Analyse de site"
    m = fn.match(/SEQ\s+BONNUS\s+2\s*-\s*MOD\s+(\d+)|sequence_bonus_2_-_module_(\d+)/i)
    if (m) {
      const num = parseInt(m[1] || m[2])
      const targetSection = Array.from(seoSections.values()).find((cs) =>
        cs.length > 0 && /analyse\s*de\s*site/i.test(cs[0].sectionTitle)
      )
      if (targetSection) {
        const videoChapters = targetSection.filter((c) => !c.isQuiz && !c.isResponseVideo)
        const target = videoChapters[num - 1]
        if (target && !usedDb.has(target.chapterId)) {
          matches.push({
            diskFile: v.fullPath,
            chapterId: target.chapterId,
            chapterTitle: target.chapterTitle,
            sectionTitle: target.sectionTitle,
            reason: `SEO bonus 2 (analyse de site) module ${num}`,
            confidence: "high",
          })
          usedDisk.add(v.fullPath)
          usedDb.add(target.chapterId)
          continue
        }
      }
    }

    // SEO tools: SEMRUSH / Yooda insight / ubbersuggest → match substring sur chapter title
    const fileLower = v.filename.toLowerCase().replace(/\.mp4$/i, "")
    const toolMatch = db.find((c) => {
      if (c.formationCode !== "SEO" || usedDb.has(c.chapterId)) return false
      const ct = c.chapterTitle.toLowerCase()
      if (fileLower.includes("semrush") && ct.includes("semrush")) return true
      if ((fileLower.includes("yooda") || fileLower.includes("yoda")) && ct.includes("yooda")) return true
      if ((fileLower.includes("ubbersuggest") || fileLower.includes("ubersuggest")) && ct.includes("ubersuggest")) return true
      return false
    })
    if (toolMatch) {
      matches.push({
        diskFile: v.fullPath,
        chapterId: toolMatch.chapterId,
        chapterTitle: toolMatch.chapterTitle,
        sectionTitle: toolMatch.sectionTitle,
        reason: "SEO tuto outil",
        confidence: "high",
      })
      usedDisk.add(v.fullPath)
      usedDb.add(toolMatch.chapterId)
      continue
    }

    // INTRODUCTION GLOBAL → section 0
    if (/INTRODUCTION GLOBAL/i.test(v.filename)) {
      const introSection = seoSections.get(0) || []
      const intro = introSection[0]
      if (intro && !usedDb.has(intro.chapterId)) {
        matches.push({
          diskFile: v.fullPath,
          chapterId: intro.chapterId,
          chapterTitle: intro.chapterTitle,
          sectionTitle: intro.sectionTitle,
          reason: "SEO introduction global formation",
          confidence: "high",
        })
        usedDisk.add(v.fullPath)
        usedDb.add(intro.chapterId)
        continue
      }
    }

    // VIDEO CLOTURE → section de clôture (Perspectives et opportunités)
    if (/CLOTURE/i.test(v.filename)) {
      const closingSection = Array.from(seoSections.values()).find((cs) =>
        cs.length > 0 && /clôture|cloture/i.test(cs[0].sectionTitle)
      )
      if (closingSection) {
        const closing = closingSection.find((c) => !c.isQuiz && !usedDb.has(c.chapterId))
        if (closing) {
          matches.push({
            diskFile: v.fullPath,
            chapterId: closing.chapterId,
            chapterTitle: closing.chapterTitle,
            sectionTitle: closing.sectionTitle,
            reason: "SEO video clôture",
            confidence: "high",
          })
          usedDisk.add(v.fullPath)
          usedDb.add(closing.chapterId)
        }
      }
    }
  }

  const unmatchedDisk = disk.filter((v) => !usedDisk.has(v.fullPath))
  const unmatchedDb = db.filter((c) => !usedDb.has(c.chapterId))
  return { matches, unmatchedDisk, unmatchedDb }
}

async function main() {
  console.log("🎬 MATCHING POSITIONNEL V2\n")
  const disk: DiskVideo[] = []
  for (const r of DISK_ROOTS) walkVideos(r, disk)
  console.log(`📁 ${disk.length} fichiers .mp4 dans VIDEO FINAL (sans doublons)`)
  console.log(`   VBA: ${disk.filter((v) => v.formation === "VBA").length}`)
  console.log(`   SEA: ${disk.filter((v) => v.formation === "SEA").length}`)
  console.log(`   SEO: ${disk.filter((v) => v.formation === "SEO").length}\n`)

  const dbChapters = await loadDbStructure()
  console.log(`📚 ${dbChapters.length} chapters DB`)
  console.log(`   VBA: ${dbChapters.filter((c) => c.formationCode === "VBA").length}`)
  console.log(`   SEA: ${dbChapters.filter((c) => c.formationCode === "SEA").length}`)
  console.log(`   SEO: ${dbChapters.filter((c) => c.formationCode === "SEO").length}\n`)

  const { matches, unmatchedDisk, unmatchedDb } = match(disk, dbChapters)

  console.log("━".repeat(75))
  console.log(`✅ ${matches.length} matches  (high: ${matches.filter((m) => m.confidence === "high").length}, medium: ${matches.filter((m) => m.confidence === "medium").length})`)
  console.log(`🟡 ${unmatchedDisk.length} fichiers disque non-matchés`)
  console.log(`🟡 ${unmatchedDb.filter((c) => !c.isQuiz).length} chapters non-vidéo encore vides`)
  console.log("━".repeat(75))

  const outPath = "/tmp/riseup-explore/matching-v2.json"
  fs.mkdirSync("/tmp/riseup-explore", { recursive: true })
  fs.writeFileSync(
    outPath,
    JSON.stringify({ matches, unmatchedDisk, unmatchedDb }, null, 2)
  )
  console.log(`\n💾 ${outPath}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
