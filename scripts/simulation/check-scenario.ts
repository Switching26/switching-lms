/**
 * Contrôle un fichier de scénario AVANT qu'il n'atteigne un apprenant.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs","target":"ES2020","esModuleInterop":true,"skipLibCheck":true}' \
 *     scripts/simulation/check-scenario.ts scripts/simulation/scenarios/m06-l01.json
 *
 * La formation d'origine contenait exactement les défauts que ce script attrape :
 * une consigne vide comptée comme une étape, une réponse acceptée « 32 0000 » à
 * côté de « 32000 », un « Mecredi », un titre de classeur qui changeait en cours de
 * leçon. Ces fautes sont invisibles à la relecture et très visibles pour l'élève.
 */

import * as fs from "fs"
import * as path from "path"
import type { SimulationScenario, SimulationStep } from "../../lib/simulation/types"
import { SIMULATION_SCHEMA_VERSION } from "../../lib/simulation/types"
import { parseCell, parseRange } from "../../lib/simulation/grid"
import { frToEngine, isKnownFrenchFunction } from "../../lib/simulation/formula-fr"

const errors: string[] = []
const warnings: string[] = []

const err = (m: string) => errors.push(m)
const warn = (m: string) => warnings.push(m)

function checkRef(kind: string, ref: string, where: string) {
  const ok = ref.includes(":") ? parseRange(ref) : parseCell(ref)
  if (!ok) err(`${where} : ${kind} « ${ref} » n'est pas une référence valide.`)
}

/** Les noms de fonctions cités dans une formule sont-ils dans notre périmètre ? */
function checkFormulaFunctions(formula: string, where: string) {
  // On isole les identifiants suivis d'une parenthèse : ce sont les appels.
  const calls = formula.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_.]*)\s*\(/g) ?? []
  for (const raw of calls) {
    const name = raw.replace(/\s*\($/, "")
    if (/^[A-Z]+$/i.test(name) && name.length <= 3 && !isKnownFrenchFunction(name)) {
      // Deux ou trois lettres suivies d'une parenthèse : probablement une
      // référence mal écrite plutôt qu'une fonction. On ne crie pas.
      continue
    }
    if (!isKnownFrenchFunction(name)) {
      warn(
        `${where} : la fonction « ${name} » n'est pas dans la table de traduction — le moteur ne la reconnaîtra pas en français.`,
      )
    }
  }
}

function checkStep(s: SimulationStep, i: number, seen: Set<string>, mode: string) {
  const where = `étape ${i + 1} (${s.id || "sans id"})`

  if (!s.id || !s.id.trim()) err(`${where} : identifiant manquant.`)
  else if (seen.has(s.id)) err(`${where} : identifiant en double.`)
  else seen.add(s.id)

  if (!s.consigne || !s.consigne.trim()) {
    err(`${where} : consigne vide. Une étape sans consigne est une étape fantôme.`)
  } else {
    // Balisage mal fermé : l'élève verrait les astérisques à l'écran.
    const stars = (s.consigne.match(/\*\*/g) ?? []).length
    if (stars % 2 !== 0) err(`${where} : balisage **gras** non fermé.`)
    const marks = (s.consigne.match(/==/g) ?? []).length
    if (marks % 2 !== 0) err(`${where} : balisage ==action== non fermé.`)
    // Règle pédagogique, différente selon le mode — c'est la distinction mesurée
    // sur la formation de référence : en leçon le chemin est dicté (44 % des
    // consignes commencent par « cliquez »), en exercice on ne donne que
    // l'objectif (32 % des consignes ne localisent RIEN dans l'interface).
    if (mode === "LESSON" && s.action.type !== "READ" && marks === 0) {
      warn(`${where} : leçon sans action mise en évidence (==…==). En leçon, le geste doit être montré.`)
    }
    if (mode === "EVALUATION" && s.aide) {
      warn(`${where} : une évaluation ne doit pas proposer d'aide.`)
    }
  }

  const a = s.action
  switch (a.type) {
    case "READ":
      if ((s.points ?? 0) > 0) {
        warn(`${where} : écran de lecture noté. Mettre points à 0.`)
      }
      break

    case "TYPE": {
      if (a.target !== "formula-bar") checkRef("cible", a.target, where)
      if (!a.accept || a.accept.length === 0) {
        err(`${where} : aucune réponse acceptée. L'étape serait impossible à réussir.`)
        break
      }
      const norm = new Set<string>()
      for (const acc of a.accept) {
        if (!acc.trim()) {
          err(`${where} : une réponse acceptée est vide.`)
          continue
        }
        // Doublon d'espaces au milieu d'un nombre : la faute « 32 0000 ».
        if (/\d\s+\d/.test(acc)) {
          err(`${where} : réponse « ${acc} » contient une espace au milieu d'un nombre — faute de frappe probable.`)
        }
        const key = a.formulaMode ? frToEngine(acc).toUpperCase() : acc.trim().toUpperCase()
        if (norm.has(key)) warn(`${where} : réponse « ${acc} » fait doublon après normalisation.`)
        norm.add(key)
        if (a.formulaMode) {
          if (!acc.trim().startsWith("=")) {
            err(`${where} : « ${acc} » est déclarée comme formule mais ne commence pas par =.`)
          } else {
            checkFormulaFunctions(acc, where)
          }
        }
      }
      if (a.maxLength !== undefined) {
        for (const acc of a.accept) {
          if (acc.length > a.maxLength) {
            err(`${where} : la réponse « ${acc} » dépasse maxLength (${a.maxLength}).`)
          }
        }
      }
      break
    }

    case "CLICK_CELL":
    case "CLICK_CELL_MODIFIER":
      checkRef("cellule", a.cell, where)
      break

    case "CLICK_CONTROL":
      if (!a.control.trim()) err(`${where} : identifiant de contrôle vide.`)
      else if (!/^(bf|acc|sb|ui|ins|for|don|rev|aff|dev)-/.test(a.control)) {
        warn(`${where} : « ${a.control} » ne suit pas la convention de préfixe des contrôles.`)
      }
      break

    case "FILL_HANDLE":
      checkRef("origine", a.from, where)
      checkRef("destination", a.to, where)
      break

    case "DRAG_RANGE":
      checkRef("plage", a.range, where)
      if (a.duringEdit && !a.template) {
        warn(`${where} : sélection pendant l'édition sans template de réinjection.`)
      }
      break

    case "KEY":
      if (!a.key.trim()) err(`${where} : touche non renseignée.`)
      break

    case "CONTEXT_MENU":
    case "DOUBLE_CLICK":
      if (!a.target.trim()) err(`${where} : cible non renseignée.`)
      break

    case "SELECT_COLUMN":
      if (!/^[A-Z]{1,3}$/i.test(a.column)) err(`${where} : « ${a.column} » n'est pas une lettre de colonne.`)
      break

    case "SELECT_ROW":
      if (!Number.isInteger(a.row) || a.row < 1) err(`${where} : numéro de ligne invalide.`)
      break

    case "SELECT_SHEET":
      if (!a.name.trim()) err(`${where} : nom de feuille vide.`)
      break

    case "GOTO_REF":
      checkRef("référence", a.ref, where)
      break

    case "EXPECT_STATE": {
      const refs = Object.entries(a.cells)
      if (refs.length === 0) {
        err(`${where} : aucune cellule à vérifier, l'étape serait validée d'office.`)
        break
      }
      for (const [ref, want] of refs) {
        checkRef("cellule attendue", ref, where)
        if (want.f === undefined && want.v === undefined && !want.anyOf?.length) {
          err(`${where} : la cellule ${ref} n'attend ni formule ni valeur.`)
        }
        for (const f of [...(want.anyOf ?? []), ...(want.f ? [want.f] : [])]) {
          if (!f.startsWith("=")) err(`${where} : « ${f} » attendu en ${ref} ne commence pas par =.`)
          else checkFormulaFunctions(f, where)
        }
      }
      break
    }
  }

  // Garde-fou décisif : une étape dont le geste n'est pas observable par la grille
  // serait INJOUABLE. L'apprenant resterait bloqué sans comprendre pourquoi.
  // Cette liste doit suivre ce que `ExcelGrid` émet réellement.
  // CLICK_CELL_MODIFIER est ABSENT volontairement : vérifié au banc d'essai le
  // 28/07/2026, un Ctrl+clic ne déclenche AUCUN événement côté Univer (seul le
  // clic précédent est vu). Une étape Ctrl+clic bloquerait donc l'apprenant.
  const OBSERVABLE = new Set([
    "READ",
    "TYPE",
    "CLICK_CELL",
    "CLICK_CONTROL",
    "DRAG_RANGE",
    "EXPECT_STATE",
    "SELECT_COLUMN",
    "SELECT_ROW",
    "SELECT_SHEET",
    "GOTO_REF",
  "DEFINE_NAME",
  "SORT_RANGE",
  "FILTER_COLUMN",
  "EXPECT_FORMAT",
  ])
  if (!OBSERVABLE.has(a.type)) {
    err(
      `${where} : le geste « ${a.type} » n'est pas encore observé par la grille — l'étape serait injouable. Utiliser EXPECT_STATE pour valider le résultat à la place.`,
    )
  }

  if (s.setup?.cells) {
    for (const [ref, cell] of Object.entries(s.setup.cells)) {
      checkRef("cellule d'état", ref, where)
      if (cell.v !== undefined && cell.f !== undefined) {
        err(`${where} : la cellule ${ref} porte à la fois une valeur et une formule.`)
      }
      if (cell.f) {
        if (!cell.f.startsWith("=")) err(`${where} : la formule de ${ref} ne commence pas par =.`)
        else checkFormulaFunctions(cell.f, where)
      }
    }
  }
  if (s.setup?.selection) checkRef("sélection", s.setup.selection, where)
}

function checkScenario(sc: SimulationScenario) {
  if (sc.schemaVersion !== SIMULATION_SCHEMA_VERSION) {
    err(`schemaVersion ${sc.schemaVersion} inattendue (attendu ${SIMULATION_SCHEMA_VERSION}).`)
  }
  if (!sc.title?.trim()) err("Titre du scénario manquant.")
  if (!sc.ribbon || sc.ribbon.length === 0) err("Aucun onglet de ruban déclaré.")
  if (!sc.workbook?.fileName?.trim()) err("Nom de classeur manquant.")
  if (!sc.workbook?.sheets?.length) err("Le classeur ne contient aucune feuille.")
  if (!sc.steps?.length) {
    err("Le scénario ne contient aucune étape.")
    return
  }

  for (const sheet of sc.workbook.sheets ?? []) {
    for (const [ref, cell] of Object.entries(sheet.cells ?? {})) {
      checkRef("cellule initiale", ref, `feuille ${sheet.name}`)
      if (cell.f && !cell.f.startsWith("=")) {
        err(`feuille ${sheet.name} : la formule de ${ref} ne commence pas par =.`)
      }
    }
  }

  const seen = new Set<string>()
  sc.steps.forEach((s, i) => checkStep(s, i, seen, sc.mode ?? "LESSON"))

  // Une simulation entièrement contemplative n'apprend rien.
  const interactive = sc.steps.filter((s) => s.action.type !== "READ").length
  const ratio = interactive / sc.steps.length
  if (ratio < 0.6) {
    warn(
      `Seulement ${Math.round(ratio * 100)} % d'étapes interactives (${interactive}/${sc.steps.length}). Le seuil d'alerte est 60 % ; viser plutôt 80 %.`,
    )
  }

  // Les contrôles cités doivent exister dans l'habillage. Liste tenue à jour
  // manuellement : mieux vaut un avertissement qu'un bouton introuvable en prod.
  const KNOWN_CONTROLS = new Set([
    "bf-entrer",
    "bf-annuler",
    "bf-fx",
    "acc-somme-auto",
    "acc-somme-auto-fleche",
    "acc-recopier",
    "acc-effacer",
    "acc-coller",
    "acc-copier",
    "acc-format-nombre",
    "acc-pourcentage",
    "acc-inserer",
    "acc-supprimer",
    "acc-format",
    "acc-format-fleche",
    "acc-format-largeur",
    "acc-format-masquer",
    "acc-mfc-regle",
    "acc-mfc-effacer",
    "acc-gras",
    "acc-italique",
    "acc-souligne",
    "acc-taille-plus",
    "acc-taille-moins",
    "acc-couleur-police",
    "acc-remplissage",
    "acc-bordures",
    "acc-aligner-gauche",
    "acc-aligner-centre",
    "acc-aligner-droite",
    "acc-fusionner",
    "acc-renvoyer-ligne",
    "don-tri-croissant",
    "don-tri-decroissant",
    "don-filtrer",
    "don-effacer-filtre",
    "don-validation",
    "don-effacer-validation",
    "rev-commentaire",
    "rev-supprimer-commentaire",
    "aff-figer-volets",
    "aff-liberer-volets",
    "ui-nouvelle-feuille",
  ])
  for (const s of sc.steps) {
    if (s.action.type === "CLICK_CONTROL" && !KNOWN_CONTROLS.has(s.action.control)) {
      warn(
        `étape ${s.id} : le contrôle « ${s.action.control} » n'existe pas encore dans l'habillage — l'étape serait injouable.`,
      )
    }
  }
}

/* ── Exécution ────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error("Usage : check-scenario.ts <fichier.json> [autre.json…]")
  process.exit(2)
}

let filesChecked = 0
let hadError = false

for (const file of args) {
  const abs = path.resolve(file)
  errors.length = 0
  warnings.length = 0

  let sc: SimulationScenario
  try {
    sc = JSON.parse(fs.readFileSync(abs, "utf8"))
  } catch (e) {
    console.log(`\n✗ ${path.basename(file)} : JSON illisible — ${(e as Error).message}`)
    hadError = true
    continue
  }

  checkScenario(sc)
  filesChecked++

  const interactive = (sc.steps ?? []).filter((s) => s.action?.type !== "READ").length
  console.log(
    `\n${errors.length ? "✗" : "✓"} ${path.basename(file)} — « ${sc.title ?? "?"} » · ${sc.steps?.length ?? 0} étapes dont ${interactive} interactives`,
  )
  for (const e of errors) console.log(`   ERREUR  ${e}`)
  for (const w of warnings) console.log(`   avert.  ${w}`)
  if (errors.length) hadError = true
}

console.log(`\n${filesChecked} scénario(s) contrôlé(s).`)
process.exit(hadError ? 1 : 0)
