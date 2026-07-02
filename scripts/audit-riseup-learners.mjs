#!/usr/bin/env node

import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import { PrismaClient } from "@prisma/client"

const HELP = `
Audit dry-run d'un export apprenants RiseUp.

Usage:
  node scripts/audit-riseup-learners.mjs --input /path/export.csv
  node scripts/audit-riseup-learners.mjs --input /path/export.json --out generated/riseup-migration-audit

Le script ne fait aucune ecriture en base.
`

function parseArgs(argv) {
  const out = { out: "generated/riseup-migration-audit", partner: "cnfdi" }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") out.help = true
    else if (arg === "--input") out.input = argv[++i]
    else if (arg === "--out") out.out = argv[++i]
    else if (arg === "--partner") out.partner = argv[++i]
    else throw new Error(`Argument inconnu: ${arg}`)
  }
  return out
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '"' && inQuotes && next === '"') {
      cell += '"'
      i++
    } else if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      row.push(cell)
      cell = ""
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++
      row.push(cell)
      if (row.some((v) => v.trim() !== "")) rows.push(row)
      row = []
      cell = ""
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some((v) => v.trim() !== "")) rows.push(row)
  if (rows.length === 0) return []

  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((values, index) => {
    const obj = { __row: index + 2 }
    headers.forEach((header, i) => {
      obj[header || `column_${i + 1}`] = (values[i] || "").trim()
    })
    return obj
  })
}

function extractJsonRows(value) {
  if (Array.isArray(value)) return value
  for (const key of ["rows", "data", "items", "learners", "users", "results"]) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  throw new Error("JSON non reconnu: attendu un tableau ou une cle rows/data/items/learners/users/results.")
}

async function loadRows(input) {
  const text = await fsp.readFile(input, "utf8")
  if (/\.json$/i.test(input)) return extractJsonRows(JSON.parse(text))
  return parseCsv(text)
}

function keyOf(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
}

function get(row, aliases) {
  const wanted = new Set(aliases.map(keyOf))
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(keyOf(k)) && v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim()
    }
  }
  return ""
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

function parsePercent(value) {
  if (value === undefined || value === null || value === "") return null
  const raw = String(value).replace(",", ".")
  const match = raw.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const num = Number(match[0])
  if (!Number.isFinite(num)) return null
  if (num < 0) return 0
  if (num > 100) return 100
  return num
}

function parseDateOrNull(value) {
  if (!value) return null
  const raw = String(value).trim()
  const fr = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const iso = fr ? `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}` : raw
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function formationCodeFromTitle(title) {
  const n = normalizeText(title)
  if (/\bvba\b/.test(n) || n.includes("visual basic")) return "VBA"
  if (/\bseo\b/.test(n) || n.includes("search engine optimization")) return "SEO"
  if (/\bsea\b/.test(n) || n.includes("search engine advertising")) return "SEA"
  return null
}

function isCompletedStatus(status, progress) {
  const n = normalizeText(status)
  if (progress !== null && progress >= 100) return true
  return /(termine|terminee|completed|complete|finished|finish|acheve|achevee|done|reussi|valide)/.test(n)
}

function isInProgressStatus(status, progress) {
  const n = normalizeText(status)
  if (progress !== null && progress > 0 && progress < 100) return true
  return /(en cours|started|commence|commencee|progress|active|actif|opened|inscrit)/.test(n)
}

function getCanonical(row) {
  const firstName = get(row, ["first_name", "firstname", "firstName", "prenom", "prénom"])
  const lastName = get(row, ["last_name", "lastname", "lastName", "nom", "name"])
  const fullName = get(row, ["full_name", "fullname", "fullName", "nom complet", "apprenant", "learner"])
  const email = get(row, ["email", "mail", "e-mail", "learner_email", "user_email", "adresse email"]).toLowerCase()
  const formationTitle = get(row, ["formation", "training", "training_title", "course", "course_title", "parcours", "module"])
  const status = get(row, ["status", "statut", "etat", "état", "training_status", "enrollment_status"])
  const progressRaw = get(row, ["progress", "progression", "progress_percent", "pourcentage", "%", "completion", "completion_rate"])
  const chapterTitle = get(row, ["chapter", "chapter_title", "lesson", "lesson_title", "step", "step_title", "lecon", "leçon", "titre lecon"])
  const chapterStatus = get(row, ["chapter_status", "lesson_status", "step_status", "statut lecon", "statut leçon"])
  const chapterProgressRaw = get(row, ["chapter_progress", "lesson_progress", "step_progress", "progression lecon", "progression leçon"])

  return {
    sourceRow: row.__row || null,
    sourceUserId: get(row, ["id", "user_id", "learner_id", "riseup_id", "source_user_id"]),
    email,
    firstName,
    lastName,
    fullName,
    formationTitle,
    formationCode: formationCodeFromTitle(formationTitle),
    status,
    progressPercent: parsePercent(progressRaw),
    startedAt: parseDateOrNull(get(row, ["started_at", "start_date", "date_debut", "date début", "debut", "début"])),
    expiresAt: parseDateOrNull(get(row, ["expires_at", "end_date", "date_fin", "date fin", "fin", "deadline"])),
    chapterTitle,
    chapterStatus,
    chapterProgressPercent: parsePercent(chapterProgressRaw),
  }
}

function splitFullName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] }
}

function matchChapter(chapterTitle, chapters) {
  const n = normalizeText(chapterTitle)
  if (!n) return null
  let found = chapters.find((c) => normalizeText(c.title) === n)
  if (found) return found
  found = chapters.find((c) => normalizeText(c.title).includes(n) || n.includes(normalizeText(c.title)))
  return found || null
}

async function main() {
  loadDotenv()
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.input) {
    console.log(HELP.trim())
    process.exit(args.help ? 0 : 1)
  }

  const inputPath = path.resolve(args.input)
  const rows = await loadRows(inputPath)
  if (rows.length === 0) throw new Error("Export vide.")

  const prisma = new PrismaClient()
  const formations = await prisma.formation.findMany({
    where: { deletedAt: null },
    include: {
      sections: true,
      chapters: { include: { section: true } },
    },
  })
  const partner = await prisma.partner.findUnique({ where: { slug: args.partner } })

  const formationByCode = new Map()
  for (const formation of formations) {
    const code = formationCodeFromTitle(formation.title)
    if (!code) continue
    const chapters = formation.chapters
      .slice()
      .sort((a, b) => {
        const sa = a.section?.order ?? 0
        const sb = b.section?.order ?? 0
        return sa === sb ? a.order - b.order : sa - sb
      })
    formationByCode.set(code, { ...formation, chapters })
  }

  const canonicalRows = rows.map(getCanonical)
  const groups = new Map()
  for (const row of canonicalRows) {
    const key = `${row.email || `missing-email-${row.sourceRow}`}|${row.formationCode || row.formationTitle || "missing-formation"}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const emails = [...new Set(canonicalRows.map((r) => r.email).filter(Boolean))]
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: emails } },
    include: { partner: true, enrollments: { include: { formation: true } } },
  })
  const existingByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]))

  const candidates = []
  const excluded = []
  const blockingIssues = []
  const warnings = []

  for (const [groupKey, groupRows] of groups.entries()) {
    const base = groupRows[0]
    const names = splitFullName(base.fullName)
    const firstName = base.firstName || names.firstName
    const lastName = base.lastName || names.lastName
    const progressValues = groupRows.map((r) => r.progressPercent).filter((v) => v !== null)
    const progressPercent = progressValues.length ? Math.max(...progressValues) : null
    const status = groupRows.map((r) => r.status).find(Boolean) || ""
    const formation = base.formationCode ? formationByCode.get(base.formationCode) : null
    const existing = base.email ? existingByEmail.get(base.email) : null

    const record = {
      key: groupKey,
      sourceRows: groupRows.map((r) => r.sourceRow).filter(Boolean),
      sourceUserId: base.sourceUserId || null,
      email: base.email,
      firstName,
      lastName,
      formationTitle: base.formationTitle,
      formationCode: base.formationCode,
      status,
      progressPercent,
      startedAt: base.startedAt,
      expiresAt: base.expiresAt,
      existingUser: existing
        ? {
            id: existing.id,
            role: existing.role,
            partnerSlug: existing.partner?.slug || null,
            enrollmentTitles: existing.enrollments.map((e) => e.formation.title),
          }
        : null,
      precision: "unknown",
      target: null,
      issues: [],
      warnings: [],
    }

    if (!base.email) record.issues.push("email manquant")
    if (!firstName || !lastName) record.warnings.push("prenom/nom incomplet")
    if (!base.formationCode || !formation) record.issues.push("formation non reconnue")
    if (!status && progressPercent === null) record.issues.push("statut/progression absents")

    if (isCompletedStatus(status, progressPercent)) {
      excluded.push({ ...record, excludeReason: "formation terminee ou progression 100%" })
      continue
    }

    if (!isInProgressStatus(status, progressPercent)) {
      record.warnings.push("statut non explicitement en cours: verification humaine requise")
    }

    if (formation) {
      const detailRows = groupRows.filter((r) => r.chapterTitle)
      const completedChapterIds = new Set()
      const unmatchedChapterTitles = []

      if (detailRows.length > 0) {
        for (const detail of detailRows) {
          const chapter = matchChapter(detail.chapterTitle, formation.chapters)
          if (!chapter) {
            unmatchedChapterTitles.push(detail.chapterTitle)
            continue
          }
          if (isCompletedStatus(detail.chapterStatus, detail.chapterProgressPercent)) {
            completedChapterIds.add(chapter.id)
          }
        }
        record.precision = "chapter_detail"
        record.target = {
          formationId: formation.id,
          formationTitle: formation.title,
          totalChapters: formation.chapters.length,
          completedChapters: completedChapterIds.size,
          completionStrategy: "detail lecon RiseUp",
        }
        if (unmatchedChapterTitles.length > 0) {
          record.warnings.push(`${unmatchedChapterTitles.length} lecons RiseUp non matchees`)
        }
      } else if (progressPercent !== null) {
        const completedCount = Math.min(
          formation.chapters.length,
          Math.max(0, Math.round((formation.chapters.length * progressPercent) / 100))
        )
        record.precision = "coarse_percent"
        record.target = {
          formationId: formation.id,
          formationTitle: formation.title,
          totalChapters: formation.chapters.length,
          completedChapters: completedCount,
          completionStrategy: "approximation par pourcentage global",
        }
        record.warnings.push("progression approximee: l'export ne contient pas le detail par lecon")
      }
    }

    if (record.issues.length > 0) blockingIssues.push(record)
    else {
      if (record.warnings.length > 0) warnings.push(record)
      candidates.push(record)
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    input: inputPath,
    partner: partner ? { id: partner.id, name: partner.name, slug: partner.slug } : null,
    totals: {
      sourceRows: rows.length,
      groupedEnrollments: groups.size,
      candidates: candidates.length,
      excluded: excluded.length,
      blockingIssues: blockingIssues.length,
      warnings: warnings.length,
    },
    formationTargets: [...formationByCode.entries()].map(([code, f]) => ({
      code,
      id: f.id,
      title: f.title,
      chapters: f.chapters.length,
    })),
    candidates,
    excluded,
    blockingIssues,
    warnings,
  }

  await fsp.mkdir(args.out, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const jsonPath = path.join(args.out, `riseup-audit-${stamp}.json`)
  const mdPath = path.join(args.out, `riseup-audit-${stamp}.md`)
  await fsp.writeFile(jsonPath, JSON.stringify(report, null, 2))
  await fsp.writeFile(mdPath, renderMarkdown(report))

  console.log(`Audit termine.`)
  console.log(`JSON: ${jsonPath}`)
  console.log(`MD:   ${mdPath}`)
  console.log(
    `Candidats=${report.totals.candidates} · Exclus=${report.totals.excluded} · Blocages=${report.totals.blockingIssues} · Alertes=${report.totals.warnings}`
  )

  await prisma.$disconnect()
}

function renderMarkdown(report) {
  const lines = []
  lines.push("# Audit RiseUp learners")
  lines.push("")
  lines.push(`Genere: ${report.generatedAt}`)
  lines.push(`Input: ${report.input}`)
  lines.push(`Partenaire cible: ${report.partner?.name || "introuvable"}`)
  lines.push("")
  lines.push("## Synthese")
  lines.push("")
  lines.push(`- Lignes source: ${report.totals.sourceRows}`)
  lines.push(`- Inscriptions groupees: ${report.totals.groupedEnrollments}`)
  lines.push(`- Candidats a migrer: ${report.totals.candidates}`)
  lines.push(`- Exclus termines: ${report.totals.excluded}`)
  lines.push(`- Blocages: ${report.totals.blockingIssues}`)
  lines.push(`- Alertes: ${report.totals.warnings}`)
  lines.push("")
  lines.push("## Formations cibles")
  lines.push("")
  for (const f of report.formationTargets) {
    lines.push(`- ${f.code}: ${f.title} (${f.chapters} chapitres)`)
  }
  lines.push("")

  if (report.blockingIssues.length > 0) {
    lines.push("## Blocages")
    lines.push("")
    for (const item of report.blockingIssues.slice(0, 50)) {
      lines.push(`- ${item.email || "(email manquant)"} / ${item.formationTitle || "(formation manquante)"}: ${item.issues.join("; ")}`)
    }
    lines.push("")
  }

  lines.push("## Candidats")
  lines.push("")
  for (const item of report.candidates.slice(0, 100)) {
    const target = item.target
      ? `${item.target.completedChapters}/${item.target.totalChapters} chapitres (${item.precision})`
      : `progression non calculee (${item.precision})`
    const existing = item.existingUser ? " · compte LMS existant" : ""
    const warn = item.warnings.length ? ` · alertes: ${item.warnings.join("; ")}` : ""
    lines.push(`- ${item.email} · ${item.formationCode || "?"} · ${target}${existing}${warn}`)
  }
  if (report.candidates.length > 100) lines.push(`- ... ${report.candidates.length - 100} candidats supplementaires dans le JSON`)
  lines.push("")

  lines.push("## Exclus")
  lines.push("")
  for (const item of report.excluded.slice(0, 100)) {
    lines.push(`- ${item.email || "(email manquant)"} · ${item.formationCode || "?"} · ${item.excludeReason}`)
  }
  if (report.excluded.length > 100) lines.push(`- ... ${report.excluded.length - 100} exclus supplementaires dans le JSON`)
  lines.push("")
  return `${lines.join("\n")}\n`
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
