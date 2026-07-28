/**
 * Contrôle la COMPLÉTUDE et la COHÉRENCE PÉDAGOGIQUE d'un module, là où
 * `check-scenario.ts` ne contrôle que la validité d'un fichier pris isolément.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs","noImplicitAny":false}' \
 *     scripts/simulation/check-couverture.ts
 *
 * POURQUOI CE FICHIER EXISTE
 * La formation a d'abord été construite module par module, chaque fichier passant
 * ses contrôles — et l'ensemble était pourtant incomplet : mesurée compétence par
 * compétence, elle n'en couvrait que 42 %, avec des fondamentaux purement absents
 * (ni SI, ni SOMME.SI, ni hauteur de ligne, ni largeur de colonne). Aucun contrôle
 * ne pouvait le voir, parce que tous raisonnaient sur UN fichier. Celui-ci
 * raisonne sur le PARCOURS.
 *
 * Les quatre propriétés vérifiées, dans l'ordre de gravité :
 *
 *  1. Chaque module a au moins une leçon, un exercice et EXACTEMENT une
 *     évaluation. Un module sans exercice ne fait pas pratiquer ; sans évaluation,
 *     rien ne mesure l'acquis.
 *
 *  2. L'évaluation d'un module n'exerce que des gestes que ses leçons ont
 *     montrés. Évaluer quelqu'un sur ce qu'on ne lui a pas enseigné est la faute
 *     pédagogique la plus grossière, et elle est indétectable fichier par fichier.
 *
 *  3. Une évaluation n'offre aucune aide et note ses étapes ; une leçon montre le
 *     geste. Le contrôleur de scénario le vérifie déjà pour partie, on le
 *     re-vérifie ici sous l'angle du parcours pour que le rapport soit d'un bloc.
 *
 *  4. Deux chapitres d'un même module ne portent ni le même titre ni la même
 *     consigne mot pour mot : le premier cas casse l'injection en base (un
 *     chapitre est reconnu par son titre), le second signale un copier-coller.
 *
 * Ce contrôle ne juge PAS si le catalogue de compétences est le bon — c'est une
 * décision métier. Il garantit seulement qu'aucun module n'est livré à moitié.
 */

import * as fs from "fs"
import * as path from "path"
import type { SimulationScenario, SimulationStep } from "../../lib/simulation/types"

const DOSSIER = path.join(__dirname, "scenarios")

type Genre = "L" | "E" | "V"
type Chapitre = { fichier: string; genre: Genre; index: number; sc: SimulationScenario }

const erreurs: string[] = []
const avertissements: string[] = []

/** `m06-l03.json` → leçon 3 du module 6 ; `m17-ev01.json` → évaluation 1. */
function analyserNom(nom: string): { module: number; genre: Genre; index: number } | null {
  const m = /^m(\d{2})-(ev|[le])(\d{2})\.json$/i.exec(nom)
  if (!m) return null
  const g = m[2].toLowerCase()
  return {
    module: parseInt(m[1], 10),
    genre: g === "ev" ? "V" : (g.toUpperCase() as Genre),
    index: parseInt(m[3], 10),
  }
}

/**
 * Signature d'un geste : le type d'action, et pour un clic de ruban l'identifiant
 * du contrôle. C'est à ce grain que l'on compare ce qu'une évaluation demande à
 * ce que les leçons ont montré — comparer les cellules ou les formules n'aurait
 * aucun sens, une évaluation portant par construction sur d'autres données.
 */
function signature(step: SimulationStep): string {
  const a = step.action
  if (a.type === "CLICK_CONTROL") return `CLICK_CONTROL:${a.control}`
  return a.type
}

/* ── Lecture ──────────────────────────────────────────────────────────────── */

// Objets et tableaux plutôt que Map/Set : ces scripts sont exclus du tsconfig du
// projet, où l'itération d'une Map exige `downlevelIteration`.
const parModule: Record<number, Chapitre[]> = {}
for (const nom of fs.readdirSync(DOSSIER).sort()) {
  if (!nom.endsWith(".json")) continue
  const meta = analyserNom(nom)
  if (!meta) {
    erreurs.push(`${nom} : nom hors convention mNN-lNN / mNN-eNN / mNN-evNN`)
    continue
  }
  let sc: SimulationScenario
  try {
    sc = JSON.parse(fs.readFileSync(path.join(DOSSIER, nom), "utf8")) as SimulationScenario
  } catch (e) {
    erreurs.push(`${nom} : JSON illisible (${(e as Error).message})`)
    continue
  }
  parModule[meta.module] = [...(parModule[meta.module] ?? []), { fichier: nom, genre: meta.genre, index: meta.index, sc }]
}

/* ── Contrôles par module ─────────────────────────────────────────────────── */

const modules = Object.keys(parModule).map(Number).sort((a, b) => a - b)
const lignes: string[] = []

for (const num of modules) {
  const chapitres = parModule[num]
  const lecons = chapitres.filter((c) => c.genre === "L")
  const exercices = chapitres.filter((c) => c.genre === "E")
  const evaluations = chapitres.filter((c) => c.genre === "V")
  const etiquette = `Module ${String(num).padStart(2, "0")}`

  /* 1. Le module est-il complet ? */
  if (lecons.length === 0) erreurs.push(`${etiquette} : aucune leçon`)
  if (exercices.length === 0) {
    erreurs.push(`${etiquette} : aucun exercice — le module ne fait rien pratiquer`)
  }
  if (evaluations.length === 0) {
    erreurs.push(`${etiquette} : aucune évaluation — rien ne mesure l'acquis`)
  } else if (evaluations.length > 1) {
    erreurs.push(`${etiquette} : ${evaluations.length} évaluations, une seule attendue`)
  }
  // Un exercice par leçon est la forme voulue : on avertit sans bloquer, une
  // leçon purement démonstrative pouvant légitimement ne pas avoir la sienne.
  if (exercices.length < lecons.length) {
    avertissements.push(
      `${etiquette} : ${lecons.length} leçon(s) pour ${exercices.length} exercice(s) — ${lecons.length - exercices.length} compétence(s) montrée(s) sans être pratiquée(s)`,
    )
  }

  /* 2. L'évaluation reste-t-elle dans le périmètre enseigné ?
     On ne compare que les GESTES CONCRETS, c'est-à-dire les boutons du ruban.
     Les actions de vérification (EXPECT_CHART, EXPECT_STATE…) sont des mécanismes
     de contrôle, pas des compétences : une leçon peut légitimement valider le clic
     d'un bouton là où l'exercice vérifie le résultat obtenu, sans que l'apprenant
     ait à apprendre quoi que ce soit de plus. Confondre les deux produisait des
     alertes creuses sur les modules de graphiques. */
  const montres: Record<string, true> = {}
  for (const l of lecons) for (const s of l.sc.steps) montres[signature(s)] = true
  for (const ev of evaluations) {
    const horsPerimetre: string[] = []
    for (const s of ev.sc.steps) {
      const sig = signature(s)
      if (sig.indexOf("CLICK_CONTROL:") !== 0) continue
      if (!montres[sig] && horsPerimetre.indexOf(sig) < 0) horsPerimetre.push(sig)
    }
    if (horsPerimetre.length) {
      erreurs.push(
        `${etiquette} : l'évaluation exige des gestes que les leçons n'ont pas montrés → ${horsPerimetre.join(", ")}`,
      )
    }
  }

  /* 3. Aide et notation conformes au genre. */
  for (const ev of evaluations) {
    const avecAide = ev.sc.steps.filter((s) => s.aide).length
    if (avecAide) erreurs.push(`${etiquette} : ${avecAide} étape(s) de l'évaluation portent une aide`)
    const notables = ev.sc.steps.filter((s) => s.action.type !== "READ")
    const sansPoints = notables.filter((s) => s.points === undefined).length
    if (sansPoints === notables.length && notables.length > 0) {
      avertissements.push(
        `${etiquette} : aucune étape de l'évaluation ne porte de points — la note repose sur le barème implicite`,
      )
    }
    if (ev.sc.mode && ev.sc.mode !== "EVALUATION") {
      erreurs.push(`${etiquette} : l'évaluation déclare le mode « ${ev.sc.mode} »`)
    }
  }
  for (const l of lecons) {
    const montrent = l.sc.steps.filter((s) => s.aide).length
    const interactives = l.sc.steps.filter((s) => s.action.type !== "READ").length
    if (interactives > 0 && montrent === 0) {
      avertissements.push(`${etiquette} : ${l.fichier} ne montre aucun geste — une leçon devrait guider`)
    }
  }

  /* 4. Doublons de titre et de consigne. */
  const titres: Record<string, string> = {}
  const consignes: Record<string, string> = {}
  for (const c of chapitres) {
    const t = (c.sc.title ?? "").trim()
    if (titres[t]) {
      // Un chapitre est reconnu en base par son titre : deux titres identiques
      // dans une même section rendent l'injection ambiguë.
      erreurs.push(`${etiquette} : « ${t} » porté par ${titres[t]} ET ${c.fichier}`)
    } else titres[t] = c.fichier
    for (const s of c.sc.steps) {
      const cons = (s.consigne ?? "").trim()
      if (cons.length < 25) continue
      const deja = consignes[cons]
      if (deja && deja !== c.fichier) {
        avertissements.push(`${etiquette} : consigne identique dans ${deja} et ${c.fichier} — copier-coller ?`)
      } else consignes[cons] = c.fichier
    }
  }

  const etapes = chapitres.reduce((n, c) => n + c.sc.steps.length, 0)
  lignes.push(
    `  ${etiquette} : ${String(lecons.length).padStart(2)} leçon(s) · ${String(exercices.length).padStart(2)} exercice(s) · ${evaluations.length ? "évaluation" : "SANS ÉVALUATION"} · ${String(etapes).padStart(3)} étapes`,
  )
}

/* ── Rapport ──────────────────────────────────────────────────────────────── */

console.log(`\nCouverture du parcours — ${modules.length} module(s)\n`)
for (const l of lignes) console.log(l)

const tous = modules.reduce<Chapitre[]>((acc, n) => acc.concat(parModule[n]), [])
const totalEtapes = tous.reduce((n, c) => n + c.sc.steps.length, 0)
console.log(
  `\nTotal : ${tous.length} chapitre(s), ${totalEtapes} étapes.`,
)

if (avertissements.length) {
  console.log(`\n=== ${avertissements.length} AVERTISSEMENT(S) ===`)
  for (const a of avertissements) console.log("  ⚠ " + a)
}
if (erreurs.length) {
  console.log(`\n=== ${erreurs.length} ERREUR(S) ===`)
  for (const e of erreurs) console.log("  ✗ " + e)
  process.exit(1)
}
console.log("\nParcours complet et cohérent.\n")
