/** Contrôle des écrans de lecture équipés d'une démonstration. */
import * as fs from "fs"
import * as path from "path"
import { planDemonstration } from "@/lib/simulation/demonstration"
import type { SimulationScenario } from "@/lib/simulation/types"

const DIR = "/Users/switchingformation/checkos/work/switching-lms/scripts/simulation/scenarios"
let ok = 0
const soucis: string[] = []

for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".json")).sort()) {
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))
  const feuille = (sc.workbook as any).sheets?.[0]
  const noms: string[] = ((sc.workbook as any).sheets ?? []).map((s: any) => s.name)
  // Le classeur ÉVOLUE : une cellule visée à l'étape 8 peut avoir été créée à
  // l'étape 3. Comparer au seul classeur de départ signalait à tort des cibles
  // parfaitement valides.
  const cells: Record<string, unknown> = { ...(feuille?.cells ?? {}) }
  for (const st of sc.steps as any[]) {
    for (const r of Object.keys(st.setup?.cells ?? {})) cells[r.toUpperCase()] = true
    // Ce que l'étape précédente faisait écrire compte aussi.
    const a = st.action ?? {}
    if (a.type === "TYPE" && a.target && a.target !== "formula-bar") cells[String(a.target).toUpperCase()] = true
    if (a.type === "EXPECT_STATE") for (const r of Object.keys(a.cells ?? {})) cells[r.toUpperCase()] = true
    if (a.type === "FILL_HANDLE" && a.to) for (const r of String(a.to).split(":")) cells[r.toUpperCase()] = true
    if (!st.montrer) continue
    const plans = st.montrer.map(planDemonstration)
    const vides = plans.filter((p: any) => !p || p.gestes.length === 0).length
    if (vides) { soucis.push(`${f} ${st.id} — ${vides} action(s) sans plan`); continue }
    // Un champ mal nommé (`col` au lieu de `column`) produit un plan d'apparence
    // valide dont la cible vaut « undefined » — la grille tournait alors en
    // boucle et figeait la page entière. On relit donc chaque cible résolue.
    for (const pl of plans as any[]) {
      for (const g of pl.gestes) {
        const c = g.cible
        const val =
          c.k === "cellule" || c.k === "plage" ? c.ref
          : c.k === "enteteColonne" ? c.col
          : c.k === "enteteLigne" ? c.ligne
          : c.k === "dom" ? c.sel
          : "clavier"
        if (val === undefined || val === null || String(val).includes("undefined")) {
          soucis.push(`${f} ${st.id} — cible incomplète (${c.k}) : champ d'action mal nommé ?`)
        }
      }
    }
    // Les cellules visées doivent exister dans le classeur de départ.
    for (const a of st.montrer as any[]) {
      const refs: string[] = []
      if (a.cell) refs.push(a.cell)
      if (a.range) refs.push(...a.range.split(":"))
      if (a.target && /^[A-Z]+\d+$/i.test(a.target)) refs.push(a.target)
      for (const r of refs) {
        if (!(r.toUpperCase() in cells)) soucis.push(`${f} ${st.id} — ${r} absente du classeur`)
      }
      if (a.type === "SELECT_SHEET" && !noms.includes(a.name)) {
        soucis.push(`${f} ${st.id} — feuille « ${a.name} » inconnue (${noms.join(", ")})`)
      }
    }
    // Une démonstration ne peut rien montrer quand le classeur n'est PAS affiché :
    // le calque vit dans la zone de grille, absente tant que le poste de travail
    // montre le bureau ou l'écran d'accueil d'Excel. La séquence se jouait alors
    // entièrement à blanc — et pire, l'apprenant perdait son bouton « Voir le
    // geste » au profit d'une démonstration invisible, sans même un « Revoir »
    // avant la fin. Constaté sur `M01-L01-14` (deux raccourcis clavier).
    if (sc.poste) {
      let etat = sc.poste.excelOuvert ? "classeur" : "ferme"
      for (const p of sc.steps as any[]) {
        const sp = p.setup?.poste
        if (sp?.excel) etat = sp.excel
        if (p.id === st.id) break
      }
      if (etat !== "classeur") {
        soucis.push(
          `${f} ${st.id} — démonstration impossible : le poste affiche « ${etat} », le classeur n'est pas à l'écran`,
        )
      }
    }
    // Une lecture ne doit pas jouer le geste que l'étape SUIVANTE va demander :
    // ce serait donner la réponse avant la question.
    const suivante = (sc.steps as any[])[(sc.steps as any[]).indexOf(st) + 1]
    if (suivante) {
      const cible = (a: any) => a?.cell ?? a?.range ?? a?.target ?? a?.col ?? a?.name ?? null
      const apres = cible(suivante.action)
      if (apres && (st.montrer as any[]).some((m) => cible(m) === apres)) {
        soucis.push(`${f} ${st.id} — montre déjà ${apres}, que l'étape suivante demande`)
      }
    }
    ok++
  }
}
console.log(`\n${ok} écrans de lecture avec démonstration vérifiée`)
if (soucis.length) { console.log(`\n${soucis.length} point(s) à corriger :`); soucis.forEach((s) => console.log("  ·", s)) }
else console.log("aucune cible dans le vide")
