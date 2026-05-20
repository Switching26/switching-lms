/**
 * Import Rise Up → Switching LMS
 *
 * Reads:
 *  - /tmp/riseup-explore/v7-all.json (structures: 3 formations × modules × steps)
 *  - /tmp/riseup-explore/quiz-docs-clean.json (quiz content + PDF URLs)
 *  - /tmp/riseup-explore/pdfs/*.pdf (7 PDFs téléchargés)
 *
 * Creates in DB:
 *  - 1 Partner CNFDI (white-label)
 *  - 1 Super-admin Samuel (admin@switching-formation.fr / Admin1234!)
 *  - 3 Formations × 22 Sections × ~109 Chapters
 *  - 11 Exercises (QCM) × 88 Questions × 287 Choices
 *  - 7 Attachments (PDFs copiés vers public/uploads/pdfs/)
 *
 * Usage:
 *  npx tsx scripts/import-riseup.ts --dry-run   (default, no DB write)
 *  npx tsx scripts/import-riseup.ts --apply     (apply for real)
 */

import { PrismaClient, Role, ExerciseType } from "@prisma/client"
import { hash } from "bcryptjs"
import * as fs from "fs"
import * as path from "path"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")

const RISEUP_DIR = "/tmp/riseup-explore"
const PUBLIC_PDFS_DIR = path.join(__dirname, "..", "public", "uploads", "pdfs")

// ============================================================
// Utils
// ============================================================

/** Strip HTML tags + decode common entities → plain text. */
function stripHtml(html: string): string {
  if (!html) return ""
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
}

interface RiseUpStep {
  id: number
  title: string
  type: "video" | "quiz" | "document"
  educationalTime?: number
  duration?: number
}

interface RiseUpModule {
  id: number
  title: string
  steps: RiseUpStep[]
}

interface RiseUpFormation {
  id: number
  title: string
  description?: string
  educationalTime: number
  imageUrl?: string
  bannerUrl?: string
  modules: RiseUpModule[]
}

// ============================================================
// Load data
// ============================================================

function loadFormations(): RiseUpFormation[] {
  const v7 = JSON.parse(fs.readFileSync(`${RISEUP_DIR}/v7-all.json`, "utf-8"))
  const out: RiseUpFormation[] = []
  for (const [k, v] of Object.entries(v7) as [string, any][]) {
    if (!k.startsWith("info_")) continue
    const payload = v.data || {}
    const t = payload.training || {}
    out.push({
      id: t.id,
      title: t.title || "",
      description: t.description || "",
      educationalTime: t.educationalTime || 0,
      imageUrl: t.imageUrl || undefined,
      bannerUrl: t.bannerUrl || undefined,
      modules: (payload.modules || []).map((m: any) => ({
        id: m.id,
        title: m.title || "",
        steps: (m.steps || []).map((s: any) => ({
          id: s.id,
          title: s.title || "",
          type: s.type,
          educationalTime: s.educationalTime,
          duration: s.duration,
        })),
      })),
    })
  }
  return out
}

function loadQuizAndDocs(): {
  quiz: Record<string, any>
  docs: Record<string, any>
} {
  const raw = JSON.parse(
    fs.readFileSync(`${RISEUP_DIR}/quiz-docs-clean.json`, "utf-8")
  )
  return raw
}

// ============================================================
// PDF copy
// ============================================================

function findPdfFile(stepId: number): { path: string; size: number; name: string } | null {
  const pdfsDir = `${RISEUP_DIR}/pdfs`
  if (!fs.existsSync(pdfsDir)) return null
  const files = fs.readdirSync(pdfsDir)
  const f = files.find((f) => f.includes(`_${stepId}_`))
  if (!f) return null
  const full = path.join(pdfsDir, f)
  return {
    path: full,
    size: fs.statSync(full).size,
    name: f,
  }
}

function copyPdfToPublic(stepId: number): { fileUrl: string; size: number } | null {
  const src = findPdfFile(stepId)
  if (!src) return null
  if (!fs.existsSync(PUBLIC_PDFS_DIR)) {
    fs.mkdirSync(PUBLIC_PDFS_DIR, { recursive: true })
  }
  const dst = path.join(PUBLIC_PDFS_DIR, src.name)
  if (APPLY) fs.copyFileSync(src.path, dst)
  return {
    fileUrl: `/uploads/pdfs/${src.name}`,
    size: src.size,
  }
}

// ============================================================
// Map Rise Up step type → Prisma model
// ============================================================

async function createChapterForStep(
  formationId: string,
  sectionId: string,
  step: RiseUpStep,
  order: number,
  quizDict: Record<string, any>
): Promise<{ chapterId: string; counts: { exercise: number; questions: number; choices: number; attachment: number } }> {
  const counts = { exercise: 0, questions: 0, choices: 0, attachment: 0 }
  const stepIdStr = String(step.id)
  const duration = step.duration || step.educationalTime || 0

  if (!APPLY) {
    // Dry-run : compute counts only
    if (step.type === "quiz") {
      const q = quizDict[stepIdStr]
      if (q?.questions) {
        counts.exercise = 1
        counts.questions = q.questions.length
        for (const qu of q.questions) {
          counts.choices += (qu.choices || []).length
        }
      }
    } else if (step.type === "document") {
      counts.attachment = 1
    }
    return { chapterId: "DRYRUN", counts }
  }

  const chapter = await prisma.chapter.create({
    data: {
      formationId,
      sectionId,
      title: step.title || `Étape ${order}`,
      order,
      videoDuration: step.type === "video" ? duration * 60 : 0, // RiseUp en min → Prisma en seconds
      isPublished: true,
    },
  })

  if (step.type === "quiz") {
    const q = quizDict[stepIdStr]
    if (!q?.questions) {
      console.warn(`  ⚠ Quiz step ${step.id} sans questions dans quiz-docs-clean.json`)
      return { chapterId: chapter.id, counts }
    }
    const exercise = await prisma.exercise.create({
      data: {
        chapterId: chapter.id,
        type: ExerciseType.QCM,
        title: stripHtml(q.title) || step.title,
        instructions: q.description ? stripHtml(q.description) : null,
        order: 0,
      },
    })
    counts.exercise = 1

    const questionsArr = q.questions as any[]
    for (let qIdx = 0; qIdx < questionsArr.length; qIdx++) {
      const qu = questionsArr[qIdx]
      const question = await prisma.question.create({
        data: {
          exerciseId: exercise.id,
          text: stripHtml(qu.title),
          type: ExerciseType.QCM,
          order: qIdx,
        },
      })
      counts.questions++
      for (const ch of (qu.choices || [])) {
        await prisma.choice.create({
          data: {
            questionId: question.id,
            text: stripHtml(ch.choice),
            isCorrect: !!ch.correct,
          },
        })
        counts.choices++
      }
    }
  } else if (step.type === "document") {
    const pdf = copyPdfToPublic(step.id)
    if (pdf) {
      await prisma.attachment.create({
        data: {
          chapterId: chapter.id,
          name: step.title || "Document",
          fileUrl: pdf.fileUrl,
          fileSize: pdf.size,
        },
      })
      counts.attachment = 1
    } else {
      console.warn(`  ⚠ PDF step ${step.id} : fichier introuvable dans /tmp/riseup-explore/pdfs/`)
    }
  }
  // type === 'video' : Chapter créé, videoUrl null (à remplir plus tard via Vimeo)

  return { chapterId: chapter.id, counts }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`\n${APPLY ? "🚀 APPLY MODE" : "🧪 DRY-RUN (use --apply to write)"}\n`)

  const formations = loadFormations()
  const qd = loadQuizAndDocs()

  console.log(`📚 ${formations.length} formations chargées :`)
  for (const f of formations) {
    console.log(`   ${f.id} | ${f.title} | ${f.modules.length} modules`)
  }
  console.log()

  // ─── Nuke existing data (DEV mode safety net) ───
  if (APPLY) {
    console.log("🗑  Nuke existing data...")
    await prisma.choice.deleteMany()
    await prisma.question.deleteMany()
    await prisma.exercise.deleteMany()
    await prisma.attachment.deleteMany()
    await prisma.formationAttachment.deleteMany()
    await prisma.chapter.deleteMany()
    await prisma.section.deleteMany()
    await prisma.enrollment.deleteMany()
    await prisma.formation.deleteMany()
    await prisma.user.deleteMany({ where: { role: { not: Role.SUPER_ADMIN } } })
    await prisma.partner.deleteMany()
    console.log("   ✓ Nuked\n")
  }

  // ─── Partner CNFDI ───
  let partnerId = "DRYRUN_PARTNER"
  if (APPLY) {
    const partner = await prisma.partner.create({
      data: {
        name: "CNFDI",
        slug: "cnfdi",
        primaryColor: "#111111", // placeholder, à remplacer avec couleur CNFDI réelle
        secondaryColor: "#FFFFFF",
        logoUrl: null, // placeholder
        isActive: true,
      },
    })
    partnerId = partner.id
    console.log(`✓ Partner CNFDI créé (id=${partnerId.substring(0, 8)}…)`)
  } else {
    console.log("• [DRY] Partner CNFDI")
  }

  // ─── Super-admin Samuel ───
  if (APPLY) {
    await prisma.user.upsert({
      where: { email: "admin@switching-formation.fr" },
      update: {},
      create: {
        email: "admin@switching-formation.fr",
        password: await hash("Admin1234!", 12),
        firstName: "Samuel",
        lastName: "Switching",
        role: Role.SUPER_ADMIN,
        isActive: true,
      },
    })
    console.log(`✓ Super-admin Samuel créé\n`)
  } else {
    console.log("• [DRY] Super-admin Samuel\n")
  }

  // ─── Formations + Sections + Chapters ───
  let totalSections = 0
  let totalChapters = 0
  const grandTotal = { exercise: 0, questions: 0, choices: 0, attachment: 0 }

  for (const f of formations) {
    console.log(`📚 Formation: ${f.title}`)
    let formationId = "DRYRUN_F"
    if (APPLY) {
      // Récupère la haute-définition (banner > image). Rise Up sert des images redimensionnées
      // via un proxy `images.riseup.ai/<hash>=/<W>x<H>/filters:...` — on retire le filtre pour
      // demander l'image full-size.
      const cleanCover = (url?: string) => {
        if (!url) return null
        const m = url.match(/images\.riseup\.ai\/([^/]+)=\/[^/]+\/(.+)$/)
        if (m) return `https://images.riseup.ai/${m[1]}=//${m[2]}`
        return url
      }
      const created = await prisma.formation.create({
        data: {
          title: f.title,
          description: f.description || null,
          coverImageUrl: cleanCover(f.bannerUrl || f.imageUrl),
          isPublished: true,
        },
      })
      formationId = created.id
    }

    for (let mIdx = 0; mIdx < f.modules.length; mIdx++) {
      const m = f.modules[mIdx]
      console.log(`   📁 Module ${mIdx + 1}: ${m.title.substring(0, 60)}`)
      totalSections++
      let sectionId = "DRYRUN_S"
      if (APPLY) {
        const sec = await prisma.section.create({
          data: {
            formationId,
            title: m.title,
            order: mIdx,
          },
        })
        sectionId = sec.id
      }

      for (let sIdx = 0; sIdx < m.steps.length; sIdx++) {
        const step = m.steps[sIdx]
        const { counts } = await createChapterForStep(
          formationId,
          sectionId,
          step,
          sIdx,
          qd.quiz
        )
        totalChapters++
        grandTotal.exercise += counts.exercise
        grandTotal.questions += counts.questions
        grandTotal.choices += counts.choices
        grandTotal.attachment += counts.attachment
        const tag =
          step.type === "video"
            ? "🎬"
            : step.type === "quiz"
              ? `❓×${counts.questions}`
              : "📄"
        console.log(`      ${tag} ${step.title.substring(0, 70)}`)
      }
    }
    console.log()
  }

  // ─── Learner de test enrolled sur les 3 formations (pour validation UI) ───
  if (APPLY) {
    const allFormations = await prisma.formation.findMany({ select: { id: true } })
    const learner = await prisma.user.upsert({
      where: { email: "apprenant@switching-formation.fr" },
      update: { partnerId },
      create: {
        email: "apprenant@switching-formation.fr",
        password: await hash("Apprenant1234!", 12),
        firstName: "Apprenant",
        lastName: "Demo",
        role: Role.LEARNER,
        partnerId,
        isActive: true,
      },
    })
    for (const f of allFormations) {
      await prisma.enrollment.upsert({
        where: { userId_formationId: { userId: learner.id, formationId: f.id } } as any,
        update: {},
        create: { userId: learner.id, formationId: f.id },
      }).catch(async () => {
        // Fallback si pas de @@unique([userId, formationId])
        const exists = await prisma.enrollment.findFirst({ where: { userId: learner.id, formationId: f.id } })
        if (!exists) await prisma.enrollment.create({ data: { userId: learner.id, formationId: f.id } })
      })
    }
    console.log(`✓ Learner-demo créé + enrolled sur ${allFormations.length} formations`)
    console.log(`   apprenant@switching-formation.fr / Apprenant1234!\n`)
  }


  console.log("━".repeat(70))
  console.log(`✅ ${APPLY ? "APPLIED" : "DRY-RUN"} :`)
  console.log(`   ${formations.length} formations`)
  console.log(`   ${totalSections} sections`)
  console.log(`   ${totalChapters} chapters`)
  console.log(`   ${grandTotal.exercise} exercises (QCM)`)
  console.log(`   ${grandTotal.questions} questions`)
  console.log(`   ${grandTotal.choices} choices`)
  console.log(`   ${grandTotal.attachment} attachments PDF`)
  console.log("━".repeat(70))
  if (!APPLY) {
    console.log("\n🟢 Pour APPLY : npx tsx scripts/import-riseup.ts --apply\n")
  } else {
    console.log("\n🟢 Login http://localhost:3000 → admin@switching-formation.fr / Admin1234!\n")
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
