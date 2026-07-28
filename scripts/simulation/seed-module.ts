/**
 * Injecte des scénarios de simulation dans le LMS : formation → sections →
 * chapitres → simulations.
 *
 * DRY-RUN PAR DÉFAUT. Rien n'est écrit sans `--apply --confirm SEED_SIMULATION`.
 * C'est la règle de la maison sur toute mutation de la base de production, et
 * elle est d'autant plus justifiée ici : la formation Excel visée compte à terme
 * plusieurs centaines de chapitres.
 *
 *   # Contrôle, aucune écriture
 *   DATABASE_URL="$(cat ~/switching-lms-backups/.db-url)" \
 *     npx ts-node --compiler-options '{"module":"commonjs","target":"ES2020","esModuleInterop":true,"skipLibCheck":true}' \
 *     scripts/simulation/seed-module.ts scripts/simulation/scenarios/m06-*.json
 *
 *   # Écriture réelle, après GO
 *   … seed-module.ts --apply --confirm SEED_SIMULATION --publish scripts/…/m06-*.json
 *
 * IDEMPOTENT : un chapitre est reconnu par (formation, section, titre). Relancer
 * met à jour le scénario au lieu de créer un doublon — indispensable quand on
 * corrige une leçon déjà injectée.
 */

import * as fs from "fs"
import * as path from "path"
import { PrismaClient } from "@prisma/client"
import type { SimulationScenario } from "../../lib/simulation/types"

const prisma = new PrismaClient()

/** Titre de la formation cible. Un seul endroit à changer. */
const FORMATION_TITLE = "Excel — Du débutant à l'avancé"
const FORMATION_DESCRIPTION =
  "Formation Excel interactive : vous travaillez dans un vrai classeur, pas devant une vidéo. Chaque leçon se termine par un exercice où vous refaites seul ce que vous venez d'apprendre."

/** Ordre et libellé des modules, repris du programme de référence. */
const MODULE_TITLES: Record<number, string> = {
  1: "Prise en main",
  2: "Saisie des données",
  3: "Sélectionner une cellule, une plage de cellules",
  4: "Les lignes et les colonnes",
  5: "Les différents formats",
  6: "Calculs simples",
  7: "Les fonctions courantes",
  8: "Mise en forme",
  9: "Premières applications",
  10: "Fonctions avancées",
  11: "Mise en forme conditionnelle",
  12: "Saisie semi-automatique et import de données",
  13: "Mise en page et impression",
  14: "Noms de cellules",
  15: "Gestion des feuilles et liaisons entre feuilles",
  16: "Applications pratiques",
  17: "Présenter les données en graphiques",
  18: "Manipuler les séries de données",
  19: "Tri, filtre et sous-totaux",
  20: "Tableaux croisés dynamiques",
  21: "Validation et protection des données",
  22: "Consolidation des données",
  23: "Analyses et simulations",
  24: "Images et dessins",
  25: "Outils divers",
  26: "Import, export, échanges de données",
  27: "Les Macros",
}

type Parsed = {
  file: string
  moduleNumber: number
  /**
   * L = leçon, E = exercice, V = évaluation (« S'évaluer »). L'ordre du parcours
   * est celui-là : on montre, on fait faire, puis on note.
   */
  kind: "L" | "E" | "V"
  index: number
  scenario: SimulationScenario
}

/** `m06-l03.json` → module 6, leçon 3 ; `m17-ev01.json` → module 17, évaluation 1. */
function parseFileName(file: string): { moduleNumber: number; kind: "L" | "E" | "V"; index: number } | null {
  // `ev` avant `[le]` dans l'alternative : sinon `ev01` serait lu comme un `e`
  // suivi de `v01`, qui n'est pas un nombre — le fichier serait rejeté.
  const m = /m(\d{2})-(ev|[le])(\d{2})\.json$/i.exec(path.basename(file))
  if (!m) return null
  const genre = m[2].toLowerCase()
  return {
    moduleNumber: parseInt(m[1], 10),
    kind: genre === "ev" ? "V" : (genre.toUpperCase() as "L" | "E"),
    index: parseInt(m[3], 10),
  }
}

/**
 * Ordre du chapitre dans sa section : les leçons d'abord, puis les exercices,
 * chacun dans son ordre de numérotation. On garde des paliers de 100 pour pouvoir
 * insérer plus tard sans tout renuméroter.
 */
function chapterOrder(p: Parsed): number {
  return (p.kind === "L" ? 100 : p.kind === "E" ? 200 : 300) + p.index
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes("--apply")
  const confirmed = args.includes("--confirm") && args[args.indexOf("--confirm") + 1] === "SEED_SIMULATION"
  const publish = args.includes("--publish")
  const files = args.filter((a) => a.endsWith(".json"))

  if (files.length === 0) {
    console.error("Usage : seed-module.ts [--apply --confirm SEED_SIMULATION] [--publish] <scenario.json…>")
    process.exit(2)
  }
  if (apply && !confirmed) {
    console.error("Refus : --apply exige --confirm SEED_SIMULATION.")
    process.exit(2)
  }

  /* ── Lecture et contrôles AVANT toute écriture ─────────────────────────── */

  const parsed: Parsed[] = []
  const problems: string[] = []

  for (const file of files) {
    const meta = parseFileName(file)
    if (!meta) {
      problems.push(
        `${path.basename(file)} : nom de fichier hors convention mNN-lNN.json / mNN-eNN.json / mNN-evNN.json`,
      )
      continue
    }
    if (!MODULE_TITLES[meta.moduleNumber]) {
      problems.push(`${path.basename(file)} : module ${meta.moduleNumber} inconnu`)
      continue
    }
    let scenario: SimulationScenario
    try {
      scenario = JSON.parse(fs.readFileSync(file, "utf8"))
    } catch (e) {
      problems.push(`${path.basename(file)} : JSON illisible — ${(e as Error).message}`)
      continue
    }
    if (!scenario.title?.trim()) problems.push(`${path.basename(file)} : titre manquant`)
    if (!scenario.steps?.length) problems.push(`${path.basename(file)} : aucune étape`)
    parsed.push({ file, ...meta, scenario })
  }

  // Deux scénarios ne peuvent pas viser le même chapitre.
  const slots = new Map<string, string>()
  for (const p of parsed) {
    const key = `${p.moduleNumber}/${p.kind}${p.index}`
    if (slots.has(key)) problems.push(`Conflit : ${path.basename(p.file)} et ${slots.get(key)} occupent la même place`)
    else slots.set(key, path.basename(p.file))
  }
  // Deux chapitres de même titre dans une même section seraient indistinguables.
  const titlesBySection = new Map<number, Set<string>>()
  for (const p of parsed) {
    const set = titlesBySection.get(p.moduleNumber) ?? new Set()
    if (set.has(p.scenario.title)) {
      problems.push(`Module ${p.moduleNumber} : deux chapitres portent le titre « ${p.scenario.title} »`)
    }
    set.add(p.scenario.title)
    titlesBySection.set(p.moduleNumber, set)
  }

  if (problems.length) {
    console.log("\n=== CONTRÔLES EN ÉCHEC — aucune écriture ===")
    for (const p of problems) console.log("  ✗ " + p)
    process.exit(1)
  }

  parsed.sort((a, b) => a.moduleNumber - b.moduleNumber || chapterOrder(a) - chapterOrder(b))

  /* ── Récapitulatif ─────────────────────────────────────────────────────── */

  const existingFormation = await prisma.formation.findFirst({
    where: { title: FORMATION_TITLE, deletedAt: null },
    include: { sections: { include: { chapters: { include: { simulation: true } } } } },
  })

  console.log(`\n=== ${apply ? "INJECTION" : "CONTRÔLE (dry-run)"} ===`)
  console.log(`Formation cible : « ${FORMATION_TITLE} »`)
  console.log(
    existingFormation
      ? `  → existe déjà (id ${existingFormation.id}, ${existingFormation.sections.length} sections)`
      : "  → sera CRÉÉE",
  )
  console.log(`Publication des chapitres : ${publish ? "OUI" : "non (brouillon)"}`)

  let totalSteps = 0
  let creations = 0
  let updates = 0
  const byModule = new Map<number, Parsed[]>()
  for (const p of parsed) {
    byModule.set(p.moduleNumber, [...(byModule.get(p.moduleNumber) ?? []), p])
  }

  for (const [num, items] of [...byModule.entries()].sort((a, b) => a[0] - b[0])) {
    const sectionTitle = MODULE_TITLES[num]
    const existingSection = existingFormation?.sections.find((s) => s.title === sectionTitle)
    console.log(`\nModule ${num} — ${sectionTitle}  ${existingSection ? "(section existante)" : "(section à créer)"}`)
    for (const p of items) {
      const steps = p.scenario.steps.length
      totalSteps += steps
      const existingChapter = existingSection?.chapters.find((c) => c.title === p.scenario.title)
      const verb = existingChapter ? "MAJ  " : "CRÉER"
      if (existingChapter) updates++
      else creations++
      const mode = p.scenario.mode ?? (p.kind === "E" ? "EXERCISE" : p.kind === "V" ? "EVALUATION" : "LESSON")
      console.log(
        `  ${verb} [${p.kind}${String(p.index).padStart(2, "0")}] ${p.scenario.title.padEnd(46)} ${String(steps).padStart(2)} étapes · ${mode}`,
      )
    }
  }

  console.log(
    `\nBilan : ${creations} chapitre(s) à créer, ${updates} à mettre à jour, ${totalSteps} étapes au total.`,
  )

  if (!apply) {
    console.log("\nDry-run : AUCUNE écriture effectuée.")
    console.log("Pour injecter réellement : --apply --confirm SEED_SIMULATION [--publish]")
    return
  }

  /* ── Écriture, en une transaction ──────────────────────────────────────── */

  await prisma.$transaction(async (tx) => {
    const formation =
      (await tx.formation.findFirst({ where: { title: FORMATION_TITLE, deletedAt: null } })) ??
      (await tx.formation.create({
        data: { title: FORMATION_TITLE, description: FORMATION_DESCRIPTION, isPublished: publish },
      }))

    for (const [num, items] of [...byModule.entries()].sort((a, b) => a[0] - b[0])) {
      const sectionTitle = MODULE_TITLES[num]
      const section =
        (await tx.section.findFirst({ where: { formationId: formation.id, title: sectionTitle } })) ??
        (await tx.section.create({
          data: { formationId: formation.id, title: sectionTitle, order: num },
        }))

      for (const p of items) {
        const mode = (p.scenario.mode ?? (p.kind === "E" ? "EXERCISE" : p.kind === "V" ? "EVALUATION" : "LESSON")) as
          | "LESSON"
          | "EXERCISE"
          | "EVALUATION"
        const order = chapterOrder(p)
        const description = p.scenario.intro?.body ?? null

        const existing = await tx.chapter.findFirst({
          where: { formationId: formation.id, sectionId: section.id, title: p.scenario.title },
        })

        const chapter = existing
          ? await tx.chapter.update({
              where: { id: existing.id },
              data: { order, description, isPublished: publish },
            })
          : await tx.chapter.create({
              data: {
                formationId: formation.id,
                sectionId: section.id,
                title: p.scenario.title,
                description,
                order,
                isPublished: publish,
                // Un chapitre de simulation n'a pas de vidéo : c'est ce qui le
                // distingue dans le player.
                videoUrl: null,
                videoDuration: 0,
              },
            })

        // `scenario` est du JSON opaque côté base : on le remplace en bloc.
        await tx.simulation.upsert({
          where: { chapterId: chapter.id },
          create: {
            chapterId: chapter.id,
            app: "EXCEL",
            mode,
            scenario: p.scenario as never,
            stepCount: p.scenario.steps.length,
          },
          update: {
            mode,
            scenario: p.scenario as never,
            stepCount: p.scenario.steps.length,
            // Une correction de scénario incrémente la version : les tentatives
            // en cours restent identifiables comme démarrées sur l'ancienne.
            version: { increment: 1 },
          },
        })
      }
    }

    console.log(`\nFormation ${formation.id} — écriture terminée.`)
  })

  // Vérification post-mutation : un `ok` de transaction ne prouve rien.
  const check = await prisma.formation.findFirst({
    where: { title: FORMATION_TITLE, deletedAt: null },
    include: {
      sections: { orderBy: { order: "asc" }, include: { chapters: { include: { simulation: true } } } },
    },
  })
  if (!check) {
    console.error("VÉRIFICATION ÉCHOUÉE : formation introuvable après écriture.")
    process.exit(1)
  }
  let chapters = 0
  let sims = 0
  let stepsInDb = 0
  for (const s of check.sections) {
    for (const c of s.chapters) {
      chapters++
      if (c.simulation) {
        sims++
        stepsInDb += c.simulation.stepCount
      }
    }
  }
  console.log(
    `Vérifié en base : ${check.sections.length} section(s), ${chapters} chapitre(s), ${sims} simulation(s), ${stepsInDb} étapes.`,
  )
  if (sims !== chapters) {
    console.error(`ATTENTION : ${chapters - sims} chapitre(s) sans simulation attachée.`)
    process.exit(1)
  }
}

main()
  .catch((e) => {
    console.error("ERREUR :", e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
