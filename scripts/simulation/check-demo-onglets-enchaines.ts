/**
 * CONTRÔLE — une démonstration ne doit jamais désigner un bouton que le ruban
 * ne rend pas.
 *
 * Le ruban n'affiche que les boutons de l'onglet ouvert. Si un geste vise un
 * bouton rangé sous un AUTRE onglet et que rien ne l'ouvre, sa cible ne se
 * résout pas : le repère n'est jamais peint, la bulle explique un bouton
 * invisible, et le compteur va au bout quand même. L'apprenant ne voit rien et
 * le produit affiche « 4/4 ».
 *
 * Le contrôle rejoue, pour chaque étape et pour CHAQUE onglet de départ possible
 * du chapitre, le plan tel que le player le construit (`planSequence`), en
 * suivant l'onglet réellement ouvert au fil des gestes.
 *
 *   npx tsx scripts/simulation/check-demo-onglets-enchaines.ts
 *   npx tsx scripts/simulation/check-demo-onglets-enchaines.ts --piege
 */
import fs from "fs"
import path from "path"
import { planDemonstration, planSequence } from "../../lib/simulation/demonstration"
import type { RibbonTab, SimulationStep } from "../../lib/simulation/types"

const DOSSIER = path.join(__dirname, "scenarios")

/**
 * La table onglet↔contrôle n'est pas exportée : on la lit dans la SOURCE plutôt
 * que de la réécrire. Un parsing qui déraperait se verrait aussitôt — le
 * contrôle refuse de tourner sous 50 entrées.
 */
function tableOnglets(): Record<string, RibbonTab> {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "lib", "simulation", "demonstration.ts"), "utf8")
  const bloc = /const ONGLET_DU_CONTROLE: Record<string, RibbonTab> = \{([\s\S]*?)\n\}/.exec(src)
  if (!bloc) throw new Error("table ONGLET_DU_CONTROLE introuvable")
  const t: Record<string, RibbonTab> = {}
  for (const m of bloc[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) t[m[1]] = m[2] as RibbonTab
  if (Object.keys(t).length < 50) throw new Error(`table suspecte : ${Object.keys(t).length} entrées`)
  return t
}
const ONGLET = tableOnglets()

/** Gestes dont le bouton n'est pas sous l'onglet ouvert au moment où on le montre. */
function invisibles(gestes: any[], depart: RibbonTab): string[] {
  let courant = depart
  const out: string[] = []
  for (const g of gestes) {
    if (g?.onglet) { courant = g.onglet; continue }
    if (g?.cible?.k !== "dom") continue
    const m = /\[data-control="([^"]+)"\]/.exec(g.cible.sel ?? "")
    if (!m || !ONGLET[m[1]]) continue
    if (ONGLET[m[1]] !== courant) out.push(m[1])
  }
  return out
}

type Cas = { fichier: string; index: number; id: string; depart: RibbonTab; boutons: string[] }

/**
 * `enchaine = false` reproduit l'ANCIEN défaut : chaque action reçoit le même
 * onglet de départ, sans savoir que la précédente en a ouvert un autre. Sert au
 * piège — le contrôle DOIT rougir dans ce mode.
 */
function balayer(enchaine: boolean): { cas: Cas[]; etapes: number } {
  const cas: Cas[] = []
  let etapes = 0
  for (const f of fs.readdirSync(DOSSIER).filter((x) => x.endsWith(".json")).sort()) {
    const sc = JSON.parse(fs.readFileSync(path.join(DOSSIER, f), "utf8"))
    const ruban: RibbonTab[] = sc.ribbon ?? []
    ;(sc.steps ?? []).forEach((step: SimulationStep & any, index: number) => {
      const actions = step.montrer?.length ? step.montrer : sc.mode === "EVALUATION" ? [] : [step.action]
      if (!actions.length) return
      etapes++
      for (const depart of (ruban.length ? ruban : (["accueil"] as RibbonTab[]))) {
        const ctx = { onglet: depart, setup: step.setup } as any
        const plans = enchaine
          ? planSequence(actions as any, ctx)
          : (actions.map((a: any) => planDemonstration(a, ctx)).filter(Boolean) as any[])
        const gestes = plans.flatMap((p: any) => p.gestes)
        if (!gestes.length) continue
        const boutons = invisibles(gestes, depart)
        if (boutons.length) cas.push({ fichier: f, index, id: step.id, depart, boutons })
      }
    })
  }
  return { cas, etapes }
}

if (process.argv.includes("--piege")) {
  /**
   * PIÈGE — un contrôle qu'on n'a pas mis en échec ne prouve rien.
   * On lui redonne l'ancien comportement : il DOIT rougir. On rétablit : il DOIT
   * reverdir. Aucune modification du produit n'est nécessaire pour cela.
   */
  const avecDefaut = balayer(false)
  const sansDefaut = balayer(true)
  console.log(`PIÈGE · ancien comportement (chaque action part du même onglet)`)
  console.log(`         → ${avecDefaut.cas.length ? `ROUGE ✓ ${avecDefaut.cas.length} cas : ` + avecDefaut.cas.map((c) => `${c.id}@${c.depart}:${c.boutons.join(",")}`).join(" · ") : "VERT ✗ le contrôle est aveugle"}`)
  console.log(`PIÈGE · comportement corrigé (l'onglet se propage)`)
  console.log(`         → ${sansDefaut.cas.length ? "ROUGE ✗ " + sansDefaut.cas.map((c) => `${c.id}@${c.depart}`).join(" · ") : "VERT ✓"}`)
  const bon = avecDefaut.cas.length > 0 && sansDefaut.cas.length === 0
  console.log(bon ? "PIÈGE CONCLUANT : le contrôle voit le défaut, et seulement lui." : "PIÈGE ÉCHOUÉ — ne pas se fier à ce contrôle.")
  process.exit(bon ? 0 : 1)
}

const { cas, etapes } = balayer(true)
if (cas.length) {
  console.error(`✗ ${cas.length} démonstration(s) désignent un bouton absent de l'écran :`)
  for (const c of cas) console.error(`   ${c.fichier}#${c.index} ${c.id} · départ ${c.depart} · ${c.boutons.join(", ")}`)
  process.exit(1)
}
console.log(`✓ ${etapes} étapes × tous les onglets de départ — aucun geste ne vise un bouton hors écran.`)
