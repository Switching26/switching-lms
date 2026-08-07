/**
 * MESURE — empreinte de TOUS les plans, tels que le PLAYER les construit.
 *
 * Le même script doit tourner sur la version d'avant et celle d'après : il
 * utilise `planSequence` quand elle existe, et retombe sinon sur l'ancien
 * `montrer.map(...)`. C'est le comportement RÉEL de chaque version qui est
 * comparé, pas deux façons différentes de l'appeler.
 */
import fs from "fs"; import path from "path"
import * as D2 from "../../lib/simulation/demonstration"
const D = path.join(__dirname, "scenarios")
const seq = (D2 as any).planSequence as undefined | ((a: any[], c: any) => any[])
const out: Record<string, unknown> = {}
for (const f of fs.readdirSync(D).filter((x) => x.endsWith(".json")).sort()) {
  const sc = JSON.parse(fs.readFileSync(path.join(D, f), "utf8"))
  const rub: string[] = sc.ribbon ?? []
  ;(sc.steps ?? []).forEach((s: any, i: number) => {
    const acts = s.montrer?.length ? s.montrer : sc.mode === "EVALUATION" ? [] : [s.action]
    if (!acts.length) return
    for (const dep of rub.length ? rub : ["accueil"]) {
      const ctx = { onglet: dep, setup: s.setup } as any
      const plans = s.montrer?.length && seq
        ? seq(acts, ctx)
        : acts.map((a: any) => (D2 as any).planDemonstration(a, ctx)).filter(Boolean)
      if (!plans.length) continue
      out[`${f}#${i}@${dep}`] = {
        gestes: plans.flatMap((p: any) => p.gestes),
        pas: plans.flatMap((p: any) => p.pas),
      }
    }
  })
}
fs.writeFileSync(process.argv[2] || "/tmp/plans.json", JSON.stringify(out, null, 0))
console.log(`plans écrits : ${Object.keys(out).length} · planSequence ${seq ? "présente" : "absente (version d'avant)"}`)
