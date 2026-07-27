#!/usr/bin/env node
/**
 * Injecte un test décrit en JSON dans la base, en une transaction.
 *
 *   node scripts/assessments/seed.mjs anglais-positionnement.json [--publish] [--dry]
 *
 * Refuse de créer un doublon : si un test du même titre existe déjà pour le
 * même organisme, il faut le supprimer ou le renommer d'abord. Sans ce garde,
 * un second passage créerait un test fantôme invisible à l'œil dans la liste.
 */
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { PrismaClient } from "@prisma/client"

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const file = resolve(here, args.find((a) => !a.startsWith("--")) || "anglais-positionnement.json")
const publish = args.includes("--publish")
const dry = args.includes("--dry")

const A = JSON.parse(readFileSync(file, "utf8"))
const prisma = new PrismaClient()

const flat = A.sections.flatMap((s) => s.questions)

/* ── Contrôle d'intégrité AVANT toute écriture ────────────────────────── */
const errors = []
flat.forEach((q, i) => {
  const n = i + 1
  if (q.type === "QCM_SINGLE" || q.type === "QCM_MULTI") {
    const good = (q.choices || []).filter((c) => c.c).length
    if (!q.choices?.length) errors.push(`Q${n} : aucun choix.`)
    if (q.points > 0 && q.type === "QCM_SINGLE" && good !== 1)
      errors.push(`Q${n} : ${good} bonne(s) réponse(s) pour un choix unique noté.`)
    if (q.points > 0 && q.type === "QCM_MULTI" && good < 1)
      errors.push(`Q${n} : aucune bonne réponse pour un QCM noté.`)
    const seen = new Set()
    for (const c of q.choices || []) {
      if (seen.has(c.t)) errors.push(`Q${n} : choix en double « ${c.t} ».`)
      seen.add(c.t)
    }
  }
  if (q.type === "ECHELLE" && (q.scaleMin == null || q.scaleMax == null))
    errors.push(`Q${n} : échelle sans bornes.`)
  if (!q.text?.trim()) errors.push(`Q${n} : énoncé vide.`)
})
if (errors.length) {
  console.error("ARRÊT — le contenu est invalide :\n" + errors.map((e) => "  · " + e).join("\n"))
  process.exit(1)
}

const maxScore = flat.reduce((n, q) => n + (q.type === "ECHELLE" ? 0 : q.points), 0)
console.log(`Contrôle OK — ${flat.length} questions, ${maxScore} points notés.`)

const partner = A.partnerSlug ? await prisma.partner.findUnique({ where: { slug: A.partnerSlug } }) : null
if (A.partnerSlug && !partner) {
  console.error(`ARRÊT — organisme « ${A.partnerSlug} » introuvable.`)
  process.exit(1)
}

const dup = await prisma.assessment.findFirst({
  where: { title: A.title, partnerId: partner?.id ?? null, deletedAt: null },
})
if (dup) {
  console.error(`ARRÊT — un test « ${A.title} » existe déjà (${dup.id}). Supprimez-le ou renommez celui-ci.`)
  process.exit(1)
}

if (dry) {
  console.log(`[dry] Créerait « ${A.title} » pour ${partner?.name ?? "aucun organisme"}, publié=${publish}.`)
  await prisma.$disconnect()
  process.exit(0)
}

const created = await prisma.$transaction(async (tx) => {
  const a = await tx.assessment.create({
    data: {
      title: A.title,
      description: A.description,
      type: A.type,
      partnerId: partner?.id ?? null,
      isPublished: publish,
      showScore: A.showScore,
      showCorrectAnswers: A.showCorrectAnswers,
      passingScore: A.passingScore ?? null,
      timeLimitMinutes: A.timeLimitMinutes ?? null,
      validityDays: A.validityDays ?? 30,
      notifyEmail: A.notifyEmail ?? null,
    },
  })
  let order = 0
  for (const q of flat) {
    const question = await tx.assessmentQuestion.create({
      data: {
        assessmentId: a.id,
        text: q.text,
        helpText: q.helpText ?? null,
        type: q.type,
        order: order++,
        points: q.points ?? 1,
        scaleMin: q.scaleMin ?? null,
        scaleMax: q.scaleMax ?? null,
        scaleMinLabel: q.scaleMinLabel ?? null,
        scaleMaxLabel: q.scaleMaxLabel ?? null,
      },
    })
    if (q.choices?.length) {
      await tx.assessmentChoice.createMany({
        data: q.choices.map((c, i) => ({
          questionId: question.id,
          text: c.t,
          isCorrect: !!c.c,
          order: i,
        })),
      })
    }
  }
  return a
})

const check = await prisma.assessment.findUnique({
  where: { id: created.id },
  include: { questions: { include: { choices: true } }, partner: true },
})
const choices = check.questions.reduce((n, q) => n + q.choices.length, 0)
console.log(
  `CRÉÉ ${check.id} — « ${check.title} » · organisme ${check.partner?.name ?? "—"} · ` +
    `${check.questions.length} questions · ${choices} choix · publié=${check.isPublished}`
)
await prisma.$disconnect()
