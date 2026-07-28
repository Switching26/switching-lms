/**
 * Enregistreur de macros : le modèle. Aucune dépendance à React, à Univer ni au
 * DOM — tout est testable en ligne de commande, et le même code servira à
 * corriger côté serveur une évaluation notée.
 *
 * POURQUOI UN ENREGISTREUR PLUTÔT QU'UN ÉDITEUR VBA
 * Univer n'a pas d'éditeur VBA et il n'en existe pas de gratuit. Mais le module
 * 27 n'enseigne pas à programmer : il enseigne à ENREGISTRER une macro, à lui
 * affecter un raccourci, puis à relire et retoucher le code produit. Or le
 * simulateur observe déjà chaque geste de l'apprenant — c'est ainsi que la
 * validation fonctionne. Transcrire ces gestes en VBA est donc à notre portée,
 * et surtout c'est honnête : le code affiché est réellement rejoué par
 * `executerMacro`. Si le code était décoratif, la leçon « Visualiser et
 * modifier une macro » mentirait à l'apprenant.
 *
 * LES TROIS CONVENTIONS QUI SE CROISENT ICI, ET POURQUOI
 *  1. L'apprenant tape des formules FRANÇAISES en notation A1 : `=SOMME(D3:D9)`.
 *  2. Le moteur de calcul veut de l'anglais : `=SUM(D3:D9)` (voir formula-fr).
 *  3. VBA écrit de l'anglais en notation R1C1 : `=SUM(R[-6]C:R[-1]C)`.
 * Le champ `formula` d'un `MacroStatement` porte la forme 3 — celle de VBA. Ce
 * n'est pas un caprice de fidélité : R1C1 exprime une référence par son ÉCART
 * avec la cellule courante, donc l'instruction devient indépendante de sa
 * position et peut être rejouée ailleurs. C'est exactement ce que la leçon sur
 * les références relatives fait comprendre. La traduction vers le français A1 se
 * fait au dernier moment, à l'exécution.
 *
 * INVARIANT SUR LES RÉFÉRENCES D'INSTRUCTION (`MacroStatement.ref`)
 *  - enregistrement en références ABSOLUES → A1 (« D10 », « A10:D10 ») ;
 *  - enregistrement en références RELATIVES → R1C1 entièrement relatif
 *    (« RC », « R[-7]C », « RC:R[6]C »), résolu à l'exécution contre la cellule
 *    active du moment.
 */

import type { MacroState, MacroStatement } from "./types"
import { engineToFr, frToEngine } from "./formula-fr"
import { columnIndexToLetter, columnLetterToIndex, formatCell, parseCell, parseRange, sameArea } from "./grid"

/* ═══════════ RÉFÉRENCES : A1 ⟷ R1C1 ═══════════ */

/** « $B$4 », « B4 » : les `$` disent quelle partie est absolue. */
const RE_A1 = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/
/** R1C1 sous toutes ses formes, y compris absolues : RC, R[-2]C, R2C2, RC5. */
const RE_R1C1 = /^R(?:\[(-?\d+)\]|(\d+))?C(?:\[(-?\d+)\]|(\d+))?$/i
/** R1C1 ENTIÈREMENT relatif : la seule forme qu'une `ref` d'instruction utilise. */
const RE_R1C1_RELATIF = /^R(?:\[(-?\d+)\])?C(?:\[(-?\d+)\])?$/i

type Pos = { row: number; col: number }

/**
 * La référence est-elle exprimée en R1C1 relatif, donc à résoudre contre la
 * cellule active à l'exécution ? C'est ce qui distingue une macro enregistrée en
 * références relatives d'une macro enregistrée en références absolues.
 */
export function estRefRelative(ref: string): boolean {
  const parts = ref.split(":")
  return parts.length <= 2 && parts.every((p) => RE_R1C1_RELATIF.test(p.trim()))
}

/** Coin haut-gauche d'une référence : la cellule active d'une sélection. */
export function coinHautGauche(ref: string): string {
  const r = parseRange(ref)
  return r ? formatCell({ row: r.startRow, col: r.startCol }) : ref
}

/** « B2 » vu depuis B4 → « R[-2]C » ; « $B$2 » → « R2C2 ». */
function a1VersR1C1Ref(token: string, ancre: Pos): string | null {
  const m = RE_A1.exec(token)
  if (!m) return null
  const colAbs = m[1] === "$"
  const rowAbs = m[3] === "$"
  const col = columnLetterToIndex(m[2])
  const row = parseInt(m[4], 10) - 1
  const partR = rowAbs ? `R${row + 1}` : ecartR1C1("R", row - ancre.row)
  const partC = colAbs ? `C${col + 1}` : ecartR1C1("C", col - ancre.col)
  return partR + partC
}

/** Un écart nul ne s'écrit pas : R1C1 dit « R » pour « la même ligne ». */
function ecartR1C1(lettre: "R" | "C", ecart: number): string {
  return ecart === 0 ? lettre : `${lettre}[${ecart}]`
}

/** « R[-2]C » vu depuis B4 → « B2 » ; « R2C2 » → « $B$2 ». */
function r1c1VersA1Ref(token: string, ancre: Pos): string | null {
  const m = RE_R1C1.exec(token)
  if (!m) return null
  const [, rRel, rAbs, cRel, cAbs] = m
  const row = rAbs !== undefined ? parseInt(rAbs, 10) - 1 : ancre.row + (rRel !== undefined ? parseInt(rRel, 10) : 0)
  const col = cAbs !== undefined ? parseInt(cAbs, 10) - 1 : ancre.col + (cRel !== undefined ? parseInt(cRel, 10) : 0)
  if (row < 0 || col < 0) return null
  return `${cAbs !== undefined ? "$" : ""}${columnIndexToLetter(col)}${rAbs !== undefined ? "$" : ""}${row + 1}`
}

/**
 * Réécrit les références d'une formule et RIEN d'autre. Les pièges sont les
 * mêmes que dans formula-fr : une chaîne entre guillemets, un nom de feuille
 * entre apostrophes et un nom de fonction ne doivent jamais être touchés, sinon
 * la formule devient fausse en silence — la pire panne possible dans un outil
 * pédagogique.
 */
function reecrireReferences(formule: string, reecrire: (token: string) => string | null): string {
  let out = ""
  let i = 0
  const n = formule.length

  while (i < n) {
    const c = formule[i]

    // Chaîne ou nom de feuille : recopiés tels quels, guillemet doublé compris.
    if (c === '"' || c === "'") {
      const clot = c
      out += c
      i++
      while (i < n) {
        if (formule[i] === clot) {
          if (formule[i + 1] === clot) {
            out += clot + clot
            i += 2
            continue
          }
          out += clot
          i++
          break
        }
        out += formule[i]
        i++
      }
      continue
    }

    if (/[A-Za-z_$]/.test(c)) {
      let token = ""
      let dansCrochets = false
      while (i < n) {
        const ch = formule[i]
        if (ch === "[") {
          dansCrochets = true
        } else if (ch === "]") {
          dansCrochets = false
        } else if (!(dansCrochets ? /[-0-9]/.test(ch) : /[A-Za-z0-9_.$]/.test(ch))) {
          break
        }
        token += ch
        i++
      }
      // Un identifiant suivi d'une parenthèse est un appel de fonction ; un
      // identifiant précédé d'un « ! » désigne une autre feuille. Ni l'un ni
      // l'autre n'est une référence à convertir.
      let j = i
      while (j < n && formule[j] === " ") j++
      const estAppel = formule[j] === "("
      const qualifie = out.endsWith("!")
      out += (estAppel || qualifie ? null : reecrire(token)) ?? token
      continue
    }

    out += c
    i++
  }

  return out
}

/** Formule française en A1, telle que l'apprenant la tape → formule VBA. */
export function formuleVersR1C1(formuleFr: string, ancre: string): string {
  const pos = parseCell(ancre) ?? { row: 0, col: 0 }
  return reecrireReferences(frToEngine(formuleFr), (t) => a1VersR1C1Ref(t, pos))
}

/** Formule VBA → formule française en A1, celle qu'on peut poser dans la grille. */
export function formuleVersA1(formuleVba: string, ancre: string): string {
  const pos = parseCell(ancre) ?? { row: 0, col: 0 }
  return engineToFr(reecrireReferences(formuleVba, (t) => r1c1VersA1Ref(t, pos)))
}

/** Écart d'une cible par rapport à la cellule active, en R1C1 relatif. */
function refRelativeDepuis(cible: string, active: string): string {
  const p = parseCell(active) ?? { row: 0, col: 0 }
  const r = parseRange(cible)
  if (!r) return cible
  const debut = ecartR1C1("R", r.startRow - p.row) + ecartR1C1("C", r.startCol - p.col)
  if (r.startRow === r.endRow && r.startCol === r.endCol) return debut
  return `${debut}:${ecartR1C1("R", r.endRow - p.row)}${ecartR1C1("C", r.endCol - p.col)}`
}

/**
 * Référence d'instruction → référence A1 utilisable par le tableur. `active` est
 * la cellule active au moment où l'instruction s'exécute : c'est elle qui donne
 * son sens à une référence relative.
 */
export function resoudreRef(ref: string, active: string): string | null {
  if (!estRefRelative(ref)) return parseRange(ref) ? ref.replace(/\$/g, "") : null
  const p = parseCell(active) ?? { row: 0, col: 0 }
  const parts = ref.split(":").map((t) => r1c1VersA1Ref(t.trim(), p))
  if (parts.some((x) => x === null)) return null
  return parts.map((x) => (x as string).replace(/\$/g, "")).join(":")
}

/* ═══════════ NOMS ET RACCOURCIS ═══════════ */

/**
 * Excel refuse un nom de macro qui ne serait pas un identifiant VBA valide, et
 * son message énumère les trois règles. On les reprend telles quelles : un nom
 * refusé sans explication laisserait l'apprenant chercher au hasard.
 */
export function validerNomMacro(nom: string): string | null {
  const n = (nom ?? "").trim()
  if (!n) return "Donnez un nom à la macro."
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ_][A-Za-z0-9À-ÖØ-öø-ÿ_]*$/.test(n)) {
    return (
      "Ce nom de macro n'est pas valide. Le premier caractère doit être une lettre, " +
      "les suivants des lettres, des chiffres ou des traits de soulignement. " +
      "Ni espace ni ponctuation."
    )
  }
  if (n.length > 80) return "Ce nom de macro est trop long."
  // Un nom qui ressemble à une référence de cellule est ambigu : Excel le refuse
  // aussi, parce que `A1` désignerait à la fois une cellule et une procédure.
  if (RE_A1.test(n)) return "Ce nom de macro n'est pas valide : il ressemble à une référence de cellule."
  return null
}

/**
 * Raccourcis que le tableur s'est déjà réservés. Excel, lui, laisse une macro
 * les écraser silencieusement pendant que le classeur est ouvert — un piège
 * classique : la macro vole le Ctrl+C de l'utilisateur. Une formation ne peut pas
 * enseigner ça, donc on refuse, ce qui amène naturellement au Ctrl+Maj+lettre.
 * Écart assumé avec le logiciel, au bénéfice de l'apprenant.
 */
const CTRL_RESERVE: Record<string, string> = {
  a: "Sélectionner tout",
  b: "Gras",
  c: "Copier",
  d: "Recopier vers le bas",
  e: "Remplissage instantané",
  f: "Rechercher",
  g: "Atteindre",
  h: "Remplacer",
  i: "Italique",
  k: "Insérer un lien",
  n: "Nouveau classeur",
  o: "Ouvrir",
  p: "Imprimer",
  r: "Recopier vers la droite",
  s: "Enregistrer",
  t: "Créer un tableau",
  u: "Souligner",
  v: "Coller",
  w: "Fermer",
  x: "Couper",
  y: "Répéter",
  z: "Annuler",
}

/** Les quelques Ctrl+Maj que le tableur utilise déjà. */
const CTRL_MAJ_RESERVE: Record<string, string> = {
  f: "Boîte Police",
  l: "Activer les filtres",
  p: "Taille de police",
  u: "Développer la barre de formule",
}

/**
 * Met un raccourci sous sa forme canonique, celle qu'affiche Excel : « Ctrl+e »
 * ou « Ctrl+Maj+E ». Une lettre MAJUSCULE vaut Maj, exactement comme dans la
 * boîte de dialogue où l'on tape le caractère voulu.
 * Renvoie null si l'entrée n'est pas un raccourci acceptable.
 */
export function normaliserRaccourci(entree: string): string | null {
  const brut = (entree ?? "").replace(/\s+/g, "")
  if (!brut) return null
  const morceaux = brut.split("+").filter((m) => m !== "")
  let maj = false
  let lettre: string | null = null
  for (const m of morceaux) {
    const bas = m.toLowerCase()
    if (bas === "ctrl" || bas === "control" || bas === "^") continue
    if (bas === "maj" || bas === "shift") {
      maj = true
      continue
    }
    if (lettre !== null) return null // deux caractères : on ne sait pas trancher
    if (!/^[A-Za-z]$/.test(m)) return null
    if (m === m.toUpperCase()) maj = true
    lettre = m
  }
  if (lettre === null) return null
  return maj ? `Ctrl+Maj+${lettre.toUpperCase()}` : `Ctrl+${lettre.toLowerCase()}`
}

/**
 * Le raccourci est-il libre ? Renvoie le message à montrer, ou null si tout va
 * bien. `nomCourant` permet de réattribuer à une macro le raccourci qu'elle a
 * déjà, sans se plaindre d'un conflit avec elle-même.
 */
export function raccourciEnConflit(
  raccourci: string,
  existantes?: MacroState[],
  nomCourant?: string,
): string | null {
  const norme = normaliserRaccourci(raccourci)
  if (!norme) return "Le raccourci doit être une lettre. Utilisez Maj pour obtenir un Ctrl+Maj+lettre."
  const avecMaj = norme.includes("Maj+")
  const lettre = norme.slice(-1).toLowerCase()
  const reserve = avecMaj ? CTRL_MAJ_RESERVE[lettre] : CTRL_RESERVE[lettre]
  if (reserve) {
    const propose = avecMaj ? "une autre lettre" : `Ctrl+Maj+${lettre.toUpperCase()}`
    return `${norme} est déjà utilisé par Excel (${reserve}). Choisissez ${propose}.`
  }
  for (const m of existantes ?? []) {
    if (nomCourant && m.name === nomCourant) continue
    if (m.shortcut && normaliserRaccourci(m.shortcut) === norme) {
      return `${norme} est déjà attribué à la macro « ${m.name} ».`
    }
  }
  return null
}

/* ═══════════ ENREGISTREMENT ═══════════ */

export type EmplacementMacro = "classeur" | "nouveau-classeur" | "classeur-macros-personnelles"

/** Emplacements de la boîte « Enregistrer une macro », dans l'ordre d'Excel. */
export const EMPLACEMENTS: Array<{ valeur: EmplacementMacro; libelle: string }> = [
  { valeur: "classeur-macros-personnelles", libelle: "Classeur de macros personnelles" },
  { valeur: "nouveau-classeur", libelle: "Nouveau classeur" },
  { valeur: "classeur", libelle: "Ce classeur" },
]

/** Ce que la boîte de dialogue collecte. */
export type OptionsMacro = {
  shortcut?: string
  relative?: boolean
  emplacement?: EmplacementMacro
  description?: string
}

export type OptionsEnregistrement = OptionsMacro & {
  /** Sélection au moment du démarrage : origine des écarts en mode relatif. */
  ancre?: string
  /** Macros déjà dans le classeur : un nom et un raccourci ne se prennent pas deux fois. */
  existantes?: MacroState[]
}

/**
 * Geste observé pendant l'enregistrement. Le vocabulaire est celui de la façade
 * de la grille, pas celui de VBA : c'est `transcrire` qui fait la traduction.
 * `ref` est toujours une référence A1 réelle — ce que le simulateur voit.
 */
export type GesteMacro =
  | { kind: "select"; ref: string }
  | { kind: "value"; ref: string; value: string | number }
  /** Formule telle que l'apprenant l'a tapée : française, notation A1. */
  | { kind: "formula"; ref: string; formula: string }
  | { kind: "font"; ref: string; bold?: boolean; italic?: boolean; size?: number; color?: string }
  | { kind: "interior"; ref: string; color: string }
  | { kind: "numberFormat"; ref: string; pattern: string }

export type EtatEnregistrement = {
  /** Macro en construction : c'est elle qu'on remet au classeur à l'arrêt. */
  macro: MacroState
  actif: boolean
  /** Sélection courante à cet instant de l'enregistrement, en A1 absolu. */
  selection: string
  /** Champs de la boîte de dialogue sans effet sur le code, mais que la leçon montre. */
  emplacement: EmplacementMacro
  description?: string
}

export type ResultatDemarrage = { ok: true; etat: EtatEnregistrement } | { ok: false; message: string }

/**
 * Démarre l'enregistreur. Les refus (nom invalide, nom pris, raccourci pris)
 * remontent en clair plutôt que par une exception : la boîte de dialogue les
 * affiche telle quelle, comme le fait Excel.
 */
export function demarrerEnregistrement(nom: string, options: OptionsEnregistrement = {}): ResultatDemarrage {
  const messageNom = validerNomMacro(nom)
  if (messageNom) return { ok: false, message: messageNom }
  const propre = nom.trim()

  const dejaPris = (options.existantes ?? []).some(
    (m) => m.name.trim().toLocaleLowerCase("fr-FR") === propre.toLocaleLowerCase("fr-FR"),
  )
  if (dejaPris) {
    return { ok: false, message: `Une macro nommée « ${propre} » existe déjà dans ce classeur. Choisissez un autre nom.` }
  }

  let shortcut: string | undefined
  const saisi = (options.shortcut ?? "").trim()
  if (saisi) {
    const conflit = raccourciEnConflit(saisi, options.existantes)
    if (conflit) return { ok: false, message: conflit }
    shortcut = normaliserRaccourci(saisi) ?? undefined
  }

  const ancre = options.ancre && parseRange(options.ancre) ? options.ancre : "A1"
  const macro: MacroState = { name: propre, statements: [] }
  if (shortcut) macro.shortcut = shortcut
  if (options.relative) macro.relative = true

  return {
    ok: true,
    etat: {
      macro,
      actif: true,
      selection: ancre,
      emplacement: options.emplacement ?? "classeur",
      ...(options.description?.trim() ? { description: options.description.trim() } : {}),
    },
  }
}

/**
 * Transcrit un geste en instruction. Fonction pure : elle rend un nouvel état,
 * ce qui la rend utilisable telle quelle depuis un `useState`.
 *
 * Deux comportements repris de l'enregistreur d'Excel, et qui comptent :
 *  - une sélection n'est écrite que si elle change vraiment (sinon le code se
 *    remplirait de `Range("D10").Select` identiques) ;
 *  - une action sur une cellule qui n'est pas la sélection courante provoque
 *    d'abord la sélection. Le code reste ainsi rejouable même si l'appelant ne
 *    nous a pas signalé le déplacement.
 */
export function transcrire(etat: EtatEnregistrement, geste: GesteMacro): EtatEnregistrement {
  if (!etat.actif) return etat
  const cible = (geste.ref ?? "").trim()
  if (!parseRange(cible)) return etat

  const relative = Boolean(etat.macro.relative)
  const statements = [...etat.macro.statements]
  let selection = etat.selection

  if (!sameArea(cible, selection)) {
    const ref = relative ? refRelativeDepuis(cible, coinHautGauche(selection)) : cible
    statements.push({ op: "select", ref })
    selection = cible
  }

  // Après la sélection, la référence de l'action est la sélection elle-même :
  // « RC » en relatif, la plage en absolu — c'est le `Selection` de VBA.
  const ref = relative ? refRelativeDepuis(cible, coinHautGauche(selection)) : cible

  switch (geste.kind) {
    case "select":
      break
    case "value":
      statements.push({ op: "value", ref, value: geste.value })
      break
    case "formula":
      statements.push({
        op: "formula",
        ref,
        formula: formuleVersR1C1(geste.formula, coinHautGauche(cible)),
      })
      break
    case "font": {
      const st: MacroStatement = { op: "font", ref }
      if (geste.bold !== undefined) st.bold = geste.bold
      if (geste.italic !== undefined) st.italic = geste.italic
      if (geste.size !== undefined) st.size = geste.size
      if (geste.color !== undefined) st.color = geste.color
      statements.push(st)
      break
    }
    case "interior":
      statements.push({ op: "interior", ref, color: geste.color })
      break
    case "numberFormat":
      statements.push({ op: "numberFormat", ref, pattern: geste.pattern })
      break
  }

  return { ...etat, macro: { ...etat.macro, statements }, selection }
}

/** Arrête l'enregistreur et rend la macro à ranger dans le classeur. */
export function arreterEnregistrement(etat: EtatEnregistrement): MacroState {
  return { ...etat.macro, statements: [...etat.macro.statements] }
}

/**
 * Gestes correspondant aux boutons du ruban utilisés par le module. Les motifs
 * doivent rester ceux que `SimulationPlayer` applique réellement : si le code
 * affichait un autre format que celui posé dans la cellule, l'apprenant qui
 * modifie le code obtiendrait un résultat différent de ce qu'il lit.
 */
export function gesteDepuisControle(control: string, ref: string): GesteMacro | null {
  switch (control) {
    case "acc-gras":
      return { kind: "font", ref, bold: true }
    case "acc-italique":
      return { kind: "font", ref, italic: true }
    case "acc-taille-plus":
      return { kind: "font", ref, size: 14 }
    case "acc-taille-moins":
      return { kind: "font", ref, size: 9 }
    case "acc-couleur-police":
      return { kind: "font", ref, color: "#b91c1c" }
    case "acc-remplissage":
      return { kind: "interior", ref, color: "#fde68a" }
    case "acc-format-monetaire":
      return { kind: "numberFormat", ref, pattern: '#,##0.00" €"' }
    case "acc-pourcentage":
      return { kind: "numberFormat", ref, pattern: "0.00%" }
    case "acc-format-nombre":
      return { kind: "numberFormat", ref, pattern: "#,##0.00" }
    case "acc-format-date":
      return { kind: "numberFormat", ref, pattern: "dd/mm/yyyy" }
    default:
      return null
  }
}

/** Une saisie validée dans une cellule : formule si elle commence par « = ». */
export function gesteDepuisSaisie(ref: string, texte: string): GesteMacro {
  const t = (texte ?? "").trim()
  if (t.startsWith("=")) return { kind: "formula", ref, formula: t }
  // Un nombre saisi reste un nombre : le stocker en texte fausserait les calculs
  // qui s'appuient dessus.
  const nombre = Number(t.replace(",", "."))
  const estNombre = t !== "" && Number.isFinite(nombre) && /^-?[\d\s]*[.,]?\d+$/.test(t)
  return { kind: "value", ref, value: estNombre ? nombre : t }
}

/* ═══════════ GÉNÉRATION DU CODE VBA ═══════════ */

/**
 * Chaîne VBA : le guillemet s'échappe en le doublant, il n'y a pas d'antislash.
 * Un nombre y passe aussi : `FormulaR1C1` reçoit toujours du texte, et c'est
 * bien ce qu'écrit l'enregistreur — `ActiveCell.FormulaR1C1 = "480"`.
 */
function chaineVba(texte: string | number): string {
  return `"${String(texte).replace(/"/g, '""')}"`
}

/** « #fde68a » → « RGB(253, 230, 138) », la forme lisible qu'écrit l'enregistreur. */
function rgbVba(hex: string): string {
  const h = (hex ?? "").trim().replace(/^#/, "")
  const plein = h.length === 3 ? h.split("").map((d) => d + d).join("") : h
  const n = parseInt(plein.slice(0, 6) || "0", 16)
  if (!Number.isFinite(n)) return "RGB(0, 0, 0)"
  return `RGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

function hexDepuisRgb(r: number, v: number, b: number): string {
  const deux = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")
  return `#${deux(r)}${deux(v)}${deux(b)}`
}

/**
 * Ramène une référence relative à son écart NUL : c'est ce que devient la
 * sélection juste après un `Select`. Sans cette remise à zéro, l'instruction
 * suivante — qui vise « RC », la cellule active — semblerait porter sur une
 * autre zone, et on écrirait un `Select` de trop.
 */
function refZeroBase(ref: string): string {
  const parts = ref.split(":").map((p) => RE_R1C1_RELATIF.exec(p.trim()))
  const debut = parts[0]
  if (!debut) return ref
  const dr = debut[1] !== undefined ? parseInt(debut[1], 10) : 0
  const dc = debut[2] !== undefined ? parseInt(debut[2], 10) : 0
  const fin = parts[1]
  if (!fin) return "RC"
  const hauteur = (fin[1] !== undefined ? parseInt(fin[1], 10) : 0) - dr
  const largeur = (fin[2] !== undefined ? parseInt(fin[2], 10) : 0) - dc
  if (hauteur === 0 && largeur === 0) return "RC"
  return `RC:${ecartR1C1("R", hauteur)}${ecartR1C1("C", largeur)}`
}

/** Forme `Offset(dr, dc).Range("A1:A7")` d'une référence relative. */
function offsetVba(ref: string): string {
  const parts = ref.split(":").map((p) => RE_R1C1_RELATIF.exec(p.trim()))
  const debut = parts[0]
  if (!debut) return `Range(${chaineVba(ref)})`
  const dr = debut[1] !== undefined ? parseInt(debut[1], 10) : 0
  const dc = debut[2] !== undefined ? parseInt(debut[2], 10) : 0
  let forme = "A1"
  const fin = parts[1]
  if (fin) {
    const fr = fin[1] !== undefined ? parseInt(fin[1], 10) : 0
    const fc = fin[2] !== undefined ? parseInt(fin[2], 10) : 0
    forme = `A1:${columnIndexToLetter(fc - dc)}${fr - dr + 1}`
  }
  return `ActiveCell.Offset(${dr}, ${dc}).Range(${chaineVba(forme)})`
}

/**
 * Code VBA de la macro, dans le style que produit réellement l'enregistreur
 * d'Excel : en-tête de commentaires, un `Select` puis des actions sur
 * `ActiveCell` / `Selection`, indentation de quatre espaces.
 *
 * `analyserCode` relit exactement ce que cette fonction écrit : c'est cette
 * réciprocité qui autorise la leçon à laisser l'apprenant modifier le code.
 */
export function genererCode(macro: MacroState, options: { description?: string } = {}): string {
  const nom = macro.name?.trim() || "Macro1"
  const lignes: string[] = [`Sub ${nom}()`, "'", `' ${nom} Macro`]
  const description = options.description?.trim()
  if (description) lignes.push(`' ${description}`)
  lignes.push("'")
  if (macro.shortcut) {
    lignes.push(`' Touche de raccourci du clavier: ${normaliserRaccourci(macro.shortcut) ?? macro.shortcut}`)
    lignes.push("'")
  }

  // Sélection implicite : elle suit les `Select`, comme dans VBA. Une action sur
  // une autre cellule provoque donc un `Select` — le code reste juste même si le
  // modèle a été construit à la main.
  let selection: string | null = null
  const cible = (ref: string): string => (estRefRelative(ref) ? offsetVba(ref) : `Range(${chaineVba(ref)})`)
  const apresSelect = (ref: string): string => (estRefRelative(ref) ? refZeroBase(ref) : ref)

  for (const st of macro.statements) {
    // En relatif, la sélection est toujours notée depuis la cellule active : une
    // instruction qui la vise s'écrit donc « RC ». En absolu on compare les zones.
    const memeZone =
      selection !== null && (estRefRelative(st.ref) ? st.ref === selection : sameArea(st.ref, selection))

    if (st.op === "select") {
      lignes.push(`    ${cible(st.ref)}.Select`)
      selection = apresSelect(st.ref)
      continue
    }
    if (!memeZone) {
      lignes.push(`    ${cible(st.ref)}.Select`)
      selection = apresSelect(st.ref)
    }

    switch (st.op) {
      case "value":
        lignes.push(`    ActiveCell.FormulaR1C1 = ${chaineVba(st.value)}`)
        break
      case "formula":
        lignes.push(`    ActiveCell.FormulaR1C1 = ${chaineVba(st.formula)}`)
        break
      case "font":
        if (st.bold !== undefined) lignes.push(`    Selection.Font.Bold = ${st.bold ? "True" : "False"}`)
        if (st.italic !== undefined) lignes.push(`    Selection.Font.Italic = ${st.italic ? "True" : "False"}`)
        if (st.size !== undefined) lignes.push(`    Selection.Font.Size = ${st.size}`)
        if (st.color !== undefined) lignes.push(`    Selection.Font.Color = ${rgbVba(st.color)}`)
        break
      case "interior":
        lignes.push(`    Selection.Interior.Color = ${rgbVba(st.color)}`)
        break
      case "numberFormat":
        lignes.push(`    Selection.NumberFormat = ${chaineVba(st.pattern)}`)
        break
    }
  }

  lignes.push("End Sub")
  return lignes.join("\n")
}

/* ═══════════ RELECTURE DU CODE ═══════════ */

export type ResultatAnalyse =
  | { ok: true; macro: MacroState }
  /** `ligne` est en base 1, pour pointer directement dans l'éditeur. */
  | { ok: false; ligne: number; message: string }

/** Retire un commentaire de fin de ligne sans casser les guillemets d'une chaîne. */
function sansCommentaire(ligne: string): string {
  let dansChaine = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"') {
      if (dansChaine && ligne[i + 1] === '"') {
        i++
        continue
      }
      dansChaine = !dansChaine
      continue
    }
    if (c === "'" && !dansChaine) return ligne.slice(0, i)
  }
  return ligne
}

/** Lit une chaîne VBA complète, guillemets doublés compris. */
function lireChaine(texte: string): string | null {
  const t = texte.trim()
  if (t.length < 2 || !t.startsWith('"') || !t.endsWith('"')) return null
  const dedans = t.slice(1, -1)
  // Un guillemet seul au milieu signifierait deux chaînes accolées : on refuse.
  let i = 0
  let out = ""
  while (i < dedans.length) {
    if (dedans[i] === '"') {
      if (dedans[i + 1] !== '"') return null
      out += '"'
      i += 2
      continue
    }
    out += dedans[i]
    i++
  }
  return out
}

const RE_RGB = /^RGB\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i

/**
 * Propriétés relues, en minuscules. `NumberFormatLocal` est admise à côté de
 * `NumberFormat` : c'est la variante qu'un apprenant francophone trouvera dans
 * la documentation, et elle veut dire la même chose pour nous.
 */
const PROPRIETES_LUES = new Set([
  "formular1c1",
  "formula",
  "value",
  "font.bold",
  "font.italic",
  "font.size",
  "font.color",
  "interior.color",
  "numberformat",
  "numberformatlocal",
])

/** Formes de cible acceptées, dans l'ordre où on les essaie. */
function lireCible(ligne: string): { ref: string | null; reste: string } | null {
  let m = /^ActiveCell\.Offset\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\.Range\("([^"]+)"\)\.(.*)$/i.exec(ligne)
  if (m) {
    const dr = parseInt(m[1], 10)
    const dc = parseInt(m[2], 10)
    const forme = parseRange(m[3])
    if (!forme) return null
    const h = forme.endRow - forme.startRow
    const w = forme.endCol - forme.startCol
    const debut = ecartR1C1("R", dr) + ecartR1C1("C", dc)
    const ref = h === 0 && w === 0 ? debut : `${debut}:${ecartR1C1("R", dr + h)}${ecartR1C1("C", dc + w)}`
    return { ref, reste: m[4] }
  }
  m = /^ActiveCell\.Offset\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\.(.*)$/i.exec(ligne)
  if (m) {
    return { ref: ecartR1C1("R", parseInt(m[1], 10)) + ecartR1C1("C", parseInt(m[2], 10)), reste: m[3] }
  }
  m = /^Range\("([^"]+)"\)\.(.*)$/i.exec(ligne)
  if (m) {
    if (!parseRange(m[1])) return null
    return { ref: m[1], reste: m[2] }
  }
  m = /^(?:Selection|ActiveCell)\.(.*)$/i.exec(ligne)
  if (m) return { ref: null, reste: m[1] }
  return null
}

/**
 * Relit du code VBA — celui qu'on a produit, ou celui que l'apprenant vient de
 * retoucher — et en retire des instructions exécutables.
 *
 * Le périmètre est délibérément celui de l'enregistreur, pas celui de VBA :
 * mieux vaut une erreur franche et localisée qu'une exécution silencieusement
 * fausse. En revanche on accepte les écritures ÉQUIVALENTES qu'un apprenant a
 * de bonnes raisons d'employer — `Range("D10").Font.Bold` au lieu de
 * `Selection.Font.Bold`, `.Value` au lieu de `.FormulaR1C1` — parce que refuser
 * une réponse juste est la faute la plus grave d'un simulateur.
 *
 * Le raccourci est lu dans l'EN-TÊTE DE COMMENTAIRES, comme dans VBA où il ne
 * fait pas partie du code : si l'apprenant efface cette ligne, l'appelant doit
 * conserver le raccourci déjà enregistré au lieu de le perdre.
 */
export function analyserCode(code: string): ResultatAnalyse {
  const lignes = (code ?? "").split(/\r?\n/)
  const statements: MacroStatement[] = []
  let nom: string | null = null
  let shortcut: string | undefined
  let fini = false
  let selection: string | null = null

  const erreur = (ligne: number, message: string): ResultatAnalyse => ({ ok: false, ligne, message })

  for (let i = 0; i < lignes.length; i++) {
    const numero = i + 1
    const brute = lignes[i]
    const nu = sansCommentaire(brute).trim()

    if (!nu) {
      // Ligne vide ou commentaire seul : on y cherche seulement le raccourci.
      const commentaire = brute.trim()
      const m = /^'\s*(?:Touche de raccourci du clavier|Keyboard Shortcut)\s*:\s*(.+)$/i.exec(commentaire)
      if (m) shortcut = normaliserRaccourci(m[1]) ?? undefined
      continue
    }

    if (/\s_$/.test(nu)) {
      return erreur(numero, "Les lignes continuées par « _ » ne sont pas relues ici : écrivez l'instruction sur une seule ligne.")
    }
    if (/^With\b/i.test(nu) || /^End\s+With$/i.test(nu)) {
      return erreur(numero, "Les blocs « With … End With » ne sont pas relus ici : écrivez une instruction par ligne, par exemple Selection.Font.Bold = True.")
    }

    if (fini) return erreur(numero, "Il y a du code après « End Sub ».")

    if (/^Sub\b/i.test(nu)) {
      const debut = /^Sub\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)\s*\(\s*\)$/i.exec(nu)
      if (!debut) {
        // Le plus souvent : un nom avec une espace. Le dire précisément vaut
        // mieux que « instruction inconnue », qui n'apprend rien.
        const suppose = nu.replace(/^Sub\s*/i, "").replace(/\(.*$/, "")
        return erreur(numero, validerNomMacro(suppose) ?? "La première ligne doit s'écrire « Sub NomDeLaMacro() ».")
      }
      if (nom !== null) return erreur(numero, "Cet éditeur ne gère qu'une seule macro à la fois.")
      const message = validerNomMacro(debut[1])
      if (message) return erreur(numero, message)
      nom = debut[1]
      continue
    }
    if (/^End\s+Sub$/i.test(nu)) {
      if (nom === null) return erreur(numero, "« End Sub » arrive avant la ligne « Sub ».")
      fini = true
      continue
    }
    if (nom === null) return erreur(numero, "Le code d'une macro commence par une ligne « Sub NomDeLaMacro() ».")

    const cible = lireCible(nu)
    if (!cible) {
      return erreur(
        numero,
        `« ${nu} » n'est pas une instruction que cet éditeur sait relire. Les instructions attendues commencent par Range("…"), Selection ou ActiveCell.`,
      )
    }
    const reste = cible.reste.trim()

    if (/^Select$/i.test(reste)) {
      if (cible.ref === null) {
        return erreur(numero, 'Écrivez la cellule à sélectionner, par exemple Range("D10").Select.')
      }
      statements.push({ op: "select", ref: cible.ref })
      selection = estRefRelative(cible.ref) ? refZeroBase(cible.ref) : cible.ref
      continue
    }

    const affectation = /^([A-Za-z0-9_.]+)\s*=\s*(.+)$/.exec(reste)
    if (!affectation) {
      return erreur(numero, `« ${nu} » n'est pas une instruction que cet éditeur sait relire.`)
    }
    const propriete = affectation[1].toLowerCase()
    const valeurBrute = affectation[2].trim()

    // La propriété est vérifiée AVANT la sélection : sur `Selection.Borders`,
    // dire « propriété non gérée » renseigne, « aucune cellule sélectionnée »
    // envoie chercher au mauvais endroit.
    if (!PROPRIETES_LUES.has(propriete)) {
      return erreur(
        numero,
        `La propriété « ${affectation[1]} » n'est pas gérée. Cet éditeur relit FormulaR1C1, Font.Bold, Font.Italic, Font.Size, Font.Color, Interior.Color et NumberFormat.`,
      )
    }

    // Annotation nécessaire : `selection` est réaffectée plus bas à partir de
    // `ref`, et l'inférence tournerait en rond.
    const ref: string | null = cible.ref ?? selection
    if (!ref) {
      return erreur(numero, "Cette instruction porte sur la sélection, mais aucune cellule n'a encore été sélectionnée.")
    }

    // Écart assumé avec VBA, où `Range("D21").Font.Bold = True` ne déplace PAS la
    // sélection : ici elle suit. Un apprenant qui remplace la ligne `Select` par
    // une action directement adressée a raison sur le fond, et les instructions
    // implicites qui suivent doivent porter là où il pense.
    if (cible.ref !== null) selection = estRefRelative(ref) ? refZeroBase(ref) : ref

    switch (propriete) {
      case "formular1c1":
      case "formula":
      case "value": {
        const litteral = lireChaine(valeurBrute)
        const texte = litteral ?? valeurBrute
        if (texte.startsWith("=")) {
          const ancre = coinHautGauche(ref)
          if (propriete === "formular1c1") {
            statements.push({ op: "formula", ref, formula: texte })
          } else {
            // `.Formula` et `.Value` s'écrivent en notation A1 : on la ramène en
            // R1C1, ce qui exige de connaître la position absolue de la cellule.
            if (estRefRelative(ref)) {
              return erreur(
                numero,
                "Dans une macro en références relatives, écrivez la formule avec FormulaR1C1 (notation R1C1).",
              )
            }
            statements.push({ op: "formula", ref, formula: formuleVersR1C1(texte, ancre) })
          }
        } else if (litteral !== null) {
          statements.push({ op: "value", ref, value: litteral })
        } else {
          const n = Number(valeurBrute)
          if (!Number.isFinite(n)) {
            return erreur(numero, `« ${valeurBrute} » n'est ni un nombre ni un texte entre guillemets.`)
          }
          statements.push({ op: "value", ref, value: n })
        }
        break
      }
      case "font.bold":
      case "font.italic": {
        const vrai = /^true$/i.test(valeurBrute)
        if (!vrai && !/^false$/i.test(valeurBrute)) {
          return erreur(numero, `« ${valeurBrute} » doit être True ou False.`)
        }
        statements.push(
          propriete === "font.bold" ? { op: "font", ref, bold: vrai } : { op: "font", ref, italic: vrai },
        )
        break
      }
      case "font.size": {
        const n = Number(valeurBrute)
        if (!Number.isFinite(n) || n <= 0) return erreur(numero, "La taille de police doit être un nombre.")
        statements.push({ op: "font", ref, size: n })
        break
      }
      case "font.color":
      case "interior.color": {
        const m = RE_RGB.exec(valeurBrute)
        if (!m) {
          return erreur(numero, `« ${valeurBrute} » doit être une couleur de la forme RGB(255, 235, 156).`)
        }
        const hex = hexDepuisRgb(Number(m[1]), Number(m[2]), Number(m[3]))
        statements.push(
          propriete === "font.color" ? { op: "font", ref, color: hex } : { op: "interior", ref, color: hex },
        )
        break
      }
      case "numberformat":
      case "numberformatlocal": {
        const motif = lireChaine(valeurBrute)
        if (motif === null) return erreur(numero, "Le format de nombre doit être écrit entre guillemets.")
        statements.push({ op: "numberFormat", ref, pattern: motif })
        break
      }
      default:
        // Inatteignable : `PROPRIETES_LUES` et ce `switch` listent les mêmes
        // propriétés. Le garde-fou évite qu'un ajout dans l'un et pas dans
        // l'autre ne laisse passer une instruction sans effet.
        return erreur(numero, `La propriété « ${affectation[1]} » n'est pas gérée.`)
    }
  }

  if (nom === null) return erreur(1, "Le code d'une macro commence par une ligne « Sub NomDeLaMacro() ».")
  if (!fini) return erreur(lignes.length, "Il manque la ligne « End Sub » à la fin de la macro.")

  const macro: MacroState = { name: nom, statements }
  if (shortcut) macro.shortcut = shortcut
  // Le mode d'enregistrement se lit dans les instructions elles-mêmes : une
  // référence relative ne peut venir que d'un enregistrement relatif.
  if (statements.some((st) => estRefRelative(st.ref))) macro.relative = true
  return { ok: true, macro }
}

/* ═══════════ EXÉCUTION ═══════════ */

/**
 * Ce qu'il faut savoir faire pour rejouer une macro. Injecté plutôt qu'importé :
 * le modèle reste testable sans navigateur, et la façade de la grille n'a pas à
 * connaître les macros.
 */
export type PiloteMacro = {
  select: (ref: string) => void
  setValue: (ref: string, value: string | number) => void
  /** Formule française en notation A1, comme si on la tapait dans la cellule. */
  setFormula: (ref: string, formuleFr: string) => void
  setFont: (ref: string, style: { bold?: boolean; italic?: boolean; size?: number; color?: string }) => void
  setInterior: (ref: string, color: string) => void
  setNumberFormat: (ref: string, pattern: string) => void
}

export type ResultatExecution =
  | { ok: true; instructions: number; selection: string }
  | { ok: false; message: string }

/**
 * Rejoue la macro. `ancre` est la sélection au moment du lancement : c'est elle
 * qui donne leur sens aux références relatives, et donc tout l'intérêt d'une
 * macro relative — la même macro clôt le tableau de juillet ou celui d'août
 * selon l'endroit où on la déclenche.
 */
export function executerMacro(
  macro: MacroState,
  pilote: PiloteMacro,
  options: { ancre?: string } = {},
): ResultatExecution {
  let selection = options.ancre && parseRange(options.ancre) ? options.ancre : "A1"
  let compte = 0

  for (const st of macro.statements) {
    const ref = resoudreRef(st.ref, coinHautGauche(selection))
    if (!ref) {
      return { ok: false, message: `La référence « ${st.ref} » ne désigne aucune cellule valide.` }
    }
    // `ActiveCell` d'un côté, `Selection` de l'autre : une valeur et une formule
    // ne vont que dans la cellule active, une mise en forme couvre la sélection.
    const active = coinHautGauche(ref)

    switch (st.op) {
      case "select":
        pilote.select(ref)
        selection = ref
        break
      case "value":
        pilote.setValue(active, st.value)
        break
      case "formula":
        pilote.setFormula(active, formuleVersA1(st.formula, active))
        break
      case "font": {
        const style: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {}
        if (st.bold !== undefined) style.bold = st.bold
        if (st.italic !== undefined) style.italic = st.italic
        if (st.size !== undefined) style.size = st.size
        if (st.color !== undefined) style.color = st.color
        pilote.setFont(ref, style)
        break
      }
      case "interior":
        pilote.setInterior(ref, st.color)
        break
      case "numberFormat":
        pilote.setNumberFormat(ref, st.pattern)
        break
    }
    compte++
  }

  return { ok: true, instructions: compte, selection }
}
