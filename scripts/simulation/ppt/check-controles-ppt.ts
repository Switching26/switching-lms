/**
 * PowerPoint — les boutons du ruban, dans les DEUX sens.
 *
 * Décliné de `check-controles` (contrat §7).
 *
 * ═══ POURQUOI LES DEUX SENS ═══
 *
 * Sur Excel, NEUF boutons n'avaient aucun traitement et validaient quand même
 * l'étape, parce que tout identifiant finissait par émettre une observation
 * `control` : l'apprenant cliquait, rien ne bougeait, et l'étape passait. L'un
 * d'eux — masquer une colonne — annonçait « ✓ C'est exact » alors que la colonne
 * restait à l'écran, et l'étape suivante faisait totaliser « la colonne
 * masquée ». Aucun contrôle statique ne pouvait le voir.
 *
 * D'où trois vérifications :
 *
 *  1. tout bouton RENDU par le chrome porte un libellé lisible — sinon la ligne
 *     « Attendu : … » dit « un clic sur le bouton indiqué », ce qui occupait 239
 *     étapes d'Excel sans rien apprendre ;
 *  2. tout bouton NOMMÉ dans les libellés est encore rendu — un nom qui ne
 *     désigne plus rien est une promesse morte ;
 *  3. tout bouton CITÉ par un scénario existe dans le chrome.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE VOIT PAS, et qu'il faut dire : il lit le TEXTE du
 * composant. Il ne sait pas si un bouton rendu FAIT quelque chose — c'est
 * précisément le défaut d'Excel. Seul le rejeu au navigateur le prouve.
 */

import { readFileSync, readdirSync, existsSync } from "fs"
import { join } from "path"
import { LIBELLES_CONTROLES_PPT } from "../../../lib/simulation/ppt/adaptateur"
import { CONTROLES_PPT } from "../../../lib/simulation/ppt/document"

const CHROME = join(__dirname, "..", "..", "..", "components", "simulation", "ppt", "PptChrome.tsx")
const SURFACE = join(__dirname, "..", "..", "..", "components", "simulation", "ppt", "PptSurface.tsx")
const SCENARIOS = join(__dirname, "..", "scenarios", "ppt")

/**
 * Les identifiants réellement rendus.
 *
 * Le composant ne les écrit pas en clair (`data-control={CONTROLES_PPT.gras}`,
 * `CONTROLES_PPT.formeChoix(s)`) : on résout donc depuis la table, en repérant
 * les CLÉS citées par le source. Lire des chaînes littérales ne trouverait rien
 * et rendrait un vert vide.
 */
function rendus(): Set<string> {
  const src = readFileSync(CHROME, "utf-8") + readFileSync(SURFACE, "utf-8")
  const out = new Set<string>()
  for (const [cle, val] of Object.entries(CONTROLES_PPT)) {
    if (!new RegExp(`CONTROLES_PPT\\.${cle}\\b`).test(src)) continue
    if (typeof val === "string") out.add(val)
    else if (typeof val === "function") {
      // Une fabrique : on énumère ses arguments possibles depuis les libellés
      // déclarés, qui sont la liste de référence.
      for (const id of Object.keys(LIBELLES_CONTROLES_PPT)) {
        const prefixe = String((val as (x: never) => string)("§§" as never)).replace("§§", "")
        if (id.startsWith(prefixe) && id !== prefixe) out.add(id)
      }
    }
  }
  return out
}

function principal() {
  const problemes: string[] = []
  const dansLeDom = rendus()

  // (1) Rendu sans libellé.
  for (const id of dansLeDom) {
    if (!LIBELLES_CONTROLES_PPT[id])
      problemes.push(`« ${id} » est rendu par le chrome mais n'a pas de libellé : « Attendu : … » ne dira rien`)
  }
  // (2) Libellé orphelin.
  for (const id of Object.keys(LIBELLES_CONTROLES_PPT)) {
    if (!dansLeDom.has(id))
      problemes.push(`« ${id} » porte un libellé mais n'est plus rendu par le chrome`)
  }
  // (3) Cité par un scénario, absent du chrome.
  if (existsSync(SCENARIOS)) {
    for (const f of readdirSync(SCENARIOS).filter((x) => x.endsWith(".json"))) {
      const s = JSON.parse(readFileSync(join(SCENARIOS, f), "utf-8"))
      const texte = JSON.stringify(s)
      for (const m of texte.matchAll(/"control"\s*:\s*"([^"]+)"|"ctrl:([^"]+)"/g)) {
        const id = m[1] ?? m[2]
        if (id && !dansLeDom.has(id)) problemes.push(`${f} cite le bouton « ${id} », que le chrome ne rend pas`)
      }
    }
  }

  /* PIÉGEAGE — un contrôle qui ne trouverait AUCUN bouton passerait au vert en
     silence. C'est exactement le vert vide que la résolution par clés évite. */
  console.log("── Piégeage ──")
  console.log(
    `  ${dansLeDom.size >= 20 ? "✓" : "✗"} ${dansLeDom.size} boutons réellement résolus depuis le chrome` +
      (dansLeDom.size >= 20 ? "" : " — TROP PEU : le contrôle regarde à côté et son vert ne prouve rien"),
  )
  const faux = LIBELLES_CONTROLES_PPT["acc-bouton-inexistant-zqx"]
  console.log(`  ${faux === undefined ? "✓" : "✗"} un identifiant inventé n'a pas de libellé`)
  console.log()

  if (dansLeDom.size < 20) problemes.push("moins de 20 boutons résolus : la résolution est cassée")

  if (problemes.length) {
    console.error(`✗ ${problemes.length} anomalie(s) de contrôles :\n`)
    for (const p of problemes) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  console.log(`✓ ${dansLeDom.size} boutons — rendus, nommés, et cités sans manque.`)
  console.log("  (ce contrôle ne dit PAS qu'ils agissent : seul le rejeu au navigateur le prouve.)")
}

if (require.main === module) principal()
