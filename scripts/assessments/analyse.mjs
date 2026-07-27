#!/usr/bin/env node
/**
 * Diagnostic de niveau d'un candidat, à partir de ses réponses réelles.
 *
 *   node scripts/assessments/analyse.mjs <email | id d'invitation>
 *
 * Le score brut ne suffit pas à placer quelqu'un : un candidat qui bâcle sort
 * « A1 » alors qu'il peut être B2. On croise donc le score, le PROFIL de
 * réussite par niveau, la durée de passage et les productions écrites — et on
 * refuse de conclure quand les signaux disent que le test n'est pas sincère.
 */
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { PrismaClient } from "@prisma/client"

const here = dirname(fileURLToPath(import.meta.url))
const who = process.argv[2]
if (!who) {
  console.error("usage: analyse.mjs <email | invitationId>")
  process.exit(1)
}
const prisma = new PrismaClient()

const inv = await prisma.assessmentInvitation.findFirst({
  where: { OR: [{ candidateEmail: who }, { id: who }], submittedAt: { not: null } },
  orderBy: { submittedAt: "desc" },
  include: {
    assessment: { select: { title: true } },
    answers: { include: { question: { include: { choices: true } } } },
  },
})
if (!inv) {
  console.error(`Aucun test terminé trouvé pour « ${who} ».`)
  process.exit(1)
}

// Le niveau CECRL de chaque question vit dans le JSON source, pas en base.
const src = JSON.parse(readFileSync(resolve(here, "anglais-positionnement.json"), "utf8"))
const levelOf = {}
for (const s of src.sections) for (const q of s.questions) levelOf[q.text] = q.level
const bands = src.levelBands

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
const per = Object.fromEntries(LEVELS.map((l) => [l, { ok: 0, total: 0 }]))
const written = []
let blank = 0

for (const a of inv.answers.sort((x, y) => x.question.order - y.question.order)) {
  const q = a.question
  if (q.type === "TEXTE") {
    written.push({ prompt: q.text, answer: (a.responseText || "").trim() })
    continue
  }
  const lvl = levelOf[q.text]
  if (!per[lvl]) continue
  per[lvl].total++
  if (a.isCorrect) per[lvl].ok++
  if (!a.selectedChoiceIds.length) blank++
}

const score = inv.score ?? 0
const max = inv.maxScore ?? 0
const percent = max ? Math.round((score / max) * 100) : 0
const band = bands.find((b) => score >= b.min && score <= b.max)

const durationSec =
  inv.startedAt && inv.submittedAt ? Math.round((inv.submittedAt - inv.startedAt) / 1000) : null
const questionCount = inv.answers.length

/* ── Signaux de fiabilité ─────────────────────────────────────────────── */
const alerts = []
// 4 choix par question ⇒ le pur hasard rapporte ~25 %. En dessous, le candidat
// n'a pas lu : soit il a cliqué au hasard, soit il a abandonné.
if (percent <= 27) alerts.push(`score de ${percent} % ≤ au hasard pur (~25 % avec 4 choix)`)
if (durationSec !== null && durationSec < questionCount * 8)
  alerts.push(
    `${durationSec} s pour ${questionCount} questions (${(durationSec / questionCount).toFixed(1)} s/question) : trop rapide pour avoir lu`
  )
const bad = written.filter((w) => w.answer.replace(/\s/g, "").length < 25)
if (bad.length) alerts.push(`${bad.length}/${written.length} rédaction(s) vide(s) ou non exploitable(s)`)

// Un vrai niveau produit un dégradé : bon en A1/A2, décroissant vers C1/C2.
// Un profil plat signe une réponse au hasard.
const rates = LEVELS.filter((l) => per[l].total).map((l) => per[l].ok / per[l].total)
const low = rates.filter((r) => r <= 0.5).length
if (rates.length && low === rates.length)
  alerts.push("aucun niveau au-dessus de 50 %, y compris A1 : pas de dégradé exploitable")

console.log(`\n${inv.candidateFirstName ?? ""} ${inv.candidateLastName ?? ""} <${inv.candidateEmail}>`)
console.log(`${inv.assessment.title}`)
console.log(`Rendu le ${inv.submittedAt.toLocaleString("fr-FR")}${durationSec !== null ? ` · durée ${durationSec} s` : ""}`)
console.log(`\nScore : ${score}/${max} (${percent} %)`)
console.log("\nRéussite par niveau :")
for (const l of LEVELS) {
  if (!per[l].total) continue
  const r = Math.round((per[l].ok / per[l].total) * 100)
  const bar = "█".repeat(Math.round(r / 10)).padEnd(10, "·")
  console.log(`  ${l}  ${bar}  ${per[l].ok}/${per[l].total}  (${r} %)`)
}
if (blank) console.log(`\n${blank} question(s) sans réponse cochée.`)

console.log("\nProductions écrites :")
for (const w of written) {
  console.log(`  • ${w.prompt.slice(0, 62)}…`)
  console.log(`    « ${w.answer || "(vide)"} »  [${w.answer.split(/\s+/).filter(Boolean).length} mots]`)
}

if (alerts.length) {
  console.log("\n⚠ TEST NON EXPLOITABLE :")
  for (const a of alerts) console.log(`  · ${a}`)
  console.log("\nVerdict : niveau NON déterminable. Ne pas retenir le score.")
  console.log("Action : renvoyer une invitation en expliquant que le test doit être passé sérieusement.")
} else {
  console.log(`\nNiveau : ${band?.level} — ${band?.label}`)
  console.log(`Orientation : ${band?.parcours}`)
  console.log(
    "\nÀ confirmer à la lecture des rédactions ci-dessus : elles seules départagent B1/B2 et C1/C2."
  )
}
await prisma.$disconnect()
