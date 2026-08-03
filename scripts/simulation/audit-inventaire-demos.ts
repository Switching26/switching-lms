/**
 * INVENTAIRE des démonstrations — cartographie du corpus par FAMILLE D'ÉTAT.
 *
 *   npx tsx scripts/simulation/audit-inventaire-demos.ts
 *
 * Ce n'est pas un contrôle : c'est la carte qui dit OÙ chercher. Elle recense,
 * pour chacune des 1 882 étapes, le plan réellement produit par
 * `planDemonstration` (donc après `rendreAgissant`), les contrôles qu'il presse,
 * les cellules qu'il écrit, et range chaque étape dans une famille d'état
 * mutable — grille, ruban, poste, mise en page, graphique, tableau croisé,
 * macro, feuilles, noms, tri/filtre.
 *
 * La question à laquelle elle répond : « une deuxième exécution du même plan
 * produit-elle le même écran ? » Un bouton qui BASCULE (gras, filtre, figer les
 * volets) répond non ; un bouton qui POSE (format monétaire, orientation
 * paysage) répond oui. Le rejeu d'une démonstration exécute le plan une seconde
 * fois : toute étape dont le plan presse un bouton bascule est un candidat.
 */

import * as fs from "fs"
import * as path from "path"
import { planDemonstration, type PlanDemo } from "@/lib/simulation/demonstration"
import type { RibbonTab, SimulationScenario, SimulationStep } from "@/lib/simulation/types"

const DIR = path.join(__dirname, "scenarios")

/**
 * Contrôles dont la deuxième pression DÉFAIT la première.
 *
 * Établi en relisant `handleControl` dans `SimulationPlayer` : chacun de ceux-ci
 * lit l'état courant et écrit son contraire (`!gras`, `filtre ? null : …`).
 * Cette liste est vérifiée au navigateur, elle n'est pas une supposition.
 */
const BASCULE = new Set([
  "acc-gras", "acc-italique", "acc-souligne", "acc-fusionner", "acc-renvoyer-ligne",
  "don-filtrer", "dev-references-relatives", "acc-format", "acc-format-fleche", "bf-fx",
  "dev-macros", "aff-figer-volets",
])

/** Contrôles qui AJOUTENT un objet : deux pressions, deux objets. */
const ACCUMULE = new Set([
  "ins-tcd", "ins-graph-histogramme", "ins-graph-barres", "ins-graph-courbes",
  "ins-graph-secteurs", "ins-graph-aires", "ins-graph-nuage", "ins-graph-recommande",
  "acc-inserer", "acc-supprimer", "mep-saut-inserer", "rev-commentaire",
  "acc-mfc-regle", "dev-enregistrer-macro",
])

type Famille =
  | "grille" | "format" | "ruban-bascule" | "poste" | "mise-en-page"
  | "graphique" | "tcd" | "macro" | "feuille" | "nom" | "tri-filtre"
  | "selection" | "clavier" | "illustration" | "aucun"

function familleDe(type: string): Famille {
  switch (type) {
    case "TYPE": case "EXPECT_STATE": return "grille"
    case "EXPECT_FORMAT": return "format"
    case "EXPECT_POSTE": return "poste"
    case "EXPECT_PAGE_SETUP": return "mise-en-page"
    case "EXPECT_CHART": case "SELECT_CHART_ELEMENT": return "graphique"
    case "EXPECT_PIVOT": return "tcd"
    case "EXPECT_MACRO": case "RECORD_MACRO": return "macro"
    case "SELECT_SHEET": return "feuille"
    case "DEFINE_NAME": case "GOTO_REF": return "nom"
    case "SORT_RANGE": case "FILTER_COLUMN": return "tri-filtre"
    case "CLICK_CELL": case "CLICK_CELL_MODIFIER": case "DRAG_RANGE":
    case "SELECT_COLUMN": case "SELECT_ROW": return "selection"
    case "KEY": case "DOUBLE_CLICK": case "CONTEXT_MENU": return "clavier"
    case "MONTRER": return "illustration"
    case "CLICK_CONTROL": return "ruban-bascule"
    default: return "aucun"
  }
}

type Ligne = {
  fichier: string
  mode: string
  etape: string
  index: number
  type: string
  ecran: "READ" | "ACTION"
  famille: Famille
  gestes: number
  presse: string[]
  ecrit: string[]
  definit: number
  ouvreOnglet: string[]
  bascules: string[]
  accumule: string[]
}

/** Onglet du ruban actif à cette étape, déduit des `setup` cumulés. */
function ongletCourant(steps: SimulationStep[], jusqua: number, depart: RibbonTab): RibbonTab {
  let t = depart
  for (let i = 0; i <= jusqua; i++) {
    const r = steps[i]?.setup?.ribbonTab
    if (r) t = r as RibbonTab
  }
  return t
}

const lignes: Ligne[] = []
let scenarios = 0
let etapes = 0

for (const nom of fs.readdirSync(DIR).filter((n) => n.endsWith(".json")).sort()) {
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"))
  scenarios++
  const steps = sc.steps ?? []
  const posteInitialBoite = "aucune" as const
  steps.forEach((s, i) => {
    etapes++
    const onglet = ongletCourant(steps, i, (sc.workbook?.ribbonTab as RibbonTab) ?? "accueil")
    const ctx = { onglet, boitePoste: (s.setup?.poste?.boite ?? posteInitialBoite) as "aucune" | "enregistrer" | "ouvrir", setup: s.setup }
    const lecture = s.action.type === "READ"
    const plans: PlanDemo[] = []
    if (s.montrer?.length) {
      for (const a of s.montrer) {
        const p = planDemonstration(a, ctx)
        if (p) plans.push(p)
      }
    } else if (!lecture && sc.mode !== "EVALUATION") {
      const p = planDemonstration(s.action, ctx)
      if (p) plans.push(p)
    }
    if (plans.length === 0) return
    const gestes = plans.flatMap((p) => p.gestes)
    const presse = gestes.flatMap((g) => (g.presser ? [g.presser.id] : []))
    const ecrit = gestes.flatMap((g) => (g.ecrire ? [g.ecrire.ref] : []))
    const familleAction = s.montrer?.length
      ? familleDe(s.montrer[0].type)
      : familleDe(s.action.type)
    lignes.push({
      fichier: nom.replace(".json", ""),
      mode: sc.mode ?? "LESSON",
      etape: s.id,
      index: i,
      type: s.montrer?.length ? `READ+${s.montrer.map((m) => m.type).join("/")}` : s.action.type,
      ecran: lecture ? "READ" : "ACTION",
      famille: lecture ? "illustration" : familleAction,
      gestes: gestes.length,
      presse,
      ecrit,
      definit: gestes.filter((g) => g.definir).length,
      ouvreOnglet: gestes.flatMap((g) => (g.onglet ? [g.onglet] : [])),
      bascules: presse.filter((c) => BASCULE.has(c)),
      accumule: presse.filter((c) => ACCUMULE.has(c)),
    })
  })
}

/* ── Sortie ─────────────────────────────────────────────────────────────── */

const parFamille = new Map<string, { etapes: number; gestes: number; presse: number; ecrit: number; read: number }>()
for (const l of lignes) {
  const k = l.famille
  const e = parFamille.get(k) ?? { etapes: 0, gestes: 0, presse: 0, ecrit: 0, read: 0 }
  e.etapes++
  e.gestes += l.gestes
  e.presse += l.presse.length
  e.ecrit += l.ecrit.length
  if (l.ecran === "READ") e.read++
  parFamille.set(k, e)
}

console.log(`Corpus : ${scenarios} scénarios · ${etapes} étapes · ${lignes.length} démonstrations jouables\n`)
console.log("FAMILLE                étapes   gestes   pressions   écritures   dont READ")
for (const [k, v] of [...parFamille.entries()].sort((a, b) => b[1].etapes - a[1].etapes))
  console.log(`${k.padEnd(20)} ${String(v.etapes).padStart(7)} ${String(v.gestes).padStart(8)} ${String(v.presse).padStart(11)} ${String(v.ecrit).padStart(11)} ${String(v.read).padStart(11)}`)

const compteCtrl = new Map<string, number>()
for (const l of lignes) for (const c of l.presse) compteCtrl.set(c, (compteCtrl.get(c) ?? 0) + 1)
console.log(`\nContrôles pressés par les démonstrations : ${compteCtrl.size} distincts`)
for (const [c, n] of [...compteCtrl.entries()].sort((a, b) => b[1] - a[1])) {
  const marque = BASCULE.has(c) ? "  ⇄ BASCULE" : ACCUMULE.has(c) ? "  + ACCUMULE" : ""
  console.log(`   ${c.padEnd(34)} ${String(n).padStart(4)}${marque}`)
}

const risque = lignes.filter((l) => l.bascules.length || l.accumule.length)
console.log(`\nÉtapes dont le plan presse un bouton NON IDEMPOTENT : ${risque.length}`)
const parCtrl = new Map<string, string[]>()
for (const l of risque)
  for (const c of [...l.bascules, ...l.accumule])
    parCtrl.set(c, [...(parCtrl.get(c) ?? []), `${l.fichier}#${l.index}`])
for (const [c, l] of [...parCtrl.entries()].sort((a, b) => b[1].length - a[1].length))
  console.log(`   ${c.padEnd(30)} ${String(l.length).padStart(4)}   ex. ${l.slice(0, 4).join(", ")}`)

fs.writeFileSync(
  path.join(__dirname, "..", "..", ".audit-inventaire-demos.json"),
  JSON.stringify(lignes, null, 1),
)
console.log(`\nDétail écrit dans .audit-inventaire-demos.json (${lignes.length} lignes)`)
