/**
 * Les frontières du simulateur multi-applications.
 *
 * Ce contrôle existe parce que quatre applications vont cohabiter dans
 * `lib/simulation/`, écrites par des agents différents, et que trois des règles
 * qui les tiennent ne se voient pas à la lecture d'un diff.
 *
 * ═══ DEUX RÈGLES D'IMPORT DISTINCTES — ne pas les confondre ═══
 *
 * Elles n'ont volontairement pas la même sévérité, et l'écart est motivé :
 *
 *   • `contrats.ts` (le socle) : AUCUN IMPORT DE VALEUR. Les `import type` sont
 *     autorisés — TypeScript les efface à la compilation, ils ne peuvent donc
 *     pas produire de cycle d'initialisation, qui est le danger réel. Ce fichier
 *     est écrit une fois, par un seul agent ; le seul risque à couvrir est le
 *     cycle à l'exécution.
 *
 *   • `<app>/actions.ts` et `<app>/observations.ts` (les feuilles) : AUCUN
 *     IMPORT, littéralement — pas même un `import type`. Ces fichiers sont
 *     écrits EN PARALLÈLE par trois agents ; une feuille sans import ne dépend
 *     d'aucun ordre de livraison et se lit seule.
 *
 * ⚠️ L'assouplissement accordé au socle N'EST PAS une autorisation générale.
 *    Un agent de phase 2 qui lirait « `import type` est toléré » et l'appliquerait
 *    à ses feuilles ferait exactement ce que la seconde règle interdit.
 *
 * ═══ LE CYCLE, ET POURQUOI IL EST GRAVE ═══
 *
 * Sens unique obligatoire :
 *
 *     registre.ts → excel-adaptateur.ts → validate/attendu/demonstration/expurge/frappe
 *
 * Un fichier de couture qui importerait `registre.ts` fermerait la boucle. Au
 * chargement, `adaptateurExcel` vaudrait `undefined` et l'atelier jugerait avec
 * rien : sur la route de correction serveur d'une évaluation, la note serait
 * fausse SANS ERREUR VISIBLE — le pire mode de défaillance possible dans un
 * organisme certifié Qualiopi.
 *
 * ═══ CE QUE CE CONTRÔLE NE VOIT PAS ═══
 *
 * Il lit le TEXTE des imports. Il ne détecte pas un cycle refermé par un import
 * dynamique (`await import(…)`), ni une dépendance passée par une chaîne de
 * caractères. Il signale ces formes plutôt que de les ignorer.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs"
import { join } from "path"

const RACINE = join(__dirname, "..", "..")
const LIB = join(RACINE, "lib", "simulation")

const APPS = ["word", "ppt", "outlook"] as const
const PREFIXE_DE_DOSSIER: Record<string, string> = { word: "W_", ppt: "P_", outlook: "O_" }
const KIND_DE_DOSSIER: Record<string, string> = { word: "w:", ppt: "p:", outlook: "o:" }

/** Fichiers de couture : ils portent la logique partagée, jamais le registre. */
const COUTURE = [
  "types.ts",
  "validate.ts",
  "attendu.ts",
  "demonstration.ts",
  "expurge.ts",
  "frappe.ts",
  "contrats.ts",
]

const erreurs: string[] = []
const avertissements: string[] = []
let controles = 0

function err(m: string) {
  erreurs.push(m)
}

function lire(p: string): string | null {
  return existsSync(p) ? readFileSync(p, "utf-8") : null
}

/**
 * Les imports d'un fichier, séparés en « type » et « valeur ».
 *
 * On retire d'abord commentaires de bloc et de ligne : les en-têtes de ce dépôt
 * citent volontiers du code en exemple (« import { adaptateurWord } from … »),
 * et les compter ferait échouer un fichier parfaitement conforme. C'est
 * exactement le genre de faux positif qui décrédibilise un contrôle.
 */
function imports(src: string): { type: string[]; valeur: string[]; dynamiques: string[] } {
  const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const type: string[] = []
  const valeur: string[] = []
  const dynamiques: string[] = []
  const re = /^\s*import\s+([\s\S]*?)from\s+["']([^"']+)["']/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(sansCommentaires))) {
    const clause = m[1]
    const cible = m[2]
    // `import type { … }` est entièrement effacé ; `import { type X }` ne l'est
    // que si TOUS les spécificateurs portent `type` — sinon il reste une valeur.
    const toutEnType =
      /^\s*type\s/.test(clause) ||
      (clause.includes("{") &&
        clause
          .replace(/[\s\S]*?\{/, "")
          .replace(/\}[\s\S]*/, "")
          .split(",")
          .filter((s) => s.trim())
          .every((s) => /^\s*type\s/.test(s)))
    ;(toutEnType ? type : valeur).push(cible)
  }
  // `import "…"` sans clause : effet de bord, donc une valeur.
  const re2 = /^\s*import\s+["']([^"']+)["']/gm
  while ((m = re2.exec(sansCommentaires))) valeur.push(m[1])
  const re3 = /\bimport\s*\(/g
  while ((m = re3.exec(sansCommentaires))) dynamiques.push(m[0])
  return { type, valeur, dynamiques }
}

/* ═══════════ RÈGLE 1 — les feuilles d'application ═══════════ */

for (const app of APPS) {
  for (const nom of ["actions.ts", "observations.ts"]) {
    const chemin = join(LIB, app, nom)
    const src = lire(chemin)
    if (src === null) {
      // Absent en phase 0 pour une application non démarrée : ce n'est pas une
      // faute, c'est un état du chantier. On le dit, on n'échoue pas.
      avertissements.push(`lib/simulation/${app}/${nom} : absent (application non démarrée)`)
      continue
    }
    controles++
    const { type, valeur, dynamiques } = imports(src)
    for (const c of [...type, ...valeur]) {
      err(
        `lib/simulation/${app}/${nom} importe « ${c} » — une FEUILLE n'importe rien, ` +
          `pas même un \`import type\`. Trois agents écrivent ces fichiers en parallèle : ` +
          `une feuille sans import ne dépend d'aucun ordre de livraison.`,
      )
    }
    if (dynamiques.length) {
      err(`lib/simulation/${app}/${nom} contient un import dynamique — même règle.`)
    }
  }
}

/* ═══════════ RÈGLE 2 — le socle `contrats.ts` ═══════════ */

{
  const src = lire(join(LIB, "contrats.ts"))
  if (src === null) err("lib/simulation/contrats.ts est absent : le contrat multi-app n'existe pas.")
  else {
    controles++
    const { valeur, dynamiques } = imports(src)
    for (const c of valeur) {
      err(
        `lib/simulation/contrats.ts importe la VALEUR « ${c} » — le socle n'a droit ` +
          `qu'aux \`import type\`, seuls effacés à la compilation. Un import de valeur ` +
          `ici peut refermer le cycle registre → adaptateur → contrats.`,
      )
    }
    if (dynamiques.length) {
      err("lib/simulation/contrats.ts contient un import dynamique : il échappe au contrôle.")
    }
  }
}

/* ═══════════ RÈGLE 3 — aucun fichier de couture n'importe le registre ═══════════ */

for (const nom of COUTURE) {
  const src = lire(join(LIB, nom))
  if (src === null) continue
  controles++
  const { type, valeur } = imports(src)
  if (valeur.some((c) => /(^|\/)registre$/.test(c))) {
    err(
      `lib/simulation/${nom} importe le REGISTRE. C'est le cycle à ne jamais fermer : ` +
        `registre → excel-adaptateur → ${nom}. Au chargement l'adaptateur vaudrait ` +
        `\`undefined\` et une évaluation serait jugée par personne, sans erreur visible. ` +
        `Injecter le comportement en paramètre (cf. \`jugerEtape\`, \`expurgerScenarioNote\`).`,
    )
  }
  if (valeur.some((c) => /-adaptateur$|\/adaptateur$/.test(c))) {
    err(`lib/simulation/${nom} importe un adaptateur : même cycle, même conduite.`)
  }
  void type
}

/* ═══════════ RÈGLE 4 — un adaptateur d'app n'importe pas la couture en valeur ═══════════ */

const COUTURE_INTERDITE = ["validate", "attendu", "demonstration", "expurge", "frappe"]
for (const app of APPS) {
  const chemin = join(LIB, app, "adaptateur.ts")
  const src = lire(chemin)
  if (src === null) {
    avertissements.push(`lib/simulation/${app}/adaptateur.ts : absent (application non démarrée)`)
    continue
  }
  controles++
  const { valeur } = imports(src)
  for (const c of valeur) {
    const base = c.split("/").pop() ?? ""
    if (COUTURE_INTERDITE.includes(base)) {
      err(
        `lib/simulation/${app}/adaptateur.ts importe la VALEUR « ${c} » — un adaptateur ` +
          `d'application ne prend de la couture que des types (\`import type\`). ` +
          `Excel est la seule exception, parce que son adaptateur EST la délégation ` +
          `au code existant.`,
      )
    }
  }
}

/* ═══════════ RÈGLE 5 — les préfixes ═══════════ */

{
  const src = lire(join(LIB, "types.ts"))
  if (src === null) err("lib/simulation/types.ts est absent.")
  else {
    controles++
    // Aucun type d'action EXCEL ne doit commencer par un préfixe réservé :
    // `estActionApp` teste `/^[WPO]_/`, et un type Excel ainsi nommé serait
    // routé vers une application qui ne sait pas le juger.
    const debut = src.indexOf("export type SimulationAction =")
    const fin = src.indexOf("/* ═══════════ ÉTAPES", debut)
    if (debut < 0) err("lib/simulation/types.ts : union `SimulationAction` introuvable.")
    else {
      const bloc = src.slice(debut, fin > debut ? fin : undefined)
      const re = /type:\s*"([A-Z_][A-Z0-9_]*)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(bloc))) {
        if (/^[WPO]_/.test(m[1])) {
          err(
            `lib/simulation/types.ts : le type Excel « ${m[1]} » emprunte un préfixe ` +
              `réservé à une application. Il serait routé vers un adaptateur qui ne sait ` +
              `pas le juger.`,
          )
        }
      }
      for (const app of APPS) {
        const nomUnion = app === "ppt" ? "PptAction" : app === "word" ? "WordAction" : "OutlookAction"
        if (!bloc.includes(nomUnion)) {
          err(`lib/simulation/types.ts : l'union « ${nomUnion} » n'est pas raccordée à SimulationAction.`)
        }
      }
    }
  }
}

// Inversement : chaque variante déclarée par une application DOIT porter son
// préfixe, sinon le registre ne saura pas à qui l'adresser.
for (const app of APPS) {
  const src = lire(join(LIB, app, "actions.ts"))
  if (src === null) continue
  const attendu = PREFIXE_DE_DOSSIER[app]
  const re = /type:\s*"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src.replace(/\/\*[\s\S]*?\*\//g, "")))) {
    if (!m[1].startsWith(attendu)) {
      err(
        `lib/simulation/${app}/actions.ts : le type « ${m[1]} » ne porte pas le préfixe ` +
          `« ${attendu} ». Le registre route sur le préfixe : sans lui, l'action ` +
          `retomberait sur le juge d'Excel.`,
      )
    }
  }
  const srcObs = lire(join(LIB, app, "observations.ts"))
  if (srcObs) {
    const attenduKind = KIND_DE_DOSSIER[app]
    const reK = /kind:\s*"([^"]+)"/g
    while ((m = reK.exec(srcObs.replace(/\/\*[\s\S]*?\*\//g, "")))) {
      if (!m[1].startsWith(attenduKind)) {
        err(
          `lib/simulation/${app}/observations.ts : le kind « ${m[1]} » ne porte pas le ` +
            `préfixe « ${attenduKind} ».`,
        )
      }
    }
  }
}

/* ═══════════ RÈGLE 6 — le registre est statique ═══════════ */

{
  const src = lire(join(LIB, "registre.ts"))
  if (src === null) err("lib/simulation/registre.ts est absent : aucune application ne peut être routée.")
  else {
    controles++
    const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    if (/\bimport\s*\(/.test(sansCommentaires)) {
      err(
        "lib/simulation/registre.ts fait un import DYNAMIQUE. Le registre doit être " +
          "statique : un adaptateur chargé à l'exécution ne le serait pas côté serveur, " +
          "et la route de correction d'une évaluation ne trouverait pas son juge.",
      )
    }
    if (/enregistrerAdaptateur|register\s*\(/.test(sansCommentaires)) {
      err(
        "lib/simulation/registre.ts semble peuplé à l'exécution. Interdit, même raison : " +
          "ce qui s'enregistre au montage d'un composant client n'existe pas côté serveur.",
      )
    }
  }
}

/* ═══════════ RÈGLE 7 — un adaptateur d'app est branché, ou il n'existe pas ═══════════ */

{
  const src = lire(join(LIB, "registre.ts"))
  if (src) {
    for (const app of APPS) {
      const aAdaptateur = existsSync(join(LIB, app, "adaptateur.ts"))
      const estBranche = new RegExp(`["'.]/?${app}/adaptateur["']`).test(src)
      if (aAdaptateur && !estBranche) {
        err(
          `lib/simulation/${app}/adaptateur.ts existe mais n'est PAS branché dans ` +
            `registre.ts. Ses chapitres seraient servis sans juge : côté serveur, la ` +
            `note d'une évaluation serait fausse sans erreur visible.`,
        )
      }
    }
  }
}

/* ═══════════ RÈGLE 8 — un dossier d'app est complet, ou vide ═══════════ */

for (const app of APPS) {
  const dossier = join(LIB, app)
  if (!existsSync(dossier) || !statSync(dossier).isDirectory()) continue
  const presents = readdirSync(dossier)
  const aAdaptateur = presents.includes("adaptateur.ts")
  if (aAdaptateur) {
    for (const requis of ["actions.ts", "observations.ts", "document.ts"]) {
      if (!presents.includes(requis)) {
        err(`lib/simulation/${app}/ a un adaptateur mais pas de ${requis} (§1 du contrat).`)
      }
    }
  }
}

/* ═══════════ VERDICT ═══════════ */

for (const a of avertissements) console.log(`  — ${a}`)

if (erreurs.length) {
  console.error(`\n✗ ${erreurs.length} frontière(s) franchie(s) :\n`)
  for (const e of erreurs) console.error(`  ✗ ${e}\n`)
  process.exit(1)
}

console.log(`✓ ${controles} fichier(s) contrôlé(s) — frontières tenues.`)
