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

import { observationCanonique } from "./observation-canonique"

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
