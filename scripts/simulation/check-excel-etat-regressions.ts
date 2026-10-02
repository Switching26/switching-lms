import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cellulesAReposer, restaurerCellulesCapturees, restaurerStylesCapturees, ProtectionDemonstration, rectangleVisible, type CelluleCapturee } from "../../lib/simulation/etat-etape"
import { jouerToucheDemo, rejouerRecopiesDemo } from "../../lib/simulation/demonstration-execution"
import { planDemonstration, boutonEditionGraphique } from "../../lib/simulation/demonstration"
import { cellulesHorsEtatAplomb, etatAplomb, zoneClasseur } from "../../lib/simulation/aplomb"
import type { SimulationScenario } from "../../lib/simulation/types"

let checks = 0
const check = (f: () => void) => { f(); checks++ }
const scenario = (nom: string) => JSON.parse(readFileSync(join(__dirname, "scenarios", nom + ".json"), "utf8")) as SimulationScenario

// Résultat réel de M12-E01 : le juge sonde E3/E5/E6, mais la poignée produit E4.
const m12 = scenario("m12-e01")
const indexTotal = m12.steps.findIndex((s) => s.id === "M12-E01-06")
const capture: Record<string, CelluleCapturee> = {
  E2: { f: "=C2*D2" }, E3: { f: "=C3*D3" }, E4: { f: "=C4*D4" }, E5: { f: "=C5*D5" }, E6: { f: "=C6*D6" },
  B1: { v: true }, H9: {},
}
const cellules = structuredClone(capture)
cellules.H1 = { v: "PARASITE AVANT" }
cellules.H2 = { f: "=99+1" }
let appels = 0
const applyCells = (reparations: Record<string, CelluleCapturee>) => {
  appels++
  for (const [ref, c] of Object.entries(reparations)) cellules[ref] = c
}
// Le helper consommé par Player doit appeler la façade, pas seulement calculer {}.
restaurerCellulesCapturees(capture, Object.keys(cellules), (ref) => cellules[ref] ?? {}, applyCells)
check(() => assert.equal(appels, 1))
check(() => assert.deepEqual(cellules.H1, {}))
check(() => assert.deepEqual(cellules.H2, {}))
check(() => assert.equal(cellules.E4.f, "=C4*D4"))
check(() => assert.equal(cellules.B1.v, true))
check(() => assert.deepEqual(cellules.H9, {}))
check(() => assert.equal(Object.keys(cellulesAReposer(capture, Object.keys(capture), (r) => capture[r])).length, 0))
const styles: Record<string, unknown> = { H9: { bg: "red" }, H10: { bg: "red" } }
restaurerStylesCapturees({ H9: JSON.stringify({ bg: "green" }) }, ["H9", "H10"], (ref) => styles[ref], (ref, style) => { styles[ref] = style })
check(() => assert.deepEqual(styles.H9, { bg: "green" }))
check(() => assert.equal(styles.H10, null))
check(() => assert.equal(cellules.E4.f, "=C4*D4"))

// Témoin négatif : les sondes historiques ne constituent pas une feuille.
const ancien = etatAplomb(m12.steps, m12.workbook, indexTotal)
const lecture = Object.fromEntries(Object.entries(capture).map(([r, c]) => [r, { formule: c.f ?? "", valeur: c.v, numberFormat: "" }]))
check(() => assert.ok(cellulesHorsEtatAplomb(zoneClasseur(m12.steps, m12.workbook).zone, ancien, lecture).includes("E4"), "Le témoin historique doit reproduire E4 effacée"))

// Les notifications de recalcul tardives ne deviennent jamais un geste élève.
const verrou = new ProtectionDemonstration()
verrou.demarrer()
check(() => assert.equal(verrou.autorise("stateChange"), false))
verrou.prendreMain()
check(() => assert.equal(verrou.autorise("pivotChange"), false))
verrou.terminer()
check(() => assert.equal(verrou.autorise("stateChange"), false))
check(() => assert.equal(verrou.autorise("next"), true))
verrou.prendreMain()
check(() => assert.equal(verrou.autorise("typed"), true))

let selection = "B7"
const saisies: Record<string, { v: string }> = {}
const clavier = { getSelection: () => selection, setSelection: (r: string) => { selection = r }, applyCells: (c: typeof saisies) => { Object.assign(saisies, c) } }
jouerToucheDemo(clavier, "Tab")
jouerToucheDemo(clavier, "Tab")
jouerToucheDemo(clavier, "Enter")
check(() => assert.equal(selection, "D8"))
selection = "G6"
jouerToucheDemo(clavier, "Control+;", new Date(2026, 9, 2, 12))
check(() => assert.equal(saisies.G6.v, "02/10/2026"))
check(() => assert.equal(jouerToucheDemo(clavier, "Unsupported"), false))
check(() => assert.ok(planDemonstration({ type: "KEY", key: "Tab" })?.gestes[0].presser))

const fill = planDemonstration({ type: "FILL_HANDLE", from: "E2", to: "E6" })
check(() => assert.equal(fill?.gestes[0].presser?.id, "demo-recopier"))
check(() => assert.deepEqual(JSON.parse(fill!.gestes[0].presser!.arg!), { from: "E2", to: "E6" }))
check(() => assert.equal(fill?.gestes.some((g) => g.ecrire), false, "La poignée doit recopier, sans taper les sondes"))
const filtre = planDemonstration({ type: "FILTER_COLUMN", column: "C", values: ["Mobilier"] })!
check(() => assert.deepEqual(JSON.parse(filtre.gestes[1].presser!.arg!), { column: "C", values: ["Mobilier"] }))
check(() => assert.equal(boutonEditionGraphique({ title: "Ventes par région" })?.id, "ins-graph-element-titre"))
check(() => assert.notEqual(boutonEditionGraphique({ title: "Ventes par région" })?.id, "ins-graph-element-quadrillage"))
const titre = planDemonstration({ type: "EXPECT_CHART", chart: { title: "Ventes par région" } }, { setup: { chartEdit: { title: "Ventes par région" } } })!
check(() => assert.ok(titre.gestes.some((g) => g.frappe === "Ventes par région")))
const m20 = scenario("m20-l01")
const creation = planDemonstration(m20.steps[0].action, { setup: m20.steps[0].setup })!
check(() => assert.ok(creation.gestes.some((g) => g.cible.k === "dom" && g.cible.sel.includes('data-pivot-zone="rows"'))))
check(() => assert.ok(creation.gestes.some((g) => g.cible.k === "dom" && g.cible.sel.includes('data-pivot-zone="values"'))))
check(() => assert.equal(rectangleVisible({ left: -100, top: 40, width: 80, height: 24 }, 800, 400), null))
check(() => assert.deepEqual(rectangleVisible({ left: 40, top: 15, width: 90, height: 30 }, 800, 400), { left: 46, top: 20, width: 84, height: 25 }))
async function verifierRepriseRecopie() {
  const sources: Record<string, { f?: string; v?: string }> = {}
  const ordre: string[] = []
  await rejouerRecopiesDemo({
    applyCells: (c) => { Object.assign(sources, c); ordre.push("source") },
    fillRange: async (from, to) => {
      check(() => assert.equal(sources[from]?.f, "=SOMME(B2:D2)"))
      ordre.push(`${from}:${to}`)
      return true
    },
  }, [
    { type: "TYPE", target: "E2", accept: ["=SOMME(B2:D2)"] },
    { type: "FILL_HANDLE", from: "E2", to: "E5" },
  ])
  check(() => assert.deepEqual(ordre, ["source", "E2:E5"]))
  console.log(`Excel état/démonstrations : ${checks} assertions OK ; témoin historique E4 reproduit.`)
}
void verifierRepriseRecopie().catch((e) => { console.error(e); process.exitCode = 1 })
