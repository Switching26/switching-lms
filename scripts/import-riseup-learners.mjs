#!/usr/bin/env node

import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import crypto from "crypto"
import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"

const HELP = `
Import silencieux des apprenants RiseUp vers Switching LMS.

Usage:
  node scripts/import-riseup-learners.mjs --audit generated/riseup-migration-audit/riseup-audit-xxx.json --details generated/riseup-exports/course-registration-progress-details.json --sample-per-formation 1
  node scripts/import-riseup-learners.mjs --audit generated/riseup-migration-audit/riseup-audit-xxx.json --details generated/riseup-exports/course-registration-progress-details.json --subscription-ids 60983235,45485791 --apply --confirm IMPORT_RISEUP_NO_EMAIL

Par defaut, le script est un dry-run et ne fait aucune ecriture.
En mode --apply, aucun email n'est envoye et aucun token d'activation n'est genere.
`

function parseArgs(argv) {
  const args = {
    out: "generated/riseup-import-test",
    partner: "cnfdi",
    apply: false,
    includeExisting: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") args.help = true
    else if (arg === "--audit") args.audit = argv[++i]
    else if (arg === "--details") args.details = argv[++i]
    else if (arg === "--out") args.out = argv[++i]
    else if (arg === "--partner") args.partner = argv[++i]
    else if (arg === "--limit") args.limit = Number(argv[++i])
    else if (arg === "--sample-per-formation") args.samplePerFormation = Number(argv[++i])
    else if (arg === "--subscription-ids") args.subscriptionIds = argv[++i].split(",").map((v) => v.trim()).filter(Boolean)
    else if (arg === "--emails") args.emails = argv[++i].split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
    else if (arg === "--apply") args.apply = true
    else if (arg === "--confirm") args.confirm = argv[++i]
    else if (arg === "--include-existing") args.includeExisting = true
    else throw new Error(`Argument inconnu: ${arg}`)
  }
  return args
}

function loadDotenv() {
  const envPath = path.resolve(process.cwd(), ".env")
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"))
}

function loadDetails(file) {
  if (!file) return new Map()
  const parsed = loadJson(file)
  const rows = Array.isArray(parsed) ? parsed : parsed.data || parsed.rows || []
  return new Map(rows.map((row) => [String(row.subscriptionId ?? row.trainingSubscriptionId ?? row.id), row]))
}

function sortChapters(chapters) {
  return chapters.slice().sort((a, b) => {
    const sa = a.section?.order ?? 0
    const sb = b.section?.order ?? 0
    return sa === sb ? a.order - b.order : sa - sb
  })
}

function matchChapter(title, chapters) {
  const n = normalizeText(title)
  if (!n) return null
  let found = chapters.find((chapter) => normalizeText(chapter.title) === n)
  if (found) return found
  found = chapters.find((chapter) => {
    const c = normalizeText(chapter.title)
    return c.includes(n) || n.includes(c)
  })
  return found || null
}

function completedStepRows(detail) {
  const modules = Array.isArray(detail?.progression?.data) ? detail.progression.data : []
  const rows = []
  for (const module of modules) {
    for (const step of module.steps || []) {
      if (normalizeText(step.state) !== "success") continue
      rows.push({
        title: step.title || "",
        sourceStepId: step.id || null,
        totalTime: Number(step.totalTime || 0),
      })
    }
  }
  return rows
}

function candidateScore(candidate) {
  const detail = candidate.precision === "riseup_step_detail" ? 1000 : 0
  return detail + Number(candidate.progressPercent || 0)
}

function selectCandidates(candidates, args) {
  let selected = candidates.filter((candidate) => candidate.email && candidate.target)
  if (!args.includeExisting) selected = selected.filter((candidate) => !candidate.existingUser)

  if (args.subscriptionIds?.length) {
    const ids = new Set(args.subscriptionIds.map(String))
    selected = selected.filter((candidate) => ids.has(String(candidate.sourceSubscriptionId)))
  } else if (args.emails?.length) {
    const emails = new Set(args.emails)
    selected = selected.filter((candidate) => emails.has(candidate.email))
  } else if (args.samplePerFormation) {
    const perFormation = new Map()
    for (const candidate of selected.slice().sort((a, b) => candidateScore(b) - candidateScore(a))) {
      const list = perFormation.get(candidate.formationCode) || []
      if (list.length < args.samplePerFormation) {
        list.push(candidate)
        perFormation.set(candidate.formationCode, list)
      }
    }
    selected = ["SEO", "SEA", "VBA"].flatMap((code) => perFormation.get(code) || [])
  } else {
    selected = selected.slice().sort((a, b) => candidateScore(b) - candidateScore(a))
  }

  if (args.limit) selected = selected.slice(0, args.limit)
  return selected
}

function buildReference(candidate) {
  const sourceUserId = candidate.sourceUserId || candidate.sourceSubscriptionId || crypto.randomBytes(4).toString("hex")
  return `RISEUP-${sourceUserId}`
}

async function planCandidate(prisma, partner, candidate, detailsBySubscriptionId) {
  const user = await prisma.user.findUnique({
    where: { email: candidate.email },
    include: { enrollments: true },
  })
  const formation = await prisma.formation.findUnique({
    where: { id: candidate.target.formationId },
    include: { chapters: { include: { section: true } } },
  })
  if (!formation) throw new Error(`Formation introuvable: ${candidate.target.formationId}`)

  const chapters = sortChapters(formation.chapters)
  const detail = detailsBySubscriptionId.get(String(candidate.sourceSubscriptionId))
  const completedRows = candidate.precision === "riseup_step_detail" ? completedStepRows(detail) : []
  const completedChapters = []
  const unmatchedSteps = []

  for (const row of completedRows) {
    const chapter = matchChapter(row.title, chapters)
    if (!chapter) {
      unmatchedSteps.push(row.title)
      continue
    }
    completedChapters.push({ chapterId: chapter.id, title: chapter.title, timeSpentSeconds: row.totalTime })
  }

  const existingEnrollment = user?.enrollments.find((enrollment) => enrollment.formationId === formation.id) || null
  const license = await prisma.license.findUnique({
    where: { partnerId_formationId: { partnerId: partner.id, formationId: formation.id } },
  })

  const blockers = []
  const warnings = []
  if (user && user.role !== "LEARNER") blockers.push("email deja utilise par un compte non apprenant")
  if (user?.partnerId && user.partnerId !== partner.id) blockers.push("compte existant rattache a un autre partenaire")
  if (!license) warnings.push("aucune licence CNFDI configuree pour cette formation")
  if (unmatchedSteps.length > 0) warnings.push(`${unmatchedSteps.length} etapes RiseUp terminees non matchees`)

  return {
    sourceSubscriptionId: candidate.sourceSubscriptionId,
    email: candidate.email,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    formationCode: candidate.formationCode,
    formationId: formation.id,
    formationTitle: formation.title,
    progressPercent: candidate.progressPercent,
    precision: candidate.precision,
    userAction: user ? "reuse_existing_user" : "create_inactive_user",
    enrollmentAction: existingEnrollment ? "keep_existing_enrollment" : "create_enrollment",
    progressAction: `mark_${completedChapters.length}_chapters_completed`,
    completedChapters: completedChapters.length,
    totalChapters: chapters.length,
    startedAt: candidate.startedAt,
    expiresAt: candidate.expiresAt,
    blockers,
    warnings,
    completedChapterRows: completedChapters,
  }
}

async function applyPlan(prisma, partner, plan) {
  if (plan.blockers.length > 0) return { ...plan, applied: false, skippedReason: plan.blockers.join("; ") }

  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: plan.email } })
    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString("hex")
      user = await tx.user.create({
        data: {
          email: plan.email,
          firstName: plan.firstName || "Apprenant",
          lastName: plan.lastName || "RiseUp",
          password: await hash(randomPassword, 12),
          role: "LEARNER",
          partnerId: partner.id,
          isActive: false,
          reference: buildReference(plan),
        },
      })
    }

    const existingEnrollment = await tx.enrollment.findUnique({
      where: { userId_formationId: { userId: user.id, formationId: plan.formationId } },
    })
    if (!existingEnrollment) {
      await tx.enrollment.create({
        data: {
          userId: user.id,
          formationId: plan.formationId,
          startedAt: plan.startedAt ? new Date(plan.startedAt) : new Date(),
          expiresAt: plan.expiresAt ? new Date(plan.expiresAt) : null,
          assignedByPartnerId: partner.id,
        },
      })
      const license = await tx.license.findUnique({
        where: { partnerId_formationId: { partnerId: partner.id, formationId: plan.formationId } },
      })
      if (license) {
        await tx.license.update({ where: { id: license.id }, data: { usedSeats: { increment: 1 } } })
      }
    }

    const completedAt = new Date()
    for (const chapter of plan.completedChapterRows) {
      await tx.progress.upsert({
        where: { userId_chapterId: { userId: user.id, chapterId: chapter.chapterId } },
        update: {
          completedAt,
          timeSpentSeconds: Math.max(0, chapter.timeSpentSeconds || 0),
        },
        create: {
          userId: user.id,
          chapterId: chapter.chapterId,
          completedAt,
          timeSpentSeconds: Math.max(0, chapter.timeSpentSeconds || 0),
          sessionCount: 1,
        },
      })
    }

    return { ...plan, applied: true, userId: user.id }
  })
}

function renderMarkdown(report) {
  const lines = []
  lines.push("# Import RiseUp silencieux")
  lines.push("")
  lines.push(`Genere: ${report.generatedAt}`)
  lines.push(`Mode: ${report.apply ? "apply" : "dry-run"}`)
  lines.push(`Emails envoyes: ${report.emailsSent}`)
  lines.push("")
  lines.push("## Synthese")
  lines.push("")
  lines.push(`- Selection: ${report.totals.selected}`)
  lines.push(`- Applicables: ${report.totals.applicable}`)
  lines.push(`- Bloques: ${report.totals.blocked}`)
  lines.push(`- Appliques: ${report.totals.applied}`)
  lines.push("")
  lines.push("## Selection")
  lines.push("")
  for (const item of report.items) {
    const status = item.blockers.length ? `BLOQUE: ${item.blockers.join("; ")}` : "OK"
    const warn = item.warnings.length ? ` · alertes: ${item.warnings.join("; ")}` : ""
    lines.push(`- ${item.email} · ${item.formationCode} · ${item.completedChapters}/${item.totalChapters} chapitres · ${item.userAction} · ${item.enrollmentAction} · ${status}${warn}`)
  }
  lines.push("")
  return `${lines.join("\n")}\n`
}

async function main() {
  loadDotenv()
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.audit) {
    console.log(HELP.trim())
    process.exit(args.help ? 0 : 1)
  }
  if (args.apply && args.confirm !== "IMPORT_RISEUP_NO_EMAIL") {
    throw new Error("Mode apply refuse: ajouter --confirm IMPORT_RISEUP_NO_EMAIL")
  }

  const audit = loadJson(args.audit)
  const detailsBySubscriptionId = loadDetails(args.details)
  const selected = selectCandidates(audit.candidates || [], args)
  if (selected.length === 0) throw new Error("Aucun candidat selectionne.")

  const prisma = new PrismaClient()
  try {
    const partner = await prisma.partner.findUnique({ where: { slug: args.partner } })
    if (!partner) throw new Error(`Partenaire introuvable: ${args.partner}`)

    const planned = []
    for (const candidate of selected) {
      planned.push(await planCandidate(prisma, partner, candidate, detailsBySubscriptionId))
    }

    const items = []
    for (const plan of planned) {
      items.push(args.apply ? await applyPlan(prisma, partner, plan) : plan)
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    await fsp.mkdir(args.out, { recursive: true })
    const report = {
      generatedAt: new Date().toISOString(),
      apply: args.apply,
      emailsSent: 0,
      audit: path.resolve(args.audit),
      details: args.details ? path.resolve(args.details) : null,
      partner: { id: partner.id, name: partner.name, slug: partner.slug },
      totals: {
        selected: items.length,
        applicable: items.filter((item) => item.blockers.length === 0).length,
        blocked: items.filter((item) => item.blockers.length > 0).length,
        applied: items.filter((item) => item.applied).length,
      },
      items,
    }
    const jsonPath = path.join(args.out, `riseup-import-${stamp}.json`)
    const mdPath = path.join(args.out, `riseup-import-${stamp}.md`)
    await fsp.writeFile(jsonPath, JSON.stringify(report, null, 2))
    await fsp.writeFile(mdPath, renderMarkdown(report))

    console.log(`Import ${args.apply ? "apply" : "dry-run"} termine.`)
    console.log(`JSON: ${jsonPath}`)
    console.log(`MD:   ${mdPath}`)
    console.log(`Selection=${report.totals.selected} · Applicables=${report.totals.applicable} · Bloques=${report.totals.blocked} · Appliques=${report.totals.applied} · Emails=0`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
