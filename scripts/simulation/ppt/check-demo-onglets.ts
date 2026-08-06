/**
 * TOUT BOUTON DE RUBAN QU'UNE DÉMONSTRATION DÉSIGNE DOIT ÊTRE À L'ÉCRAN.
 *
 * Le ruban PowerPoint ne rend QUE son onglet actif. Un geste qui vise un bouton
 * rangé sous un autre onglet ne désigne donc rien : `rectDe` rend `null`,
 * `DemonstrationGeste` ne dessine pas son cadre — et la séquence continue. Le
 * compteur va jusqu'à `n/n`, la phase atteint `fini`, l'apprenant qui venait de
 * demander « Montrez-moi » n'a rien vu. C'est le défaut le plus coûteux du
 * chantier PowerPoint : 60 gestes joués à blanc sur GRAND écran, mesurés au
 * balayage exhaustif du 06/08/2026, invisibles à toute lecture de compteur.
 *
 * 🔴 CE QUE CE CONTRÔLE ATTRAPE ET QUE RIEN D'AUTRE NE VOYAIT.
 *
 * La bascule d'onglet ne lisait que `plan.gestes[0].presser?.id`. Deux familles
 * entières y échappaient, et c'est cette asymétrie qu'il faut garder sous
 * surveillance :
 *
 *  · les plans qui commencent AILLEURS que sur le ruban — une miniature, un
 *    objet de la scène — et dont le bouton vient au deuxième geste ;
 *  · les plans qui DÉSIGNENT sans presser, ce qui est la règle partout où le
 *    geste n'est pas idempotent (`P_DELETE_SLIDE`) ou engage l'apprenant à sa
 *    place (`P_EXPECT_SHOW` : on ne lance pas le diaporama pour lui).
 *
 * L'invariant vérifié est donc plus large que le correctif : pour CHAQUE geste
 * de CHAQUE plan des 130 chapitres, si sa cible est un bouton du ruban, un geste
 * ANTÉRIEUR de la même séquence doit avoir pressé l'onglet qui le porte.
 *
 * ⚠️ On interroge le MOTEUR (`adaptateurPpt.demonstration`), jamais le texte des
 * fichiers : c'est la leçon du registre, dont le branchement se lisait vert dans
 * un commentaire de documentation pendant que rien n'était branché.
 *
 * ⚠️ La construction du plan est le MIROIR EXACT de `PptPlayer` (bloc `plan`) :
 * `step.montrer` s'il existe, sinon aucun plan en évaluation notée, sinon le
 * plan déduit de l'action. Toute divergence ici produirait un faux verdict.
 *
 *   npx tsx scripts/simulation/ppt/check-demo-onglets.ts [--piege]
 */

import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { adaptateurPpt } from "../../../lib/simulation/ppt/adaptateur"
import { CONTROLES_PPT, LIBELLE_ONGLET_PPT, ongletDuControle } from "../../../lib/simulation/ppt/document"

const DOSSIER = join(__dirname, "..", "scenarios", "ppt")

type Geste = { cible: { k: string; sel?: string }; presser?: { id?: string } }
type Plan = { gestes: Geste[] } | null

const PIEGE = process.argv.includes("--piege")

/** L'identifiant de bouton qu'un geste DÉSIGNE — pressé ou seulement montré. */
function controleDuGeste(g: Geste): string | null {
  if (g.presser?.id) return g.presser.id
  if (g.cible.k !== "dom" || !g.cible.sel) return null
  const m = /^\[data-control="([^"]+)"\]$/.exec(g.cible.sel)
  return m ? m[1] : null
}

function planDe(step: { action?: { type?: string }; montrer?: unknown[] }, evaluationNotee: boolean): Plan {
  const demo = (a: unknown): Plan => {
    try {
      return adaptateurPpt.demonstration(a as never, {} as never) as Plan
    } catch {
      return null
    }
  }
  if (step.montrer?.length) {
    const plans = step.montrer.map(demo).filter(Boolean) as Array<{ gestes: Geste[] }>
    return plans.length ? { gestes: plans.flatMap((p) => p.gestes) } : null
  }
  if (evaluationNotee) return null
  return demo(step.action)
}

type Anomalie = { fichier: string; id: string; type: string; bouton: string; onglet: string; rang: number }

function analyser(saboter: boolean) {
  const anomalies: Anomalie[] = []
  let chapitres = 0
  let gestesRuban = 0
  let bascules = 0

  for (const f of readdirSync(DOSSIER).filter((x) => x.endsWith(".json")).sort()) {
    const sc = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8"))
    chapitres += 1
    const evaluationNotee = sc.mode === "EVALUATION"

    for (const step of sc.steps as Array<{ id: string; action?: { type?: string }; montrer?: unknown[] }>) {
      let plan = planDe(step, evaluationNotee)
      if (!plan) continue

      /* LE PIÈGE — on rétablit l'ancienne règle : la bascule ne regarde que le
         PREMIER geste, et seulement s'il presse. Le contrôle DOIT rougir, sinon
         il ne prouve rien. Un détecteur qu'on n'a pas piégé n'est qu'un afficheur. */
      if (saboter) {
        const g = plan.gestes.filter((x) => !estBascule(x))
        const id = g[0]?.presser?.id
        const o = id ? ongletDuControle(id) : null
        plan = { gestes: o ? [bascule(o), ...g] : g }
      }

      /* ⚠️ DEUX mécanismes amènent le ruban sur le bon onglet, et le contrôle
         doit modéliser les DEUX sous peine de crier au loup :
          · `PptPlayer.ongletSuggere` ouvre, au MONTAGE de l'étape, l'onglet du
            premier bouton de ruban qu'elle désigne — c'est ce qui équipe les
            écrans « À comprendre », dont les illustrations ne pressent rien ;
          · la bascule insérée dans le plan, pour les gestes d'action.
         Modéliser le second seul ferait sortir en anomalie les 101 gestes
         d'illustration, qui fonctionnent parfaitement. */
      let ouvert: string | null = saboter ? ongletSuggereAncien(step, plan) : ongletSuggere(step, plan)
      plan.gestes.forEach((g, rang) => {
        const id = controleDuGeste(g)
        const onglet = id ? ongletDuControle(id) : null
        if (!onglet) return
        if (estBascule(g)) {
          bascules += 1
          ouvert = onglet
          return
        }
        gestesRuban += 1
        if (onglet !== ouvert)
          anomalies.push({
            fichier: f,
            id: step.id,
            type: String(step.action?.type ?? "?"),
            bouton: id!,
            onglet,
            rang,
          })
      })
    }
  }
  return { anomalies, chapitres, gestesRuban, bascules }
}

/**
 * L'onglet que l'étape ouvre à son montage — miroir de `PptPlayer.ongletSuggere`.
 *
 * Il vaut pour TOUTE la durée de l'étape, y compris avant la démonstration : un
 * écran de lecture ne presse rien, c'est lui seul qui rend ses cibles visibles.
 * Il n'en ouvre qu'UN — d'où l'intérêt de ce contrôle, qui dira le jour où un
 * écran désignera des boutons de deux onglets différents.
 */
function ongletSuggere(
  step: { action?: { type?: string }; montrer?: unknown[] },
  planDeLEtape: { gestes: Geste[] },
): string | null {
  for (const g of planDeLEtape.gestes) {
    const id = controleDuGeste(g)
    const o = id ? ongletDuControle(id) : null
    if (o) return o
  }
  for (const a of step.montrer ?? []) {
    const c = (a as { cible?: string }).cible ?? ""
    if (!c.startsWith("ctrl:")) continue
    const o = ongletDuControle(c.slice(5))
    if (o) return o
  }
  return null
}

/**
 * L'ANCIENNE déduction, rétablie à l'identique pour l'auto-épreuve.
 *
 * Elle est reproduite fidèlement plutôt que simplement neutralisée : sinon
 * l'épreuve gonflerait avec les 101 gestes d'illustration, que cette version
 * servait correctement par la boucle sur `montrer`. Un piège qui exagère le mal
 * qu'il prétend attraper vaut à peine mieux qu'un contrôle qui l'ignore.
 *
 * Les deux fautes sont ici, et elles tiennent en deux lignes : on ne regarde que
 * le premier geste qui PRESSE, et l'on rend son onglet même quand il vaut `null`
 * — ce qui est le cas d'une miniature, donc de tout plan qui commence par
 * afficher une diapositive.
 */
function ongletSuggereAncien(
  step: { montrer?: unknown[] },
  planDeLEtape: { gestes: Geste[] },
): string | null {
  const gestes = planDeLEtape.gestes.filter((g) => !estBascule(g))
  const presse = gestes.find((g) => g.presser?.id)?.presser?.id
  if (presse) return ongletDuControle(presse)
  for (const a of step.montrer ?? []) {
    const c = (a as { cible?: string }).cible ?? ""
    if (!c.startsWith("ctrl:")) continue
    const o = ongletDuControle(c.slice(5))
    if (o) return o
  }
  return null
}

/** Un geste de bascule : il PRESSE un onglet, et sa cible est ce même onglet. */
function estBascule(g: Geste): boolean {
  const id = g.presser?.id
  return !!id && id.startsWith("ong-") && ongletDuControle(id) !== null
}

function bascule(onglet: string): Geste {
  const ctrl = CONTROLES_PPT.onglet(onglet as never)
  return { cible: { k: "dom", sel: `[data-control="${ctrl}"]` }, presser: { id: ctrl } }
}

const vrai = analyser(false)
console.log(`── Onglets des démonstrations PowerPoint · ${vrai.chapitres} chapitres ──\n`)
console.log(`  gestes visant un bouton du ruban        : ${vrai.gestesRuban}`)
console.log(`  bascules d'onglet insérées par le plan  : ${vrai.bascules}`)

if (vrai.anomalies.length) {
  console.log(`\n  ✗ ${vrai.anomalies.length} geste(s) désignent un bouton sous un onglet JAMAIS ouvert :`)
  for (const a of vrai.anomalies.slice(0, 40))
    console.log(
      `      ${a.fichier} ${a.id.padEnd(12)} ${a.type.padEnd(20)} geste ${a.rang} → ${a.bouton.padEnd(22)} (onglet ${LIBELLE_ONGLET_PPT[a.onglet as never] ?? a.onglet})`,
    )
  if (vrai.anomalies.length > 40) console.log(`      … et ${vrai.anomalies.length - 40} autre(s)`)
}

if (PIEGE) {
  const piege = analyser(true)
  console.log(`\n── AUTO-ÉPREUVE — ancienne règle rétablie ──`)
  console.log(`  gestes laissés sans onglet : ${piege.anomalies.length}`)
  const parType = new Map<string, number>()
  for (const a of piege.anomalies) parType.set(a.type, (parType.get(a.type) ?? 0) + 1)
  for (const [t, n] of [...parType].sort((x, y) => y[1] - x[1])) console.log(`      ${String(n).padStart(4)}  ${t}`)
  if (!piege.anomalies.length) {
    console.log("\n✗ LE PIÈGE N'A RIEN ATTRAPÉ — ce contrôle ne prouve rien, le réparer avant de s'y fier.")
    process.exit(1)
  }
  console.log("\n  ✓ le piège rougit : le contrôle détecte bien ce qu'il prétend détecter.")
}

if (vrai.anomalies.length) {
  console.log("\n✗ Des démonstrations désignent un bouton absent de l'écran.")
  process.exit(1)
}
console.log(`\n✓ ${vrai.gestesRuban}/${vrai.gestesRuban} gestes de ruban sont précédés de l'ouverture de leur onglet.`)
