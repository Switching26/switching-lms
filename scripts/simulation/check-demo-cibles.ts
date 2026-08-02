/**
 * Contrôle des CIBLES des démonstrations — le chaînon que ni
 * `check-demonstration.ts` ni `check-montrer.ts` ne couvraient.
 *
 *   npx tsx scripts/simulation/check-demo-cibles.ts
 *
 * POURQUOI CE FICHIER EXISTE
 * `check-demonstration.ts` annonce « 1 654 interactives · avec démonstration :
 * 1 654 (100 %) ». Ce compteur dit seulement qu'un PLAN existe, jamais qu'il
 * montre quelque chose. Or `DemonstrationGeste` ne rend le repère, la bulle et
 * le curseur que si `resoudre(geste.cible)` renvoie un rectangle : quand la
 * cible n'est pas résoluble, le geste se joue À BLANC — rien à l'écran, mais la
 * minuterie tourne, le compteur avance et « Revoir » apparaît à la fin. Un
 * audit qui se contente de « n / n atteint » valide donc une démonstration
 * invisible.
 *
 * Trois classes de cible irrésoluble, toutes rencontrées :
 *
 *  1. Un `{k:"dom"}` qui vise un bouton rangé sous un AUTRE onglet du ruban que
 *     celui de l'étape. Le ruban ne rend que l'onglet actif : le sélecteur ne
 *     trouve rien. La démonstration n'a alors aucun moyen d'y arriver — elle ne
 *     change pas d'onglet.
 *  2. Un `{k:"dom"}` qui vise un contrôle rendu par un panneau (graphique,
 *     tableau croisé, mise en page, macro) fermé à ce moment-là.
 *  3. Une cellule hors des bornes de la grille — depuis le bornage du 29/07,
 *     la feuille ne fait plus 1 000 lignes mais `max(40, maxLigne + 20)`.
 *
 * Ce contrôle raisonne sans navigateur : le plan est une donnée pure, l'onglet
 * actif se déduit des `setup`, et les bornes de la grille se recalculent depuis
 * le classeur déclaré. Il ne remplace pas le rejeu réel — il le rend utile, en
 * écartant d'avance ce qui ne pouvait pas marcher.
 */

import * as fs from "fs"
import * as path from "path"
import { planDemonstration, type CibleDemo } from "@/lib/simulation/demonstration"
import type { SimulationScenario, RibbonTab } from "@/lib/simulation/types"

const DIR = path.join(__dirname, "scenarios")
const COMPOSANTS = path.join(__dirname, "..", "..", "components", "simulation")

/* ── Où vit chaque bouton ? ───────────────────────────────────────────────────
   Le ruban est un `switch` d'onglets : `{activeTab === "donnees" && (…)}`. On
   relit donc le composant en suivant l'onglet courant, et l'on retient pour
   chaque identifiant le ou les onglets qui le rendent. Les contrôles rencontrés
   AVANT le premier onglet (barre de titre, accès rapide) et APRÈS la fin du
   `switch` (barre de formule, onglets de feuille) sont là en permanence. */

const TOUJOURS = "*"
const ongletsParControle: Record<string, string[]> = {}

function noter(id: string, onglet: string) {
  const l = ongletsParControle[id] ?? []
  if (!l.includes(onglet)) l.push(onglet)
  ongletsParControle[id] = l
}

/* Tout littéral en tiret-bas est un identifiant candidat : les boutons sont
   écrits tantôt `data-control="…"`, tantôt `id="…"`, tantôt en tableau
   (`["paysage", "Paysage", "mep-orientation-paysage"]`). Un motif étroit passait
   à côté de la moitié d'entre eux et accusait à tort des contrôles bien rendus. */
const IDENTIFIANT = /"([a-z][a-z0-9]*(?:-[a-z0-9]+)+)"/g

{
  const src = fs.readFileSync(path.join(COMPOSANTS, "SimulationChrome.tsx"), "utf8").split("\n")
  let courant = TOUJOURS
  for (const ligne of src) {
    const chg = /activeTab === "([a-z-]+)"/.exec(ligne)
    if (chg) courant = chg[1]
    // Fin du switch d'onglets : le repli « Onglet … » puis la barre de formule.
    else if (/^\s*\{!\(/.test(ligne)) courant = TOUJOURS
    for (const m of ligne.matchAll(IDENTIFIANT)) noter(m[1], courant)
  }
}

/* Les couches par-dessus la feuille (graphique, tableau croisé, mise en page,
   macro, poste de travail) ne sont pas des onglets : elles s'ouvrent selon
   l'étape. On les note à part pour ne pas crier au loup, mais on les signale
   comme à confirmer au navigateur.

   `poste.ts` est lu avec elles : le bureau construit ses identifiants depuis la
   table `CONTROLES_POSTE`, donc aucun ne figure en clair dans le composant. */
const PANNEAUX: Record<string, string> = {
  "PageLayoutLayer.tsx": "mise en page",
  "PivotLayer.tsx": "tableau croisé",
  "MacroPanel.tsx": "macro",
  "ChartLayer.tsx": "graphique",
  "DesktopLayer.tsx": "poste de travail",
}
const panneauParControle: Record<string, string> = {}
for (const [fichier, nom] of Object.entries(PANNEAUX)) {
  const p = path.join(COMPOSANTS, fichier)
  if (!fs.existsSync(p)) continue
  const src = fs.readFileSync(p, "utf8")
  for (const m of src.matchAll(IDENTIFIANT)) if (!panneauParControle[m[1]]) panneauParControle[m[1]] = nom
}
{
  const p = path.join(__dirname, "..", "..", "lib", "simulation", "poste.ts")
  if (fs.existsSync(p)) {
    const src = fs.readFileSync(p, "utf8")
    for (const m of src.matchAll(IDENTIFIANT))
      if (m[1].startsWith("poste-") && !panneauParControle[m[1]]) panneauParControle[m[1]] = "poste de travail"
  }
}

/* ── Bornes de la grille, telles que `applyWorkbook` les pose ──────────────── */

function colVersIndex(col: string): number {
  let n = 0
  for (const c of col.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

function decouper(ref: string): { col: number; ligne: number } | null {
  const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref.trim())
  if (!m) return null
  return { col: colVersIndex(m[1]), ligne: parseInt(m[2], 10) - 1 }
}

/* ── Lecture ──────────────────────────────────────────────────────────────── */

const erreurs: string[] = []
const aConfirmer: string[] = []
let etapes = 0
let interactives = 0
let horsPortee = 0
let gestes = 0
let ciblesDom = 0

for (const nom of fs.readdirSync(DIR).filter((n) => n.endsWith(".json")).sort()) {
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"))
  const feuilles: any[] = (sc.workbook as any).sheets ?? []

  // Bornes : le classeur de départ, plus tout ce que les étapes font naître.
  let maxLigne = 0
  let maxCol = 0
  const compter = (ref: string) => {
    const d = decouper(ref)
    if (!d) return
    if (d.ligne > maxLigne) maxLigne = d.ligne
    if (d.col > maxCol) maxCol = d.col
  }
  for (const f of feuilles) for (const r of Object.keys(f.cells ?? {})) compter(r)
  for (const st of sc.steps as any[]) {
    for (const r of Object.keys(st.setup?.cells ?? {})) compter(r)
    const a = st.action ?? {}
    if (a.type === "EXPECT_STATE") for (const r of Object.keys(a.cells ?? {})) compter(r)
  }
  const lignesMax = Math.max(40, maxLigne + 20)
  const colsMax = Math.max(16, maxCol + 8)

  let onglet: string = (sc.steps as any[])[0]?.setup?.ribbon?.activeTab ?? sc.ribbon[0] ?? "accueil"

  for (const st of sc.steps as any[]) {
    etapes++
    if (st.setup?.ribbon?.activeTab) onglet = st.setup.ribbon.activeTab
    if (st.action.type === "READ") continue
    interactives++
    // Une évaluation ne montre jamais le geste attendu : `demo` renvoie `null`.
    // Ces étapes sont hors du périmètre de ce contrôle, on les compte à part.
    if (sc.mode === "EVALUATION") {
      horsPortee++
      continue
    }
    const plan = planDemonstration(st.action, {
      onglet: onglet as RibbonTab,
      boitePoste: st.setup?.poste?.boite,
    })
    if (!plan || plan.gestes.length === 0) continue

    // Le plan ouvre lui-même l'onglet dont il a besoin : on suit ces ouvertures
    // au fil des gestes, exactement comme le calque les joue.
    let ongletDemo = onglet
    for (const g of plan.gestes) {
      gestes++
      const cibles: CibleDemo[] = [g.cible, ...(g.glisserVers ? [g.glisserVers] : [])]
      for (const c of cibles) {
        if (c.k === "clavier") continue
        if (c.k === "cellule" || c.k === "plage") {
          for (const part of c.ref.split(":")) {
            // Une référence inter-feuilles ne se résout pas : `getCellRect`
            // travaille sur la feuille affichée.
            if (part.includes("!")) {
              erreurs.push(`${nom} ${st.id} — cible « ${part} » sur une autre feuille : getCellRect ne sait pas la viser`)
              continue
            }
            const d = decouper(part)
            if (!d) {
              erreurs.push(`${nom} ${st.id} — référence illisible « ${part} » (${c.k})`)
              continue
            }
            if (d.ligne >= lignesMax || d.col >= colsMax) {
              erreurs.push(
                `${nom} ${st.id} — ${part} hors des bornes de la grille (${colsMax} colonnes × ${lignesMax} lignes) : geste invisible`,
              )
            }
          }
          continue
        }
        if (c.k === "enteteColonne") {
          const d = decouper(`${c.col}1`)
          if (!d) erreurs.push(`${nom} ${st.id} — en-tête de colonne illisible « ${c.col} »`)
          else if (d.col >= colsMax)
            erreurs.push(`${nom} ${st.id} — colonne ${c.col} hors des bornes (${colsMax} colonnes)`)
          continue
        }
        if (c.k === "enteteLigne") {
          if (!(c.ligne >= 1) || c.ligne > lignesMax)
            erreurs.push(`${nom} ${st.id} — ligne ${c.ligne} hors des bornes (${lignesMax} lignes)`)
          continue
        }
        // Cible DOM : le sélecteur doit désigner quelque chose de rendu MAINTENANT.
        ciblesDom++
        const m = /\[data-control="([^"]+)"\]/.exec(c.sel)
        if (!m) {
          aConfirmer.push(`${nom} ${st.id} — sélecteur libre « ${c.sel} » : à vérifier au navigateur`)
          continue
        }
        const id = m[1]
        const ou = ongletsParControle[id]
        if (!ou) {
          // Le bureau nomme ses fichiers et ses applications à la volée
          // (`poste-fichier-Budget.xlsx`) : le préfixe fait foi.
          const p = panneauParControle[id] ?? (id.startsWith("poste-") ? "poste de travail" : null)
          if (p) aConfirmer.push(`${nom} ${st.id} — « ${id} » vit dans le panneau ${p} : présence à confirmer`)
          else erreurs.push(`${nom} ${st.id} — « ${id} » n'est rendu par aucun composant : geste invisible`)
          continue
        }
        if (ou.includes(TOUJOURS)) continue
        if (!ou.includes(ongletDemo)) {
          erreurs.push(
            `${nom} ${st.id} — « ${id} » est sous l'onglet ${ou.join(" ou ")}, la démonstration en est à ${ongletDemo} : geste invisible`,
          )
        }
      }
      // Ce geste-ci ouvre un onglet : les suivants en héritent.
      if (g.onglet) ongletDemo = g.onglet
    }
  }
}

/* ── Rapport ──────────────────────────────────────────────────────────────── */

console.log(`\nCibles des démonstrations\n`)
console.log(`  ${etapes} étapes, ${interactives} interactives`)
console.log(`  ${horsPortee} en évaluation — aucune démonstration par construction`)
console.log(`  ${interactives - horsPortee} démonstrations atteignables, ${gestes} gestes, ${ciblesDom} cibles de châssis`)

if (aConfirmer.length) {
  console.log(`\n=== ${aConfirmer.length} À CONFIRMER AU NAVIGATEUR ===`)
  const vus: Record<string, number> = {}
  for (const a of aConfirmer) {
    const cle = a.replace(/^\S+ \S+ — /, "")
    vus[cle] = (vus[cle] ?? 0) + 1
  }
  for (const [cle, n] of Object.entries(vus).sort((x, y) => y[1] - x[1]).slice(0, 25))
    console.log(`  ⚠ ${n}× ${cle}`)
}

if (erreurs.length) {
  console.log(`\n=== ${erreurs.length} CIBLE(S) IRRÉSOLUBLE(S) ===`)
  for (const e of erreurs.slice(0, 60)) console.log("  ✗ " + e)
  if (erreurs.length > 60) console.log(`  … et ${erreurs.length - 60} autre(s)`)
  process.exitCode = 1
} else {
  console.log(`\n✓ Toutes les cibles de démonstration sont résolubles.`)
}
