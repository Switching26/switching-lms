/**
 * LES LITTÉRAUX QU'EXCEL TRANSFORME TOUT SEUL.
 *
 * Dans l'évaluation notée du module 10, le code de dossier `MAR-01` était lu
 * par le moteur comme MARS 2001 : numéro de série 36951, format `mmm-yy`,
 * affiché « mars-01 ». L'auteur écrivait une référence, l'apprenant lisait une
 * date — dans une épreuve comptée. Le piège est d'autant plus vicieux que
 * `MAR` est aussi l'abréviation française de « mardi » : rien ne signale à
 * l'auteur qu'Excel y voit un mois anglais.
 *
 * Les motifs ci-dessous ont tous été ÉPROUVÉS dans le moteur, un par un, en
 * écrivant la chaîne par le chemin réel du produit (`applyCells`) et en
 * relisant ce que la cellule affiche. Ne jamais en ajouter un « par principe » :
 * `VRAI`, `1er`, `1,5`, `-5`, `(3)`, `1 000`, `LUN-01`, `SAM-01`, `3-4-5` sont
 * intacts, et les interdire ferait refuser du contenu parfaitement bon.
 *
 * Ce contrôle est une VIGIE, pas une preuve : il connaît les formes déjà
 * rencontrées. La vérification exhaustive reste le balayage navigateur qui
 * écrit les 1 539 littéraux distincts du corpus dans la grille et relit —
 * c'est lui qui a trouvé les cinq `MAR-0x` (voir le skill).
 *
 *   npx tsx scripts/simulation/check-litteraux-excel.ts
 */
import * as fs from "fs"
import * as path from "path"
import type { SimulationScenario } from "../../lib/simulation/types"

const DIR = path.join(__dirname, "scenarios")

type Motif = { nom: string; test: (s: string) => boolean; devient: string }

/** Abréviations de mois que le moteur reconnaît — en ANGLAIS. */
const MOIS_EN = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC"

const MOTIFS: Motif[] = [
  {
    nom: "mois anglais abrégé + nombre",
    // `MAR-01` → mars 2001. Piège : `MAR` est aussi « mardi » en français.
    test: (s) => new RegExp(`^(${MOIS_EN})[-/ ]\\d{1,4}$`, "i").test(s),
    devient: "une date (mmm-yy)",
  },
  {
    nom: "année + mois anglais + jour",
    test: (s) => new RegExp(`^\\d{4}-(${MOIS_EN})-\\d{1,2}$`, "i").test(s),
    devient: "une date (yyyy-mmm-dd)",
  },
  {
    nom: "deux nombres séparés par - ou /",
    // `1-2` et `3/4` deviennent le 1er février et le 3 avril de l'année en cours.
    test: (s) => /^\d{1,2}[-/]\d{1,2}$/.test(s),
    devient: "une date du jour courant",
  },
  {
    nom: "notation scientifique",
    test: (s) => /^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(s),
    devient: "un nombre en 0.00E+00",
  },
  {
    nom: "zéros de tête",
    // `0033612345678` perd ses zéros. C'est parfois VOULU — le module 5 en fait
    // une leçon — d'où la liste d'exceptions ci-dessous.
    test: (s) => /^0\d+$/.test(s),
    devient: "un nombre sans ses zéros de tête",
  },
  {
    nom: "booléen anglais",
    test: (s) => /^(TRUE|FALSE)$/i.test(s),
    devient: "un booléen (1 ou 0)",
  },
  {
    nom: "signe + de tête",
    test: (s) => /^\+\d/.test(s),
    devient: "un nombre sans son +",
  },
]

/**
 * Littéraux dont la transformation EST la leçon. Chacun doit dire pourquoi :
 * sans justification écrite, une exception devient un trou.
 */
const VOULUS: Record<string, string> = {
  "0033612345678":
    "m05-l02 — la leçon montre justement que le tableur supprime les zéros de tête ; l'`accept` déclare les deux formes",
}

type Trouvaille = { fichier: string; ou: string; texte: string; motif: string; devient: string }

const trouvailles: Trouvaille[] = []
let litteraux = 0

const examiner = (texte: unknown, fichier: string, ou: string) => {
  if (typeof texte !== "string") return
  const s = texte.trim()
  if (!s || s.startsWith("=")) return
  litteraux++
  if (VOULUS[s]) return
  for (const m of MOTIFS) {
    if (m.test(s)) {
      trouvailles.push({ fichier, ou, texte: s, motif: m.nom, devient: m.devient })
      return
    }
  }
}

for (const nom of fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"))
  for (const sh of sc.workbook?.sheets ?? []) {
    for (const [ref, c] of Object.entries(sh.cells ?? {})) {
      if (c.v !== undefined) examiner(c.v, nom, `${sh.name}!${ref}`)
    }
  }
  for (const st of sc.steps ?? []) {
    for (const [ref, c] of Object.entries(st.setup?.cells ?? {})) {
      if (c.v !== undefined) examiner(c.v, nom, `${ref} (setup ${st.id})`)
    }
    const a = st.action
    if (a.type === "TYPE" && Array.isArray(a.accept)) {
      // Une saisie attendue passe par le même moteur : si elle se transforme,
      // l'apprenant tape ce qu'on demande et voit autre chose.
      for (const x of a.accept) examiner(x, nom, `${a.target} (accept ${st.id})`)
    }
    if (a.type === "EXPECT_STATE" && a.cells) {
      for (const [ref, att] of Object.entries(a.cells)) {
        if (att.v !== undefined) examiner(att.v, nom, `${ref} (attendu ${st.id})`)
      }
    }
  }
}

console.log("LITTÉRAUX QU'EXCEL TRANSFORME TOUT SEUL")
console.log("  littéraux examinés :", litteraux, "· suspects :", trouvailles.length)
console.log("  exceptions déclarées :", Object.keys(VOULUS).length)
console.log()
if (trouvailles.length) {
  for (const t of trouvailles) {
    console.log(`  ✗ ${t.fichier} ${t.ou}`)
    console.log(`      « ${t.texte} » → ${t.devient}   [${t.motif}]`)
  }
  console.log()
  console.log("→ ÉCHEC : l'apprenant ne verra pas ce que l'auteur a écrit.")
  console.log("  Corriger le littéral dans le scénario, puis réinjecter en base.")
  process.exit(1)
}
console.log("→ aucun littéral détourné par le moteur")
