/**
 * Mise en page et impression : le modèle (module 13).
 *
 * Pourquoi ce fichier existe alors qu'Univer sait imprimer : son moteur
 * d'impression (`@univerjs-pro/sheets-print`) est un paquet payant. Or ce module
 * n'enseigne pas à imprimer, il enseigne des RÉGLAGES et leur effet visuel —
 * orientation, marges, titres répétés, en-tête, sauts de page, zone
 * d'impression. Tout cela se calcule et se rend très bien nous-mêmes, et c'est
 * même plus pédagogique : on peut montrer les ruptures de page en direct sur la
 * grille, ce qu'un aperçu avant impression ne permet pas.
 *
 * Le fichier est PUR : aucune dépendance à React ni à Univer. La couche visuelle
 * (`PageLayoutLayer`) et la validation (`validate.ts`) consomment le même
 * résultat, donc l'apprenant ne peut jamais voir une rupture de page à un
 * endroit et être corrigé sur un autre.
 *
 * ── Conversion centimètres → pixels ──────────────────────────────────────────
 * Le papier se décrit en centimètres, la grille en pixels. On convertit par la
 * référence CSS de 96 points par pouce, la même que celle sur laquelle Excel
 * calcule ses largeurs de colonnes à l'écran :
 *
 *     1 pouce = 96 px  et  1 pouce = 2,54 cm   ⇒   1 cm = 96 / 2,54 ≈ 37,795 px
 *
 * On reste donc dans les pixels de la grille (colonne par défaut 88 px, ligne
 * par défaut 24 px chez Univer) : une page A4 portrait à marges normales offre
 * 17,4 × 25,9 cm utiles, soit environ 658 × 979 px, c'est-à-dire ~7 colonnes et
 * ~40 lignes par défaut. Ces ordres de grandeur sont ceux d'Excel, ce qui rend
 * les leçons crédibles sans avoir à simuler le pilote d'impression.
 */

import type { PageSetupState, RangeRef } from "./types"
import { columnLetterToIndex, parseRange } from "./grid"

/* ═══════════ CONSTANTES ═══════════ */

/** Voir l'en-tête du fichier : référence CSS de 96 ppp. */
export const PIXELS_PAR_CM = 96 / 2.54

/** Dimensions en centimètres, TOUJOURS données en portrait. */
export const FORMATS_PAPIER: Record<
  NonNullable<PageSetupState["format"]>,
  { largeurCm: number; hauteurCm: number }
> = {
  A4: { largeurCm: 21, hauteurCm: 29.7 },
  A3: { largeurCm: 29.7, hauteurCm: 42 },
  Letter: { largeurCm: 21.59, hauteurCm: 27.94 },
}

export type Marges = { haut: number; bas: number; gauche: number; droite: number }

/**
 * Les trois jeux de marges du bouton « Marges » d'Excel, arrondis au millimètre.
 * Excel affiche 1,91 / 1,78 là où nous écrivons 1,9 / 1,8 : la validation tolère
 * 0,02 cm, donc les deux écritures sont acceptées et l'apprenant n'est jamais
 * recalé sur un arrondi.
 */
export const PRESETS_MARGES: Record<"normales" | "larges" | "etroites", Marges> = {
  normales: { haut: 1.9, bas: 1.9, gauche: 1.8, droite: 1.8 },
  larges: { haut: 2.5, bas: 2.5, gauche: 2.5, droite: 2.5 },
  etroites: { haut: 1.9, bas: 1.9, gauche: 0.6, droite: 0.6 },
}

/**
 * Excel n'imprime NI le quadrillage NI les en-têtes de lignes et de colonnes par
 * défaut. C'est la première surprise de tout débutant qui sort sa feuille, et
 * c'est pour cela que le réglage se trouve dans ce module : partir des vraies
 * valeurs d'Excel est ce qui rend la leçon transférable.
 */
export const REGLAGES_PAR_DEFAUT: PageSetupState = {
  orientation: "portrait",
  format: "A4",
  margins: { ...PRESETS_MARGES.normales },
  scale: 100,
  header: {},
  footer: {},
  pageBreakRows: [],
  pageBreakCols: [],
  gridlines: false,
  headings: false,
  view: "normal",
  center: { horizontal: false, vertical: false },
}

/** Excel n'accepte pas d'échelle en dehors de cette fourchette. */
export const ECHELLE_MIN = 10
export const ECHELLE_MAX = 400

/* ═══════════ APPLICATION D'UN RÉGLAGE ═══════════ */

/**
 * Fusionne un réglage dans l'état courant.
 *
 * Deux subtilités qui ne sont pas du confort :
 *
 * 1. `scale` et `scaleToFit` sont EXCLUSIFS. Dans Excel, cocher « Ajuster à
 *    1 page en largeur » grise le champ Échelle, et saisir une échelle décoche
 *    l'ajustement. Laisser les deux coexister enseignerait un état impossible,
 *    et surtout rendrait la pagination indéterminée (lequel gagne ?).
 *
 * 2. Une chaîne vide EFFACE : c'est ainsi qu'on rend « Annuler la zone
 *    d'impression » et « Supprimer les titres à répéter », deux gestes que le
 *    module enseigne. Sans cela un scénario ne pourrait qu'ajouter, jamais
 *    retirer.
 */
export function appliquerReglages(etat: PageSetupState, patch: PageSetupState): PageSetupState {
  const suivant: PageSetupState = { ...etat }

  for (const [cle, valeur] of Object.entries(patch) as Array<[keyof PageSetupState, unknown]>) {
    if (valeur === undefined) continue
    switch (cle) {
      // Objets fusionnés champ par champ : régler la seule marge du haut ne doit
      // pas effacer les trois autres.
      case "margins":
        suivant.margins = { ...(etat.margins ?? PRESETS_MARGES.normales), ...(valeur as Partial<Marges>) }
        break
      case "header":
      case "footer": {
        const zone = { ...(etat[cle] ?? {}), ...(valeur as Record<string, string>) }
        suivant[cle] = zone
        break
      }
      case "center":
        suivant.center = { ...(etat.center ?? {}), ...(valeur as PageSetupState["center"]) }
        break

      // Références effaçables par la chaîne vide.
      case "repeatRows":
      case "repeatCols":
      case "printArea":
        suivant[cle] = String(valeur).trim() === "" ? undefined : (valeur as string)
        break

      // Exclusivité échelle / ajustement.
      case "scale":
        suivant.scale = borner(Number(valeur), ECHELLE_MIN, ECHELLE_MAX)
        suivant.scaleToFit = undefined
        break
      case "scaleToFit": {
        const st = valeur as NonNullable<PageSetupState["scaleToFit"]>
        // Un ajustement vide ({}) veut dire « repasser en échelle manuelle ».
        const actif = st.largeur !== undefined || st.hauteur !== undefined
        suivant.scaleToFit = actif ? { ...st } : undefined
        suivant.scale = actif ? undefined : (etat.scale ?? 100)
        break
      }

      // Les tableaux se remplacent en bloc : une liste de sauts de page est un
      // tout, la fusionner produirait des sauts fantômes impossibles à retirer.
      case "pageBreakRows":
      case "pageBreakCols":
        suivant[cle] = Array.from(new Set(valeur as number[])).sort((a, b) => a - b)
        break

      default:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(suivant as any)[cle] = valeur
    }
  }

  return suivant
}

function borner(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/* ═══════════ TITRES À RÉPÉTER ═══════════ */

/**
 * Résout `repeatRows` / `repeatCols` en index de base 0.
 * On accepte les deux écritures d'Excel — « $1:$1 » comme « 1:1 », « $A:$A »
 * comme « A:A » — parce qu'un apprenant qui tape la seconde a raison.
 */
export function resoudreTitresRepetes(etat: PageSetupState): { lignes: number[]; colonnes: number[] } {
  return {
    lignes: bandeLignes(etat.repeatRows),
    colonnes: bandeColonnes(etat.repeatCols),
  }
}

function bandeLignes(ref: string | undefined): number[] {
  const m = /^\$?(\d{1,7})\s*:\s*\$?(\d{1,7})$/.exec((ref ?? "").trim())
  if (!m) return []
  return intervalle(Number(m[1]) - 1, Number(m[2]) - 1)
}

function bandeColonnes(ref: string | undefined): number[] {
  const m = /^\$?([A-Za-z]{1,3})\s*:\s*\$?([A-Za-z]{1,3})$/.exec((ref ?? "").trim())
  if (!m) return []
  return intervalle(columnLetterToIndex(m[1]), columnLetterToIndex(m[2]))
}

function intervalle(a: number, b: number): number[] {
  const debut = Math.max(0, Math.min(a, b))
  const fin = Math.max(a, b)
  const out: number[] = []
  for (let i = debut; i <= fin; i++) out.push(i)
  return out
}

/* ═══════════ EN-TÊTE ET PIED DE PAGE ═══════════ */

export type ContexteEntete = {
  /** Numéro de la page rendue, base 1. */
  page: number
  /** Nombre total de pages. */
  total: number
  fichier?: string
  feuille?: string
  /** Injectée plutôt que lue de l'horloge : un rendu doit être reproductible. */
  date?: Date
}

/**
 * Substitue les codes d'Excel dans un texte d'en-tête ou de pied.
 *
 *   &P numéro de page · &N nombre de pages · &D date · &T heure
 *   &F nom du fichier · &A nom de la feuille · && une esperluette littérale
 *   &P+2 / &P-1 décalent la numérotation, comme dans Excel
 *
 * La substitution se fait en UN SEUL passage : remplacer code par code
 * réinjecterait les valeurs dans le texte, et un nom de fichier contenant
 * « &A » finirait remplacé par le nom de la feuille.
 */
export function rendreEntete(texte: string, ctx: ContexteEntete): string {
  const date = ctx.date ?? new Date()
  return (texte ?? "").replace(/&&|&P([+-]\d+)?|&N|&D|&T|&F|&A/gi, (motif, decalage?: string) => {
    const code = motif.slice(0, 2).toUpperCase()
    if (code === "&&") return "&"
    switch (code) {
      case "&P":
        return String(ctx.page + (decalage ? Number(decalage) : 0))
      case "&N":
        return String(ctx.total)
      case "&D":
        return formaterDate(date)
      case "&T":
        return formaterHeure(date)
      case "&F":
        return ctx.fichier ?? ""
      case "&A":
        return ctx.feuille ?? ""
      default:
        return motif
    }
  })
}

/** Rend les trois cases d'une zone d'un coup, pour la couche visuelle. */
export function rendreZone(
  zone: { gauche?: string; centre?: string; droite?: string } | undefined,
  ctx: ContexteEntete,
): { gauche: string; centre: string; droite: string } {
  return {
    gauche: rendreEntete(zone?.gauche ?? "", ctx),
    centre: rendreEntete(zone?.centre ?? "", ctx),
    droite: rendreEntete(zone?.droite ?? "", ctx),
  }
}

function deuxChiffres(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Convention française : 05/03/2026 et 14:07. */
function formaterDate(d: Date): string {
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()}`
}

function formaterHeure(d: Date): string {
  return `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`
}

/* ═══════════ PAGINATION ═══════════ */

/** Une tranche de lignes ou de colonnes qui tient sur une page. */
export type Bande = {
  /** Index de base 0, inclusifs, dans les coordonnées de la feuille. */
  debut: number
  fin: number
  /** Occupation réelle en pixels de grille, à l'échelle 100 %. */
  taillePx: number
  /** Vrai quand la bande commence sur un saut de page manuel. */
  manuel: boolean
}

export type PageCalculee = {
  /** Numéro d'impression, base 1. */
  numero: number
  ligneDebut: number
  ligneFin: number
  colonneDebut: number
  colonneFin: number
  /** Rang de la bande, pour situer la page dans la mosaïque. */
  bandeLigne: number
  bandeColonne: number
  /** Titres réimprimés en tête de cette page (index base 0). */
  lignesRepetees: number[]
  colonnesRepetees: number[]
  /** Occupation du corps en pixels de grille, à l'échelle 100 %. */
  largeurPx: number
  hauteurPx: number
}

export type Pagination = {
  pages: PageCalculee[]
  nombrePages: number
  /** Échelle réellement appliquée : 1 = 100 %. */
  echelle: number
  /** Feuille de papier entière, en pixels de grille. */
  papierPx: { largeur: number; hauteur: number }
  /** Zone utile (papier moins marges), en pixels de grille. */
  zonePx: { largeur: number; hauteur: number }
  margesPx: Marges
  /** Index des lignes / colonnes qui DÉBUTENT une page, la première exclue. */
  rupturesLignes: number[]
  rupturesColonnes: number[]
  /** Ruptures dues à un saut manuel : trait plein, et non pointillé. */
  rupturesLignesManuelles: number[]
  rupturesColonnesManuelles: number[]
  lignesRepetees: number[]
  colonnesRepetees: number[]
  bandesLignes: Bande[]
  bandesColonnes: Bande[]
  /** Étendue réellement paginée, après zone d'impression. */
  etendue: { ligneDebut: number; ligneFin: number; colonneDebut: number; colonneFin: number }
}

/**
 * Où les pages se coupent, pour de vrai.
 *
 * `largeursColonnes` et `hauteursLignes` sont les dimensions RÉELLES lues sur la
 * grille (indexées de 0), pas des moyennes : une colonne élargie doit déplacer
 * la rupture, sinon la leçon montre un pointillé au mauvais endroit et l'élève
 * apprend faux.
 *
 * `plage` est l'étendue utilisée de la feuille. Une `printArea` déclarée la
 * REMPLACE — c'est le sens du réglage dans Excel : hors de la zone
 * d'impression, rien n'existe.
 *
 * L'ordre des pages suit le réglage par défaut d'Excel, « Vers le bas, puis à
 * droite » : on épuise les lignes d'une bande de colonnes avant de passer à la
 * bande suivante.
 */
export function calculerPages(
  etat: PageSetupState,
  largeursColonnes: number[],
  hauteursLignes: number[],
  plage?: RangeRef,
): Pagination {
  const format = FORMATS_PAPIER[etat.format ?? "A4"] ?? FORMATS_PAPIER.A4
  const paysage = (etat.orientation ?? "portrait") === "paysage"
  const papierPx = {
    largeur: (paysage ? format.hauteurCm : format.largeurCm) * PIXELS_PAR_CM,
    hauteur: (paysage ? format.largeurCm : format.hauteurCm) * PIXELS_PAR_CM,
  }
  const marges = { ...PRESETS_MARGES.normales, ...(etat.margins ?? {}) }
  const margesPx: Marges = {
    haut: marges.haut * PIXELS_PAR_CM,
    bas: marges.bas * PIXELS_PAR_CM,
    gauche: marges.gauche * PIXELS_PAR_CM,
    droite: marges.droite * PIXELS_PAR_CM,
  }
  // L'en-tête et le pied vivent DANS la marge (marge d'en-tête 0,8 cm sous une
  // marge haute de 1,9 cm) : leur présence ne réduit donc pas le corps, exactement
  // comme dans Excel tant qu'ils ne débordent pas.
  const zonePx = {
    largeur: Math.max(1, papierPx.largeur - margesPx.gauche - margesPx.droite),
    hauteur: Math.max(1, papierPx.hauteur - margesPx.haut - margesPx.bas),
  }

  const etendue = resoudreEtendue(etat, largeursColonnes, hauteursLignes, plage)
  const titres = resoudreTitresRepetes(etat)

  // Les titres répétés sont réimprimés en tête de CHAQUE page : ils sortent donc
  // du corps paginé, et leur encombrement est réservé sur toutes les pages. C'est
  // le modèle le plus simple qui reste juste — les compter comme du corps sur la
  // première page seulement ferait varier la capacité d'une page à l'autre pour
  // un gain pédagogique nul.
  //
  // Ils ne sont VOLONTAIREMENT pas restreints à la zone d'impression : dans Excel,
  // une zone « A27:J50 » avec les lignes 1 et 2 à répéter imprime quand même ces
  // deux lignes en tête de page. Les filtrer priverait de titres exactement le cas
  // où ils sont le plus utiles — une zone d'impression prise au milieu du relevé.
  const lignesRepetees = titres.lignes.filter((i) => i < hauteursLignes.length)
  const colonnesRepetees = titres.colonnes.filter((i) => i < largeursColonnes.length)
  const reserveHauteur = lignesRepetees.reduce((s, i) => s + taille(hauteursLignes, i, 24), 0)
  const reserveLargeur = colonnesRepetees.reduce((s, i) => s + taille(largeursColonnes, i, 88), 0)

  const corpsLignes = indices(etendue.ligneDebut, etendue.ligneFin).filter((i) => !lignesRepetees.includes(i))
  const corpsColonnes = indices(etendue.colonneDebut, etendue.colonneFin).filter(
    (i) => !colonnesRepetees.includes(i),
  )

  const dispoLargeur = Math.max(1, zonePx.largeur - reserveLargeur)
  const dispoHauteur = Math.max(1, zonePx.hauteur - reserveHauteur)

  const sautsLignes = new Set(etat.pageBreakRows ?? [])
  const sautsColonnes = new Set(etat.pageBreakCols ?? [])

  const decouper = (echelle: number) => ({
    colonnes: decouperEnBandes(corpsColonnes, largeursColonnes, 88, dispoLargeur / echelle, sautsColonnes),
    lignes: decouperEnBandes(corpsLignes, hauteursLignes, 24, dispoHauteur / echelle, sautsLignes),
  })

  const echelle = resoudreEchelle(etat, decouper)
  const { colonnes: bandesColonnes, lignes: bandesLignes } = decouper(echelle)

  // « Vers le bas, puis à droite » : bande de colonnes à l'extérieur.
  const pages: PageCalculee[] = []
  let numero = 1
  for (let bc = 0; bc < bandesColonnes.length; bc++) {
    for (let bl = 0; bl < bandesLignes.length; bl++) {
      const c = bandesColonnes[bc]
      const l = bandesLignes[bl]
      pages.push({
        numero: numero++,
        ligneDebut: l.debut,
        ligneFin: l.fin,
        colonneDebut: c.debut,
        colonneFin: c.fin,
        bandeLigne: bl,
        bandeColonne: bc,
        lignesRepetees,
        colonnesRepetees,
        largeurPx: c.taillePx,
        hauteurPx: l.taillePx,
      })
    }
  }

  return {
    pages,
    nombrePages: pages.length,
    echelle,
    papierPx,
    zonePx,
    margesPx,
    rupturesLignes: bandesLignes.slice(1).map((b) => b.debut),
    rupturesColonnes: bandesColonnes.slice(1).map((b) => b.debut),
    rupturesLignesManuelles: bandesLignes.slice(1).filter((b) => b.manuel).map((b) => b.debut),
    rupturesColonnesManuelles: bandesColonnes.slice(1).filter((b) => b.manuel).map((b) => b.debut),
    lignesRepetees,
    colonnesRepetees,
    bandesLignes,
    bandesColonnes,
    etendue,
  }
}

/**
 * Découpe une suite d'index en bandes qui tiennent dans `disponible`.
 *
 * Une ligne ou une colonne est INDIVISIBLE : Excel ne coupe jamais une cellule
 * en deux entre deux feuilles. Une colonne plus large que la page occupe donc
 * une page à elle seule — sans ce garde-fou la boucle ne terminerait pas.
 */
function decouperEnBandes(
  indexes: number[],
  tailles: number[],
  defaut: number,
  disponible: number,
  sauts: Set<number>,
): Bande[] {
  const bandes: Bande[] = []
  let courante: Bande | null = null

  for (const i of indexes) {
    const t = taille(tailles, i, defaut)
    const forcee = sauts.has(i)
    if (courante === null || forcee || courante.taillePx + t > disponible) {
      courante = { debut: i, fin: i, taillePx: t, manuel: forcee }
      bandes.push(courante)
    } else {
      courante.fin = i
      courante.taillePx += t
    }
  }

  return bandes
}

/**
 * Quelle échelle appliquer ? Si l'apprenant a demandé « Ajuster à N page(s) »,
 * on cherche le plus grand pourcentage ENTIER qui y parvient — Excel raisonne
 * en pourcentages entiers et n'agrandit jamais pour remplir, il ne fait que
 * réduire. Sinon on prend l'échelle manuelle.
 */
function resoudreEchelle(
  etat: PageSetupState,
  decouper: (echelle: number) => { colonnes: Bande[]; lignes: Bande[] },
): number {
  const ajuster = etat.scaleToFit
  const maxLargeur = ajuster?.largeur
  const maxHauteur = ajuster?.hauteur
  if (maxLargeur === undefined && maxHauteur === undefined) {
    return borner(etat.scale ?? 100, ECHELLE_MIN, ECHELLE_MAX) / 100
  }
  for (let pct = 100; pct >= ECHELLE_MIN; pct--) {
    const { colonnes, lignes } = decouper(pct / 100)
    const largeurOk = maxLargeur === undefined || colonnes.length <= maxLargeur
    const hauteurOk = maxHauteur === undefined || lignes.length <= maxHauteur
    if (largeurOk && hauteurOk) return pct / 100
  }
  return ECHELLE_MIN / 100
}

/** Étendue à paginer : la zone d'impression si elle existe, sinon la plage. */
function resoudreEtendue(
  etat: PageSetupState,
  largeursColonnes: number[],
  hauteursLignes: number[],
  plage?: RangeRef,
): { ligneDebut: number; ligneFin: number; colonneDebut: number; colonneFin: number } {
  const maxLigne = Math.max(0, hauteursLignes.length - 1)
  const maxColonne = Math.max(0, largeursColonnes.length - 1)
  const ref = etat.printArea?.trim() || plage
  const p = ref ? parseRange(ref) : null
  if (!p) {
    return { ligneDebut: 0, ligneFin: maxLigne, colonneDebut: 0, colonneFin: maxColonne }
  }
  return {
    ligneDebut: Math.max(0, Math.min(p.startRow, p.endRow)),
    ligneFin: Math.min(maxLigne, Math.max(p.startRow, p.endRow)),
    colonneDebut: Math.max(0, Math.min(p.startCol, p.endCol)),
    colonneFin: Math.min(maxColonne, Math.max(p.startCol, p.endCol)),
  }
}

function indices(debut: number, fin: number): number[] {
  const out: number[] = []
  for (let i = debut; i <= fin; i++) out.push(i)
  return out
}

/** Dimension d'une ligne ou d'une colonne, avec le défaut d'Univer en secours. */
function taille(tailles: number[], index: number, defaut: number): number {
  const t = tailles[index]
  return Number.isFinite(t) && t > 0 ? t : defaut
}

/**
 * Somme des tailles AVANT un index. Exposé parce que la couche visuelle doit
 * placer ses pointillés exactement là où la pagination les a calculés : deux
 * cumuls écrits séparément finiraient par diverger d'un pixel, puis de dix.
 */
export function cumulPx(tailles: number[], jusqua: number, defaut: number): number {
  let somme = 0
  for (let i = 0; i < jusqua; i++) somme += taille(tailles, i, defaut)
  return somme
}

/**
 * La mise en page a-t-elle été touchée ? Excel n'affiche les pointillés de
 * rupture dans la vue Normal qu'une fois la feuille mise en page ou imprimée :
 * reproduire ce détail évite de polluer les 26 autres modules avec des
 * pointillés que personne n'a demandés.
 */
export function miseEnPageTouchee(etat: PageSetupState): boolean {
  const d = REGLAGES_PAR_DEFAUT
  return (
    (etat.orientation ?? d.orientation) !== d.orientation ||
    (etat.format ?? d.format) !== d.format ||
    (etat.scale ?? 100) !== 100 ||
    etat.scaleToFit !== undefined ||
    Boolean(etat.repeatRows) ||
    Boolean(etat.repeatCols) ||
    Boolean(etat.printArea) ||
    (etat.pageBreakRows?.length ?? 0) > 0 ||
    (etat.pageBreakCols?.length ?? 0) > 0 ||
    (etat.view ?? "normal") !== "normal" ||
    aDuTexte(etat.header) ||
    aDuTexte(etat.footer) ||
    !memesMarges(etat.margins, d.margins)
  )
}

function aDuTexte(zone: { gauche?: string; centre?: string; droite?: string } | undefined): boolean {
  return Boolean(zone && [zone.gauche, zone.centre, zone.droite].some((t) => (t ?? "").trim() !== ""))
}

function memesMarges(a: Marges | undefined, b: Marges | undefined): boolean {
  if (!a || !b) return a === b
  // Même tolérance que la validation : 1,9 et 1,90 sont la même marge.
  return (["haut", "bas", "gauche", "droite"] as const).every((c) => Math.abs(a[c] - b[c]) <= 0.02)
}
