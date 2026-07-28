/**
 * Moteur de tableaux croisés dynamiques.
 *
 * POURQUOI ce fichier existe : le module TCD d'Univer (`@univerjs-pro/sheets-pivot`)
 * est un paquet payant. Or un tableau croisé n'est rien d'autre qu'un regroupement
 * assorti d'agrégats — quelque chose que l'on sait calculer exactement soi-même, et
 * dont on maîtrise alors CHAQUE cellule produite. C'est cette maîtrise qui permet à
 * une leçon de demander « relevez le total du Nord » et à la correction de vérifier
 * que B5 contient bien 24 130 : sans elle, on validerait des champs bien rangés sans
 * jamais prouver que le calcul est juste.
 *
 * Modèle PUR : ni React, ni Univer, ni accès au DOM. Le simulateur fournit une
 * fonction de lecture de cellule (`lire`) et applique lui-même les cellules
 * calculées. Le même code sert donc à la leçon dans le navigateur et à la
 * correction d'une évaluation côté serveur — c'est la règle déjà posée par
 * `validate.ts`, et deux implémentations divergentes finiraient par rendre deux
 * verdicts sur la même action.
 *
 * PARTI PRIS DE DISPOSITION : on reproduit la présentation « compacte » d'Excel,
 * celle qui s'applique par défaut. Les champs de lignes tiennent dans UNE colonne
 * (la plus à gauche), les niveaux imbriqués sont décalés par une indentation, et le
 * sous-total d'un niveau s'affiche sur la ligne du libellé parent. Les champs de
 * colonnes occupent les lignes du haut, « Total général » ferme la dernière ligne et
 * la dernière colonne. Un apprenant qui refera l'exercice dans le vrai Excel
 * retrouvera la même géométrie, donc les mêmes références de cellules.
 */

import type {
  CellRef,
  CellState,
  PivotAgg,
  PivotField,
  PivotState,
  RangeRef,
} from "./types"
import { columnIndexToLetter, formatCell, formatRange, parseRange } from "./grid"

/* ═══════════ CONTRAT DE LECTURE ═══════════ */

/**
 * Lecture d'une cellule, en notation A1. Signature volontairement identique à
 * `GridApi.getValue` : le simulateur passe la méthode de la grille telle quelle,
 * et un test peut passer une simple table en dur.
 */
export type LireCellule = (ref: CellRef) => unknown

/** Une ligne de la source, indexée par nom de champ. */
export type LigneSource = Record<string, unknown>

/**
 * Instantané de la plage source. On garde les valeurs BRUTES : un TCD regroupe sur
 * la valeur, pas sur ce que la cellule affiche.
 */
export type SourceTcd = {
  /** Plage lue, ligne d'en-tête comprise. */
  range: RangeRef
  /** Noms des champs, dans l'ordre des colonnes. */
  champs: string[]
  /** Une entrée par ligne de données. */
  lignes: LigneSource[]
}

/** Les quatre zones du volet, nommées comme les champs de `PivotState`. */
export type ZoneTcd = "filters" | "cols" | "rows" | "values"

/**
 * État d'un TCD tel que le manipule ce moteur : l'état déclaratif du scénario,
 * augmenté de l'instantané de source sur lequel le tableau a été calculé.
 *
 * POURQUOI cet instantané : le vrai Excel ne recalcule pas un tableau croisé quand
 * la source change ; il attend « Actualiser ». Le tableau doit donc continuer
 * d'afficher les anciens chiffres, ce qui n'est possible qu'en gardant les anciennes
 * lignes quelque part. Une leçon entière du module 20 porte là-dessus.
 *
 * `EtatTcd` reste assignable à `PivotState` : il part donc directement dans
 * l'observation `pivotChange` que lit `validate.ts`.
 */
export type EtatTcd = PivotState & { instantane: SourceTcd }

/** Ce que le scénario déclare pour créer un tableau (`setup.pivot`). */
export type SpecTcd = Partial<PivotState> & { source: RangeRef; target: CellRef }

/** Ce que le scénario déclare pour modifier le tableau courant (`setup.pivotEdit`). */
export type PatchTcd = Partial<PivotState> & {
  addRows?: PivotField[]
  addCols?: PivotField[]
  addValues?: PivotField[]
  addFilters?: PivotField[]
  removeFields?: string[]
  /** Cellules de la source que l'étape va modifier : le tableau devient périmé. */
  sourceCells?: Record<CellRef, CellState>
  refresh?: boolean
}

/* ═══════════ TABLEAU CALCULÉ ═══════════ */

/**
 * Une position sur un axe : une ligne du tableau, ou une colonne de valeurs.
 * Les sous-totaux et le total général sont des positions comme les autres — c'est
 * ce qui évite de dupliquer la logique d'agrégation trois fois : une position
 * retient les lignes source dont le début de clé correspond à la sienne, et une clé
 * vide retient tout.
 */
export type PositionAxe = {
  /** Valeurs successives des champs de l'axe, ex. ["Nord", "Vasseur"]. */
  cle: string[]
  /** Libellé le plus interne, celui que l'on écrit dans la cellule. */
  libelle: string
  /** Libellé à écrire par niveau d'en-tête (axe des colonnes). "" = rien. */
  libelles: string[]
  /** Profondeur d'imbrication, 0 pour le champ le plus externe. */
  niveau: number
  /** Position de sous-total (nœud qui a des enfants). */
  sousTotal: boolean
  /** Position « Total général ». */
  total: boolean
  /** Index du champ de valeur affiché par cette colonne. */
  valeurIndex: number
}

export type TableauCroise = {
  champsLignes: string[]
  champsColonnes: string[]
  /** Champs de valeurs, agrégat résolu. */
  valeurs: PivotField[]
  /** En-têtes de lignes, de haut en bas, ligne « Total général » comprise. */
  lignes: PositionAxe[]
  /** En-têtes de colonnes, de gauche à droite, colonne « Total général » comprise. */
  colonnes: PositionAxe[]
  /** Valeurs : `cellules[i][j]` pour `lignes[i]` × `colonnes[j]`. null = vide. */
  cellules: Array<Array<number | null>>
  /** Index de la ligne de total général dans `lignes`, -1 s'il n'y en a pas. */
  indexTotalLignes: number
  /** Index de la première colonne de total général dans `colonnes`, -1 sinon. */
  indexTotalColonnes: number
  /** Total général, un par champ de valeur. */
  totalGeneral: Array<number | null>
  /** Nombre de lignes source retenues après filtres de rapport. */
  nbLignesRetenues: number
  /** Filtres de rapport et libellé de leur sélection, dans l'ordre. */
  filtres: Array<{ champ: string; libelle: string }>
}

/** Résultat de la projection du tableau en cellules de feuille. */
export type PosePivot = {
  /** Cellules à appliquer, prêtes pour `GridApi.applyCells`. */
  cells: Record<CellRef, CellState>
  /** Plage occupée, filtres de rapport compris. */
  range: RangeRef
  /** Référence de chaque cellule de valeur, alignée sur `tableau.cellules`. */
  refsValeurs: CellRef[][]
  /** Référence du libellé de chaque ligne, alignée sur `tableau.lignes`. */
  refsLignes: CellRef[]
  /** Numéro (base 1) de la ligne portant les libellés de colonnes. */
  ligneEntetes: number
}

/* ═══════════ LIBELLÉS ═══════════ */

/** En-tête d'un champ de valeurs, comme l'écrit Excel : « Somme de Montant ». */
export function libelleValeur(champ: PivotField): string {
  const prefixe: Record<PivotAgg, string> = {
    somme: "Somme",
    nombre: "Nombre",
    moyenne: "Moyenne",
    min: "Min",
    max: "Max",
  }
  return `${prefixe[champ.agg ?? "somme"]} de ${champ.name}`
}

const LIB_LIGNES = "Étiquettes de lignes"
const LIB_COLONNES = "Étiquettes de colonnes"
const LIB_TOTAL = "Total général"
/** Ce qu'Excel affiche pour un regroupement sur une cellule vide. */
const LIB_VIDE = "(vide)"

/* ═══════════ LECTURE DE LA SOURCE ═══════════ */

/** Valeur exploitable : "" et les blancs deviennent null, le reste est conservé. */
function normaliserValeur(brut: unknown): unknown {
  if (brut === null || brut === undefined) return null
  if (typeof brut === "string") {
    const t = brut.trim()
    return t === "" ? null : t
  }
  if (typeof brut === "number") return Number.isFinite(brut) ? brut : null
  return brut
}

/**
 * Nombre porté par une valeur, ou null. On accepte l'écriture française
 * (« 1 234,50 ») parce que selon le format posé sur la cellule, la grille peut
 * rendre une chaîne formatée plutôt qu'un nombre — refuser cette forme ferait
 * silencieusement tomber des montants à zéro.
 */
function nombreDe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string") {
    const t = v.replace(/[\s  €%]/g, "").replace(",", ".")
    if (t === "" || !/^-?\d+(\.\d+)?$/.test(t)) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Libellé de regroupement d'une valeur : c'est lui qui s'affiche en en-tête. */
function libelleDe(v: unknown): string {
  const n = normaliserValeur(v)
  if (n === null) return LIB_VIDE
  return String(n)
}

/**
 * Lit la plage source. La première ligne porte les noms de champs — comme dans le
 * vrai Excel, qui refuse un tableau croisé sur une plage sans ligne de titres.
 * Les lignes entièrement vides sont ignorées : un scénario peut déclarer une plage
 * un peu plus large que ses données sans fausser un « Nombre de ».
 */
export function lireSource(range: RangeRef, lire: LireCellule): SourceTcd {
  const r = parseRange(range)
  if (!r) return { range, champs: [], lignes: [] }

  const champs: string[] = []
  for (let c = r.startCol; c <= r.endCol; c++) {
    const brut = normaliserValeur(lire(formatCell({ row: r.startRow, col: c })))
    // Une colonne sans titre garde sa lettre comme nom : mieux vaut un nom laid
    // qu'un champ anonyme impossible à déposer dans le volet.
    champs.push(brut === null ? columnIndexToLetter(c) : String(brut))
  }

  const lignes: LigneSource[] = []
  for (let row = r.startRow + 1; row <= r.endRow; row++) {
    const ligne: LigneSource = {}
    let vide = true
    for (let c = r.startCol; c <= r.endCol; c++) {
      const v = normaliserValeur(lire(formatCell({ row, col: c })))
      ligne[champs[c - r.startCol]] = v
      if (v !== null) vide = false
    }
    if (!vide) lignes.push(ligne)
  }
  return { range, champs, lignes }
}

/** Champs proposés par le volet, dans l'ordre des colonnes de la source. */
export function champsDisponibles(source: SourceTcd): string[] {
  return [...source.champs]
}

/**
 * Agrégat par défaut d'un champ déposé en Valeurs : somme si le champ est
 * numérique, nombre sinon. C'est le comportement d'Excel, et il évite d'afficher
 * « Somme de Commercial » à zéro.
 */
export function aggParDefaut(champ: string, source: SourceTcd): PivotAgg {
  let nombres = 0
  let renseignes = 0
  for (const l of source.lignes) {
    const v = l[champ]
    if (normaliserValeur(v) === null) continue
    renseignes++
    if (nombreDe(v) !== null) nombres++
  }
  return renseignes > 0 && nombres === renseignes ? "somme" : "nombre"
}

/* ═══════════ CRÉATION ET MODIFICATION ═══════════ */

function copieChamps(champs: PivotField[] | undefined): PivotField[] {
  return (champs ?? []).map((f) => ({ ...f }))
}

/** Résout l'agrégat de chaque champ de valeurs pour que l'état reste explicite. */
function resoudreAggs(valeurs: PivotField[], source: SourceTcd): PivotField[] {
  return valeurs.map((f) => ({ ...f, agg: f.agg ?? aggParDefaut(f.name, source) }))
}

/**
 * Crée le tableau croisé déclaré par une étape. La source est lue TOUT DE SUITE :
 * c'est cet instantané qui fait référence jusqu'à la prochaine actualisation.
 */
export function creerTcd(spec: SpecTcd, lire: LireCellule): EtatTcd {
  const instantane = lireSource(spec.source, lire)
  return {
    id: spec.id ?? "tcd1",
    source: spec.source,
    target: spec.target,
    rows: copieChamps(spec.rows),
    cols: copieChamps(spec.cols),
    values: resoudreAggs(copieChamps(spec.values), instantane),
    filters: copieChamps(spec.filters),
    ...(spec.filterValues ? { filterValues: { ...spec.filterValues } } : {}),
    ...(spec.styleId !== undefined ? { styleId: spec.styleId } : {}),
    ...(spec.stale !== undefined ? { stale: spec.stale } : {}),
    instantane,
  }
}

/** Retire un champ des quatre zones : dans Excel, un champ n'est que dans une zone. */
function retirerPartout(etat: EtatTcd, nom: string) {
  const filtre = (l: PivotField[]) => l.filter((f) => f.name !== nom)
  etat.rows = filtre(etat.rows)
  etat.cols = filtre(etat.cols)
  etat.values = filtre(etat.values)
  etat.filters = filtre(etat.filters)
  if (etat.filterValues && nom in etat.filterValues) {
    const reste = { ...etat.filterValues }
    delete reste[nom]
    etat.filterValues = reste
  }
}

/**
 * Ajoute un champ dans une zone. Si le champ y est déjà, on ne le duplique pas :
 * on met à jour son agrégat — c'est exactement ce que fait « Paramètres des champs
 * de valeurs » quand on rechoisit un calcul sur un champ déjà posé.
 */
function ajouterDans(etat: EtatTcd, zone: ZoneTcd, champ: PivotField, source: SourceTcd) {
  const liste = etat[zone]
  const existant = liste.find((f) => f.name === champ.name)
  if (existant) {
    if (zone === "values" && champ.agg) existant.agg = champ.agg
    return
  }
  // La sélection du filtre survit au déplacement du champ : sans cette mise de
  // côté, un patch qui pose « Trimestre en Filtres, valeur T4 » perdait son T4 —
  // le tableau restait sur (Tous) et le filtre n'avait plus aucun effet.
  const selection = etat.filterValues?.[champ.name]
  // Un champ déplacé quitte sa zone d'origine, comme dans le volet d'Excel.
  retirerPartout(etat, champ.name)
  if (zone === "filters" && selection && selection.length > 0) {
    etat.filterValues = { ...(etat.filterValues ?? {}), [champ.name]: selection }
  }
  const ajout: PivotField = { name: champ.name }
  if (zone === "values") ajout.agg = champ.agg ?? aggParDefaut(champ.name, source)
  else if (champ.agg) ajout.agg = champ.agg
  etat[zone].push(ajout)
}

/**
 * Applique une modification au tableau courant.
 *
 * ORDRE D'APPEL IMPORTANT côté simulateur : quand un patch porte `sourceCells`, on
 * appelle cette fonction AVANT d'écrire les cellules dans la feuille — le tableau
 * doit passer périmé en gardant ses anciens chiffres. Quand un patch porte
 * `refresh`, on l'appelle APRÈS, puisque l'actualisation relit la source.
 */
export function modifierTcd(etat: EtatTcd, patch: PatchTcd, lire: LireCellule): EtatTcd {
  const suivant: EtatTcd = {
    ...etat,
    rows: copieChamps(etat.rows),
    cols: copieChamps(etat.cols),
    values: copieChamps(etat.values),
    filters: copieChamps(etat.filters),
    ...(etat.filterValues ? { filterValues: { ...etat.filterValues } } : {}),
  }

  // Remplacements directs déclarés par le scénario.
  if (patch.id !== undefined) suivant.id = patch.id
  if (patch.target !== undefined) suivant.target = patch.target
  if (patch.rows !== undefined) suivant.rows = copieChamps(patch.rows)
  if (patch.cols !== undefined) suivant.cols = copieChamps(patch.cols)
  if (patch.values !== undefined) suivant.values = copieChamps(patch.values)
  if (patch.filters !== undefined) suivant.filters = copieChamps(patch.filters)
  if (patch.filterValues !== undefined) suivant.filterValues = { ...patch.filterValues }
  if (patch.styleId !== undefined) suivant.styleId = patch.styleId

  // Un changement de plage source impose une relecture : sans elle, le tableau
  // serait calculé sur des lignes qui ne sont plus les bonnes.
  if (patch.source !== undefined && patch.source !== etat.source) {
    suivant.source = patch.source
    suivant.instantane = lireSource(patch.source, lire)
    suivant.stale = false
  }

  for (const nom of patch.removeFields ?? []) retirerPartout(suivant, nom)
  for (const f of patch.addFilters ?? []) ajouterDans(suivant, "filters", f, suivant.instantane)
  for (const f of patch.addCols ?? []) ajouterDans(suivant, "cols", f, suivant.instantane)
  for (const f of patch.addRows ?? []) ajouterDans(suivant, "rows", f, suivant.instantane)
  for (const f of patch.addValues ?? []) ajouterDans(suivant, "values", f, suivant.instantane)

  // Les agrégats des champs de valeurs restent toujours explicites.
  suivant.values = resoudreAggs(suivant.values, suivant.instantane)

  // La source va changer : le tableau devient périmé et CONSERVE son instantané.
  if (patch.sourceCells && Object.keys(patch.sourceCells).length > 0) suivant.stale = true
  if (patch.stale !== undefined) suivant.stale = patch.stale

  // Actualiser = relire la source et repartir sur des chiffres à jour.
  if (patch.refresh) {
    suivant.instantane = lireSource(suivant.source, lire)
    suivant.values = resoudreAggs(suivant.values, suivant.instantane)
    suivant.stale = false
  }
  return suivant
}

/**
 * La source a-t-elle changé depuis le dernier calcul ? Sert au simulateur qui
 * modifie la feuille sans passer par `pivotEdit` (saisie libre de l'apprenant en
 * exercice) : le tableau doit alors passer périmé de lui-même.
 */
export function sourceAChange(etat: EtatTcd, lire: LireCellule): boolean {
  const frais = lireSource(etat.source, lire)
  if (frais.lignes.length !== etat.instantane.lignes.length) return true
  if (frais.champs.join("§") !== etat.instantane.champs.join("§")) return true
  for (let i = 0; i < frais.lignes.length; i++) {
    for (const champ of frais.champs) {
      if (libelleDe(frais.lignes[i][champ]) !== libelleDe(etat.instantane.lignes[i][champ])) return true
    }
  }
  return false
}

/* ═══════════ CALCUL ═══════════ */

/** Agrège une colonne de valeurs selon le calcul demandé. */
function agreger(valeurs: unknown[], agg: PivotAgg): number | null {
  // Aucune ligne dans ce croisement : Excel laisse la cellule vide, il n'affiche
  // pas zéro. Distinguer les deux cas est indispensable — « 0 vendu » et « rien à
  // vendre » ne se lisent pas de la même façon.
  if (valeurs.length === 0) return null

  if (agg === "nombre") {
    return valeurs.reduce<number>((n, v) => n + (normaliserValeur(v) === null ? 0 : 1), 0)
  }

  const nombres: number[] = []
  for (const v of valeurs) {
    const n = nombreDe(v)
    if (n !== null) nombres.push(n)
  }
  switch (agg) {
    case "somme":
      // Des lignes existent mais aucune valeur numérique : Excel affiche 0.
      return nombres.reduce((s, n) => s + n, 0)
    case "moyenne":
      return nombres.length === 0 ? null : nombres.reduce((s, n) => s + n, 0) / nombres.length
    case "min":
      return nombres.length === 0 ? null : Math.min(...nombres)
    case "max":
      return nombres.length === 0 ? null : Math.max(...nombres)
    default:
      return null
  }
}

/** Ordre d'affichage des libellés : numérique si possible, alphabétique sinon. */
function comparerLibelles(a: string, b: string): number {
  const na = nombreDe(a)
  const nb = nombreDe(b)
  if (na !== null && nb !== null) return na - nb
  if (na !== null) return -1
  if (nb !== null) return 1
  return a.localeCompare(b, "fr", { sensitivity: "base", numeric: true })
}

type NoeudAxe = { valeur: string; cle: string[]; niveau: number; enfants: NoeudAxe[] }

/** Arbre de regroupement d'un axe : un niveau par champ, libellés triés. */
function construireArbre(
  lignes: LigneSource[],
  champs: string[],
  niveau = 0,
  prefixe: string[] = [],
): NoeudAxe[] {
  if (niveau >= champs.length) return []
  const paquets = new Map<string, LigneSource[]>()
  for (const l of lignes) {
    const cle = libelleDe(l[champs[niveau]])
    const p = paquets.get(cle)
    if (p) p.push(l)
    else paquets.set(cle, [l])
  }
  return Array.from(paquets.keys())
    .sort(comparerLibelles)
    .map((valeur) => {
      const cle = [...prefixe, valeur]
      return {
        valeur,
        cle,
        niveau,
        enfants: construireArbre(paquets.get(valeur) ?? [], champs, niveau + 1, cle),
      }
    })
}

/**
 * Positions de l'axe des lignes, en présentation compacte : un nœud = une ligne,
 * parcours en profondeur, le parent portant son propre sous-total.
 */
function positionsLignes(arbre: NoeudAxe[], nbNiveaux: number): PositionAxe[] {
  const out: PositionAxe[] = []
  const visiter = (noeuds: NoeudAxe[]) => {
    for (const n of noeuds) {
      out.push({
        cle: n.cle,
        libelle: n.valeur,
        libelles: [n.valeur],
        niveau: n.niveau,
        sousTotal: n.enfants.length > 0,
        total: false,
        valeurIndex: 0,
      })
      visiter(n.enfants)
    }
  }
  visiter(arbre)
  if (nbNiveaux >= 1 || out.length === 0) {
    out.push({
      cle: [],
      libelle: LIB_TOTAL,
      libelles: [LIB_TOTAL],
      niveau: 0,
      sousTotal: false,
      total: true,
      valeurIndex: 0,
    })
  }
  return out
}

/**
 * Positions de l'axe des colonnes. Les champs de valeurs forment le niveau le plus
 * interne dès qu'il y en a plusieurs — sinon leur libellé va dans le coin haut
 * gauche du tableau, comme le fait Excel.
 */
function positionsColonnes(
  arbre: NoeudAxe[],
  champsColonnes: string[],
  valeurs: PivotField[],
): PositionAxe[] {
  const niveauValeurs = valeurs.length > 1
  const nbNiveaux = champsColonnes.length + (niveauValeurs ? 1 : 0)

  // Aucun champ en colonnes : une colonne par champ de valeurs, pas de total
  // général en colonne — il n'y aurait rien à totaliser horizontalement.
  if (champsColonnes.length === 0) {
    return valeurs.map((v, k) => ({
      cle: [],
      libelle: libelleValeur(v),
      libelles: [libelleValeur(v)],
      niveau: 0,
      sousTotal: false,
      total: false,
      valeurIndex: k,
    }))
  }

  const vide = () => new Array<string>(nbNiveaux).fill("")
  const out: PositionAxe[] = []

  const visiter = (noeuds: NoeudAxe[]) => {
    for (const n of noeuds) {
      if (n.enfants.length === 0) {
        valeurs.forEach((v, k) => {
          const libelles = vide()
          n.cle.forEach((val, i) => {
            libelles[i] = val
          })
          if (niveauValeurs) libelles[nbNiveaux - 1] = libelleValeur(v)
          out.push({
            cle: n.cle,
            libelle: niveauValeurs ? libelleValeur(v) : n.valeur,
            libelles,
            niveau: n.niveau,
            sousTotal: false,
            total: false,
            valeurIndex: k,
          })
        })
      } else {
        visiter(n.enfants)
        // Sous-total d'un champ de colonnes externe, comme « Total Nord » dans
        // Excel : il se lit sur la dernière ligne d'en-tête.
        valeurs.forEach((v, k) => {
          const libelles = vide()
          libelles[nbNiveaux - 1] = `Total ${n.valeur}`
          out.push({
            cle: n.cle,
            libelle: `Total ${n.valeur}`,
            libelles,
            niveau: n.niveau,
            sousTotal: true,
            total: false,
            valeurIndex: k,
          })
        })
      }
    }
  }
  visiter(arbre)

  valeurs.forEach((v, k) => {
    const libelles = vide()
    libelles[nbNiveaux - 1] = LIB_TOTAL
    out.push({
      cle: [],
      libelle: LIB_TOTAL,
      libelles,
      niveau: 0,
      sousTotal: false,
      total: true,
      valeurIndex: k,
    })
  })
  return out
}

/** Libellé affiché par un filtre de rapport, comme dans la cellule d'Excel. */
function libelleFiltre(champ: string, source: SourceTcd, retenues: string[] | undefined): string {
  if (!retenues || retenues.length === 0) return "(Tous)"
  const toutes = new Set(source.lignes.map((l) => libelleDe(l[champ])))
  if (retenues.length >= toutes.size) return "(Tous)"
  return retenues.length === 1 ? retenues[0] : "(Plusieurs éléments)"
}

/** Lignes retenues par les filtres de rapport. */
function appliquerFiltres(
  lignes: LigneSource[],
  filtres: PivotField[],
  filterValues: Record<string, string[]> | undefined,
): LigneSource[] {
  if (filtres.length === 0 || !filterValues) return lignes
  return lignes.filter((l) =>
    filtres.every((f) => {
      const retenues = filterValues[f.name]
      if (!retenues || retenues.length === 0) return true
      const v = libelleDe(l[f.name])
      return retenues.some((r) => r.trim().toLocaleUpperCase("fr-FR") === v.trim().toLocaleUpperCase("fr-FR"))
    }),
  )
}

/** Les lignes dont le début de clé correspond à la position. */
function lignesDe(lignes: LigneSource[], champs: string[], cle: string[]): LigneSource[] {
  if (cle.length === 0) return lignes
  return lignes.filter((l) => cle.every((v, d) => libelleDe(l[champs[d]]) === v))
}

/**
 * Cœur du moteur : regroupement multi-niveaux et agrégats.
 *
 * `lignesSource` est explicite pour que l'appelant puisse recalculer sur d'autres
 * lignes (test, correction serveur). Omise, on prend l'instantané de l'état — donc
 * les chiffres d'avant la modification quand le tableau est périmé, ce qui est
 * précisément le comportement d'Excel.
 */
export function calculerTcd(
  etat: PivotState & { instantane?: SourceTcd },
  lignesSource?: SourceTcd,
): TableauCroise {
  const source: SourceTcd =
    lignesSource ?? etat.instantane ?? { range: etat.source, champs: [], lignes: [] }

  const champsLignes = etat.rows.map((f) => f.name)
  const champsColonnes = etat.cols.map((f) => f.name)
  const valeurs = resoudreAggs(copieChamps(etat.values), source)

  const retenues = appliquerFiltres(source.lignes, etat.filters, etat.filterValues)

  const lignes = positionsLignes(construireArbre(retenues, champsLignes), champsLignes.length)
  const colonnes = positionsColonnes(
    construireArbre(retenues, champsColonnes),
    champsColonnes,
    valeurs.length > 0 ? valeurs : [],
  )

  const cellules: Array<Array<number | null>> = []
  for (const pl of lignes) {
    const sousEnsemble = lignesDe(retenues, champsLignes, pl.cle)
    const ligne: Array<number | null> = []
    for (const pc of colonnes) {
      const champ = valeurs[pc.valeurIndex]
      if (!champ) {
        ligne.push(null)
        continue
      }
      const croisement = lignesDe(sousEnsemble, champsColonnes, pc.cle)
      ligne.push(agreger(croisement.map((l) => l[champ.name]), champ.agg ?? "somme"))
    }
    cellules.push(ligne)
  }

  return {
    champsLignes,
    champsColonnes,
    valeurs,
    lignes,
    colonnes,
    cellules,
    indexTotalLignes: lignes.findIndex((p) => p.total),
    indexTotalColonnes: colonnes.findIndex((p) => p.total),
    totalGeneral: valeurs.map((v) => agreger(retenues.map((l) => l[v.name]), v.agg ?? "somme")),
    nbLignesRetenues: retenues.length,
    filtres: etat.filters.map((f) => ({
      champ: f.name,
      libelle: libelleFiltre(f.name, source, etat.filterValues?.[f.name]),
    })),
  }
}

/* ═══════════ STYLES ═══════════ */

export type StyleTcd = {
  id: number
  nom: string
  /** Ligne d'en-tête. */
  entete: { fond: string; texte: string }
  /** Fond d'une ligne sur deux, "" si le style n'en pose pas. */
  bande: string
  /** Lignes et colonnes de totaux. */
  total: { fond: string; texte: string }
  /** Filet de séparation. */
  bordure: string
}

/**
 * Galerie de styles, numérotée comme celle d'Excel. Volontairement sobre : un
 * tableau croisé se lit, il ne décore pas. Quatre entrées suffisent à ce que la
 * leçon « mettre en forme » ait de vrais choix à faire.
 */
export const STYLES_TCD: StyleTcd[] = [
  {
    id: 1,
    nom: "Clair 1",
    entete: { fond: "#f1f5f9", texte: "#0f172a" },
    bande: "",
    total: { fond: "#f8fafc", texte: "#0f172a" },
    bordure: "#cbd5e1",
  },
  {
    id: 2,
    nom: "Clair 2 — lignes alternées",
    entete: { fond: "#e2e8f0", texte: "#0f172a" },
    bande: "#f8fafc",
    total: { fond: "#e2e8f0", texte: "#0f172a" },
    bordure: "#cbd5e1",
  },
  {
    id: 3,
    nom: "Moyen 3 — en-tête ardoise",
    entete: { fond: "#334155", texte: "#ffffff" },
    bande: "#f1f5f9",
    total: { fond: "#e2e8f0", texte: "#0f172a" },
    bordure: "#94a3b8",
  },
  {
    id: 4,
    nom: "Moyen 4 — en-tête indigo",
    entete: { fond: "#3730a3", texte: "#ffffff" },
    bande: "#eef2ff",
    total: { fond: "#e0e7ff", texte: "#1e1b4b" },
    bordure: "#a5b4fc",
  },
]

/** Style d'un identifiant, style 1 par défaut : un tableau sans style est illisible. */
export function styleTcd(id?: number): StyleTcd {
  return STYLES_TCD.find((s) => s.id === id) ?? STYLES_TCD[0]
}

/* ═══════════ PROJECTION EN CELLULES ═══════════ */

/**
 * Projette le tableau calculé en cellules concrètes à partir de `target`.
 *
 * C'est cette projection qui rend le tableau vérifiable : la validation lit B5 dans
 * la feuille et y trouve un nombre, exactement comme un apprenant qui recompterait à
 * la main. La géométrie suit Excel :
 *
 *   - les filtres de rapport occupent les premières lignes, suivis d'une ligne vide ;
 *   - une ligne de coin porte le libellé du champ de valeurs et « Étiquettes de
 *     colonnes » quand un champ est en colonnes ;
 *   - la dernière ligne d'en-tête porte « Étiquettes de lignes » et les libellés de
 *     colonnes ;
 *   - « Total général » ferme la dernière colonne et la dernière ligne.
 *
 * `effacer` reçoit la plage occupée par la pose précédente : les cellules qu'elle
 * couvrait et que la nouvelle n'occupe plus sont vidées. Sans cela, un tableau qui
 * rétrécit (champ retiré, filtre posé) laisserait des chiffres fantômes derrière lui.
 */
export function posterTcd(
  etat: PivotState,
  tableau: TableauCroise,
  options?: { effacer?: RangeRef },
): PosePivot {
  const coin = parseRange(etat.target)
  const cells: Record<CellRef, CellState> = {}
  const refsValeurs: CellRef[][] = []
  const refsLignes: CellRef[] = []
  if (!coin) {
    return { cells, range: etat.target, refsValeurs, refsLignes, ligneEntetes: 0 }
  }

  const style = styleTcd(etat.styleId)
  const r0 = coin.startRow
  const c0 = coin.startCol
  const ref = (row: number, col: number) => formatCell({ row, col })

  const grasFond = (fond: string, texte: string): CellState["format"] => ({
    bold: true,
    background: fond,
    color: texte,
  })

  // ── Filtres de rapport, puis une ligne de respiration ─────────────────────
  let ligne = r0
  for (const f of tableau.filtres) {
    cells[ref(ligne, c0)] = { v: f.champ, format: { bold: true } }
    cells[ref(ligne, c0 + 1)] = { v: f.libelle }
    ligne++
  }
  if (tableau.filtres.length > 0) ligne++

  // ── Lignes d'en-tête ──────────────────────────────────────────────────────
  const nbNiveauxCol = tableau.champsColonnes.length + (tableau.valeurs.length > 1 ? 1 : 0)
  const premiereEntete = ligne
  // Sans champ en colonnes, une seule ligne d'en-tête suffit ; sinon Excel ajoute
  // au-dessus la ligne de coin qui annonce « Étiquettes de colonnes ».
  const nbLignesEntete = tableau.champsColonnes.length === 0 ? 1 : 1 + nbNiveauxCol
  const derniereEntete = premiereEntete + nbLignesEntete - 1

  if (tableau.champsColonnes.length > 0) {
    if (tableau.valeurs.length === 1) {
      cells[ref(premiereEntete, c0)] = {
        v: libelleValeur(tableau.valeurs[0]),
        format: grasFond(style.entete.fond, style.entete.texte),
      }
    }
    cells[ref(premiereEntete, c0 + 1)] = {
      v: LIB_COLONNES,
      format: grasFond(style.entete.fond, style.entete.texte),
    }
  }

  // Libellés de colonnes, niveau par niveau. Un libellé n'est écrit qu'au début de
  // son groupe : Excel fusionne visuellement les cellules d'un même parent, et
  // répéter « Nord » au-dessus de chacun de ses trimestres brouillerait la lecture.
  for (let niveau = 0; niveau < nbNiveauxCol; niveau++) {
    const rowNiveau = derniereEntete - (nbNiveauxCol - 1 - niveau)
    let prefixePrecedent: string | null = null
    tableau.colonnes.forEach((pc, j) => {
      const libelle = pc.libelles[niveau] ?? ""
      const prefixe = pc.libelles.slice(0, niveau + 1).join("§")
      if (libelle && prefixe !== prefixePrecedent) {
        cells[ref(rowNiveau, c0 + 1 + j)] = {
          v: libelle,
          format: grasFond(
            pc.total || pc.sousTotal ? style.total.fond : style.entete.fond,
            pc.total || pc.sousTotal ? style.total.texte : style.entete.texte,
          ),
        }
      }
      prefixePrecedent = prefixe
    })
  }

  // Sans champ en colonnes, la ligne d'en-tête porte directement les libellés des
  // champs de valeurs — c'est le cas du tableau croisé le plus simple.
  if (tableau.champsColonnes.length === 0) {
    tableau.colonnes.forEach((pc, j) => {
      cells[ref(derniereEntete, c0 + 1 + j)] = {
        v: pc.libelle,
        format: grasFond(style.entete.fond, style.entete.texte),
      }
    })
  }

  cells[ref(derniereEntete, c0)] = {
    v: LIB_LIGNES,
    format: grasFond(style.entete.fond, style.entete.texte),
  }

  // ── Corps ─────────────────────────────────────────────────────────────────
  const premiereDonnee = derniereEntete + 1
  tableau.lignes.forEach((pl, i) => {
    const row = premiereDonnee + i
    const refLigne = ref(row, c0)
    refsLignes.push(refLigne)
    // Indentation des niveaux imbriqués : c'est ainsi qu'Excel montre la
    // hiérarchie dans une seule colonne.
    const marge = "  ".repeat(pl.total ? 0 : pl.niveau)
    const bande = !pl.total && style.bande && i % 2 === 1 ? style.bande : ""
    cells[refLigne] = {
      v: `${marge}${pl.libelle}`,
      format: pl.total
        ? grasFond(style.total.fond, style.total.texte)
        : { bold: pl.sousTotal, ...(bande ? { background: bande } : {}) },
    }
    const refsCetteLigne: CellRef[] = []
    tableau.colonnes.forEach((pc, j) => {
      const refCellule = ref(row, c0 + 1 + j)
      refsCetteLigne.push(refCellule)
      const valeur = tableau.cellules[i]?.[j] ?? null
      const totalise = pl.total || pc.total || pl.sousTotal || pc.sousTotal
      cells[refCellule] = {
        // Une cellule vide reste vide : elle efface aussi ce qu'une pose
        // précédente aurait laissé là.
        v: valeur === null ? "" : valeur,
        format: totalise
          ? grasFond(style.total.fond, style.total.texte)
          : bande
            ? { background: bande }
            : {},
      }
    })
    refsValeurs.push(refsCetteLigne)
  })

  const derniereLigne = premiereDonnee + Math.max(tableau.lignes.length, 1) - 1
  const derniereColonne = c0 + Math.max(tableau.colonnes.length, 1)
  const range = formatRange({
    startRow: r0,
    startCol: c0,
    endRow: derniereLigne,
    endCol: derniereColonne,
  })

  // Nettoyage de l'emprise précédente.
  if (options?.effacer) {
    const ancien = parseRange(options.effacer)
    if (ancien) {
      for (let row = ancien.startRow; row <= ancien.endRow; row++) {
        for (let col = ancien.startCol; col <= ancien.endCol; col++) {
          const r = ref(row, col)
          if (!(r in cells)) cells[r] = { v: "" }
        }
      }
    }
  }

  return { cells, range, refsValeurs, refsLignes, ligneEntetes: derniereEntete + 1 }
}

/**
 * Lecture des cellules attendues par une étape, au format de l'observation
 * `pivotChange`. Le simulateur passe `api.getValue` : la lecture vient donc de la
 * feuille réelle, pas du modèle — c'est la seule façon de prouver que le tableau
 * posé contient bien ce que l'on croit y avoir écrit.
 */
export function lecturesTcd(
  refs: CellRef[],
  lire: LireCellule,
): Record<CellRef, { value: unknown }> {
  const out: Record<CellRef, { value: unknown }> = {}
  for (const ref of refs) out[ref] = { value: lire(ref) }
  return out
}
