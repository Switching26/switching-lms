/**
 * COUVERTURE DE LA SURFACE WORD — ce que le contenu enseigne, et ce qu'il ignore.
 *
 * POURQUOI IL EXISTE (D16)
 *
 * « Reste-t-il des modules à écrire ? » se répond en COMPTANT, pas au jugé. Un
 * auteur qui répond de mémoire écrit soit des modules qui répètent ce qui est
 * déjà couvert, soit s'arrête en laissant des gestes que la surface porte et que
 * personne n'enseigne. Les deux sont invisibles à la relecture.
 *
 * Ce contrôle range CHAQUE bouton rendu et CHAQUE type d'action dans une seule
 * de quatre cases :
 *
 *   · CLIC     — une étape le presse explicitement (`W_CLICK_CONTROL`)
 *   · ÉTAT     — aucun scénario ne le cite, mais il est le CHEMIN d'une étape
 *                jugée sur l'état : le bouton « Gras » n'est presque jamais
 *                cliqué par une consigne, il est le moyen d'obtenir `gras:true`
 *   · HORS     — délibérément hors consigne, avec sa raison écrite
 *   · ORPHELIN — rendu, opérant, et JAMAIS enseigné. C'est la seule case qui
 *                justifie d'écrire un module de plus.
 *
 * USAGE
 *   npx tsx scripts/simulation/word/check-couverture.ts
 */

import * as fs from "fs"
import * as path from "path"
import { LIBELLES_CONTROLES_WORD } from "../../../lib/simulation/word/adaptateur"

const RACINE = path.join(__dirname, "..", "..", "..")
const COMPOSANTS = path.join(RACINE, "components", "simulation", "word")
const SCENARIOS = path.join(RACINE, "scripts", "simulation", "scenarios", "word")

const lire = (f: string) => fs.readFileSync(f, "utf8")

/**
 * Boutons qui SERVENT une étape jugée sur l'état, sans jamais être cités.
 *
 * Le lien bouton → attente ne peut pas se déduire du source : c'est une
 * connaissance de contenu. Elle est écrite ici, une fois, et vaut preuve que le
 * bouton est bien exercé par le corpus.
 */
const CHEMIN_VERS_UNE_ATTENTE: Record<string, string> = {
  "w-gras": "W_EXPECT_FORMAT gras",
  "w-italique": "W_EXPECT_FORMAT italique",
  "w-souligne": "W_EXPECT_FORMAT souligne",
  "w-barre": "W_EXPECT_FORMAT barre",
  "w-taille": "W_EXPECT_FORMAT taille",
  "w-police": "W_EXPECT_FORMAT police",
  "w-couleur": "W_EXPECT_FORMAT couleur",
  "w-surlignage": "W_EXPECT_FORMAT surlignage",
  "w-align-gauche": "W_EXPECT_STYLE alignement",
  "w-align-centre": "W_EXPECT_STYLE alignement",
  "w-align-droite": "W_EXPECT_STYLE alignement",
  "w-align-justifie": "W_EXPECT_STYLE alignement",
  "w-liste-puces": "W_EXPECT_STYLE liste",
  "w-liste-numerotee": "W_EXPECT_STYLE liste",
  "w-style-normal": "W_EXPECT_STYLE style",
  "w-style-titre": "W_EXPECT_STYLE style",
  "w-style-soustitre": "W_EXPECT_STYLE style",
  "w-style-titre1": "W_EXPECT_STYLE style",
  "w-style-titre2": "W_EXPECT_STYLE style",
  "w-style-titre3": "W_EXPECT_STYLE style",
  "w-mise-en-page": "W_EXPECT_PAGE (ouvre le panneau — chemin obligé de toute étape de mise en page)",
  "w-orientation-portrait": "W_EXPECT_PAGE orientation",
  "w-orientation-paysage": "W_EXPECT_PAGE orientation",
  "w-marges-normales": "W_EXPECT_PAGE marges",
  "w-marges-etroites": "W_EXPECT_PAGE marges",
  "w-marges-larges": "W_EXPECT_PAGE marges",
  "w-marge-haut": "W_EXPECT_PAGE margeHaut",
  "w-marge-bas": "W_EXPECT_PAGE margeBas",
  "w-marge-gauche": "W_EXPECT_PAGE margeGauche",
  "w-marge-droite": "W_EXPECT_PAGE margeDroite",
  "w-entete-zone": "W_EXPECT_ENTETE entete",
  "w-pied-zone": "W_EXPECT_ENTETE pied",
  "w-filigrane-zone": "W_EXPECT_ENTETE filigrane",
  "w-numero-page": "W_EXPECT_PAGE numeroPage",
  "w-print-copies": "W_EXPECT_PRINT copies",
  "w-print-plage-tout": "W_EXPECT_PRINT plage",
  "w-print-plage-courante": "W_EXPECT_PRINT plage",
  "w-print-rectoverso": "W_EXPECT_PRINT rectoVerso",
  "w-taquet-type": "W_EXPECT_TABS type",
  "w-ligne-dessus": "W_EXPECT_TABLE lignes",
  "w-ligne-dessous": "W_EXPECT_TABLE lignes",
  "w-colonne-gauche": "W_EXPECT_TABLE colonnes",
  "w-colonne-droite": "W_EXPECT_TABLE colonnes",
  "w-supprimer-ligne": "W_EXPECT_TABLE lignes",
  "w-supprimer-colonne": "W_EXPECT_TABLE colonnes",
  "w-tableau-lignes": "W_EXPECT_TABLE (boîte de dialogue)",
  "w-tableau-colonnes": "W_EXPECT_TABLE (boîte de dialogue)",
  "w-tableau-ok": "W_EXPECT_TABLE (boîte de dialogue)",
  "w-habillage-aligne": "W_EXPECT_IMAGE habillage",
  "w-habillage-carre": "W_EXPECT_IMAGE habillage",
  "w-habillage-hautbas": "W_EXPECT_IMAGE habillage",
  "w-habillage-devant": "W_EXPECT_IMAGE habillage",
  "w-supprimer-image": "W_EXPECT_IMAGE absente",
  "w-lien-adresse": "W_EXPECT_LIEN url (champ de la boîte)",
  "w-lien-valider": "W_EXPECT_LIEN url (validation de la boîte)",
  "w-retirer-lien": "W_EXPECT_LIEN absent",
  "w-annuler": "W_EXPECT_DOC après annulation",
  "w-retablir": "W_EXPECT_DOC après rétablissement",
}

/**
 * Boutons délibérément hors consigne, avec leur raison.
 *
 * ⚠️ Ce n'est PAS la même liste que les « décoratifs » de `check-controles` :
 * là-bas on justifie l'absence de commande moteur ; ici on justifie l'absence
 * d'enseignement. Un bouton peut avoir une commande et n'être exercé par aucune
 * consigne — c'est ce que ce contrôle cherche.
 */
const HORS_CONSIGNE: Record<string, string> = {
  "w-copier": "presse-papiers INERTE : le player ne gère aucun presse-papiers (mesuré)",
  "w-couper": "presse-papiers inerte, même raison",
  "w-coller": "presse-papiers inerte, même raison",
  "w-mise-en-page-fermer": "fermeture de panneau : exercée par le geste, jamais notée seule",
  "w-entete-fermer": "fermeture de panneau",
  "w-print-fermer": "fermeture d'écran",
  "w-verif-fermer": "fermeture de panneau",
  "w-image-fermer": "fermeture de galerie",
  "w-lien-fermer": "abandon de la boîte de lien : rien à enseigner",
  "w-tableau-annuler": "abandon d'une boîte de dialogue : rien à enseigner",
  "w-print-plage-selection":
    "la plage « Sélection » exige une sélection active au moment de l'impression, que l'écran d'aperçu ne conserve pas",
  "w-print-zoom-moins": "réduire l'aperçu — le zoom est enseigné dans un sens seulement",
  "w-verif-orthographe":
    "onglet ACTIF À L'OUVERTURE du panneau : une étape qui demanderait de le cliquer serait vraie dès l'arrivée",
}

function scenarios() {
  return fs
    .readdirSync(SCENARIOS)
    .filter((n) => n.endsWith(".json"))
    .map((n) => JSON.parse(lire(path.join(SCENARIOS, n))) as {
      steps?: { action?: Record<string, unknown> }[]
    })
}

/* ── 1. Les boutons rendus ─────────────────────────────────────────────── */

const sources = fs
  .readdirSync(COMPOSANTS)
  .filter((n) => n.endsWith(".tsx"))
  .map((n) => lire(path.join(COMPOSANTS, n)))
  .join("\n")

const rendus = new Set<string>()
for (const m of sources.matchAll(/\bid:\s*"(w-[^"]+)"/g)) rendus.add(m[1])
for (const m of sources.matchAll(/data-control="(w-[^"{]+)"/g)) rendus.add(m[1])
for (const m of sources.matchAll(/\bcontrole:\s*"(w-[^"]+)"/g)) rendus.add(m[1])

/* ── 2. Ce que les scénarios citent ────────────────────────────────────── */

const cites = new Set<string>()
const typesEmployes = new Map<string, number>()
for (const sc of scenarios()) {
  for (const s of sc.steps ?? []) {
    const a = s.action ?? {}
    const t = String(a.type ?? "")
    typesEmployes.set(t, (typesEmployes.get(t) ?? 0) + 1)
    if (t === "W_CLICK_CONTROL" && typeof a.controle === "string") cites.add(a.controle)
  }
}

/* ── 3. Le classement ──────────────────────────────────────────────────── */

const parCase: Record<string, string[]> = { CLIC: [], ETAT: [], HORS: [], ORPHELIN: [] }
for (const id of [...rendus].sort()) {
  if (cites.has(id)) parCase.CLIC.push(id)
  else if (CHEMIN_VERS_UNE_ATTENTE[id]) parCase.ETAT.push(id)
  else if (HORS_CONSIGNE[id]) parCase.HORS.push(id)
  else parCase.ORPHELIN.push(id)
}

console.log("\n═══ COUVERTURE DE LA SURFACE WORD ═══\n")
console.log(`${rendus.size} bouton(s) rendu(s) par les composants Word\n`)
console.log(`  CLIC     ${String(parCase.CLIC.length).padStart(3)} — une étape les presse explicitement`)
console.log(`  ÉTAT     ${String(parCase.ETAT.length).padStart(3)} — chemin d'une étape jugée sur l'état`)
console.log(`  HORS     ${String(parCase.HORS.length).padStart(3)} — délibérément hors consigne, raison écrite`)
console.log(`  ORPHELIN ${String(parCase.ORPHELIN.length).padStart(3)} — rendus et JAMAIS enseignés\n`)

if (parCase.ORPHELIN.length > 0) {
  console.log("Gestes ORPHELINS — chacun justifie un module ou une étape de plus :")
  for (const id of parCase.ORPHELIN) {
    console.log(`  · ${id.padEnd(26)} ${LIBELLES_CONTROLES_WORD[id] ?? "(sans libellé)"}`)
  }
  console.log("")
}

/* ── 4. Les cibles de jugement ─────────────────────────────────────────── */

const TOUTES_ACTIONS = [
  "READ",
  "W_TYPE_TEXT",
  "W_SELECT_TEXT",
  "W_CLICK_CONTROL",
  "W_KEY",
  "W_EXPECT_DOC",
  "W_EXPECT_FORMAT",
  "W_EXPECT_STYLE",
  "W_EXPECT_TABLE",
  "W_EXPECT_PAGE",
  "W_EXPECT_IMAGE",
  "W_EXPECT_ENTETE",
  "W_EXPECT_PRINT",
  "W_EXPECT_TABS",
]

console.log("Cibles de jugement :")
const inemployees: string[] = []
for (const t of TOUTES_ACTIONS) {
  const n = typesEmployes.get(t) ?? 0
  console.log(`  ${t.padEnd(20)} ${String(n).padStart(4)} étape(s)`)
  if (n === 0) inemployees.push(t)
}
console.log("")

const anomalies: string[] = []
if (parCase.ORPHELIN.length > 0) {
  anomalies.push(
    `${parCase.ORPHELIN.length} bouton(s) rendus qu'aucune étape n'enseigne — Word n'est pas complet`,
  )
}
for (const t of inemployees) {
  anomalies.push(`la variante « ${t} » est déclarée mais aucune étape ne l'emploie`)
}

if (anomalies.length === 0) {
  console.log("✓ Chaque bouton rendu est enseigné, exercé par l'état, ou hors consigne avec sa raison.")
  console.log("  Chaque variante d'action déclarée est employée. La surface est intégralement couverte.")
  process.exit(0)
}
for (const a of anomalies) console.log(`  ✗ ${a}`)
console.log(`\n✗ ${anomalies.length} point(s) de couverture à traiter.`)
process.exit(1)
