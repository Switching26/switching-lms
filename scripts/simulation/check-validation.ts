/**
 * Contrôle de VALIDATION : pour chaque étape de chaque scénario, fabrique
 * l'observation canonique — exactement ce qu'un apprenant produit en faisant ce
 * que la consigne demande — et vérifie que `validateStep` l'accepte.
 *
 * Ce que ça attrape, et que rien d'autre ne voit : une étape dont la réponse
 * déclarée serait REFUSÉE par le moteur de validation. L'apprenant ferait
 * exactement ce qu'on lui demande et resterait bloqué.
 *
 * Autonome, sans navigateur ni base : `validateStep` est une fonction pure.
 *
 * LIMITE À CONNAÎTRE : pour `EXPECT_STATE`, la lecture est construite depuis
 * l'attente elle-même, donc la comparaison de VALEUR est circulaire — ce test
 * n'aurait pas attrapé le « 346,67 au lieu de 346,6666… ». C'est l'audit de
 * valeurs, qui recalcule dans le moteur, qui couvre ce risque-là. Les deux
 * contrôles sont complémentaires, pas redondants.
 *
 * Là où il n'est PAS circulaire et vaut vraiment : la normalisation des réponses
 * tapées, les comparaisons géométriques de plages, l'insensibilité à la casse,
 * et l'aller-retour famille → motif → famille des formats de nombre.
 */
import * as fs from "fs"
import * as path from "path"
import { validateStep, type ObservedAction } from "../../lib/simulation/validate"
import type { SimulationScenario, SimulationStep } from "../../lib/simulation/types"

const DIR = path.join(__dirname, "scenarios")

/** L'observation qu'un apprenant produit en exécutant correctement l'étape. */
function observationCanonique(s: SimulationStep): ObservedAction | null {
  const a = s.action
  switch (a.type) {
    case "READ":
      return { kind: "next" }
    case "TYPE": {
      const texte = a.accept?.[0]
      if (texte === undefined) return null
      return {
        kind: "typed",
        target: a.target,
        text: texte,
        channel: a.target === "formula-bar" ? "formulaBar" : "keyboard",
      }
    }
    case "CLICK_CELL":
      return { kind: "cellClick", cell: a.cell, channel: "mouse" }
    case "CLICK_CONTROL":
      return { kind: "control", control: a.control, channel: "ribbon" }
    case "SELECT_COLUMN":
      return { kind: "selectColumn", column: a.column }
    case "SELECT_ROW":
      return { kind: "selectRow", row: a.row }
    case "SELECT_SHEET":
      return { kind: "selectSheet", name: a.name }
    case "GOTO_REF":
      return { kind: "gotoRef", ref: a.ref }
    case "DEFINE_NAME":
      return { kind: "defineName", name: a.name, ref: a.ref ?? "A1" }
    case "DRAG_RANGE":
      return { kind: "dragRange", range: a.range }
    case "FILL_HANDLE":
      return { kind: "fillHandle", from: a.from, to: a.to }
    case "KEY":
      return { kind: "key", key: a.key }
    case "CONTEXT_MENU":
      return { kind: "contextMenu", target: a.target }
    case "DOUBLE_CLICK":
      return { kind: "doubleClick", target: a.target }
    case "SORT_RANGE":
      return { kind: "sort", range: a.range, column: a.column, ascending: a.ascending }
    case "FILTER_COLUMN":
      return { kind: "filter", column: a.column, values: a.values }
    case "EXPECT_STATE": {
      // L'apprenant a atteint l'état attendu : on fabrique la lecture idéale.
      const readings: Record<string, { formula: string; value: unknown }> = {}
      for (const [ref, att] of Object.entries(a.cells)) {
        readings[ref] = { formula: att.anyOf?.[0] ?? att.f ?? "", value: att.v }
      }
      return { kind: "stateChange", readings }
    }
    case "EXPECT_FORMAT": {
      const readings: Record<
        string,
        { background: string; fontSize: number | null; hAlign: string; vAlign: string; wrap: boolean | null; numberFormat: string }
      > = {}
      const MOTIF: Record<string, string> = {
        monetaire: '#,##0.00" €"',
        pourcentage: "0.00%",
        date: "dd/mm/yyyy",
        nombre: "#,##0.00",
        aucun: "",
      }
      const ALIGN: Record<string, string> = { left: "1", center: "2", right: "3" }
      const VALIGN: Record<string, string> = { top: "1", middle: "2", bottom: "3" }
      for (const [ref, att] of Object.entries(a.cells)) {
        readings[ref] = {
          background: att.background ?? "",
          fontSize: att.fontSize ?? null,
          hAlign: att.hAlign ? ALIGN[att.hAlign] : "",
          vAlign: att.vAlign ? VALIGN[att.vAlign] : "",
          wrap: att.wrap ?? null,
          numberFormat: att.numberFormat ? MOTIF[att.numberFormat] : "",
        }
      }
      return { kind: "formatChange", readings }
    }
    default:
      return null
  }
}

let etapes = 0
let refus = 0
let nonCouvertes = 0
const fichiers = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()

for (const f of fichiers) {
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))
  for (const s of sc.steps) {
    etapes++
    const obs = observationCanonique(s)
    if (!obs) {
      nonCouvertes++
      console.log(`   ?  ${f} · ${s.id} · ${s.action.type} : pas d'observation canonique construite`)
      continue
    }
    const v = validateStep(s, obs)
    if (!v.ok) {
      refus++
      console.log(`   ✗  ${f} · ${s.id} · ${s.action.type} REFUSÉ : ${v.reason} — « ${v.message} »`)
    }
  }
}

console.log()
console.log(`${etapes} étape(s) sur ${fichiers.length} scénarios`)
console.log(`${nonCouvertes} action(s) sans observation canonique`)
if (refus === 0) console.log("AUCUN REFUS : chaque étape accepte la réponse qu'elle déclare.")
else {
  console.log(`${refus} REFUS — un apprenant faisant ce qui est demandé serait bloqué.`)
  process.exitCode = 1
}
