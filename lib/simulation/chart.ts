/**
 * Modèle de graphique du simulateur : construction, évolution, géométrie.
 *
 * POURQUOI CE FICHIER EXISTE. Le moteur de graphiques d'Univer est vendu à part.
 * Plutôt que d'amputer la formation de deux modules, on rend les graphiques
 * nous-mêmes. Le bénéfice pédagogique dépasse largement le contournement : les
 * modules 17 et 18 font sélectionner, mettre en forme, masquer et modifier CHAQUE
 * élément d'un graphique. Il faut donc en maîtriser la géométrie au pixel, ce
 * qu'aucune bibliothèque tierce ne concède sans qu'on se batte contre elle.
 *
 * POURQUOI IL NE CONNAÎT PAS REACT. Toute la mesure est ici, tout le dessin est
 * dans `ChartLayer`. Cette frontière permet de vérifier une échelle ou une
 * régression sans monter un composant, et elle garde le modèle utilisable côté
 * serveur : la correction d'une évaluation ne doit pas dépendre d'un navigateur.
 *
 * POURQUOI LA DÉDUCTION EST AUSSI SOIGNÉE. « Créer un graphique rapidement » ne
 * s'apprend que si le simulateur devine la plage comme Excel la devine — libellés
 * dans la première colonne, noms de séries dans la première ligne, orientation
 * choisie selon la forme du bloc. Un simulateur qui devinerait autrement
 * enseignerait un faux réflexe, ce qui est pire que ne rien enseigner.
 */

import type { ChartElements, ChartSeries, ChartState, ChartType, RangeRef } from "./types"
import { columnIndexToLetter, formatRange, parseRange } from "./grid"

/* ═══════════ PALETTE ET STYLES DE GALERIE ═══════════ */

/**
 * Palette par défaut. Sobre volontairement : ce sont des supports de formation
 * professionnelle, imprimés en réunion, parfois en noir et blanc. Les teintes sont
 * désaturées et suffisamment éloignées en LUMINOSITÉ pour rester distinguables en
 * niveaux de gris et pour un daltonien — deux contraintes que les palettes
 * « tableau de bord » ignorent presque toujours.
 */
export const PALETTE_GRAPHIQUE = [
  "#3a6ea5", // bleu ardoise
  "#c26a2b", // ocre brûlé
  "#5f7a3f", // olive
  "#7a5ba6", // prune
  "#2f8a7a", // vert-de-gris
  "#a4453f", // brique
  "#8a7b3f", // moutarde sourde
  "#4c5f75", // bleu gris
] as const

/**
 * Styles de la galerie du ruban, numérotés comme dans Excel (`style?: number`).
 *
 * Un style ne touche QUE la présentation : palette, fond, encre, trait du
 * quadrillage. Il ne décide jamais si un élément est affiché — cela reste le rôle
 * de `elements`, sinon appliquer un style ferait échouer une étape qui vient de
 * demander d'afficher la légende, et l'apprenant n'y comprendrait rien.
 */
export type StyleGalerie = {
  numero: number
  nom: string
  palette: readonly string[]
  /** Fond de la zone de graphique, null pour transparent. */
  fond: string | null
  /** Couleur du texte (titre, axes, légende). */
  encre: string
  /** Couleur du quadrillage et des axes. */
  trait: string
}

const STYLE_BASE: StyleGalerie = {
  numero: 1,
  nom: "Standard",
  palette: PALETTE_GRAPHIQUE,
  fond: null,
  encre: "#3f3f46",
  trait: "#d4d4d8",
}

export const STYLES_GALERIE: readonly StyleGalerie[] = [
  STYLE_BASE,
  {
    numero: 2,
    nom: "Épuré",
    palette: PALETTE_GRAPHIQUE,
    fond: null,
    encre: "#52525b",
    // Quadrillage presque effacé : le style « épuré » d'Excel allège le fond.
    trait: "#ececef",
  },
  {
    numero: 3,
    nom: "Contrasté",
    palette: ["#1f4e79", "#9c4110", "#3d5626", "#54306f", "#12655a", "#7d2b26", "#5f5322", "#2f3f52"],
    fond: null,
    encre: "#27272a",
    trait: "#c4c4c8",
  },
  {
    numero: 4,
    nom: "Dégradé bleu",
    palette: ["#1f4e79", "#2f6ba5", "#4a89c4", "#7aa9d6", "#a6c6e5", "#cbdcef", "#16324d", "#8fb4d9"],
    fond: null,
    encre: "#27272a",
    trait: "#d4d4d8",
  },
  {
    numero: 5,
    nom: "Fond clair",
    palette: PALETTE_GRAPHIQUE,
    fond: "#f6f6f4",
    encre: "#3f3f46",
    trait: "#dedee2",
  },
  {
    numero: 6,
    nom: "Ardoise",
    palette: ["#3f4a56", "#6b7684", "#8f9aa6", "#adb6c0", "#5a6672", "#7e8996", "#9ea8b3", "#c3cad2"],
    fond: null,
    encre: "#3f3f46",
    trait: "#d9d9dd",
  },
]

/** Style de galerie, ramené au style standard si le numéro est hors table. */
export function styleDe(numero: number | undefined): StyleGalerie {
  if (!numero) return STYLE_BASE
  return STYLES_GALERIE.find((s) => s.numero === numero) ?? STYLE_BASE
}

/**
 * Couleur d'une série. La couleur EXPLICITE d'une série gagne toujours : c'est ce
 * que fait Excel une fois qu'on a choisi un remplissage à la main, et c'est ce que
 * le module 18 fait vérifier après « Modifier la couleur d'une série ».
 */
export function couleurDeSerie(serie: ChartSeries, index: number, style?: number): string {
  if (serie.color) return serie.color
  const p = styleDe(style).palette
  return p[index % p.length]
}

/* ═══════════ CONSTRUCTION ET ÉVOLUTION DU MODÈLE ═══════════ */

/** Ce qu'un scénario déclare dans `setup.chart`. */
export type SpecGraphique = Partial<ChartState> & { type: ChartType }

/** Ce qu'un scénario déclare dans `setup.chartEdit`. */
export type PatchGraphique = Partial<ChartState> & {
  addSeries?: ChartSeries[]
  removeSeries?: string[]
  editSeries?: Array<{ name: string } & Partial<ChartSeries>>
}

/** Cadre par défaut : proportion 5:3, la même qu'Excel propose à l'insertion. */
export const CADRE_DEFAUT = { x: 36, y: 14, w: 460, h: 276 }

/**
 * Crée un graphique à partir de ce que le scénario déclare.
 *
 * Les valeurs par défaut reproduisent celles d'Excel à l'insertion, y compris ses
 * exceptions : un secteur n'a pas d'axes et affiche toujours sa légende, une série
 * unique n'en affiche pas. Sans cette fidélité, la leçon « masquer la légende »
 * porterait sur un élément déjà absent.
 */
export function creerGraphique(spec: SpecGraphique): ChartState {
  const series = (spec.series ?? []).map((s) => ({ ...s }))
  const secteurs = spec.type === "secteurs"

  const elements: ChartElements = {
    titre: true,
    legende: secteurs ? true : series.length > 1,
    etiquettes: false,
    quadrillage: !secteurs,
    axes: !secteurs,
    titresAxes: false,
    ...(spec.elements ?? {}),
  }

  return {
    id: spec.id ?? "graphique",
    type: spec.type,
    source: spec.source,
    categories: spec.categories,
    series,
    title: spec.title,
    elements,
    legendPosition: spec.legendPosition ?? "bas",
    style: spec.style ?? 1,
    frame: spec.frame ?? { ...CADRE_DEFAUT },
    selectedElement: spec.selectedElement,
  }
}

/**
 * Applique une modification au graphique courant, sans jamais muter l'entrée :
 * l'état d'une étape doit rester rejouable en arrière, donc chaque geste produit
 * un nouvel état.
 *
 * Ordre d'application, choisi pour qu'un patch mixte reste prévisible :
 * remplacement complet des séries, puis retraits, puis modifications, puis ajouts.
 * Un ajout est ainsi toujours visible dans le résultat, même si son nom figurait
 * dans `removeSeries`.
 */
export function modifierGraphique(etat: ChartState, patch: PatchGraphique): ChartState {
  const { addSeries, removeSeries, editSeries, series, elements, ...reste } = patch

  // Convertir un secteur en histogramme doit RENDRE ses axes au graphique, et
  // l'inverse doit les retirer. Sans cela, un histogramme héritait de l'absence
  // d'axes du secteur dont il venait : plus de graduations, plus de libellés, un
  // graphique illisible sans que rien ne le signale. Excel fait ce ménage aussi.
  let elementsType: ChartElements | null = null
  if (patch.type && patch.type !== etat.type) {
    const avant = etat.type === "secteurs"
    const apres = patch.type === "secteurs"
    if (avant !== apres) elementsType = { axes: !apres, quadrillage: !apres }
  }

  let liste: ChartSeries[] = (series ?? etat.series).map((s) => ({ ...s }))

  if (removeSeries?.length) {
    const aRetirer = new Set(removeSeries.map(cleNom))
    liste = liste.filter((s) => !aRetirer.has(cleNom(s.name)))
  }

  if (editSeries?.length) {
    for (const modif of editSeries) {
      const i = liste.findIndex((s) => cleNom(s.name) === cleNom(modif.name))
      if (i < 0) continue
      // Une valeur vide doit pouvoir EFFACER un attribut : « supprimer la courbe
      // de tendance » se déclare `{ name: "Nord", trendline: null }`, et un
      // `...spread` seul ne retirerait rien. `null` autant que `undefined`, parce
      // qu'un scénario est du JSON : il ne sait pas écrire `undefined`.
      const fusion: ChartSeries = { ...liste[i] }
      for (const [cle, valeur] of Object.entries(modif) as Array<[keyof ChartSeries, unknown]>) {
        if (cle === "name") continue
        if (valeur === undefined || valeur === null) delete (fusion as Record<string, unknown>)[cle]
        else (fusion as Record<string, unknown>)[cle] = valeur
      }
      liste[i] = fusion
    }
  }

  if (addSeries?.length) liste = [...liste, ...addSeries.map((s) => ({ ...s }))]

  // Un élément explicitement demandé par le patch garde toujours la main sur la
  // remise à zéro liée au changement de type.
  const elementsFinaux =
    elements || elementsType
      ? { ...(etat.elements ?? {}), ...(elementsType ?? {}), ...(elements ?? {}) }
      : etat.elements

  return { ...etat, ...reste, series: liste, elements: elementsFinaux }
}

/** Sélectionne un élément du graphique, ou lève la sélection avec `null`. */
export function selectionnerElement(etat: ChartState, element: string | null): ChartState {
  if (!element) {
    const { selectedElement, ...sans } = etat
    void selectedElement
    return sans
  }
  return { ...etat, selectedElement: element }
}

/** Comparaison de noms de séries : Excel ne distingue ni la casse ni les espaces. */
function cleNom(nom: string): string {
  return (nom ?? "").trim().toLocaleUpperCase("fr-FR")
}

/**
 * Libellé français d'un élément, tel qu'Excel l'annonce dans sa zone Nom.
 * Sert aux infobulles et aux libellés d'accessibilité de la couche visuelle : un
 * apprenant qui survole doit lire « Série "T1" », pas « serie:0 ».
 */
export function libelleElement(element: string, etat?: ChartState | null): string {
  if (element === "titre") return "Titre du graphique"
  if (element === "legende") return "Légende"
  if (element === "quadrillage") return "Quadrillage principal"
  if (element === "axe-x") return "Axe horizontal"
  if (element === "axe-y") return "Axe vertical"
  const serie = /^serie:(\d+)$/.exec(element)
  if (serie) {
    const nom = etat?.series?.[Number(serie[1])]?.name
    return nom ? `Série « ${nom} »` : `Série ${Number(serie[1]) + 1}`
  }
  const point = /^point:(\d+):(\d+)$/.exec(element)
  if (point) {
    const nom = etat?.series?.[Number(point[1])]?.name
    return nom
      ? `Point ${Number(point[2]) + 1} de la série « ${nom} »`
      : `Point ${Number(point[2]) + 1}`
  }
  return element
}

/* ═══════════ DÉDUCTION DEPUIS UNE PLAGE SÉLECTIONNÉE ═══════════ */

/** Lecture d'une plage : les valeurs dans l'ordre de lecture (ligne par ligne). */
export type LecteurDePlage = (ref: RangeRef) => unknown[]

export type DeductionGraphique = {
  source: RangeRef
  categories?: RangeRef
  series: ChartSeries[]
  /** Titre qu'Excel propose : le nom de la série quand il n'y en a qu'une. */
  title?: string
  /** Séries lues dans les lignes plutôt que dans les colonnes. */
  parLigne: boolean
}

/**
 * Devine un graphique depuis la plage sélectionnée, comme le fait Excel.
 *
 * Trois règles, dans cet ordre, tirées du comportement réel du logiciel :
 *  1. une première ligne sans aucun nombre est une ligne de TITRES ;
 *  2. une première colonne sans aucun nombre porte les LIBELLÉS d'axe ;
 *  3. l'orientation suit la forme du bloc de données — plus de colonnes que de
 *     lignes signifie que chaque LIGNE est une série (des mois en travers d'une
 *     ligne), sinon chaque COLONNE en est une. À égalité, Excel choisit les
 *     colonnes, et nous aussi.
 *
 * Renvoie null si la plage est illisible : l'appelant décide alors quoi faire
 * plutôt que de propager une structure vide jusqu'au rendu.
 */
export function deduireDepuisPlage(plage: RangeRef, lire: LecteurDePlage): DeductionGraphique | null {
  const r = parseRange(plage)
  if (!r) return null

  const nbLignes = r.endRow - r.startRow + 1
  const nbCols = r.endCol - r.startCol + 1
  const plat = lire(plage) ?? []
  const cellule = (i: number, j: number): unknown => plat[i * nbCols + j]

  const ligneEstTexte = (i: number, depuisCol: number) => {
    let vues = 0
    for (let j = depuisCol; j < nbCols; j++) {
      const v = cellule(i, j)
      if (estVide(v)) continue
      vues++
      if (versNombre(v) !== null) return false
    }
    return vues > 0
  }
  const colonneEstTexte = (j: number, depuisLigne: number) => {
    let vues = 0
    for (let i = depuisLigne; i < nbLignes; i++) {
      const v = cellule(i, j)
      if (estVide(v)) continue
      vues++
      if (versNombre(v) !== null) return false
    }
    return vues > 0
  }

  // Une plage d'une seule ligne ou d'une seule colonne n'a pas d'en-tête à
  // sacrifier : tout serait consommé par les titres et il ne resterait rien à
  // tracer.
  const enteteLigne = nbLignes > 1 && ligneEstTexte(0, nbCols > 1 ? 1 : 0)
  const enteteColonne = nbCols > 1 && colonneEstTexte(0, enteteLigne ? 1 : 0)

  const i0 = enteteLigne ? 1 : 0
  const j0 = enteteColonne ? 1 : 0
  const lignesData = nbLignes - i0
  const colsData = nbCols - j0
  if (lignesData <= 0 || colsData <= 0) return null

  const parLigne = colsData > lignesData

  const lettre = (j: number) => columnIndexToLetter(r.startCol + j)
  const numero = (i: number) => r.startRow + i + 1
  const texte = (v: unknown) => (estVide(v) ? "" : String(v).trim())

  const series: ChartSeries[] = []
  let categories: RangeRef | undefined

  if (parLigne) {
    // Une série par ligne ; les libellés d'axe viennent de la ligne de titres.
    if (enteteLigne) {
      categories = formatRange({
        startRow: r.startRow,
        startCol: r.startCol + j0,
        endRow: r.startRow,
        endCol: r.endCol,
      })
    }
    for (let i = i0; i < nbLignes; i++) {
      const nom = enteteColonne ? texte(cellule(i, 0)) : ""
      series.push({
        name: nom || `Série ${series.length + 1}`,
        values: `${lettre(j0)}${numero(i)}:${lettre(nbCols - 1)}${numero(i)}`,
      })
    }
  } else {
    // Une série par colonne ; les libellés d'axe viennent de la 1re colonne.
    if (enteteColonne) {
      categories = formatRange({
        startRow: r.startRow + i0,
        startCol: r.startCol,
        endRow: r.endRow,
        endCol: r.startCol,
      })
    }
    for (let j = j0; j < nbCols; j++) {
      const nom = enteteLigne ? texte(cellule(0, j)) : ""
      series.push({
        name: nom || `Série ${series.length + 1}`,
        values: `${lettre(j)}${numero(i0)}:${lettre(j)}${numero(nbLignes - 1)}`,
      })
    }
  }

  return {
    source: formatRange(r),
    categories,
    series,
    // Excel n'invente un titre que s'il est certain : une seule série, donc un
    // seul sujet. À plusieurs séries il pose le gabarit « Titre du graphique ».
    title: series.length === 1 && series[0].name && !/^Série \d+$/.test(series[0].name) ? series[0].name : undefined,
    parLigne,
  }
}

/**
 * Raccourci du geste complet « je sélectionne, je clique sur un type » : déduit la
 * plage puis construit l'état. C'est ce que le lecteur appelle sur un clic de la
 * galerie du ruban, `surcharge` portant ce que le scénario impose éventuellement.
 */
export function creerDepuisPlage(
  plage: RangeRef,
  type: ChartType,
  lire: LecteurDePlage,
  surcharge?: Partial<ChartState>,
): ChartState | null {
  const d = deduireDepuisPlage(plage, lire)
  if (!d) return null
  return creerGraphique({
    type,
    source: d.source,
    categories: d.categories,
    series: d.series,
    title: d.title,
    ...(surcharge ?? {}),
  })
}

/* ═══════════ LECTURE DES VALEURS ═══════════ */

function estVide(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "")
}

/**
 * Convertit une valeur de cellule en nombre. Les cellules arrivent parfois
 * formatées à la française (« 1 234,50 € », espace insécable comprise) : refuser
 * ces valeurs viderait le graphique sans que rien ne le signale.
 */
export function versNombre(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "boolean") return v ? 1 : 0
  if (typeof v !== "string") return null
  const nettoye = v
    .replace(/[\s  ]/g, "")
    .replace(/[€$£%]/g, "")
    .replace(",", ".")
  if (nettoye === "" || nettoye === "-") return null
  const n = Number(nettoye)
  return Number.isFinite(n) ? n : null
}

/** Index tolérant : "$B$2:$B$7", "b2:b7" et "B2:B7" désignent la même plage. */
function indexer(valeurs: Record<string, unknown[]>): Map<string, unknown[]> {
  const m = new Map<string, unknown[]>()
  for (const [cle, v] of Object.entries(valeurs ?? {})) {
    m.set(cle.replace(/\$/g, "").trim().toUpperCase(), v)
  }
  return m
}

function lirePlage(index: Map<string, unknown[]>, ref: string | undefined): unknown[] {
  if (!ref) return []
  return index.get(ref.replace(/\$/g, "").trim().toUpperCase()) ?? []
}

/* ═══════════ ÉCHELLES ET GRADUATIONS ═══════════ */

export type Echelle = {
  min: number
  max: number
  pas: number
  graduations: number[]
  /** Décimales à afficher, déduites du pas. */
  decimales: number
}

/**
 * Pas « rond » immédiatement supérieur à un pas brut : 1, 2, 2,5 ou 5 fois une
 * puissance de dix. C'est ce qui donne un axe gradué 0 / 50 / 100 plutôt que
 * 0 / 37,4 / 74,8 — un axe illisible fait rater la lecture d'un graphique, et
 * c'est précisément ce que le module 17 apprend à faire.
 */
export function pasJoli(brut: number): number {
  if (!Number.isFinite(brut) || brut <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(brut)))
  const normalise = brut / magnitude
  const facteur = normalise <= 1 ? 1 : normalise <= 2 ? 2 : normalise <= 2.5 ? 2.5 : normalise <= 5 ? 5 : 10
  return facteur * magnitude
}

/**
 * Échelle de l'axe des valeurs.
 *
 * L'axe est ANCRÉ À ZÉRO dès que toutes les données sont du même signe : sans cela
 * une variation de 2 % paraîtrait spectaculaire, ce qui est le mensonge graphique
 * le plus courant. Excel fait le même choix par défaut, et la leçon peut ensuite
 * expliquer pourquoi il ne faut pas le contourner à la légère.
 */
export function echelleValeurs(valeurs: number[], nbGraduations = 5): Echelle {
  const finis = valeurs.filter((v) => Number.isFinite(v))
  let bas = finis.length ? Math.min(...finis) : 0
  let haut = finis.length ? Math.max(...finis) : 1

  if (bas > 0) bas = 0
  if (haut < 0) haut = 0
  if (bas === haut) haut = bas === 0 ? 1 : bas + Math.abs(bas)

  const pas = pasJoli((haut - bas) / Math.max(2, nbGraduations))
  const min = Math.floor(bas / pas) * pas
  const max = Math.ceil(haut / pas) * pas
  const decimales = Math.max(0, Math.min(6, -Math.floor(Math.log10(pas) + 1e-9)))

  const graduations: number[] = []
  const nb = Math.round((max - min) / pas)
  for (let i = 0; i <= nb; i++) {
    graduations.push(arrondir(min + i * pas, decimales))
  }
  return { min, max, pas, graduations, decimales }
}

function arrondir(v: number, decimales: number): number {
  const f = Math.pow(10, decimales)
  return Math.round(v * f) / f
}

/**
 * Nombre à la française : espace insécable comme séparateur de milliers, virgule
 * décimale. Écrit à la main plutôt que délégué à `toLocaleString` pour que le SVG
 * soit identique côté serveur et côté navigateur, quelle que soit l'ICU installée.
 */
export function formaterNombre(v: number, decimales?: number): string {
  if (!Number.isFinite(v)) return ""
  const d = decimales ?? (Number.isInteger(v) ? 0 : Math.abs(v) >= 100 ? 0 : 1)
  const signe = v < 0 ? "-" : ""
  const abs = Math.abs(arrondir(v, d))
  const [entier, frac] = abs.toFixed(d).split(".")
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return signe + groupe + (frac ? "," + frac : "")
}

/* ═══════════ COURBES DE TENDANCE ═══════════ */

export type Regression = { pente: number; ordonnee: number; r2: number }

/**
 * Régression linéaire par les moindres carrés. Calcul RÉEL : une leçon qui
 * afficherait une droite décorative apprendrait à faire confiance à une droite
 * qui ne veut rien dire, ce qui est exactement l'erreur à combattre.
 */
export function regressionLineaire(points: Array<{ x: number; y: number }>): Regression | null {
  const p = points.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
  const n = p.length
  if (n < 2) return null

  const moyX = p.reduce((s, q) => s + q.x, 0) / n
  const moyY = p.reduce((s, q) => s + q.y, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const q of p) {
    sxy += (q.x - moyX) * (q.y - moyY)
    sxx += (q.x - moyX) ** 2
    syy += (q.y - moyY) ** 2
  }
  if (sxx === 0) return null

  const pente = sxy / sxx
  return {
    pente,
    ordonnee: moyY - pente * moyX,
    r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy),
  }
}

/**
 * Moyenne mobile sur `periode` valeurs. Les `periode - 1` premiers points n'ont
 * pas assez d'historique : Excel ne les trace pas, on renvoie donc null pour eux
 * plutôt qu'une valeur inventée qui ferait démarrer la courbe au mauvais endroit.
 */
export function moyenneMobile(valeurs: Array<number | null>, periode = 2): Array<number | null> {
  const sortie: Array<number | null> = []
  for (let i = 0; i < valeurs.length; i++) {
    if (i < periode - 1) {
      sortie.push(null)
      continue
    }
    let somme = 0
    let nb = 0
    for (let k = i - periode + 1; k <= i; k++) {
      const v = valeurs[k]
      if (v === null) continue
      somme += v
      nb++
    }
    sortie.push(nb === periode ? somme / nb : null)
  }
  return sortie
}

/* ═══════════ GÉOMÉTRIE ═══════════ */

export type Cadre = { x: number; y: number; w: number; h: number }

export type Graduation = {
  libelle: string
  /** Position du libellé. */
  x: number
  y: number
  /** Trait de graduation, absent sur un axe de catégories centré. */
  trait?: { x1: number; y1: number; x2: number; y2: number }
}

export type AxeDispose = {
  /** Ce que l'axe porte : des libellés, ou une échelle numérique. */
  nature: "categories" | "valeurs"
  ligne: { x1: number; y1: number; x2: number; y2: number }
  graduations: Graduation[]
  /** Ancrage du texte des graduations. */
  ancrage: "start" | "middle" | "end"
  titre: { texte: string; x: number; y: number; vertical: boolean } | null
  cadre: Cadre
}

export type Etiquette = { texte: string; x: number; y: number; ancrage: "start" | "middle" | "end" }

export type MarqueBarre = {
  element: string
  x: number
  y: number
  w: number
  h: number
  valeur: number
  /** Libellé de catégorie, pour l'accessibilité. */
  categorie: string
  etiquette: Etiquette | null
  /** Sommet arrondi d'un cylindre, pointe d'un cône : la forme du module 18. */
  forme: "barre" | "cylindre" | "cone"
  /** Barre horizontale (type « barres ») : change le dessin des formes. */
  horizontale: boolean
}

export type MarquePoint = {
  element: string
  cx: number
  cy: number
  valeur: number
  categorie: string
  etiquette: Etiquette | null
}

export type MarquePart = {
  element: string
  /** Chemin SVG de la part. */
  d: string
  couleur: string
  valeur: number
  /** Part du total, entre 0 et 1. */
  part: number
  categorie: string
  etiquette: Etiquette | null
  cadre: Cadre
}

export type Tendance = {
  d: string
  type: "lineaire" | "moyenne-mobile"
  /** « Linéaire (Nord) », comme la légende d'Excel. */
  libelle: string
  /** Équation lisible, affichable en option. */
  equation: string | null
}

export type SerieDisposee = {
  /** Index dans `chart.series`, jamais l'index des séries visibles : les
   * identifiants d'élément doivent survivre au masquage d'une série. */
  index: number
  element: string
  nom: string
  couleur: string
  barres: MarqueBarre[]
  points: MarquePoint[]
  parts: MarquePart[]
  /** Chemin de la ligne (courbes, nuage avec lissage désactivé : null). */
  ligne: string | null
  /** Chemin de l'aire fermée sous la courbe. */
  aire: string | null
  tendance: Tendance | null
  cadre: Cadre
}

export type EntreeLegende = {
  etiquette: string
  couleur: string
  element: string
  x: number
  y: number
  /** Entrée de courbe de tendance : trait pointillé plutôt que pastille pleine. */
  tendance: boolean
}

export type DispositionGraphique = {
  type: ChartType
  largeur: number
  hauteur: number
  /** Vrai sous 420 px : les polices et les marges se resserrent. */
  compact: boolean
  style: StyleGalerie
  police: { titre: number; legende: number; axes: number; etiquettes: number }
  /** Zone de graphique : le cadre entier. */
  zone: Cadre
  /** Zone de traçage : là où les données sont dessinées. */
  tracage: Cadre
  titre: { texte: string; x: number; y: number } | null
  legende: { entrees: EntreeLegende[]; cadre: Cadre; pastille: number } | null
  quadrillage: Array<{ x1: number; y1: number; x2: number; y2: number }>
  axeX: AxeDispose | null
  axeY: AxeDispose | null
  series: SerieDisposee[]
  /** Rectangle englobant de chaque élément, pour les poignées de sélection. */
  cadres: Record<string, Cadre>
  /** Éléments sélectionnables réellement dessinés, dans l'ordre de lecture. */
  elements: string[]
  selection: string | null
}

/** Éléments effectivement affichés, valeurs par défaut comprises. */
function elementsEffectifs(etat: ChartState): Required<ChartElements> {
  const e = etat.elements ?? {}
  const secteurs = etat.type === "secteurs"
  return {
    titre: e.titre ?? true,
    legende: e.legende ?? (secteurs || etat.series.filter((s) => !s.hidden).length > 1),
    etiquettes: e.etiquettes ?? false,
    quadrillage: (e.quadrillage ?? true) && !secteurs,
    axes: (e.axes ?? true) && !secteurs,
    titresAxes: e.titresAxes ?? false,
  }
}

/** Largeur approchée d'un texte : le SVG ne se mesure pas sans le DOM. */
function largeurTexte(texte: string, police: number): number {
  return texte.length * police * 0.55
}

function tronquer(texte: string, police: number, largeurMax: number): string {
  if (largeurTexte(texte, police) <= largeurMax) return texte
  const nbMax = Math.max(1, Math.floor(largeurMax / (police * 0.55)) - 1)
  return texte.slice(0, nbMax).trimEnd() + "…"
}

function englober(cadres: Cadre[]): Cadre {
  if (!cadres.length) return { x: 0, y: 0, w: 0, h: 0 }
  const x1 = Math.min(...cadres.map((c) => c.x))
  const y1 = Math.min(...cadres.map((c) => c.y))
  const x2 = Math.max(...cadres.map((c) => c.x + c.w))
  const y2 = Math.max(...cadres.map((c) => c.y + c.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/**
 * Calcule tout ce qu'il y a à dessiner.
 *
 * `valeurs` est indexé par plage ("B2:B7") : la couche visuelle n'a pas à savoir
 * lire un classeur, et le lecteur n'a pas à savoir dessiner. `largeur` et
 * `hauteur` sont celles du cadre flottant, en pixels CSS — la fonction est donc
 * appelée à nouveau après un redimensionnement, jamais mise à l'échelle par une
 * transformation qui rendrait le texte flou.
 */
export function disposerGraphique(
  etat: ChartState,
  valeurs: Record<string, unknown[]>,
  largeur: number,
  hauteur: number,
): DispositionGraphique {
  const L = Math.max(180, largeur)
  const H = Math.max(120, hauteur)
  const compact = L < 420
  const style = styleDe(etat.style)
  const elements = elementsEffectifs(etat)
  const police = {
    titre: compact ? 12 : 14,
    legende: compact ? 9 : 10.5,
    axes: compact ? 8.5 : 10,
    etiquettes: compact ? 8 : 9.5,
  }

  const index = indexer(valeurs)
  const horizontal = etat.type === "barres"
  const secteurs = etat.type === "secteurs"
  const nuage = etat.type === "nuage"

  // Séries visibles, index d'origine conservé : « masquer une série » ne doit
  // jamais renuméroter les autres, sinon `serie:1` désignerait autre chose après
  // le geste et la validation deviendrait fausse.
  const visibles = etat.series
    .map((s, i) => ({ serie: s, index: i }))
    .filter((x) => !x.serie.hidden)
  const tracables = secteurs ? visibles.slice(0, 1) : visibles

  const donnees = tracables.map((x) => ({
    ...x,
    valeurs: lirePlage(index, x.serie.values).map(versNombre),
    couleur: couleurDeSerie(x.serie, x.index, etat.style),
  }))

  const brutsCategories = lirePlage(index, etat.categories)
  const nbPointsMax = donnees.reduce((n, d) => Math.max(n, d.valeurs.length), 0)
  const categories: string[] = []
  for (let j = 0; j < Math.max(nbPointsMax, brutsCategories.length ? brutsCategories.length : 0); j++) {
    const brut = brutsCategories[j]
    categories.push(estVide(brut) ? String(j + 1) : String(brut).trim())
  }
  const nbCat = Math.max(1, secteurs ? categories.length || nbPointsMax : nbPointsMax || categories.length)

  const toutes = donnees.flatMap((d) => d.valeurs.filter((v): v is number => v !== null))
  const echelle = echelleValeurs(toutes, compact ? 4 : 5)
  // Nuage de points : l'axe des abscisses porte lui aussi une échelle, prise dans
  // les libellés quand ils sont numériques (une semaine, une surface, un budget).
  const xNumeriques = nuage ? brutsCategories.map(versNombre) : []
  const echelleX = nuage
    ? echelleValeurs(
        xNumeriques.filter((v): v is number => v !== null).length
          ? xNumeriques.filter((v): v is number => v !== null)
          : categories.map((_, j) => j + 1),
        compact ? 4 : 5,
      )
    : null

  /* ── Réservation des zones ─────────────────────────────────────────────── */

  const marge = compact ? 6 : 9
  const zone: Cadre = { x: 0, y: 0, w: L, h: H }
  let x = marge
  let y = marge
  let w = L - marge * 2
  let h = H - marge * 2

  const cadres: Record<string, Cadre> = { "zone-graphique": { ...zone } }

  let titre: DispositionGraphique["titre"] = null
  if (elements.titre) {
    const texte = (etat.title ?? "").trim() || "Titre du graphique"
    const hTitre = police.titre * 1.9
    titre = { texte: tronquer(texte, police.titre, w), x: x + w / 2, y: y + police.titre * 1.25 }
    const larg = Math.min(w, largeurTexte(titre.texte, police.titre) + 12)
    cadres["titre"] = { x: x + (w - larg) / 2, y, w: larg, h: hTitre }
    y += hTitre
    h -= hTitre
  }

  // Légende : les entrées sont les SÉRIES, sauf pour un secteur où ce sont les
  // parts — c'est la seule façon de nommer les tranches sans les surcharger.
  const entreesBrutes: Array<{ etiquette: string; couleur: string; element: string; tendance: boolean }> = []
  if (secteurs) {
    const premiere = donnees[0]
    if (premiere) {
      for (let j = 0; j < (premiere.valeurs.length || nbCat); j++) {
        entreesBrutes.push({
          etiquette: categories[j] ?? String(j + 1),
          couleur: style.palette[j % style.palette.length],
          element: `point:${premiere.index}:${j}`,
          tendance: false,
        })
      }
    }
  } else {
    for (const d of donnees) {
      entreesBrutes.push({ etiquette: d.serie.name, couleur: d.couleur, element: `serie:${d.index}`, tendance: false })
    }
    for (const d of donnees) {
      if (!d.serie.trendline) continue
      entreesBrutes.push({
        etiquette: `${d.serie.trendline === "lineaire" ? "Linéaire" : "Moy. mobile"} (${d.serie.name})`,
        couleur: d.couleur,
        element: `serie:${d.index}`,
        tendance: true,
      })
    }
  }

  let legende: DispositionGraphique["legende"] = null
  const position = etat.legendPosition ?? "bas"
  const pastille = compact ? 7 : 9
  if (elements.legende && entreesBrutes.length) {
    if (position === "droite" || position === "gauche") {
      const largeurCol = Math.min(
        Math.max(...entreesBrutes.map((e) => largeurTexte(e.etiquette, police.legende))) + pastille + 12,
        Math.max(72, w * 0.34),
      )
      const pas = police.legende * 1.7
      const hautTotal = entreesBrutes.length * pas
      const yDepart = y + Math.max(0, (h - hautTotal) / 2)
      const xCol = position === "droite" ? x + w - largeurCol : x
      legende = {
        entrees: entreesBrutes.map((e, i) => ({
          ...e,
          etiquette: tronquer(e.etiquette, police.legende, largeurCol - pastille - 10),
          x: xCol + 2,
          y: yDepart + i * pas + pas / 2,
        })),
        cadre: { x: xCol, y: yDepart, w: largeurCol, h: hautTotal },
        pastille,
      }
      if (position === "gauche") x += largeurCol
      w -= largeurCol
    } else {
      // Légende horizontale : on remplit des lignes et on passe à la suivante
      // quand la largeur ne suffit plus. Sans ce retour, les noms se chevauchent
      // dès qu'il y a quatre séries sur un écran de téléphone.
      const espace = compact ? 10 : 14
      const lignes: Array<Array<{ e: (typeof entreesBrutes)[number]; larg: number }>> = [[]]
      for (const e of entreesBrutes) {
        const larg = pastille + 5 + largeurTexte(e.etiquette, police.legende)
        const courante = lignes[lignes.length - 1]
        const utilisee = courante.reduce((s, c) => s + c.larg + espace, 0)
        if (courante.length && utilisee + larg > w) lignes.push([{ e, larg }])
        else courante.push({ e, larg })
      }
      const pasLigne = police.legende * 1.7
      const hautTotal = lignes.length * pasLigne
      const yBloc = position === "haut" ? y : y + h - hautTotal
      const entrees: EntreeLegende[] = []
      lignes.forEach((ligne, iL) => {
        const totale = ligne.reduce((s, c) => s + c.larg, 0) + espace * Math.max(0, ligne.length - 1)
        let curseur = x + Math.max(0, (w - totale) / 2)
        for (const c of ligne) {
          entrees.push({ ...c.e, x: curseur, y: yBloc + iL * pasLigne + pasLigne / 2 })
          curseur += c.larg + espace
        }
      })
      legende = { entrees, cadre: { x, y: yBloc, w, h: hautTotal }, pastille }
      if (position === "haut") y += hautTotal
      h -= hautTotal
    }
    cadres["legende"] = legende.cadre
  }

  // Axes : on réserve d'abord la place des libellés, sinon la zone de traçage
  // mordrait dessus et les graduations sortiraient du cadre.
  let largeurGauche = 0
  let hauteurBas = 0
  const libellesValeurs = echelle.graduations.map((g) => formaterNombre(g, echelle.decimales))
  if (elements.axes) {
    if (horizontal) {
      // +12 et non +8 : la troncature des libellés retire 10 px de gouttière, une
      // réserve trop juste coupait « Administration » pour deux pixels.
      largeurGauche = Math.min(
        Math.max(...categories.slice(0, nbCat).map((c) => largeurTexte(c, police.axes)), 20) + 12,
        Math.max(56, w * 0.34),
      )
      hauteurBas = police.axes * 1.9
    } else {
      largeurGauche = Math.max(...libellesValeurs.map((t) => largeurTexte(t, police.axes)), 14) + 8
      hauteurBas = police.axes * 1.9
    }
    if (elements.titresAxes) {
      largeurGauche += police.axes * 1.6
      hauteurBas += police.axes * 1.7
    }
  } else if (!secteurs) {
    // Sans axes, on garde une respiration pour que les barres ne touchent pas le
    // bord du cadre.
    largeurGauche = 4
    hauteurBas = 4
  }

  // La dernière graduation d'un axe de valeurs HORIZONTAL est centrée sur le bord
  // droit du tracé : sans cette réserve, « 80 000 » sortait du cadre et s'affichait
  // coupé en « 80 00 ». Les axes de catégories, eux, centrent leur libellé dans un
  // intervalle et ne débordent jamais.
  let margeDroite = 0
  if (elements.axes && (horizontal || nuage)) {
    const dernier = horizontal
      ? libellesValeurs[libellesValeurs.length - 1] ?? ""
      : echelleX
        ? formaterNombre(echelleX.graduations[echelleX.graduations.length - 1], echelleX.decimales)
        : ""
    margeDroite = largeurTexte(dernier, police.axes) / 2 + 2
  }

  const tracage: Cadre = {
    x: x + largeurGauche,
    y,
    w: Math.max(20, w - largeurGauche - margeDroite),
    h: Math.max(20, h - hauteurBas),
  }
  cadres["zone-tracage"] = { ...tracage }

  /* ── Axes et quadrillage ──────────────────────────────────────────────── */

  const positionValeur = (v: number) => {
    const etendue = echelle.max - echelle.min || 1
    const t = (v - echelle.min) / etendue
    return horizontal ? tracage.x + tracage.w * t : tracage.y + tracage.h * (1 - t)
  }
  const zeroValeur = positionValeur(Math.min(Math.max(0, echelle.min), echelle.max))

  const positionX = (j: number) => {
    if (nuage && echelleX) {
      const v = xNumeriques[j] ?? j + 1
      const etendue = echelleX.max - echelleX.min || 1
      return tracage.x + tracage.w * (((v ?? j + 1) - echelleX.min) / etendue)
    }
    return tracage.x + (tracage.w / nbCat) * (j + 0.5)
  }
  const positionY = (j: number) => tracage.y + (tracage.h / nbCat) * (j + 0.5)

  const quadrillage: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  if (elements.quadrillage) {
    if (horizontal) {
      for (const g of echelle.graduations) {
        const gx = positionValeur(g)
        quadrillage.push({ x1: gx, y1: tracage.y, x2: gx, y2: tracage.y + tracage.h })
      }
    } else {
      for (const g of echelle.graduations) {
        const gy = positionValeur(g)
        quadrillage.push({ x1: tracage.x, y1: gy, x2: tracage.x + tracage.w, y2: gy })
      }
      if (nuage && echelleX) {
        for (const g of echelleX.graduations) {
          const etendue = echelleX.max - echelleX.min || 1
          const gx = tracage.x + tracage.w * ((g - echelleX.min) / etendue)
          quadrillage.push({ x1: gx, y1: tracage.y, x2: gx, y2: tracage.y + tracage.h })
        }
      }
    }
    cadres["quadrillage"] = { ...tracage }
  }

  let axeX: AxeDispose | null = null
  let axeY: AxeDispose | null = null
  if (elements.axes) {
    const yBase = tracage.y + tracage.h
    const largeurSlot = tracage.w / nbCat

    if (horizontal) {
      axeX = {
        nature: "valeurs",
        ligne: { x1: tracage.x, y1: yBase, x2: tracage.x + tracage.w, y2: yBase },
        graduations: echelle.graduations.map((g) => ({
          libelle: formaterNombre(g, echelle.decimales),
          x: positionValeur(g),
          y: yBase + police.axes * 1.35,
          trait: { x1: positionValeur(g), y1: yBase, x2: positionValeur(g), y2: yBase + 3 },
        })),
        ancrage: "middle",
        titre: null,
        cadre: { x: tracage.x, y: yBase, w: tracage.w, h: hauteurBas },
      }
      axeY = {
        nature: "categories",
        ligne: { x1: tracage.x, y1: tracage.y, x2: tracage.x, y2: yBase },
        graduations: categories.slice(0, nbCat).map((c, j) => ({
          libelle: tronquer(c, police.axes, largeurGauche - 10),
          x: tracage.x - 6,
          y: positionY(j) + police.axes * 0.36,
        })),
        ancrage: "end",
        titre: null,
        cadre: { x: tracage.x - largeurGauche, y: tracage.y, w: largeurGauche, h: tracage.h },
      }
    } else {
      const libellesX =
        nuage && echelleX
          ? echelleX.graduations.map((g) => ({ libelle: formaterNombre(g, echelleX.decimales), valeur: g }))
          : categories.slice(0, nbCat).map((c, j) => ({ libelle: c, valeur: j }))
      axeX = {
        nature: nuage ? "valeurs" : "categories",
        ligne: { x1: tracage.x, y1: yBase, x2: tracage.x + tracage.w, y2: yBase },
        graduations: libellesX.map((item, j) => {
          const gx =
            nuage && echelleX
              ? tracage.x + tracage.w * ((item.valeur - echelleX.min) / (echelleX.max - echelleX.min || 1))
              : positionX(j)
          return {
            libelle: tronquer(item.libelle, police.axes, Math.max(24, largeurSlot - 2)),
            x: gx,
            y: yBase + police.axes * 1.35,
            trait: nuage ? { x1: gx, y1: yBase, x2: gx, y2: yBase + 3 } : undefined,
          }
        }),
        ancrage: "middle",
        titre: null,
        cadre: { x: tracage.x, y: yBase, w: tracage.w, h: hauteurBas },
      }
      axeY = {
        nature: "valeurs",
        ligne: { x1: tracage.x, y1: tracage.y, x2: tracage.x, y2: yBase },
        graduations: echelle.graduations.map((g) => ({
          libelle: formaterNombre(g, echelle.decimales),
          x: tracage.x - 6,
          y: positionValeur(g) + police.axes * 0.36,
          trait: { x1: tracage.x - 3, y1: positionValeur(g), x2: tracage.x, y2: positionValeur(g) },
        })),
        ancrage: "end",
        titre: null,
        cadre: { x: tracage.x - largeurGauche, y: tracage.y, w: largeurGauche, h: tracage.h },
      }
    }

    if (elements.titresAxes && axeX && axeY) {
      // Le libellé suit la NATURE de l'axe : sur un nuage de points, les deux axes
      // portent des valeurs, et titrer l'un « Catégories » serait un contresens.
      axeX.titre = {
        texte: axeX.nature === "valeurs" ? "Valeurs" : "Catégories",
        x: tracage.x + tracage.w / 2,
        y: yBase + hauteurBas - police.axes * 0.3,
        vertical: false,
      }
      axeY.titre = {
        texte: axeY.nature === "valeurs" ? "Valeurs" : "Catégories",
        x: x + police.axes * 1.1,
        y: tracage.y + tracage.h / 2,
        vertical: true,
      }
    }

    cadres["axe-x"] = axeX.cadre
    cadres["axe-y"] = axeY.cadre
  }

  /* ── Marques ──────────────────────────────────────────────────────────── */

  const series: SerieDisposee[] = []
  const nbTracables = Math.max(1, donnees.length)
  const largeurSlot = tracage.w / nbCat
  const hauteurSlot = tracage.h / nbCat

  for (let k = 0; k < donnees.length; k++) {
    const d = donnees[k]
    const element = `serie:${d.index}`
    const barres: MarqueBarre[] = []
    const points: MarquePoint[] = []
    const parts: MarquePart[] = []
    let ligne: string | null = null
    let aire: string | null = null

    if (etat.type === "histogramme" || etat.type === "barres") {
      const forme = d.serie.shape ?? "barre"
      const groupe = (horizontal ? hauteurSlot : largeurSlot) * 0.74
      const epaisseur = groupe / nbTracables
      for (let j = 0; j < nbCat; j++) {
        const v = d.valeurs[j]
        if (v === null || v === undefined) continue
        if (horizontal) {
          const centre = positionY(j)
          const yBarre = centre - groupe / 2 + k * epaisseur
          const xv = positionValeur(v)
          const xDebut = Math.min(xv, zeroValeur)
          const larg = Math.max(1, Math.abs(xv - zeroValeur))
          barres.push({
            element: `point:${d.index}:${j}`,
            x: xDebut,
            y: yBarre,
            w: larg,
            h: Math.max(2, epaisseur - 1),
            valeur: v,
            categorie: categories[j] ?? String(j + 1),
            forme,
            horizontale: true,
            etiquette: elements.etiquettes
              ? {
                  texte: formaterNombre(v),
                  x: xDebut + larg + 4,
                  y: yBarre + epaisseur / 2 + police.etiquettes * 0.34,
                  ancrage: "start",
                }
              : null,
          })
        } else {
          const centre = positionX(j)
          const xBarre = centre - groupe / 2 + k * epaisseur
          const yv = positionValeur(v)
          const yDebut = Math.min(yv, zeroValeur)
          const haut = Math.max(1, Math.abs(yv - zeroValeur))
          barres.push({
            element: `point:${d.index}:${j}`,
            x: xBarre,
            y: yDebut,
            w: Math.max(2, epaisseur - 1),
            h: haut,
            valeur: v,
            categorie: categories[j] ?? String(j + 1),
            forme,
            horizontale: false,
            etiquette: elements.etiquettes
              ? {
                  texte: formaterNombre(v),
                  x: xBarre + epaisseur / 2,
                  y: yDebut - 3,
                  ancrage: "middle",
                }
              : null,
          })
        }
      }
    } else if (etat.type === "secteurs") {
      const total = d.valeurs.reduce<number>((s, v) => s + (v !== null && v > 0 ? v : 0), 0)
      const cx = tracage.x + tracage.w / 2
      const cy = tracage.y + tracage.h / 2
      const rayon = (Math.min(tracage.w, tracage.h) / 2) * 0.88
      let angle = -Math.PI / 2 // Excel démarre à midi, sens horaire.
      for (let j = 0; j < nbCat; j++) {
        const v = d.valeurs[j]
        if (v === null || v <= 0) continue
        const part = total > 0 ? v / total : 0
        const suivant = angle + part * Math.PI * 2
        const milieu = (angle + suivant) / 2
        parts.push({
          element: `point:${d.index}:${j}`,
          d: cheminPart(cx, cy, rayon, angle, suivant),
          couleur: style.palette[j % style.palette.length],
          valeur: v,
          part,
          categorie: categories[j] ?? String(j + 1),
          etiquette: elements.etiquettes
            ? {
                texte: `${formaterNombre(part * 100, part * 100 >= 10 ? 0 : 1)} %`,
                x: cx + Math.cos(milieu) * rayon * 0.66,
                y: cy + Math.sin(milieu) * rayon * 0.66 + police.etiquettes * 0.34,
                ancrage: "middle",
              }
            : null,
          // Rectangle englobant la PART elle-même, pas un carré au milieu : Excel
          // pose ses poignées autour de la tranche entière, et un carré central
          // masquerait l'étiquette de la part sélectionnée.
          cadre: cadreDePart(cx, cy, rayon, angle, suivant),
        })
        angle = suivant
      }
    } else {
      // Courbes, aires et nuage : mêmes points, dessins différents.
      const segments: string[] = []
      let ouvert = false
      for (let j = 0; j < nbCat; j++) {
        const v = d.valeurs[j]
        if (v === null || v === undefined) {
          ouvert = false
          continue
        }
        const px = positionX(j)
        const py = positionValeur(v)
        points.push({
          element: `point:${d.index}:${j}`,
          cx: px,
          cy: py,
          valeur: v,
          categorie: categories[j] ?? String(j + 1),
          etiquette: elements.etiquettes
            ? { texte: formaterNombre(v), x: px, y: py - 6, ancrage: "middle" }
            : null,
        })
        segments.push(`${ouvert ? "L" : "M"} ${arrondi(px)} ${arrondi(py)}`)
        ouvert = true
      }
      if (etat.type !== "nuage" && segments.length > 1) ligne = segments.join(" ")
      if (etat.type === "aires" && points.length > 1) {
        const base = arrondi(positionValeur(Math.max(echelle.min, Math.min(0, echelle.max))))
        aire =
          `M ${arrondi(points[0].cx)} ${base} ` +
          points.map((p) => `L ${arrondi(p.cx)} ${arrondi(p.cy)}`).join(" ") +
          ` L ${arrondi(points[points.length - 1].cx)} ${base} Z`
      }
    }

    /* Courbe de tendance : calcul réel sur les valeurs de la série. */
    let tendance: Tendance | null = null
    if (d.serie.trendline && !secteurs) {
      if (d.serie.trendline === "lineaire") {
        const nuagePoints = d.valeurs
          .map((v, j) => ({ x: nuage && xNumeriques[j] !== null && xNumeriques[j] !== undefined ? (xNumeriques[j] as number) : j, y: v }))
          .filter((p): p is { x: number; y: number } => p.y !== null)
        const reg = regressionLineaire(nuagePoints)
        if (reg) {
          const xs = nuagePoints.map((p) => p.x)
          const xDebut = Math.min(...xs)
          const xFin = Math.max(...xs)
          const versEcran = (xv: number) =>
            nuage && echelleX
              ? tracage.x + tracage.w * ((xv - echelleX.min) / (echelleX.max - echelleX.min || 1))
              : positionX(xv)
          tendance = {
            d: `M ${arrondi(versEcran(xDebut))} ${arrondi(positionValeur(reg.ordonnee + reg.pente * xDebut))} L ${arrondi(
              versEcran(xFin),
            )} ${arrondi(positionValeur(reg.ordonnee + reg.pente * xFin))}`,
            type: "lineaire",
            libelle: `Linéaire (${d.serie.name})`,
            equation: `y = ${formaterNombre(reg.pente, decimalesUtiles(reg.pente))} x ${
              reg.ordonnee < 0 ? "−" : "+"
            } ${formaterNombre(Math.abs(reg.ordonnee), decimalesUtiles(reg.ordonnee))}`,
          }
        }
      } else {
        const mm = moyenneMobile(d.valeurs, 2)
        const seg: string[] = []
        let ouvert = false
        mm.forEach((v, j) => {
          if (v === null) {
            ouvert = false
            return
          }
          seg.push(`${ouvert ? "L" : "M"} ${arrondi(positionX(j))} ${arrondi(positionValeur(v))}`)
          ouvert = true
        })
        if (seg.length > 1) {
          tendance = {
            d: seg.join(" "),
            type: "moyenne-mobile",
            libelle: `Moy. mobile sur 2 pér. (${d.serie.name})`,
            equation: null,
          }
        }
      }
    }

    const cadresMarques = [
      ...barres.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      ...points.map((p) => ({ x: p.cx - 4, y: p.cy - 4, w: 8, h: 8 })),
      ...parts.map((p) => p.cadre),
    ]
    for (const b of barres) cadres[b.element] = { x: b.x, y: b.y, w: b.w, h: b.h }
    for (const p of points) cadres[p.element] = { x: p.cx - 4, y: p.cy - 4, w: 8, h: 8 }
    for (const p of parts) cadres[p.element] = p.cadre

    const cadreSerie = cadresMarques.length ? englober(cadresMarques) : { ...tracage }
    cadres[element] = cadreSerie

    series.push({
      index: d.index,
      element,
      nom: d.serie.name,
      couleur: d.couleur,
      barres,
      points,
      parts,
      ligne,
      aire,
      tendance,
      cadre: cadreSerie,
    })
  }

  const ordre: string[] = []
  if (titre) ordre.push("titre")
  if (legende) ordre.push("legende")
  if (elements.quadrillage) ordre.push("quadrillage")
  if (axeX) ordre.push("axe-x")
  if (axeY) ordre.push("axe-y")
  for (const s of series) {
    ordre.push(s.element)
    for (const b of s.barres) ordre.push(b.element)
    for (const p of s.points) ordre.push(p.element)
    for (const p of s.parts) ordre.push(p.element)
  }

  return {
    type: etat.type,
    largeur: L,
    hauteur: H,
    compact,
    style,
    police,
    zone,
    tracage,
    titre,
    legende,
    quadrillage,
    axeX,
    axeY,
    series,
    cadres,
    elements: ordre,
    selection: etat.selectedElement ?? null,
  }
}

/** Décimales utiles pour une pente ou une ordonnée à l'origine. */
function decimalesUtiles(v: number): number {
  const abs = Math.abs(v)
  if (abs >= 100) return 0
  if (abs >= 10) return 1
  return 2
}

/** Coordonnées arrondies au dixième : un chemin SVG lisible et plus léger. */
function arrondi(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * Chemin d'une part de secteur. Cas particulier de la part unique : un arc de
 * 360° dégénère (départ et arrivée confondus), il faut deux demi-arcs — sans quoi
 * un secteur à une seule catégorie ne s'afficherait pas du tout.
 */
function cheminPart(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const complet = a1 - a0 >= Math.PI * 2 - 1e-6
  if (complet) {
    return (
      `M ${arrondi(cx + r)} ${arrondi(cy)} ` +
      `A ${arrondi(r)} ${arrondi(r)} 0 1 1 ${arrondi(cx - r)} ${arrondi(cy)} ` +
      `A ${arrondi(r)} ${arrondi(r)} 0 1 1 ${arrondi(cx + r)} ${arrondi(cy)} Z`
    )
  }
  const x0 = cx + Math.cos(a0) * r
  const y0 = cy + Math.sin(a0) * r
  const x1 = cx + Math.cos(a1) * r
  const y1 = cy + Math.sin(a1) * r
  const grand = a1 - a0 > Math.PI ? 1 : 0
  return (
    `M ${arrondi(cx)} ${arrondi(cy)} L ${arrondi(x0)} ${arrondi(y0)} ` +
    `A ${arrondi(r)} ${arrondi(r)} 0 ${grand} 1 ${arrondi(x1)} ${arrondi(y1)} Z`
  )
}

/**
 * Rectangle englobant une part de secteur : le centre, les deux rayons de bord et
 * les points extrêmes du cercle traversés par l'arc. Sans ces derniers, une part
 * qui enjambe midi ou trois heures aurait un cadre trop petit.
 */
function cadreDePart(cx: number, cy: number, r: number, a0: number, a1: number): Cadre {
  const xs = [cx, cx + Math.cos(a0) * r, cx + Math.cos(a1) * r]
  const ys = [cy, cy + Math.sin(a0) * r, cy + Math.sin(a1) * r]
  // Angles des quatre extrémités du cercle, ramenés dans l'intervalle de l'arc.
  for (let k = -2; k <= 4; k++) {
    const angle = (k * Math.PI) / 2
    if (angle < a0 - 1e-9 || angle > a1 + 1e-9) continue
    xs.push(cx + Math.cos(angle) * r)
    ys.push(cy + Math.sin(angle) * r)
  }
  const x1 = Math.min(...xs)
  const y1 = Math.min(...ys)
  return { x: x1, y: y1, w: Math.max(...xs) - x1, h: Math.max(...ys) - y1 }
}

/**
 * Chemin d'une barre selon sa forme (module 18). Le cylindre reçoit un sommet
 * arrondi, le cône une pointe : deux dessins, un seul modèle de données.
 */
export function cheminBarre(b: MarqueBarre): string {
  const { x, y, w, h, forme, horizontale } = b
  if (forme === "barre") {
    return `M ${arrondi(x)} ${arrondi(y)} h ${arrondi(w)} v ${arrondi(h)} h ${arrondi(-w)} Z`
  }
  if (forme === "cone") {
    return horizontale
      ? `M ${arrondi(x)} ${arrondi(y)} L ${arrondi(x + w)} ${arrondi(y + h / 2)} L ${arrondi(x)} ${arrondi(y + h)} Z`
      : `M ${arrondi(x + w / 2)} ${arrondi(y)} L ${arrondi(x + w)} ${arrondi(y + h)} L ${arrondi(x)} ${arrondi(y + h)} Z`
  }
  // Cylindre : ellipse au sommet, côtés droits.
  if (horizontale) {
    const rx = Math.min(w / 2, h * 0.18)
    return (
      `M ${arrondi(x)} ${arrondi(y)} L ${arrondi(x + w - rx)} ${arrondi(y)} ` +
      `A ${arrondi(rx)} ${arrondi(h / 2)} 0 0 1 ${arrondi(x + w - rx)} ${arrondi(y + h)} ` +
      `L ${arrondi(x)} ${arrondi(y + h)} Z`
    )
  }
  const ry = Math.min(h / 2, w * 0.18)
  return (
    `M ${arrondi(x)} ${arrondi(y + ry)} ` +
    `A ${arrondi(w / 2)} ${arrondi(ry)} 0 0 1 ${arrondi(x + w)} ${arrondi(y + ry)} ` +
    `L ${arrondi(x + w)} ${arrondi(y + h)} L ${arrondi(x)} ${arrondi(y + h)} Z`
  )
}
