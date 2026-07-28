/**
 * Traduction des formules entre la convention FRANÇAISE (celle que l'apprenant
 * tape et lit) et la convention du moteur de calcul (anglo-saxonne).
 *
 * POURQUOI CE FICHIER EXISTE
 * Le moteur de formules retenu (Univer) n'accepte que la convention anglaise :
 * la virgule sépare les arguments et le point est le séparateur décimal. Excel
 * français fait l'inverse : point-virgule pour les arguments, virgule pour les
 * décimales. Sans traduction, `=NB.SI(A1:A5;">10")` — syntaxe française
 * PARFAITEMENT correcte — renvoie un résultat faux SANS message d'erreur.
 * Vérifié en navigateur le 28/07/2026 : 1 au lieu de 3.
 *
 * Une erreur de traduction produit donc un résultat faux silencieux, c'est-à-dire
 * la pire faute possible dans un outil pédagogique. D'où le soin apporté ici, et
 * la batterie de tests dans formula-fr.test.ts.
 *
 * CE QUI NE DOIT JAMAIS ÊTRE TRADUIT
 *  - le contenu des chaînes entre guillemets : `"a; b"` garde son point-virgule ;
 *  - les noms de feuille entre apostrophes : `'Mon budget'!A1` ;
 *  - les noms définis et références de cellules : seuls les identifiants SUIVIS
 *    d'une parenthèse ouvrante sont des fonctions. `=SOMME(TVA)` laisse `TVA`
 *    intact même si un jour une fonction s'appelait ainsi.
 *
 * La table est écrite depuis la nomenclature Microsoft Excel française. Elle n'est
 * PAS reprise d'HyperFormula (fichier sous GPL, incompatible avec le LMS) ni de
 * LibreOffice (nomenclature divergente sur plusieurs fonctions financières).
 */

/**
 * Français → anglais. Quand plusieurs orthographes françaises existent (accentuée
 * ou non), la PREMIÈRE listée est celle réaffichée à l'apprenant.
 */
const FR_TO_EN: Record<string, string> = {
  // ── Maths et statistiques de base
  SOMME: "SUM",
  MOYENNE: "AVERAGE",
  NB: "COUNT",
  NBVAL: "COUNTA",
  "NB.VIDE": "COUNTBLANK",
  MIN: "MIN",
  MAX: "MAX",
  MEDIANE: "MEDIAN",
  MODE: "MODE",
  "GRANDE.VALEUR": "LARGE",
  "PETITE.VALEUR": "SMALL",
  RANG: "RANK",
  ECARTYPE: "STDEV",
  VAR: "VAR",
  PRODUIT: "PRODUCT",
  SOMMEPROD: "SUMPRODUCT",
  "SOMME.CARRES": "SUMSQ",
  ABS: "ABS",
  ENT: "INT",
  MOD: "MOD",
  QUOTIENT: "QUOTIENT",
  RACINE: "SQRT",
  PUISSANCE: "POWER",
  EXP: "EXP",
  LN: "LN",
  LOG: "LOG",
  LOG10: "LOG10",
  PI: "PI",
  SIGNE: "SIGN",
  FACT: "FACT",
  PGCD: "GCD",
  PPCM: "LCM",
  ALEA: "RAND",
  "ALEA.ENTRE.BORNES": "RANDBETWEEN",

  // ── Arrondis
  ARRONDI: "ROUND",
  "ARRONDI.SUP": "ROUNDUP",
  "ARRONDI.INF": "ROUNDDOWN",
  "ARRONDI.AU.MULTIPLE": "MROUND",
  PLAFOND: "CEILING",
  PLANCHER: "FLOOR",
  TRONQUE: "TRUNC",

  // ── Conditionnelles
  SI: "IF",
  "SI.ERREUR": "IFERROR",
  "SI.NON.DISP": "IFNA",
  "SI.CONDITIONS": "IFS",
  ET: "AND",
  OU: "OR",
  NON: "NOT",
  "OU.EXCLUSIF": "XOR",
  "NB.SI": "COUNTIF",
  "NB.SI.ENS": "COUNTIFS",
  "SOMME.SI": "SUMIF",
  "SOMME.SI.ENS": "SUMIFS",
  "MOYENNE.SI": "AVERAGEIF",
  "MOYENNE.SI.ENS": "AVERAGEIFS",
  "MAX.SI.ENS": "MAXIFS",
  "MIN.SI.ENS": "MINIFS",
  "SOUS.TOTAL": "SUBTOTAL",
  AGREGAT: "AGGREGATE",

  // ── Recherche et référence
  RECHERCHEV: "VLOOKUP",
  RECHERCHEH: "HLOOKUP",
  RECHERCHEX: "XLOOKUP",
  RECHERCHE: "LOOKUP",
  INDEX: "INDEX",
  EQUIV: "MATCH",
  "EQUIVX": "XMATCH",
  DECALER: "OFFSET",
  INDIRECT: "INDIRECT",
  CHOISIR: "CHOOSE",
  LIGNE: "ROW",
  COLONNE: "COLUMN",
  LIGNES: "ROWS",
  COLONNES: "COLUMNS",
  TRANSPOSE: "TRANSPOSE",

  // ── Texte
  CONCATENER: "CONCATENATE",
  CONCAT: "CONCAT",
  "JOINDRE.TEXTE": "TEXTJOIN",
  GAUCHE: "LEFT",
  DROITE: "RIGHT",
  STXT: "MID",
  NBCAR: "LEN",
  MAJUSCULE: "UPPER",
  MINUSCULE: "LOWER",
  NOMPROPRE: "PROPER",
  SUPPRESPACE: "TRIM",
  CHERCHE: "SEARCH",
  TROUVE: "FIND",
  SUBSTITUE: "SUBSTITUTE",
  REMPLACER: "REPLACE",
  REPT: "REPT",
  TEXTE: "TEXT",
  CNUM: "VALUE",
  CAR: "CHAR",
  CODE: "CODE",
  EPURAGE: "CLEAN",
  EXACT: "EXACT",

  // ── Dates et heures
  AUJOURDHUI: "TODAY",
  MAINTENANT: "NOW",
  DATE: "DATE",
  DATEVAL: "DATEVALUE",
  JOUR: "DAY",
  MOIS: "MONTH",
  ANNEE: "YEAR",
  "ANNÉE": "YEAR",
  JOURS: "DAYS",
  JOURS360: "DAYS360",
  JOURSEM: "WEEKDAY",
  "NO.SEMAINE": "WEEKNUM",
  "FIN.MOIS": "EOMONTH",
  "MOIS.DECALER": "EDATE",
  "NB.JOURS.OUVRES": "NETWORKDAYS",
  "SERIE.JOUR.OUVRE": "WORKDAY",
  TEMPS: "TIME",
  TEMPSVAL: "TIMEVALUE",
  HEURE: "HOUR",
  MINUTE: "MINUTE",
  SECONDE: "SECOND",
  FRACTION_ANNEE: "YEARFRAC",

  // ── Financier
  VPM: "PMT",
  INTPER: "IPMT",
  PRINCPER: "PPMT",
  VA: "PV",
  VC: "FV",
  NPM: "NPER",
  TAUX: "RATE",
  TRI: "IRR",
  VAN: "NPV",
  AMORLIN: "SLN",
  "TAUX.INTERET": "INTRATE",

  // ── Information
  ESTVIDE: "ISBLANK",
  ESTERREUR: "ISERROR",
  ESTERR: "ISERR",
  ESTNA: "ISNA",
  ESTNUM: "ISNUMBER",
  ESTTEXTE: "ISTEXT",
  ESTNONTEXTE: "ISNONTEXT",
  ESTLOGIQUE: "ISLOGICAL",
  ESTREF: "ISREF",
  TYPE: "TYPE",
  NA: "NA",
  CELLULE: "CELL",
  INFORMATIONS: "INFO",
}

/** Constantes logiques : elles se traduisent aussi, et sans parenthèses. */
const FR_TO_EN_CONST: Record<string, string> = { VRAI: "TRUE", FAUX: "FALSE" }

/** Valeurs d'erreur affichées dans les cellules. */
const FR_TO_EN_ERROR: Record<string, string> = {
  "#NOM?": "#NAME?",
  "#VALEUR!": "#VALUE!",
  "#NOMBRE!": "#NUM!",
  "#NUL!": "#NULL!",
  "#DIV/0!": "#DIV/0!",
  "#REF!": "#REF!",
  "#N/A": "#N/A",
}

/** Inversion : la première orthographe FR rencontrée devient la canonique. */
function invert(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [fr, en] of Object.entries(map)) if (!(en in out)) out[en] = fr
  return out
}

const EN_TO_FR = invert(FR_TO_EN)
const EN_TO_FR_CONST = invert(FR_TO_EN_CONST)
const EN_TO_FR_ERROR = invert(FR_TO_EN_ERROR)

/* ═══════════ SCANNER ═══════════ */

const isDigit = (c: string) => c >= "0" && c <= "9"

/**
 * Caractères pouvant composer un nom de fonction ou un nom défini.
 * Le point en fait partie (`NB.SI.ENS`), l'underscore aussi, ainsi que les
 * lettres accentuées — d'où le test par plage plutôt que par classe ASCII.
 */
function isIdentChar(c: string): boolean {
  return /[A-Za-z0-9_.À-ÖØ-öø-ÿ]/.test(c)
}
function isIdentStart(c: string): boolean {
  return /[A-Za-z_À-ÖØ-öø-ÿ]/.test(c)
}

type Direction = "toEngine" | "toFr"

/**
 * Traduit une formule dans un sens ou dans l'autre, en un seul passage.
 *
 * Le passage unique évite le piège classique : convertir d'abord `;` → `,` puis
 * les décimales rendrait les deux indiscernables. Ici chaque caractère est décidé
 * une fois, avec son contexte.
 */
function translate(formula: string, dir: Direction): string {
  if (!formula) return formula

  const toEngine = dir === "toEngine"
  const fnMap = toEngine ? FR_TO_EN : EN_TO_FR
  const constMap = toEngine ? FR_TO_EN_CONST : EN_TO_FR_CONST
  // Séparateur d'arguments : `;` en français, `,` pour le moteur.
  const argSepIn = toEngine ? ";" : ","
  const argSepOut = toEngine ? "," : ";"
  // Séparateur décimal : `,` en français, `.` pour le moteur.
  const decIn = toEngine ? "," : "."
  const decOut = toEngine ? "." : ","

  let out = ""
  let i = 0
  const n = formula.length

  while (i < n) {
    const c = formula[i]

    // ── Chaîne entre guillemets : recopiée à l'identique.
    // Excel échappe un guillemet en le doublant ("" à l'intérieur d'une chaîne).
    if (c === '"') {
      out += c
      i++
      while (i < n) {
        if (formula[i] === '"') {
          if (formula[i + 1] === '"') {
            out += '""'
            i += 2
            continue
          }
          out += '"'
          i++
          break
        }
        out += formula[i]
        i++
      }
      continue
    }

    // ── Nom de feuille entre apostrophes : recopié à l'identique.
    if (c === "'") {
      out += c
      i++
      while (i < n) {
        if (formula[i] === "'") {
          if (formula[i + 1] === "'") {
            out += "''"
            i += 2
            continue
          }
          out += "'"
          i++
          break
        }
        out += formula[i]
        i++
      }
      continue
    }

    // ── Nombre. Traité avant les identifiants pour que le séparateur décimal
    // ne soit jamais confondu avec le point d'un nom de fonction.
    const startsNumber =
      isDigit(c) || (c === decIn && isDigit(formula[i + 1] ?? "") && !isIdentChar(formula[i - 1] ?? " "))
    if (startsNumber) {
      let num = ""
      while (i < n && isDigit(formula[i])) {
        num += formula[i]
        i++
      }
      if (formula[i] === decIn && isDigit(formula[i + 1] ?? "")) {
        num += decOut
        i++
        while (i < n && isDigit(formula[i])) {
          num += formula[i]
          i++
        }
      }
      // Notation scientifique : 1,5E+10 / 1.5E+10
      if ((formula[i] === "E" || formula[i] === "e") && /[0-9+-]/.test(formula[i + 1] ?? "")) {
        num += formula[i]
        i++
        if (formula[i] === "+" || formula[i] === "-") {
          num += formula[i]
          i++
        }
        while (i < n && isDigit(formula[i])) {
          num += formula[i]
          i++
        }
      }
      out += num
      continue
    }

    // ── Identifiant : fonction, constante logique, nom défini ou référence.
    if (isIdentStart(c)) {
      let ident = ""
      while (i < n && isIdentChar(formula[i])) {
        ident += formula[i]
        i++
      }
      // Une fonction est TOUJOURS suivie d'une parenthèse ouvrante — d'éventuels
      // espaces entre le nom et la parenthèse sont tolérés par Excel.
      let j = i
      while (j < n && formula[j] === " ") j++
      const isFunctionCall = formula[j] === "("

      const upper = ident.toUpperCase()
      if (isFunctionCall && upper in fnMap) {
        out += fnMap[upper]
      } else if (!isFunctionCall && upper in constMap) {
        out += constMap[upper]
      } else {
        // Nom défini, référence de cellule, nom de feuille non quoté : intact.
        out += ident
      }
      continue
    }

    // ── Séparateur d'arguments.
    if (c === argSepIn) {
      out += argSepOut
      i++
      continue
    }

    // Cas particulier : en entrée française, une virgule qui n'est pas décimale
    // (donc non captée par le scanner de nombre) vient d'une habitude anglo-saxonne.
    // On l'accepte comme séparateur d'arguments plutôt que de casser la formule.
    if (toEngine && c === ",") {
      out += ","
      i++
      continue
    }

    out += c
    i++
  }

  return out
}

/* ═══════════ API PUBLIQUE ═══════════ */

/**
 * Formule telle que l'apprenant l'a tapée (français) → formule à donner au
 * moteur de calcul.
 */
export function frToEngine(formula: string): string {
  return translate(formula, "toEngine")
}

/**
 * Formule telle que le moteur la stocke → formule à AFFICHER à l'apprenant.
 * L'apprenant ne doit jamais voir la convention anglaise.
 */
export function engineToFr(formula: string): string {
  return translate(formula, "toFr")
}

/** Valeur d'erreur du moteur → libellé français affiché dans la cellule. */
export function errorToFr(value: string): string {
  return EN_TO_FR_ERROR[value] ?? value
}

/** Libellé d'erreur français → valeur attendue du moteur. */
export function errorToEngine(value: string): string {
  return FR_TO_EN_ERROR[value] ?? value
}

/**
 * Noms de fonctions françaises à enregistrer dans le moteur. Utile pour les
 * alias natifs et pour l'autocomplétion affichée à l'apprenant.
 */
export function frenchFunctionNames(): string[] {
  return Object.keys(FR_TO_EN).sort((a, b) => a.localeCompare(b, "fr"))
}

/** La fonction française existe-t-elle dans notre périmètre ? */
export function isKnownFrenchFunction(name: string): boolean {
  return name.toUpperCase() in FR_TO_EN
}

/**
 * Équivalent anglais d'une fonction française, ou null si hors périmètre.
 * Permet de signaler à l'auteur d'un scénario qu'il utilise une fonction que le
 * moteur ne connaîtra pas, AVANT que l'apprenant ne tombe dessus.
 */
export function englishNameOf(frName: string): string | null {
  return FR_TO_EN[frName.toUpperCase()] ?? null
}
