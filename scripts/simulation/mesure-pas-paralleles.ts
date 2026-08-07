/** MESURE (lecture seule) — `pas` est-il parallèle à `gestes` dans un PlanDemo ? */
import fs from "fs"; import path from "path"
import { planDemonstration } from "../../lib/simulation/demonstration"
const D = path.join(__dirname, "scenarios")
let eg = 0, dif = 0; const ex: string[] = []
for (const f of fs.readdirSync(D).filter((x) => x.endsWith(".json"))) {
  const sc = JSON.parse(fs.readFileSync(path.join(D, f), "utf8"))
  const rub = sc.ribbon ?? []
  ;(sc.steps ?? []).forEach((s: any, i: number) => {
    const acts = s.montrer?.length ? s.montrer : sc.mode === "EVALUATION" ? [] : [s.action]
    for (const a of acts) {
      const p: any = planDemonstration(a, { onglet: rub[0] ?? "accueil", setup: s.setup } as any)
      if (!p) continue
      if (p.gestes.length === p.pas.length) eg++
      else { dif++; if (ex.length < 5) ex.push(`${f}#${i} gestes=${p.gestes.length} pas=${p.pas.length}`) }
    }
  })
}
console.log(`plans où len(gestes)==len(pas) : ${eg} · différents : ${dif}`)
ex.forEach((x) => console.log("  ", x))
