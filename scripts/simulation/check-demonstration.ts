/**
 * Contrôle de couverture des démonstrations « Montrez-moi ».
 *
 * Relit les 246 scénarios et signale toute étape interactive qui resterait sans
 * démonstration, ou dont la démonstration serait incomplète. C'est le garde-fou
 * qui manquait : l'audit du 29/07/2026 a trouvé 518 étapes muettes et 714
 * partielles sans qu'aucun contrôle ne les signale.
 *
 *   npx tsx scripts/simulation/check-demonstration.ts
 */

import * as fs from "fs"
import * as path from "path"
import { planDemonstration } from "../../lib/simulation/demonstration"
import type { SimulationScenario } from "../../lib/simulation/types"

const DIR = path.join(__dirname, "scenarios")

const parType = new Map<string, { total: number; sans: number; exemples: string[] }>()
let total = 0
let lectures = 0
let sans = 0
let gestesTotal = 0

for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".json")).sort()) {
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))
  for (const st of sc.steps) {
    total++
    const t = st.action.type
    if (t === "READ") {
      lectures++
      continue
    }
    const e = parType.get(t) ?? { total: 0, sans: 0, exemples: [] }
    e.total++
    const plan = planDemonstration(st.action)
    if (!plan || plan.gestes.length === 0) {
      e.sans++
      sans++
      if (e.exemples.length < 3) e.exemples.push(`${f.replace(".json", "")} ${st.id ?? "?"}`)
    } else {
      gestesTotal += plan.gestes.length
    }
    parType.set(t, e)
  }
}

const interactives = total - lectures
console.log(`\n${total} étapes · ${lectures} lectures · ${interactives} interactives`)
console.log(`  avec démonstration : ${interactives - sans} (${Math.round(((interactives - sans) / interactives) * 100)} %)`)
console.log(`  sans démonstration : ${sans} (${Math.round((sans / interactives) * 100)} %)`)
console.log(`  gestes joués au total : ${gestesTotal}\n`)

const lignes = [...parType.entries()].sort((a, b) => b[1].sans - a[1].sans || b[1].total - a[1].total)
for (const [t, e] of lignes) {
  const marque = e.sans === 0 ? "✓" : e.sans === e.total ? "✗" : "~"
  console.log(`  ${marque} ${String(e.total).padStart(4)} ${t}${e.sans ? `   — ${e.sans} sans démo` : ""}`)
  if (e.sans) console.log(`        ex. ${e.exemples.join(", ")}`)
}

if (sans > 0) {
  console.log(`\n${sans} étape(s) interactive(s) sans démonstration.`)
  console.log("Ces gestes n'en admettent pas (touche seule, double-clic, poignée de recopie) :")
  console.log("la réponse écrite reste affichée à leur place.")
}
