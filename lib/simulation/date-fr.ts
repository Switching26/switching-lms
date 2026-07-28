/**
 * Lecture des DATES et des HEURES à la française.
 *
 * POURQUOI CE FICHIER EXISTE
 * Le moteur de calcul retenu (Univer) lit les dates à l'américaine, mois d'abord :
 * une saisie « 07/04/2026 », qui désigne le 7 avril pour tout francophone, devient
 * chez lui le numéro de série 46207 — le 4 juillet. Pire, il réaffiche ensuite la
 * chaîne telle qu'elle a été tapée, si bien que rien ne se voit : l'apprenant lit
 * « 07/04/2026 » et croit tenir un mois d'avril, tandis que la moindre fonction de
 * date lui répondra juillet. Une formation Excel française ne peut pas vivre avec
 * cela — on enseignerait un faux, silencieusement.
 *
 * Mesuré le 28/07/2026 : 1 039 cellules de date dans 23 scénarios étaient
 * concernées.
 *
 * Ce module est PUR et sans dépendance : il se contente de reconnaître une écriture
 * française et d'en donner le numéro de série Excel. C'est le simulateur qui décide
 * quand l'appeler.
 */

/** Origine des numéros de série d'Excel : le jour 1 est le 1ᵉʳ janvier 1900. */
const JOURS_PAR_MS = 86400000
const ORIGINE_UTC = Date.UTC(1899, 11, 30)

/** Motif d'une date française : jour, mois, année, séparés par / - ou point. */
const MOTIF_DATE = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/
/** Motif d'une heure : heures, minutes, et secondes facultatives. */
const MOTIF_HEURE = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/

export const FORMAT_DATE_FR = "dd/mm/yyyy"
export const FORMAT_HEURE_FR = "hh:mm"
export const FORMAT_HEURE_SEC_FR = "hh:mm:ss"

/**
 * Année sur deux chiffres, comme Excel : de 00 à 29 on est au XXIᵉ siècle, de 30 à
 * 99 au XXᵉ. Ce n'est pas arbitraire — c'est la règle qu'Excel applique, et un
 * apprenant qui tape « 16/3/26 » attend 2026.
 */
function anneeComplete(brut: string | undefined, defaut: number): number {
  if (brut === undefined) return defaut
  const n = parseInt(brut, 10)
  if (brut.length === 4) return n
  return n <= 29 ? 2000 + n : 1900 + n
}

/**
 * Numéro de série Excel d'une date écrite à la française, ou `null` si le texte
 * n'est pas une date. La validité est vérifiée pour de vrai : « 31/02/2026 » est
 * refusé plutôt que glissé au 3 mars, sans quoi une faute de saisie passerait pour
 * une date correcte.
 *
 * @param anneeParDefaut année à retenir quand elle est omise (« 15/03 »).
 */
export function serialDepuisDateFr(texte: string, anneeParDefaut?: number): number | null {
  const m = MOTIF_DATE.exec(texte.trim())
  if (!m) return null
  const jour = parseInt(m[1], 10)
  const mois = parseInt(m[2], 10)
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null
  const annee = anneeComplete(m[3], anneeParDefaut ?? new Date().getUTCFullYear())
  const utc = Date.UTC(annee, mois - 1, jour)
  const d = new Date(utc)
  // Rejet des dates qui n'existent pas : le 31 février aurait basculé en mars.
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) {
    return null
  }
  const serial = Math.round((utc - ORIGINE_UTC) / JOURS_PAR_MS)
  // Avant le 1ᵉʳ mars 1900, la numérotation d'Excel est décalée par son 29 février
  // 1900 inexistant. Aucun contenu pédagogique n'a besoin de ces dates, et les
  // manipuler donnerait des résultats faux : on refuse plutôt que d'approximer.
  return serial >= 61 ? serial : null
}

/** Fraction de journée d'une heure écrite « 8:30 » ou « 08:30:15 », sinon `null`. */
export function fractionDepuisHeureFr(texte: string): number | null {
  const m = MOTIF_HEURE.exec(texte.trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const sec = m[3] ? parseInt(m[3], 10) : 0
  // Excel accepte des heures au-delà de 24 pour des DURÉES ; en saisie simple, une
  // heure du jour reste bornée, et « 25:00 » est plus probablement une faute.
  if (h > 23) return null
  return (h * 3600 + min * 60 + sec) / 86400
}

export type LectureFr =
  | { genre: "date"; valeur: number; format: string }
  | { genre: "heure"; valeur: number; format: string }
  | null

/**
 * Reconnaît en une passe une date ou une heure française, et rend la valeur
 * numérique que le moteur doit stocker avec le format qui la réaffichera
 * correctement. C'est le point d'entrée que le simulateur appelle avant de confier
 * une saisie à Univer.
 */
export function lireDateOuHeureFr(texte: string, anneeParDefaut?: number): LectureFr {
  const serial = serialDepuisDateFr(texte, anneeParDefaut)
  if (serial !== null) return { genre: "date", valeur: serial, format: FORMAT_DATE_FR }
  const fraction = fractionDepuisHeureFr(texte)
  if (fraction !== null) {
    const avecSecondes = /^\d{1,2}:\d{2}:\d{2}$/.test(texte.trim())
    return { genre: "heure", valeur: fraction, format: avecSecondes ? FORMAT_HEURE_SEC_FR : FORMAT_HEURE_FR }
  }
  return null
}

/** Écriture française d'un numéro de série, pour comparer un attendu à une lecture. */
export function dateFrDepuisSerial(serial: number): string {
  const utc = ORIGINE_UTC + Math.trunc(serial) * JOURS_PAR_MS
  const d = new Date(utc)
  const deux = (n: number) => String(n).padStart(2, "0")
  return `${deux(d.getUTCDate())}/${deux(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}
