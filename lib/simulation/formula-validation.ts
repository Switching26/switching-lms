import { parseRange } from "./grid"

/** Normalise la syntaxe, en gardant les espaces et séparateurs des textes cités. */
export function normaliserFormuleExcel(input: string): string {
  return input.trim().match(/"(?:[^"]|"")*"|'(?:[^']|'')*'!|[^"']+|'/g)?.map((part) => {
    // EXACT et les textes renvoyés par SI dépendent des caractères cités.
    // La casse des noms de fonctions est facultative ; celle d'un littéral
    // fait partie de la donnée et doit rester distincte.
    if (part.startsWith('"')) return part
    if (part.startsWith("'") && part.endsWith("'!")) {
      const nom = part.slice(1, -2).replace(/''/g, "'").toUpperCase()
      // Des apostrophes facultatives (T1!, 'T1'!) ne changent pas la feuille.
      return /^[A-Z0-9_.\u00C0-\u024F]+$/.test(nom) ? `${nom}!` : `'${nom.replace(/'/g, "''")}'!`
    }
    return part.toUpperCase().replace(/\s+/g, "").replace(/,/g, ";")
  }).join("") ?? ""
}

/**
 * Refuse le seul cas déductible sans calcul : arguments SOMMEPROD constitués
 * de plages explicites, avec des nombres de lignes/colonnes différents.
 * TRANSPOSE, noms et expressions restent du ressort du moteur réel.
 */
export function matricesSommeprodIncompatibles(formule: string): boolean {
  const texte = normaliserFormuleExcel(formule)
  const appel = /\b(?:SOMMEPROD|SUMPRODUCT)\(/g
  let m: RegExpExecArray | null
  while ((m = appel.exec(texte))) {
    // Le nom de fonction dans une chaîne ne représente pas un appel.
    if ((texte.slice(0, m.index).match(/"/g)?.length ?? 0) % 2 !== 0) continue
    let profondeur = 1
    let cite = false
    let debut = appel.lastIndex
    const argumentsLus: string[] = []
    for (let i = debut; i < texte.length; i++) {
      const c = texte[i]
      if (c === '"') { cite = !cite; continue }
      if (cite) continue
      if (c === "(") profondeur++
      if (c === ")") profondeur--
      if ((c === ";" && profondeur === 1) || profondeur === 0) {
        argumentsLus.push(texte.slice(debut, i))
        debut = i + 1
      }
      if (profondeur === 0) break
    }
    const formes = argumentsLus.map((argument) => {
      // Seul un argument entier de type A1:B3 est déterminable statiquement.
      const plage = /^(?:(?:'(?:[^']|'')*'|[A-Z0-9_.\u00C0-\u024F]+)!)?(\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+)$/.exec(argument)
      const aire = plage ? parseRange(plage[1]) : null
      return aire ? `${aire.endRow - aire.startRow + 1}x${aire.endCol - aire.startCol + 1}` : null
    }).filter((forme): forme is string => forme !== null)
    if (formes.length > 1 && formes.some((forme) => forme !== formes[0])) return true
  }
  return false
}
