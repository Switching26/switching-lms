/** Régressions concrètes de l'audit Excel du 02/10/2026, sans base ni navigateur.
 * --baseline <répertoire> confronte les mêmes gestes au code avant correction.
 */
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { trierPlageFr, referenceNomAbsolue, referencesCellulesDuSnapshot, texteCelluleBrut, plageDansBornes } from "../../lib/simulation/grid-runtime"
import { cadreRapportTcd } from "../../lib/simulation/pivot-layout"

async function main() {
  const baseline = process.argv.indexOf("--baseline")
  const racine = baseline >= 0 ? path.resolve(process.argv[baseline + 1]) : path.resolve(__dirname, "../..")
  const charger = (fichier: string) => import(pathToFileURL(path.join(racine, fichier)).href)
  const { validateStep } = await charger("lib/simulation/validate.ts")
  const { normalizeFormula } = await charger("lib/simulation/types.ts")
  const { expurgerScenarioNote } = await charger("lib/simulation/expurge.ts")
  const cas: Array<[string, () => void]> = [
    ["EXCEL-M15-001 : vraie formule de recopie avec feuilles citées acceptée", () => {
      const step = { id: "M15-L04-03", consigne: "Recopiez B3:B5", action: { type: "EXPECT_STATE", cells: { B4: { v: 160100, anyOf: ["=T1!B3+T2!B3+T3!B3+T4!B3"] } } } }
      assert.equal(validateStep(step, { kind: "stateChange", readings: { B4: { formula: "='T1'!B3+'T2'!B3+'T3'!B3+'T4'!B3", value: 160100 } } }).ok, true)
    }],
    ["Noms de feuilles et textes cités ne perdent pas leur sens", () => {
      assert.notEqual(normalizeFormula("='Site Nord'!B2"), normalizeFormula("='SiteNord'!B2"))
      assert.notEqual(normalizeFormula('=SI(A1=1;"A,B";"C D")'), normalizeFormula('=SI(A1=1;"A;B";"CD")'))
      assert.notEqual(normalizeFormula('=EXACT(A1;"Paris")'), normalizeFormula('=EXACT(A1;"PARIS")'))
      assert.equal(normalizeFormula(" = somme ( 'T1'! B2 , 'T2'!B2 ) "), normalizeFormula("=SOMME(T1!B2;T2!B2)"))
    }],
    ["EXCEL-M16-001 : mauvaise alternative SOMMEPROD refusée même avant recalcul", () => {
      const formule = "=SOMMEPROD(B5:C5;$I$4:$I$5)/SOMME($I$4:$I$5)"
      const step = { id: "M16-E01-01", consigne: "Score pondéré", action: { type: "TYPE", target: "D5", accept: [formule], formulaMode: true } }
      assert.equal(validateStep(step, { kind: "typed", target: "D5", text: formule, channel: "keyboard", computed: 87.3333 }).ok, false)
      const juste = "=SOMMEPROD(B5:C5;$I$4:$J$4)/SOMME($I$4:$J$4)"
      assert.equal(validateStep({ ...step, action: { ...step.action, accept: [juste] } }, { kind: "typed", target: "D5", text: juste, channel: "keyboard", computed: 87.3333 }).ok, true)
      const transpose = "=SOMMEPROD(B5:C5;TRANSPOSE($I$4:$I$5))/SOMME($I$4:$I$5)"
      assert.equal(validateStep({ ...step, action: { ...step.action, accept: [transpose] } }, { kind: "typed", target: "D5", text: transpose, channel: "keyboard", computed: 87.3333 }).ok, true)
    }],
    ["M19-EVALUATION-TRIE-LES-TITRES : portée du tri conservée, réponse masquée", () => {
      const action = { type: "SORT_RANGE", range: "A2:E13", column: "E", ascending: false }
      const step = { id: "M19-EV01-05", consigne: "Appliquez le premier des deux tris.", action }
      const servi = expurgerScenarioNote({ steps: [step], workbook: { sheets: [{ cells: { A1: { v: "Client" }, E13: { v: 640 } } }] } })
      assert.deepEqual(servi.steps[0].action, { type: "SORT_RANGE", range: "A2:E13" })
      assert.equal(validateStep(step, { kind: "sort", range: "A1:E13", column: "E", ascending: false }).ok, false)
      assert.equal(validateStep(step, { kind: "sort", range: "A2:E13", column: "E", ascending: false }).ok, true)
    }],
    ["A0109-011 : le bon texte doit être validé avec la touche demandée", () => {
      const step = { id: "M03-L03-06", consigne: "Saisissez Site Ouest puis Tab", action: { type: "TYPE", target: "A7", accept: ["Site Ouest"], commitKey: "Tab" } }
      const saisie = { kind: "typed", target: "A7", text: "Site Ouest", channel: "keyboard" }
      assert.equal(validateStep(step, { ...saisie, commitKey: "Enter" }).ok, false)
      assert.equal(validateStep(step, saisie).ok, false)
      assert.equal(validateStep(step, { ...saisie, commitKey: "Tab" }).ok, true)
      assert.equal(validateStep({ ...step, action: { ...step.action, commitKey: undefined } }, { ...saisie, commitKey: "Enter" }).ok, true)
    }],
  ]
  if (baseline < 0) cas.push(
    ["M19-TRI-NON-RECONNU : tri français, en-tête intact, observation unique", () => {
      const valeurs: Record<string, unknown> = { A1: "Client", B1: "Montant", A2: "Girard", B2: 640, A3: "Delaunay", B3: 2100, A4: "Évrard", B4: 950 }
      const observations: unknown[] = []
      assert.equal(trierPlageFr({ getFormula: () => "", getValue: (r) => valeurs[r], applyCells: (cells) => { for (const [r, c] of Object.entries(cells)) valeurs[r] = c.v }, onSort: (o) => observations.push(o) }, "A2:B4", 1, false), true)
      assert.equal(valeurs.A1, "Client")
      assert.deepEqual([valeurs.A2, valeurs.A3, valeurs.A4], ["Delaunay", "Évrard", "Girard"])
      assert.deepEqual(observations, [{ kind: "sort", range: "A2:B4", column: "B", ascending: false }])
      assert.equal(trierPlageFr({ getFormula: () => "", getValue: () => 0, applyCells: () => { throw new Error("écriture refusée") }, onSort: () => observations.push("fausse réussite") }, "A2:B4", -1, false), false)
      assert.equal(observations.length, 1)
    }],
    ["EXCEL-M14-002 : noms absolus et noms de feuilles échappés", () => {
      assert.equal(referenceNomAbsolue("Feuil1", "B1"), "'Feuil1'!$B$1")
      assert.equal(referenceNomAbsolue("Chiffre d'affaires", "B2:B7"), "'Chiffre d''affaires'!$B$2:$B$7")
      assert.equal(referenceNomAbsolue("Feuil1", "not-a-range"), null)
    }],
    ["A0109-C05 : valeur brute monétaire et formules sélectionnées", () => {
      assert.equal(texteCelluleBrut("", 1234.5), "1234,5")
      assert.equal(texteCelluleBrut("=SOMME(B2:B5)", 1234.5), "=SOMME(B2:B5)")
      assert.equal(texteCelluleBrut("", "Client Nord"), "Client Nord")
      assert.equal(texteCelluleBrut("", null), "")
    }],
    ["A0109-002 : photographie incluant H1/H2 et styles hors rectangle initial", () => {
      assert.deepEqual(referencesCellulesDuSnapshot({ 0: { 0: { v: "Client" }, 7: { v: "PARASITE AVANT" } }, 1: { 7: { v: "PARASITE APRES" } }, 40: { 12: { s: "bold" }, 13: { f: "=A1" } } }), ["A1", "H1", "H2", "M41", "N41"])
    }],
    ["TCD-02/03 : rapport borné avant le volet, même si destination hors champ", () => {
      for (const width of [1440, 1024, 768]) {
        const cadre = cadreRapportTcd({ left: 850, top: 80, width: 640, height: 500 }, width, 380)
        assert.ok(cadre.left + cadre.width <= width - 288)
        assert.ok(cadre.width >= Math.min(240, width - 288))
        assert.ok(cadre.top + cadre.maxHeight <= 380)
      }
    }],
    ["M24 : le tri déplace le document d'image et son style avec son produit", () => {
      const image = { p: { drawings: { clavier: { source: "svg-clavier" } } }, s: "style-clavier", v: "", t: 1 }
      const cells: Record<string, Record<string, unknown>> = { A2: image, B2: { v: "Clavier" }, A3: { p: { drawings: { souris: { source: "svg-souris" } } } }, B3: { v: "Souris" } }
      trierPlageFr({ getFormula: () => "", getValue: (r) => cells[r]?.v ?? "", getCellData: (r) => cells[r] ?? {}, applyCells: (values) => Object.assign(cells, values), onSort: () => {} }, "A2:B3", 1, false)
      assert.equal(cells.B2.v, "Souris")
      assert.deepEqual(cells.A3, image)
      assert.equal((cells.A2.p as { drawings: unknown }).drawings !== undefined, true)
    }],
    ["TCD : les lectures hors bornes sont refusées avant construction native", () => {
      assert.equal(plageDansBornes("P40", 40, 16), true)
      assert.equal(plageDansBornes("Q40", 40, 16), false)
      assert.equal(plageDansBornes("A41", 40, 16), false)
      assert.equal(plageDansBornes("A1:Q8", 40, 16), false)
      assert.equal(plageDansBornes("unknown", 40, 16), false)
    }],
  )
  let echecs = 0
  for (const [nom, tester] of cas) {
    try { tester(); console.log(`✓ ${nom}`) } catch (e) { echecs++; console.error(`✗ ${nom} : ${(e as Error).message}`) }
  }
  console.log(`${cas.length - echecs}/${cas.length} cas réussis${baseline >= 0 ? " sur version avant correction" : ""}`)
  process.exitCode = echecs ? 1 : 0
}
void main()
