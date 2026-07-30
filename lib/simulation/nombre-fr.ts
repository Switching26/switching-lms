/**
 * Lecture des NOMBRES à la française.
 *
 * POURQUOI CE FICHIER EXISTE
 * Même famille que `date-fr.ts`, même cause : la plomberie de locale d'Univer est
 * morte, et son éditeur lit les saisies à l'anglo-saxonne. Un apprenant qui tape
 * « 7650,50 » — l'écriture française, et la première forme que le scénario
 * accepte — obtient donc du TEXTE, pas un nombre. Rien ne le signale : la cellule
 * affiche bien « 7650,50 », et l'étape se valide puisque la validation compare le
 * texte tapé à la liste des réponses acceptées.
 *
 * Le dégât arrive plus loin. `SOMME` ignore le texte : une leçon dont le total
 * devait faire 188,30 en affichait 112, et l'apprenant n'avait aucun moyen de
 * comprendre pourquoi. Mesuré sur le corpus : neuf étapes font taper une décimale
 * française — dont une en évaluation notée — et soixante-quinze cellules
 * attendues portent une valeur décimale.
 *
 * On ne convertit QUE les chaînes qui sont entièrement un nombre français. Un
 * texte qui contient un nombre, un identifiant à zéro de tête, une date : rien de
 * tout cela n'est touché. Vérifié sur le corpus avant d'écrire ce fichier :
 * aucune leçon ne repose sur le fait qu'une décimale française reste du texte.
 */

/**
 * Séparateur de milliers toléré : espace ordinaire, insécable, insécable fin.
 * Excel les accepte tous les trois à la saisie, et un copier-coller depuis une
 * page web en apporte régulièrement.
 */
const ESPACES = /[   ]/g

const NOMBRE_FR = /^-?\d{1,3}(?:[   ]\d{3})*(?:,\d+)?$|^-?\d+(?:,\d+)?$/

/**
 * Nombre correspondant à une écriture française, `null` si la chaîne n'en est
 * pas une. Un ENTIER renvoie `null` : il s'écrit de la même façon dans les deux
 * conventions, le moteur le lit déjà correctement, et le convertir ne ferait que
 * risquer d'écraser un texte comme « 007 ».
 */
export function lireNombreFr(texte: string): number | null {
  const t = texte.trim()
  if (!t || !t.includes(",")) return null
  if (!NOMBRE_FR.test(t)) return null
  const n = Number(t.replace(ESPACES, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}
