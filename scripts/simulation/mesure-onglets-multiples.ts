/**
 * MESURE (lecture seule) — quelles étapes Excel ont une démonstration qui
 * traverse PLUSIEURS onglets de ruban ?
 *
 * Ce sont les seules exposées au défaut 01 : `ongletRequis()` s'arrête au
 * premier bouton du plan, et toutes les actions d'un `montrer` reçoivent le même
 * onglet de départ. Dès que le ruban courant coïncide avec l'onglet d'un geste
 * NON initial, ce geste ne rouvre pas son onglet et son repère n'est jamais peint.
 *
 * Le script n'écrit rien dans le produit. Il sert à CIBLER : chaque cas listé ici
 * est ensuite prouvé au navigateur par `banc/banc-pollution.cjs`.
 *
 *   npx tsx scripts/simulation/mesure-onglets-multiples.ts
 */
import fs from "fs"
import path from "path"
import { planDemonstration } from "../../lib/simulation/demonstration"
import type { SimulationStep, RibbonTab } from "../../lib/simulation/types"

const DOSSIER = path.join(__dirname, "scenarios")

/**
 * La table onglet↔contrôle n'est pas exportée : on la lit dans la SOURCE, sans
 * la réécrire. Un écart de parsing se verrait immédiatement (table vide ou
 * onglet inconnu), et chaque conclusion est de toute façon rejouée au navigateur.
 */
function tableOnglets(): Record<string, RibbonTab> {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "lib", "simulation", "demonstration.ts"), "utf8")
  const bloc = /const ONGLET_DU_CONTROLE: Record<string, RibbonTab> = \{([\s\S]*?)\n\}/.exec(src)
  if (!bloc) throw new Error("table ONGLET_DU_CONTROLE introuvable — le parsing doit être corrigé")
  const t: Record<string, RibbonTab> = {}
  for (const m of bloc[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) t[m[1]] = m[2] as RibbonTab
  if (Object.keys(t).length < 50) throw new Error(`table suspecte : ${Object.keys(t).length} entrées`)
  return t
}

const ONGLET = tableOnglets()

/** Onglets successivement requis par les gestes d'un plan, dans l'ordre. */
function ongletsDesGestes(gestes: any[]): Array<{ i: number; controle: string; onglet: RibbonTab }> {
  const out: Array<{ i: number; controle: string; onglet: RibbonTab }> = []
  gestes.forEach((g, i) => {
    if (g?.cible?.k !== "dom") return
    const m = /\[data-control="([^"]+)"\]/.exec(g.cible.sel ?? "")
    if (m && ONGLET[m[1]]) out.push({ i, controle: m[1], onglet: ONGLET[m[1]] })
  })
  return out
}

/**
 * PIÈGE DU CONTRÔLE — un détecteur qu'on n'a pas mis en échec ne vaut rien.
 *
 * On lui soumet deux étapes fabriquées, sans toucher au produit :
 *   · l'appât : deux gestes sous DEUX onglets (Affichage puis Mise en page),
 *     joués depuis « mise-en-page » — le détecteur DOIT rougir ;
 *   · le témoin : les mêmes gestes joués depuis « accueil » — il DOIT rester vert.
 *
 *   npx tsx scripts/simulation/mesure-onglets-multiples.ts --piege
 */
function piege(): void {
  const etape: any = {
    id: "PIEGE-01",
    action: { type: "READ" },
    montrer: [
      { type: "MONTRER", cible: "ctrl:aff-figer-volets", texte: "onglet Affichage" },
      { type: "MONTRER", cible: "ctrl:mep-imprimer-titres", texte: "onglet Mise en page" },
    ],
  }
  const essai = (depart: RibbonTab) => {
    const gestes: any[] = []
    for (const a of etape.montrer) {
      const p = planDemonstration(a as any, { onglet: depart } as any)
      if (p) gestes.push(...p.gestes)
    }
    let courant: RibbonTab = depart
    const invisibles: string[] = []
    gestes.forEach((g) => {
      if (g?.onglet) { courant = g.onglet; return }
      if (g?.cible?.k !== "dom") return
      const m = /\[data-control="([^"]+)"\]/.exec(g.cible.sel ?? "")
      if (m && ONGLET[m[1]] && ONGLET[m[1]] !== courant) invisibles.push(m[1])
    })
    return invisibles
  }
  const appat = essai("mise-en-page")
  const temoin = essai("accueil")
  console.log(`PIÈGE · appât (départ mise-en-page)  → ${appat.length ? "ROUGE ✓ " + appat.join(",") : "VERT ✗ le détecteur est aveugle"}`)
  console.log(`PIÈGE · témoin (départ accueil)      → ${temoin.length ? "ROUGE ✗ faux positif : " + temoin.join(",") : "VERT ✓"}`)
  const bon = appat.length === 1 && temoin.length === 0
  console.log(bon ? "PIÈGE CONCLUANT : le détecteur voit le défaut et seulement lui." : "PIÈGE ÉCHOUÉ — ne pas se fier à ce contrôle.")
  process.exit(bon ? 0 : 1)
}
if (process.argv.includes("--piege")) piege()

const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith(".json")).sort()
let etapesTotal = 0
let avecPlan = 0
const multi: any[] = []
const fragiles: any[] = []

for (const f of fichiers) {
  const sc = JSON.parse(fs.readFileSync(path.join(DOSSIER, f), "utf8"))
  // `ribbon` est à la RACINE du scénario, pas dans `workbook` : le lire au
  // mauvais endroit rend le recensement muet (aucun onglet, aucun cas détecté).
  const ruban: RibbonTab[] = sc.ribbon ?? sc.workbook?.ribbon ?? []
  const steps: SimulationStep[] = sc.steps ?? []
  steps.forEach((step: any, index: number) => {
    etapesTotal++
    const actions = step.montrer?.length ? step.montrer : sc.mode === "EVALUATION" ? [] : [step.action]
    if (!actions.length) return

    // Le plan tel que le player le calcule : MÊME onglet de départ pour toutes
    // les actions (SimulationPlayer l.4528).
    for (const depart of ruban.length ? ruban : (["accueil"] as RibbonTab[])) {
      const gestes: any[] = []
      for (const a of actions) {
        const p = planDemonstration(a as any, { onglet: depart, setup: step.setup } as any)
        if (p) gestes.push(...p.gestes)
      }
      if (!gestes.length) continue
      if (depart === (ruban[0] ?? "accueil")) avecPlan++

      const req = ongletsDesGestes(gestes)
      const distincts = [...new Set(req.map((r) => r.onglet))]
      if (distincts.length >= 2 && depart === (ruban[0] ?? "accueil")) {
        multi.push({ f, index, id: step.id, onglets: distincts, ruban })
      }

      /**
       * Simulation de l'écran : on suit l'onglet RÉELLEMENT ouvert au fil des
       * gestes (un geste d'ouverture le change), et on repère tout geste dont
       * l'onglet requis n'est pas celui ouvert à ce moment-là.
       */
      let courant: RibbonTab = depart
      const invisibles: string[] = []
      gestes.forEach((g) => {
        if (g?.onglet) { courant = g.onglet; return }
        if (g?.cible?.k !== "dom") return
        const m = /\[data-control="([^"]+)"\]/.exec(g.cible.sel ?? "")
        if (!m || !ONGLET[m[1]]) return
        if (ONGLET[m[1]] !== courant) invisibles.push(m[1])
      })
      if (invisibles.length) {
        fragiles.push({ f, index, id: step.id, depart, invisibles, ruban })
      }
    }
  })
}

const parChapitre = new Map<string, number>()
for (const x of fragiles) parChapitre.set(x.f, (parChapitre.get(x.f) ?? 0) + 1)

console.log(`Étapes Excel parcourues : ${etapesTotal}`)
console.log(`Étapes avec un plan de démonstration : ${avecPlan}`)
console.log(`Étapes dont le plan traverse ≥2 onglets : ${multi.length}`)
console.log(`\nCouples (étape, onglet de départ) où un geste vise un bouton ABSENT de l'écran : ${fragiles.length}`)
const etapesFragiles = new Set(fragiles.map((x) => `${x.f}#${x.index}`))
console.log(`Étapes distinctes concernées : ${etapesFragiles.size} · chapitres : ${parChapitre.size}`)

console.log(`\n— Détail (30 premiers) —`)
for (const x of fragiles.slice(0, 30)) {
  console.log(`  ${x.f}#${x.index} ${x.id}  départ=${x.depart}  invisibles: ${x.invisibles.join(", ")}`)
}

fs.writeFileSync(
  path.join(__dirname, "..", "..", ".mesure-onglets-multiples.json"),
  JSON.stringify({ etapesTotal, avecPlan, multi, fragiles }, null, 1),
)
console.log(`\nÉcrit : .mesure-onglets-multiples.json`)
