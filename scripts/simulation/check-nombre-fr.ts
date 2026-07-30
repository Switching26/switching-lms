/**
 * Contrôle de la lecture française des nombres.
 *
 *   npx tsx scripts/simulation/check-nombre-fr.ts
 *
 * Ce que l'on protège : une décimale française doit devenir un NOMBRE, et rien
 * d'autre ne doit être touché. Une conversion trop large abîmerait des leçons
 * entières — le module 2 enseigne justement qu'un identifiant à zéro de tête ou
 * une référence ne sont pas des nombres.
 */

import { lireNombreFr } from "@/lib/simulation/nombre-fr"

const cas: Array<[string, number | null]> = [
  // Décimales françaises : converties.
  ["7650,50", 7650.5],
  ["148,60", 148.6],
  ["-12,40", -12.4],
  ["0,15", 0.15],
  ["0,1", 0.1],
  ["1 234,56", 1234.56],
  ["1 234,56", 1234.56], // espace insécable
  ["-0,5", -0.5],

  // Entiers : laissés au moteur, qui les lit déjà bien. Les convertir
  // risquerait d'écraser un identifiant comme « 007 ».
  ["12", null],
  ["0033612345678", null],
  ["007", null],

  // Rien de tout cela n'est un nombre français.
  ["", null],
  ["  ", null],
  ["21.5", null], // écriture anglo-saxonne : c'est au moteur de la lire
  ["16/3/26", null], // date
  ["12:30", null], // heure
  ["12,5 €", null], // texte avec unité
  ["Réf 12,5", null],
  ["=SOMME(A1:A5)", null],
  ["1,2,3", null],
  ["1 2,5", null], // groupe de milliers invalide
  ["12,", null],
  [",5", null],
]

let echecs = 0
for (const [entree, attendu] of cas) {
  const obtenu = lireNombreFr(entree)
  const ok = attendu === null ? obtenu === null : obtenu !== null && Math.abs(obtenu - attendu) < 1e-9
  if (!ok) {
    echecs++
    console.log(`  ✗ ${JSON.stringify(entree)} → ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`)
  }
}

console.log(`\nLecture française des nombres — ${cas.length} vérifications, ${echecs} échec(s)`)
if (echecs) process.exitCode = 1
else console.log("✓ conversion des décimales françaises, et de rien d'autre.")
