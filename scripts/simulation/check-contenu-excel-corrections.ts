/**
 * Régressions de contenu issues de l'audit Excel du 02/10/2026.
 * Les nombres sont recalculés depuis les données sources, indépendamment des
 * cellules attendues. Le juge est sollicité avec ces lectures indépendantes.
 * Ce contrôle ne remplace pas une recopie réelle ni une recette navigateur.
 *
 * npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node","target":"ES2020"}' scripts/simulation/check-contenu-excel-corrections.ts
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { validateStep } from "../../lib/simulation/validate"

const root = path.resolve(__dirname, "../..")
const scenarios = path.join(__dirname, "scenarios")
const load = (stem: string): any => JSON.parse(fs.readFileSync(path.join(scenarios, `${stem}.json`), "utf8"))
const step = (id: string): any => load(`${id.slice(0, 3).toLowerCase()}-${id.split("-")[1].toLowerCase()}`).steps.find((s: any) => s.id === id)
const literal = (d: any, ref: string, sheet = 0): any => d.workbook.sheets[sheet].cells[ref]?.v
const typed = (id: string, text: string): boolean => {
  const s = step(id)
  return validateStep(s, { kind: "typed", target: s.action.target, text, channel: "keyboard" }).ok
}
let checks = 0
function check(label: string, test: () => void): void {
  test()
  checks++
  console.log(`✓ ${label}`)
}

check("M01 : seule la vignette Note de frais ouvre le modèle demandé", () => {
  const s = step("M01-L06-03")
  assert(validateStep(s, { kind: "control", control: "poste-modele-note-de-frais", channel: "mouse" }).ok)
  assert(!validateStep(s, { kind: "control", control: "poste-nouveau", channel: "mouse" }).ok)
  assert(!validateStep(s, { kind: "posteChange", poste: { excel: "classeur" } } as any).ok)
})

check("M03 : 13 050 accepté et 12 550 refusé, somme indépendante des neuf cellules", () => {
  const d = load("m03-e01")
  let total = 0
  for (let row = 2; row <= 4; row++) for (const col of ["C", "D", "E"]) total += literal(d, `${col}${row}`)
  assert.equal(total, 13050)
  assert(typed("M03-E01-06", String(total)))
  assert(!typed("M03-E01-06", "12550"))
})

check("M10 : les deux recopies gardent les quantités et produisent 895 € en formules", () => {
  const d = load("m10-l01")
  const s = step("M10-L01-06")
  assert.deepEqual(s.montrer.map((g: any) => [g.type, g.from, g.to]), [
    ["FILL_HANDLE", "B2", "B5"], ["FILL_HANDLE", "D2:E2", "E5"],
  ])
  const readings: Record<string, { formula: string; value: any }> = {}
  let total = 0
  for (let row = 2; row <= 5; row++) {
    const code = literal(d, `A${row}`)
    const sourceRow = [2, 3, 4, 5].find((r) => literal(d, `H${r}`) === code)!
    const quantity = literal(d, `C${row}`)
    const price = literal(d, `J${sourceRow}`)
    readings[`B${row}`] = { formula: `=RECHERCHEV(A${row};$H$2:$J$5;2;FAUX)`, value: literal(d, `I${sourceRow}`) }
    readings[`D${row}`] = { formula: `=RECHERCHEV(A${row};$H$2:$J$5;3;FAUX)`, value: price }
    readings[`E${row}`] = { formula: `=C${row}*D${row}`, value: quantity * price }
    readings[`C${row}`] = { formula: "", value: quantity }
    total += quantity * price
  }
  assert.equal(total, 895)
  assert.deepEqual([readings.C3.value, readings.C4.value, readings.C5.value], [5, 3, 4])
  assert(validateStep(s, { kind: "stateChange", readings }).ok)
  const constants = Object.fromEntries(Object.entries(readings).map(([ref, v]) => [ref, { ...v, formula: "" }]))
  assert(!validateStep(s, { kind: "stateChange", readings: constants }).ok)
  assert(!validateStep(s, { kind: "stateChange", readings: { ...readings, C3: { formula: "", value: 3 } } }).ok)
})

check("M10 : RECHERCHEV produit une erreur attendue avant SIERREUR ; la démo recopie", () => {
  const d = load("m10-l02")
  assert.equal(literal(d, "A4"), "XXX")
  assert(![2, 3, 4, 5].some((row) => literal(d, `H${row}`) === "XXX"))
  const s = step("M10-L02-02")
  const readings = {
    B3: { formula: "=RECHERCHEV(A3;$H$2:$J$5;2;FAUX)", value: "Clavier" },
    B4: { formula: "=RECHERCHEV(A4;$H$2:$J$5;2;FAUX)", value: "#N/A" },
    B5: { formula: "=RECHERCHEV(A5;$H$2:$J$5;2;FAUX)", value: "Souris" },
  }
  assert(validateStep(s, { kind: "stateChange", readings }).ok)
  assert.equal(s.montrer[0].type, "FILL_HANDLE")
})

check("M10 : l'affichage à deux décimales et l'arrondi ont deux valeurs différentes", () => {
  const s = step("M10-L07-04")
  const full = s.setup.cells.H10.v
  assert.equal(full, 723.7512)
  assert.equal(full.toFixed(2), "723.75")
  assert.equal(s.setup.cells.H11.f, "=ARRONDI(H10;2)")
  const rounded = Math.round(full * 100) / 100
  assert.equal(rounded, 723.75)
  assert.notEqual(full, rounded)
  assert.equal(s.setup.selection, "H10")
  assert.equal(step("M10-L05-08").montrer[2].cible, "A9:B9")
  assert.deepEqual(Object.keys(step("M10-L06-01c").action.cells), ["E3", "E4", "E5", "E6"])
})

check("M11/M14 : les évaluations exigent les références et noms enseignés", () => {
  assert(!typed("M11-EV01-06", '=NB.SI(C2:C9;"<10")'))
  assert(typed("M11-EV01-06", '=NB.SI(C2:C9;"<"&H5)'))
  assert(!typed("M11-EV01-08", '=SI(C2<10;"Rupture";"OK")'))
  assert(typed("M11-EV01-08", '=SI(C2<$H$5;"Rupture";"OK")'))
  assert(!typed("M14-EV01-06", "=B10*Taux_remise"))
  assert(typed("M14-EV01-06", "=SOMME(Prestations)*Taux_remise"))
})

check("M16 : une moyenne pondérée correcte, dimensions incompatibles refusées", () => {
  const d = load("m16-e01")
  const weighted = (literal(d, "B5") * literal(d, "I4") + literal(d, "C5") * literal(d, "I5")) / (literal(d, "I4") + literal(d, "I5"))
  assert(Math.abs(weighted - 87.33333333333333) < 1e-9)
  assert(typed("M16-E01-01", "=(B5*$I$4+C5*$I$5)/($I$4+$I$5)"))
  assert(!typed("M16-E01-01", "=SOMMEPROD(B5:C5;$I$4:$I$5)/SOMME($I$4:$I$5)"))
  assert.equal(step("M16-L03-07").action.cells.F9.v, 13)
})

check("M19/M21 : critères ET/OU et source de liste ont des données distinctes", () => {
  const criteria = step("M19-L05-04").setup.cells
  assert.deepEqual([criteria.H17.v, criteria.I17.v], ["Mobilier", "Est"])
  assert.deepEqual([criteria.H21.v, criteria.I22.v], ["Mobilier", "Est"])
  assert(!criteria.I21 && !criteria.H22)
  const s = step("M21-L01-06")
  const allowed = step("M21-L01-01").setup.dv.rule.values
  assert.deepEqual([s.setup.cells.H2.v, s.setup.cells.H3.v, s.setup.cells.H4.v], allowed)
  assert.equal(step("M19-L03-06").montrer[2].cible, "D11")
})

check("M20 : la correction vaut 2 240 €, total 78 110 avant nouvelle vente", () => {
  const d = load("m20-e03")
  let total = 0
  for (let row = 2; row <= 31; row++) total += literal(d, `E${row}`)
  assert.equal(total, 75870)
  const initial = literal(d, "E10")
  const corrected = Number(step("M20-E03-01").action.accept[0])
  assert.equal(initial, 1640)
  assert.equal(corrected - initial, 2240)
  assert.equal(total - initial + corrected, 78110)
  assert.equal(total - initial + corrected + step("M20-E03-03").setup.cells.E32.v, 81240)
  assert.equal(step("M20-E03-02").action.pivot.cells.I7.v, 78110)
  assert.deepEqual(step("M20-L01-02").montrer.map((g: any) => g.cible), ["rows", "cols", "values", "filters"].map((z) => `dom:[data-pivot-zone="${z}"]`))
})

check("M21 : MOB-95 recalcule ; E6 est une autre ligne constante à réparer", () => {
  const d = load("m21-ev01")
  assert.equal(literal(d, "A7", 1), "MOB-95")
  assert.equal(d.workbook.sheets[1].cells.E7.f, "=C7*D7")
  assert.equal(2 * literal(d, "D7", 1), 270)
  assert.equal(literal(d, "E6", 1), 240)
  assert.equal(literal(d, "C6", 1) * literal(d, "D6", 1), 240)
  assert.equal(step("M21-EV01-04").setup.selection, "E6")
})

check("M23 : les jours entiers respectent l'objectif de 7 000 €", () => {
  const d = load("m23-e01")
  const price = literal(d, "B3"), count = literal(d, "B4"), dailyCost = literal(d, "B5"), days = literal(d, "B6"), room = literal(d, "B7")
  const margin = (n: number, duration: number) => n * price - dailyCost * duration - room
  const needed = (7000 + dailyCost * days + room) / price
  const duration = (count * price - room - 7000) / dailyCost
  assert.equal(Math.ceil(needed), 10)
  assert.equal(margin(10, days), 7850)
  assert.equal(margin(count, Math.ceil(duration)), 6750)
  assert.equal(margin(count, Math.floor(duration)), 7400)
  assert(margin(count, 3) < 7000 && margin(count, 2) >= 7000)
})

check("M08/M12 : les totaux de référence incluent toutes les cellules légitimes", () => {
  const budget = load("m08-l03")
  const difference = [4, 5, 6, 7, 8].reduce((total, row) => total + literal(budget, `C${row}`) - literal(budget, `B${row}`), 0)
  assert.equal(difference, 1600)
  assert.equal(step("M08-L03-03").action.cells.D10.v, difference)
  const lots = load("m12-e01")
  const total = [2, 3, 4, 5, 6].reduce((sum, row) => sum + literal(lots, `C${row}`) * literal(lots, `D${row}`), 0)
  assert.equal(total, 1805)
  assert.equal(literal(lots, "C4") * literal(lots, "D4"), 440)
  const csv = load("m12-l03")
  const first = [2, 3, 4].reduce((sum, row) => {
    const fields = literal(csv, `A${row}`).split(";")
    return sum + Number(fields[2]) * Number(fields[3])
  }, 0)
  const paste = step("M12-L03-07").setup.paste.texte
  const second = paste.split("\n").reduce((sum: number, line: string) => {
    const fields = line.split("\t")
    return sum + Number(fields[2]) * Number(fields[3])
  }, 0)
  assert.equal(first, 254)
  assert.equal(first + second, 999)
})

check("M25 : NB.SI ignore la casse ; l'espace finale fait passer le compte de 3 à 4", () => {
  const d = load("m25-e02")
  const cities = Array.from({ length: 10 }, (_, i) => literal(d, `B${i + 2}`))
  const count = (items: string[]) => items.filter((v) => v.toLocaleLowerCase("fr-FR") === "lyon").length
  assert.equal(count(cities), 3)
  assert.equal(count(cities.map((c) => c === "LYON" ? "Lyon" : c)), 3)
  assert.equal(count(cities.map((c) => c.trim())), 4)
})

check("M26 : le CSV exemple donne 3, 2 ou 4 champs selon les séparateurs", () => {
  const line = "Dupont;1200,50;Lyon"
  assert.deepEqual(line.split(";"), ["Dupont", "1200,50", "Lyon"])
  assert.deepEqual(line.split(","), ["Dupont;1200", "50;Lyon"])
  assert.deepEqual(line.split(/[;,]/), ["Dupont", "1200", "50", "Lyon"])
})

check("M24 : chaque produit reçoit une illustration originale identifiable", () => {
  const titles: Record<string, string> = { clavier: "Clavier", souris: "Souris", ecran: "Écran", chaise: "Chaise", armoire: "Armoire basse", videoprojecteur: "Vidéoprojecteur", webcam: "Webcam" }
  const seen = new Set<string>()
  for (const file of fs.readdirSync(scenarios).filter((f) => /^m24.*\.json$/.test(f))) {
    const d = load(file.slice(0, -5))
    for (const s of d.steps) {
      const image = s.setup?.image
      if (!image) continue
      const label = literal(d, `B${image.ref.replace(/\D/g, "")}`).toLowerCase().replaceAll("é", "e")
      const name = Object.keys(titles).find((n) => label.includes(n))!
      assert(name)
      assert(image.source.startsWith("data:image/svg+xml;base64,"))
      const svg = Buffer.from(image.source.split(",")[1], "base64").toString("utf8")
      assert.equal(svg + "\n", fs.readFileSync(path.join(root, "public/illustrations/excel", `${name}.svg`), "utf8"))
      assert(svg.includes(`<title id="titre">${titles[name]}</title>`))
      assert(svg.includes('viewBox="0 0 240 160"'))
      assert(!/<script|https?:|<foreignObject/.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")))
      seen.add(image.source)
    }
  }
  assert.equal(seen.size, 7)
})

console.log(`${checks} contrôles de contenu et calculs indépendants réussis.`)
