/**
 * L'ÉTAT D'APLOMB D'UN CHAPITRE, ET CE QUI S'EN ÉCARTE.
 *
 * Le classeur d'un atelier se construit d'étape en étape : une formule saisie
 * au chapitre 3 est totalisée au chapitre 6. Rien n'empêchait jusqu'ici un
 * apprenant curieux de vider une cellule, d'y écrire n'importe quoi ou d'y
 * poser un format absurde — et tout ce qui suivait se déroulait sur ce classeur
 * faussé, sans un message. Mesuré sur le corpus : 198 étapes de 94 chapitres
 * lisent une cellule produite plus tôt.
 *
 * On appelle « état d'aplomb à l'étape N » :
 *
 *     classeur de départ
 *   + tous les `setup` jusqu'à N
 *   + les résultats ATTENDUS des étapes déjà franchies
 *
 * C'est exactement ce que reconstitue déjà `rejouerAvant` à la reprise d'un
 * chapitre. Ce fichier ne refait pas ce travail : il le rend COMPARABLE, pour
 * qu'on puisse ne remettre en place que ce qui a réellement divergé — et
 * surtout, ne pas toucher au travail légitime de l'apprenant.
 *
 * ⚠️ Deux règles de conception à ne jamais assouplir :
 *
 *  1. ON COMPARE DES VALEURS, JAMAIS DES TEXTES DE FORMULE. Beaucoup d'étapes
 *     acceptent plusieurs écritures : `=SOMME(B4:B7)` et `=B4+B5+B6+B7` sont
 *     justes toutes les deux. Remplacer la seconde par la première parce
 *     qu'elle vient en tête de `accept` reviendrait à effacer sous les yeux de
 *     l'apprenant la formule qu'il vient d'écrire.
 *
 *  2. DANS LE DOUTE, ON NE TOUCHE À RIEN. Une remise en place injustifiée est
 *     bien pire que le défaut qu'on corrige : elle efface du travail juste. Les
 *     critères ci-dessous sont donc volontairement étroits — ils n'attrapent
 *     que les cas où la divergence est certaine.
 *
 * Limite assumée, héritée de `rejouerAvant` : une étape à chemin libre qui ne
 * déclare aucune valeur attendue n'est pas reconstituable, la cellule reste
 * vide. La vraie mémorisation du classeur demanderait une migration en base.
 *
 * Limite de portée : comme `rejouerAvant`, on raisonne en références simples
 * sur la feuille active. Aucun `setup.cells` du corpus n'est qualifié d'un nom
 * de feuille (vérifié : 0 sur 246 scénarios).
 */

import { lireDateOuHeureFr } from "./date-fr"
import { lireNombreFr } from "./nombre-fr"
import { normalizeFormula, type CellState, type SimulationStep, type WorkbookState } from "./types"
import { EST_VALEUR_ERREUR, familleDeFormat } from "./validate"

/* ═══════════ Ce que le scénario déclare pour une cellule ═══════════ */

export type CelluleAplomb = {
  /**
   * Écritures acceptées pour cette cellule, la première faisant référence.
   * Présent dès que l'étape qui l'a produite exigeait une formule.
   */
  formules?: string[]
  /** Littéral déclaré, quand aucune formule n'est exigée. */
  valeur?: string | number
  /**
   * Famille de format de nombre voulue : "aucun" quand le scénario n'en pose
   * pas. On raisonne par FAMILLE et non par motif, comme `EXPECT_FORMAT` :
   * exiger le motif exact refuserait un format monétaire écrit autrement.
   */
  famille: string
  /**
   * Motif exact déclaré par le scénario, quand il en déclare un. Sert à
   * REMETTRE le bon format : on repose ce que le contenu voulait, pas un motif
   * générique de la même famille.
   */
  motif?: string
}

/**
 * Motif que la grille pose d'elle-même sur toute décimale sans format déclaré,
 * pour l'afficher à la française (`ExcelGrid.localiserDecimale`).
 *
 * ⚠️ IL NE FAUT SURTOUT PAS LE PRENDRE POUR UN FORMAT DE L'APPRENANT. Il classe
 * en famille « nombre », donc toute cellule décimale du classeur paraissait mal
 * formatée : la remise d'aplomb le retirait, et « 14,2 » redevenait « 14.2 » à
 * l'écran — le simulateur cassait lui-même la francisation qu'il venait de
 * poser. Il vaut « aucun format » de notre point de vue.
 */
export const MOTIF_DECIMAL_AUTO = "0.##########"

/** Motif représentatif d'une famille, quand le scénario n'en déclare aucun. */
export const MOTIF_PAR_FAMILLE: Record<string, string> = {
  aucun: "",
  nombre: "0.00",
  pourcentage: "0.00%",
  monetaire: '#,##0.00" €"',
  date: "dd/mm/yyyy",
}

export type EtatAplomb = Record<string, CelluleAplomb>

/** Ce qu'on lit réellement dans la feuille, pour comparer. */
export type LectureCellule = {
  formule: string
  valeur: unknown
  numberFormat: string
}

export type Divergence = {
  ref: string
  motif: "vide" | "erreur" | "contenu" | "format"
  /** Contenu à réécrire. Absent quand seul le format est en cause. */
  correction?: CellState
  /** Famille de format voulue ("aucun" = il faut le retirer). */
  famille?: string
  /** Motif exact à reposer. Vide quand il faut retirer le format. */
  motifFormat?: string
}

/* ═══════════ Construction de l'état d'aplomb ═══════════ */

function poser(etat: EtatAplomb, ref: string, patch: Partial<CelluleAplomb>): void {
  const clef = ref.toUpperCase()
  const actuel = etat[clef] ?? { famille: "aucun" }
  // Une nouvelle déclaration de contenu remplace l'ancienne : c'est le dernier
  // état voulu qui fait foi, pas l'accumulation.
  if (patch.formules !== undefined || patch.valeur !== undefined) {
    delete actuel.formules
    delete actuel.valeur
  }
  etat[clef] = { ...actuel, ...patch }
}

function contenuDepuisCellState(c: CellState): Partial<CelluleAplomb> {
  const p: Partial<CelluleAplomb> = {}
  if (c.f !== undefined) p.formules = [c.f]
  else if (c.v !== undefined) p.valeur = c.v
  if (c.format?.numberFormat !== undefined) {
    p.famille = familleDeFormat(c.format.numberFormat)
    p.motif = c.format.numberFormat
  }
  return p
}

/**
 * État d'aplomb à l'ENTRÉE de l'étape `jusqua` : le classeur de départ, tous
 * les `setup` des étapes 0..jusqua, et les résultats attendus des étapes
 * 0..jusqua-1.
 *
 * Le `setup` de l'étape courante EST inclus — il fait partie du décor qu'elle
 * pose — mais pas son résultat attendu : c'est justement le travail qu'on
 * demande à l'apprenant.
 */
export function etatAplomb(steps: SimulationStep[], workbook: WorkbookState, jusqua: number): EtatAplomb {
  const etat: EtatAplomb = {}

  // 1. Le classeur de départ. On ne retient que la feuille active, comme
  //    `rejouerAvant` : les autres ne sont ni écrites ni relues ici.
  const feuille = workbook.sheets?.[0]
  for (const [ref, c] of Object.entries(feuille?.cells ?? {})) {
    poser(etat, ref, contenuDepuisCellState(c))
  }

  for (let k = 0; k <= jusqua && k < steps.length; k++) {
    const s = steps[k]
    if (!s) continue

    // 2. Le décor posé par l'étape, y compris celui de l'étape courante.
    for (const [ref, c] of Object.entries(s.setup?.cells ?? {})) {
      poser(etat, ref, contenuDepuisCellState(c))
    }

    // 3. Le résultat des étapes DÉJÀ FRANCHIES seulement.
    if (k >= jusqua) continue
    const a = s.action

    if (a.type === "TYPE" && a.target !== "formula-bar" && a.accept?.length) {
      const formules = a.accept.filter((x) => x.trim().startsWith("="))
      if (formules.length) poser(etat, a.target, { formules })
      else poser(etat, a.target, { valeur: a.accept[0] })
    }

    if (a.type === "EXPECT_STATE" && a.cells) {
      for (const [ref, att] of Object.entries(a.cells)) {
        const formules = [att.f, ...(att.anyOf ?? [])].filter(
          (x): x is string => typeof x === "string" && x.trim().startsWith("="),
        )
        if (formules.length) poser(etat, ref, { formules })
        else if (att.v !== undefined) poser(etat, ref, { valeur: att.v as string | number })
        // Une attente vide : l'étape effaçait la cellule, elle doit le rester.
        else poser(etat, ref, { valeur: "" })
      }
    }

    // 4. Un format que l'étape faisait poser devient le format d'aplomb.
    if (a.type === "EXPECT_FORMAT" && a.cells) {
      for (const [ref, att] of Object.entries(a.cells)) {
        const f = (att as { numberFormat?: string }).numberFormat
        // `EXPECT_FORMAT` déclare une FAMILLE, pas un motif : on ne peut donc
        // reposer qu'un motif représentatif si l'apprenant l'a retiré.
        if (f !== undefined) poser(etat, ref, { famille: f, motif: undefined })
      }
    }
  }

  return etat
}

/* ═══════════ Ce qu'une étape va lire ═══════════ */

const RE_REF =
  /(?:'[^']+'!|[A-Za-zÀ-ÿ0-9_ ]+!)?\$?([A-Z]{1,3})\$?(\d{1,5})(?::\$?([A-Z]{1,3})\$?(\d{1,5}))?/g

function numColonne(s: string): number {
  let n = 0
  for (const c of s) n = n * 26 + (c.charCodeAt(0) - 64)
  return n
}
function nomColonne(n: number): string {
  let s = ""
  let r = n
  while (r > 0) {
    const m = (r - 1) % 26
    s = String.fromCharCode(65 + m) + s
    r = (r - m - 1) / 26
  }
  return s
}

/** Références citées par une formule, plages développées. */
export function refsDeFormule(f: string): string[] {
  if (typeof f !== "string" || !f.trim().startsWith("=")) return []
  // Le contenu des chaînes ne contient pas de référence : "a1" est du texte.
  const sans = f.replace(/"(?:[^"]|"")*"/g, '""')
  // Objet plutôt que `Set` : ce fichier est compilé avec le tsconfig de
  // l'application, dont la cible interdit l'itération d'un `Set` (TS2802).
  const out: Record<string, true> = {}
  let m: RegExpExecArray | null
  RE_REF.lastIndex = 0
  while ((m = RE_REF.exec(sans))) {
    // Un nom de fonction colle à sa parenthèse : `NB.SI(` ne doit pas passer
    // pour une référence de colonne.
    const avant = sans[m.index - 1]
    if (avant && /[A-Za-z0-9_.]/.test(avant)) continue
    if (m[3]) {
      const c1 = numColonne(m[1])
      const c2 = numColonne(m[3])
      const r1 = Number(m[2])
      const r2 = Number(m[4])
      // Une plage démesurée (colonne entière écrite en A1:A100000) n'apprend
      // rien de plus et coûterait des dizaines de milliers d'entrées.
      if ((Math.abs(c2 - c1) + 1) * (Math.abs(r2 - r1) + 1) > 2000) continue
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) out[nomColonne(c) + r] = true
      }
    } else out[m[1] + m[2]] = true
  }
  return Object.keys(out)
}

/**
 * Cellules dont l'étape a besoin pour être jouable et juste : celles que ses
 * formules attendues citent, et celles qu'elle juge directement.
 */
export function cellulesLues(step: SimulationStep): string[] {
  const a = step.action
  const out: Record<string, true> = {}
  const ajout = (f: string | undefined) => {
    if (f) for (const r of refsDeFormule(f)) out[r.toUpperCase()] = true
  }

  if (a.type === "TYPE" && Array.isArray(a.accept)) a.accept.forEach(ajout)
  if (a.type === "EXPECT_STATE" && a.cells) {
    for (const [ref, att] of Object.entries(a.cells)) {
      ajout(att.f)
      ;(att.anyOf ?? []).forEach(ajout)
      // Une cellule ne dépend pas d'elle-même : c'est le travail demandé.
      delete out[ref.toUpperCase()]
    }
  }
  if (a.type === "EXPECT_FORMAT" && a.cells) for (const r of Object.keys(a.cells)) out[r.toUpperCase()] = true
  if (a.type === "SORT_RANGE" && a.range) ajout("=" + a.range)
  if (a.type === "FILTER_COLUMN" && (a as { range?: string }).range) ajout("=" + (a as { range?: string }).range)

  return Object.keys(out)
}

/* ═══════════ Comparaison ═══════════ */

/**
 * Ce que le moteur stocke réellement pour un littéral déclaré. Une durée
 * `"7:30"` devient la fraction 0,3125 et une date `"07/04/2026"` un numéro de
 * série : comparer le texte déclaré à la valeur lue signalerait une divergence
 * sur une cellule parfaitement d'aplomb.
 */
function valeurStockee(litteral: string | number): unknown {
  if (typeof litteral === "number") return litteral
  const t = String(litteral).trim()
  if (t === "") return ""
  const fr = lireDateOuHeureFr(t)
  if (fr) return fr.valeur
  const n = lireNombreFr(t)
  if (n !== null) return n
  return t
}

function memeValeur(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined || b === ""
  if (b === null || b === undefined) return a === "" || a === undefined
  const na = typeof a === "number" ? a : Number(String(a).replace(",", "."))
  const nb = typeof b === "number" ? b : Number(String(b).replace(",", "."))
  if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 1e-9
  return String(a).trim() === String(b).trim()
}

/**
 * Format à reposer, UNIQUEMENT s'il diverge.
 *
 * ⚠️ Ne jamais reposer un format déjà juste. `setNumberFormat` appelé dans la
 * même salve que l'écriture d'une formule ANNULE la formule qui vient d'être
 * posée : le moteur n'a pas fini de recalculer, et la cellule réparée redevient
 * vide. Le mécanisme paraissait alors ne rien faire du tout, alors qu'il avait
 * bien trouvé la divergence et bien écrit la correction.
 */
function formatVoulu(att: CelluleAplomb, divergent: boolean): { famille?: string; motifFormat?: string } {
  if (!divergent) return {}
  return { famille: att.famille, motifFormat: att.motif ?? MOTIF_PAR_FAMILLE[att.famille] ?? "" }
}

const vide = (l: LectureCellule) =>
  (l.formule ?? "") === "" && (l.valeur === null || l.valeur === undefined || l.valeur === "")

/**
 * Ce qui s'est écarté de l'état d'aplomb, parmi `refs`.
 *
 * Les critères sont volontairement étroits — voir la règle 2 en tête de
 * fichier. On ne signale que :
 *   · une cellule vidée alors que le scénario y déclare quelque chose ;
 *   · une valeur d'erreur (`#VALEUR!`, `#REF!`…), qui ne s'apprend jamais ;
 *   · une formule exigée qui a disparu ou qui ne correspond à aucune des
 *     écritures acceptées ;
 *   · un littéral dont la valeur diffère ;
 *   · un format de nombre qui fait mentir ce qu'on lit.
 *
 * Tout le reste — gras posé au hasard, couleur, texte écrit dans une case hors
 * sujet — n'est PAS une divergence : c'est la trace de l'apprenant.
 */
export function divergences(etat: EtatAplomb, lecture: Record<string, LectureCellule>, refs: string[]): Divergence[] {
  const out: Divergence[] = []

  for (const brut of refs) {
    const ref = brut.toUpperCase()
    const att = etat[ref]
    const lu = lecture[ref]
    if (!att || !lu) continue

    const declareContenu = att.formules !== undefined || att.valeur !== undefined
    const reference: CellState | undefined = att.formules?.length
      ? { f: att.formules[0] }
      : att.valeur !== undefined
        ? { v: att.valeur }
        : undefined

    // Le format se juge séparément du contenu : une cellule peut être juste et
    // mal formatée, et c'est le cas le plus fréquent (le % sur un total).
    const motifLu = (lu.numberFormat ?? "").trim()
    const familleLue = motifLu === MOTIF_DECIMAL_AUTO ? "aucun" : familleDeFormat(motifLu)
    const formatDivergent = familleLue !== att.famille

    if (declareContenu) {
      const attenduVide = att.valeur !== undefined && String(att.valeur) === "" && !att.formules
      if (vide(lu) && !attenduVide) {
        if (reference) out.push({ ref, motif: "vide", correction: reference, ...formatVoulu(att, formatDivergent) })
        continue
      }
      if (EST_VALEUR_ERREUR(lu.valeur)) {
        if (reference) out.push({ ref, motif: "erreur", correction: reference, ...formatVoulu(att, formatDivergent) })
        continue
      }
      if (att.formules?.length) {
        const saisie = (lu.formule ?? "").trim()
        // Une formule exigée : sans formule dans la cellule, l'apprenant l'a
        // écrasée par une valeur brute — l'étape ne l'aurait pas acceptée.
        const accepte =
          saisie.startsWith("=") &&
          att.formules.some((f) => normalizeFormula(f) === normalizeFormula(saisie))
        if (!accepte && reference) {
          out.push({ ref, motif: "contenu", correction: reference, ...formatVoulu(att, formatDivergent) })
          continue
        }
      } else if (att.valeur !== undefined && !attenduVide) {
        // Un littéral produit par une formule de l'apprenant reste d'aplomb
        // tant que la valeur tombe juste : on ne compare que le résultat.
        if (!memeValeur(valeurStockee(att.valeur), lu.valeur) && reference) {
          out.push({ ref, motif: "contenu", correction: reference, ...formatVoulu(att, formatDivergent) })
          continue
        }
      }
    }

    if (formatDivergent) out.push({ ref, motif: "format", ...formatVoulu(att, true) })
  }

  return out
}

/** Toutes les références connues de l'état d'aplomb — portée « tout ». */
export function refsConnues(etat: EtatAplomb): string[] {
  return Object.keys(etat)
}

/**
 * Phrase du bandeau, quand quelque chose a été remis en place.
 * Volontairement factuelle : l'apprenant n'a rien fait de mal, et on ne le lui
 * reproche pas. Au-delà de trois cellules on cesse de les énumérer.
 */
export function phraseAplomb(ds: Divergence[]): string | null {
  if (!ds.length) return null
  const contenus = ds.filter((d) => d.motif !== "format").map((d) => d.ref)
  const formats = ds.filter((d) => d.motif === "format").map((d) => d.ref)
  const liste = (r: string[]) => (r.length <= 3 ? r.join(", ") : `${r.slice(0, 3).join(", ")} et ${r.length - 3} autres`)
  const bouts: string[] = []
  if (contenus.length) bouts.push(`${contenus.length > 1 ? "les cellules" : "la cellule"} ${liste(contenus)}`)
  if (formats.length) bouts.push(`le format de ${liste(formats)}`)
  return `J'ai remis ${bouts.join(" et ")} en ordre pour que la suite reste juste.`
}
