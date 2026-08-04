/**
 * CONTRAT DE RECONSTITUTION D'UNE DÉMONSTRATION — garde-fou statique.
 *
 *   npx tsx scripts/simulation/check-demo-rejeu.ts
 *
 * POURQUOI CE FICHIER EXISTE
 * Le 03/08/2026, « Revoir la démonstration » ne montrait rien sur les étapes du
 * poste de travail : le premier passage avait fermé la boîte « Enregistrer
 * sous » et créé le fichier, le second rejouait le calque sur deux contrôles
 * disparus. Le compteur affichait pourtant 1/2 puis 2/2. Aucun des douze
 * contrôles existants ne pouvait le voir — ils lisent les SCÉNARIOS, et le
 * défaut était dans le MOTEUR.
 *
 * La cause de fond n'était pas le poste : c'était qu'un rejeu repartait de
 * l'état laissé par le passage précédent. La règle qui en découle est simple et
 * doit tenir dans le temps :
 *
 *   TOUT départ de démonstration passe par `demarrerDemonstration`,
 *   TOUT rejeu passe par `rejouerDemonstration`,
 *   et les deux remettent l'écran dans l'état d'où la démonstration part.
 *
 * Ce contrôle vérifie ce câblage à la lettre. Il ne remplace pas le balayage
 * navigateur (`scripts/simulation/banc-rejeu/audit-rejeu.cjs`), qui seul prouve
 * que les deux passages MONTRENT la même chose ; il empêche seulement que le
 * mécanisme soit débranché sans que personne ne s'en aperçoive — ce qui est
 * exactement ce qui s'est produit avant lui.
 */

import * as fs from "fs"
import * as path from "path"

const JOUEUR = path.join(__dirname, "..", "..", "components", "simulation", "SimulationPlayer.tsx")
const CALQUE = path.join(__dirname, "..", "..", "components", "simulation", "DemonstrationGeste.tsx")
/**
 * Depuis l'extraction du noyau (phase 0 du chantier multi-app), les deux
 * chemins de démonstration vivent dans le hook commun, pas dans le player : ils
 * sont génériques, et les quatre apps doivent les partager. Le contrôle suit
 * donc le code — mais il vérifie désormais les DEUX maillons de la chaîne, ce
 * qu'il ne faisait pas avant :
 *
 *   1. le hook appelle le crochet de restauration en tête des deux fonctions ;
 *   2. le player lui passe bien `restaurerDepartPostePourDemo` comme crochet.
 *
 * Casser l'un ou l'autre rend « Revoir la démonstration » faux sans erreur
 * visible — c'est exactement le défaut du 03/08 que ce fichier existe pour
 * empêcher de revenir.
 */
const HOOK = path.join(__dirname, "..", "..", "components", "simulation", "hooks", "useAtelier.ts")

const src = fs.readFileSync(JOUEUR, "utf8")
const calque = fs.readFileSync(CALQUE, "utf8")
const hook = fs.readFileSync(HOOK, "utf8")
const lignes = hook.split("\n")

const echecs: string[] = []
const ok: string[] = []

function exige(nom: string, condition: boolean, explication: string) {
  if (condition) ok.push(nom)
  else echecs.push(`${nom} — ${explication}`)
}

/* ── 1. Un seul chemin pour démarrer, un seul pour rejouer ─────────────────
   C'est LE point de rupture : les boutons appelaient `setDemonstration(true)`
   et `setRejeu(n => n + 1)` en direct, donc aucune remise en état. */

const departsDirects = lignes
  .map((l, i) => ({ l, n: i + 1 }))
  .filter(({ l }) => /setDemonstration\(\s*true\s*\)/.test(l))
  .filter(({ n }) => {
    // La seule occurrence légitime est DANS `demarrerDemonstration`.
    const contexte = lignes.slice(Math.max(0, n - 8), n).join("\n")
    return !/const demarrerDemonstration = useCallback/.test(contexte)
  })
exige(
  "un seul démarrage",
  departsDirects.length === 0 && !/setDemonstration\(\s*true\s*\)/.test(src),
  `setDemonstration(true) appelé hors de demarrerDemonstration, ligne(s) ${departsDirects.map((d) => d.n).join(", ")}` +
    ` (ou remis en direct dans le player, ce qui court-circuiterait la remise en état)`,
)

const rejeuxDirects = lignes
  .map((l, i) => ({ l, n: i + 1 }))
  .filter(({ l }) => /setRejeu\(\s*\(?\s*n\s*\)?\s*=>/.test(l))
  .filter(({ n }) => {
    const contexte = lignes.slice(Math.max(0, n - 8), n).join("\n")
    return !/const rejouerDemonstration = useCallback/.test(contexte)
  })
exige(
  "un seul rejeu",
  rejeuxDirects.length === 0 && !/setRejeu\(\s*\(?\s*n\s*\)?\s*=>/.test(src),
  `setRejeu(n => n + 1) appelé hors de rejouerDemonstration, ligne(s) ${rejeuxDirects.map((d) => d.n).join(", ")}` +
    ` (ou remis en direct dans le player)`,
)

/* ── 2. Les deux chemins remettent l'écran dans son état d'entrée ──────────
   Deux maillons, tous deux nécessaires : le hook appelle le crochet, et le
   player lui fournit celui qui restaure le poste. Vérifier un seul des deux
   laisserait passer la moitié des façons de casser la propriété. */

/**
 * Corps d'un `useCallback`, borné à SA fermeture.
 *
 * ⚠️ La version d'origine prenait 400 caractères au forfait. `demarrerDemonstration`
 * et `rejouerDemonstration` étant adjacentes et courtes, la fenêtre débordait sur
 * la seconde : retirer l'appel de la PREMIÈRE laissait le contrôle vert, puisqu'il
 * trouvait celui de la voisine. Angle mort découvert en piégeant le contrôle, et
 * qui existait avant l'extraction du noyau.
 */
function corps(source: string, nom: string): string {
  const i = source.indexOf(`const ${nom} = useCallback(`)
  if (i < 0) return ""
  // Fin du rappel : la ligne de fermeture `  }, [...])` à l'indentation 2.
  const fin = source.indexOf("\n  }, [", i)
  return fin < 0 ? source.slice(i, i + 400) : source.slice(i, fin)
}
for (const f of ["demarrerDemonstration", "rejouerDemonstration"]) {
  exige(
    `${f} appelle le crochet de restauration`,
    /avantRef\.current\?\.\(\)/.test(corps(hook, f)),
    "le hook ne rappelle plus l'app avant de (re)jouer : l'écran repartira de l'état laissé par le passage précédent",
  )
}
exige(
  "le player fournit la restauration du poste",
  /avantDemonstration:\s*restaurerDepartPostePourDemo/.test(src),
  "le poste de travail n'est plus remis dans son état d'entrée : « Enregistrer sous » redeviendra invisible au rejeu",
)

/* ── 3. Le cliché de départ est pris au premier lancement, reposé au rejeu ── */

exige(
  "cliché de démonstration présent",
  /clicheDemoRef/.test(src) && /prendreClicheDemo/.test(src) && /reposerClicheDemo/.test(src),
  "le mécanisme de cliché a disparu : un rejeu repartira du classeur déjà rempli par le premier passage",
)

/* L'effet a grossi avec le cliché et ses commentaires : on lit jusqu'à sa
   fermeture réelle plutôt que sur un nombre de caractères arbitraire, sans quoi
   ce contrôle crie au loup dès qu'on documente une ligne de plus. */
const effetDemo = (() => {
  const i = src.indexOf('poserAplomb(direAplomb(remettreDAplomb("tout", index)))')
  if (i < 0) return ""
  const fin = src.indexOf("}, [demonstration, rejeu, gridReady])", i)
  return fin < 0 ? src.slice(i, i + 4000) : src.slice(i, fin)
})()
exige(
  "cliché branché sur le démarrage",
  /reposerClicheDemo\(clicheDemoRef\.current\)/.test(effetDemo) &&
    /clicheDemoRef\.current = prendreClicheDemo\(\)/.test(effetDemo),
  "l'effet de démarrage ne prend/repose plus le cliché",
)
exige(
  "cliché remis à zéro au changement d'étape",
  /clicheDemoRef\.current = null/.test(src),
  "le cliché survivrait à l'étape et reposerait le classeur de la précédente",
)
exige(
  "le rejeu dépend bien de `rejeu`",
  /\}, \[demonstration, rejeu, gridReady\]\)/.test(src),
  "sans `rejeu` en dépendance, « Revoir » ne redéclenche ni la remise d'aplomb ni le cliché",
)

/* ── 3bis. Ce que le cliché doit savoir rendre ─────────────────────────────
   Trois propriétés payées cher, chacune par un défaut mesuré au navigateur. */

exige(
  "la formule garde son signe égal",
  /if \(f\) return \{ f: f\.startsWith\("="\) \? f : `=\$\{f\}` \}/.test(src),
  "un cliché qui retire le « = » remet une FORMULE sous forme de texte : `=B11*B13` revenait en « 447,3 » (m05-l03)",
)
exige(
  "l'enregistreur de macro est rendu en entier",
  /enregistrement: EtatEnregistrement \| null/.test(src) &&
    /enregistrement: enregistrementRef\.current \? structuredClone\(enregistrementRef\.current\) : null/.test(src),
  "un booléen ne suffit pas : quand l'étape enregistrait déjà, le rejeu repartait sans enregistreur et la macro disparaissait (m27-l01)",
)
exige(
  "reposer un style ne détruit pas la formule",
  /const formule = api\.getFormula\(ref\)/.test(
    fs.readFileSync(path.join(__dirname, "..", "..", "components", "simulation", "ExcelGrid.tsx"), "utf8"),
  ),
  "`setValue({ s })` REMPLACE la cellule : sans relire le contenu, `=B11*B13` redevient « 447,3 » (m05-l03)",
)
exige(
  "un tableau croisé créé par la démonstration est retiré au rejeu",
  /posePivotRef\.current = null/.test(src) && /const vides: Record<string, CelluleCliche> = \{\}/.test(src),
  "sans effacer sa pose, « insérez un tableau croisé » se rejouait sur un tableau déjà posé (m20-e01, m20-l01)",
)

/* ── 4. Le calque redémarre vraiment du premier geste ─────────────────────── */

exige(
  "le calque est remonté à chaque rejeu",
  /key=\{`demo\$\{index\}-\$\{rejeu\}`\}/.test(src),
  "sans clé neuve, « Revoir » ne rembobine pas la séquence",
)

/* ── 5. Les repères de mesure survivent ───────────────────────────────────── */

for (const marqueur of ["data-demo-compteur", "data-demo-cible", "data-demo-bulle", "data-demo-phase"]) {
  exige(
    `repère ${marqueur}`,
    calque.includes(marqueur),
    "l'audit du rejeu ne peut plus se recaler sur la séquence",
  )
}

/* ── 6. L'accélérateur d'audit reste hors production ──────────────────────── */

exige(
  "accélérateur d'audit neutralisé en production",
  /process\.env\.NODE_ENV === "production"[^\n]*\n?[^\n]*return 1/.test(calque) ||
    /if \(process\.env\.NODE_ENV === "production" \|\| typeof window === "undefined"\) return 1/.test(calque),
  "`vitesse()` doit rendre la constante 1 en production, sinon un réglage d'audit pourrait atteindre un apprenant",
)

/* ── Verdict ──────────────────────────────────────────────────────────────── */

for (const o of ok) console.log(`  ✓ ${o}`)
if (echecs.length) {
  console.error(`\n${echecs.length} rupture(s) du contrat de reconstitution :`)
  for (const e of echecs) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`\n${ok.length} propriétés vérifiées — le contrat de reconstitution tient.`)
