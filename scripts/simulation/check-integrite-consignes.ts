/**
 * Contrôle d'intégrité du chantier « consignes trop longues ».
 *
 * Il prouve qu'AUCUNE mécanique n'a bougé : on recharge chaque scénario, on
 * retire les seuls champs que ce chantier a le droit de toucher (`consigne`,
 * `aide`, `montrer`), et on compare au même scénario tel qu'il est dans un
 * commit de référence.
 *
 * Le bloc `remediation` est retiré lui aussi. Ce n'est PAS un assouplissement :
 * ce contrôle veille sur la MÉCANIQUE d'un scénario — étapes, actions, attendus,
 * barème — et `remediation` n'en fait pas partie, c'est une annotation
 * pédagogique posée à côté. Elle a son propre garde-fou, plus sévère que celui-ci :
 * `check-remediation.ts` exige les 27 blocs, la couverture complète de toutes
 * les étapes notées et la résolution de chaque renvoi. Toute différence restante — une `action`, un `accept`,
 * un `anyOf`, un `setup`, un identifiant, un nombre d'étapes — est un défaut.
 *
 *   npx tsx scripts/simulation/check-integrite-consignes.ts [ref-git]
 *
 * La comparaison se fait en forme canonique (clés triées) : `json.dump` ne
 * conserve pas l'ordre des clés, et sans cela les 246 scénarios paraîtraient
 * tous différents.
 */
import { execFileSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

const REF = process.argv[2] || "HEAD"
const DIR = "scripts/simulation/scenarios"

/** Forme canonique : clés triées récursivement. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) out[k] = canon(o[k])
    return out
  }
  return v
}

/** Le scénario privé de ce que ce chantier a le droit de modifier. */
function squelette(sc: any): unknown {
  const copie = JSON.parse(JSON.stringify(sc))
  delete copie.remediation
  for (const st of copie.steps ?? []) {
    delete st.consigne
    delete st.aide
    delete st.montrer
  }
  return canon(copie)
}

const soucis: string[] = []
let compares = 0
let modifies = 0

for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".json")).sort()) {
  const actuel = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))
  let avant: any
  try {
    avant = JSON.parse(execFileSync("git", ["show", `${REF}:${DIR}/${f}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }))
  } catch {
    soucis.push(`${f} — absent de ${REF} (fichier nouveau : à justifier)`)
    continue
  }
  compares++

  // 1. Le squelette doit être identique à l'octet près, une fois canonisé.
  const a = JSON.stringify(squelette(avant))
  const b = JSON.stringify(squelette(actuel))
  if (a !== b) soucis.push(`${f} — ÉCART STRUCTUREL : autre chose que consigne/aide/montrer a changé`)

  // 2. Le nombre d'étapes et les identifiants sont un contrat avec les
  //    apprenants en cours (SimulationAttempt indexe par position).
  const idsA = (avant.steps ?? []).map((s: any) => s.id).join("|")
  const idsB = (actuel.steps ?? []).map((s: any) => s.id).join("|")
  if (idsA !== idsB) {
    soucis.push(`${f} — étapes modifiées : ${(avant.steps ?? []).length} → ${(actuel.steps ?? []).length} (identifiants ou ordre)`)
  }

  // 3. Trace de ce qui a bougé, pour lecture humaine.
  if (JSON.stringify(canon(avant)) !== JSON.stringify(canon(actuel))) modifies++
}

console.log(`${compares} scénarios comparés à ${REF} — ${modifies} modifié(s) sur consigne/aide/montrer.`)
if (soucis.length === 0) {
  console.log("Intégrité : 0 écart structurel, 0 étape ajoutée ou retirée.")
  process.exit(0)
}
for (const s of soucis) console.log("  ✗ " + s)
console.log(`${soucis.length} problème(s).`)
process.exit(1)
