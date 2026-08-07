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
   et `setRejeu(n => n + 1)` en direct, donc aucune remise en état.

   🔴 DEUX DÉFAUTS DE CE CONTRÔLE, corrigés le 07/08/2026.

   (a) IL LISAIT LES COMMENTAIRES. La recherche portait sur le texte brut : une
       ligne de documentation qui CITE `setDemonstration(true)` était comptée
       comme un appel. Le contrôle a rougi sur la phrase qui explique le remède,
       en désignant la ligne 268 — un commentaire. C'est le septième faux témoin
       de ce chantier, et il était dans le garde-fou lui-même.

   (b) IL MESURAIT UNE DISTANCE, PAS UNE APPARTENANCE. « Le `const
       demarrerDemonstration = useCallback` est-il dans les 8 lignes qui
       précèdent ? » tient tant que la fonction reste courte ; ajoutez trois
       lignes et un appel parfaitement légitime devient une rupture. On délimite
       désormais le CORPS de chaque fonction en suivant les accolades.

   Ce que la règle autorise, et rien de plus :
     · `setDemonstration(true)`  → uniquement dans `demarrerDemonstration` ;
     · `setRejeu(n => n + 1)`    → dans `rejouerDemonstration`, ET dans
       `demarrerDemonstration`, parce que démarrer une démonstration DÉJÀ à
       l'écran doit passer par la clé de remontage : `setDemonstration(true)`
       sur un état déjà vrai ne remonte pas le calque, et l'apprenant perdait
       alors le bouton « Revoir » sans qu'aucune démonstration ne rejoue.
     · dans le PLAYER : ni l'un ni l'autre, jamais. */

/** Retire les commentaires. Un contrôle ne doit jamais chercher dans du texte. */
function sansCommentaires(s: string): string {
  let out = ""
  let i = 0
  let etat: "code" | "ligne" | "bloc" = "code"
  while (i < s.length) {
    const c = s[i]
    const d = s[i + 1]
    if (etat === "code") {
      if (c === "/" && d === "/") { etat = "ligne"; i += 2; continue }
      if (c === "/" && d === "*") { etat = "bloc"; i += 2; continue }
      out += c; i++; continue
    }
    if (etat === "ligne") { if (c === "\n") { etat = "code"; out += "\n" } i++; continue }
    if (c === "*" && d === "/") { etat = "code"; i += 2; continue }
    if (c === "\n") out += "\n"
    i++
  }
  return out
}

/** Le corps d'un `const <nom> = useCallback(...)`, accolades suivies. */
function corpsDe(source: string, nom: string): { debut: number; fin: number } | null {
  const m = new RegExp(`const\\s+${nom}\\s*=\\s*useCallback\\s*\\(`).exec(source)
  if (!m) return null
  let prof = 0
  for (let i = m.index + m[0].length - 1; i < source.length; i++) {
    if (source[i] === "(") prof++
    else if (source[i] === ")") { prof--; if (prof === 0) return { debut: m.index, fin: i } }
  }
  return null
}

/**
 * Les quatre propriétés des chemins, sur des sources DONNÉES.
 *
 * Factorisées pour que le piège (`--piege`) puisse les jouer sur des sources
 * modifiées en mémoire. Un contrôle qu'on assouplit sans le repiéger devient un
 * faux témoin — et celui-ci vient d'en être un.
 */
function verifierChemins(hookSrc: string, playerSrc: string): Array<{ nom: string; ok: boolean; detail: string }> {
  const hookCode = sansCommentaires(hookSrc)
  const playerCode = sansCommentaires(playerSrc)
  const ligne = (i: number) => hookCode.slice(0, i).split("\n").length
  const demarrer = corpsDe(hookCode, "demarrerDemonstration")
  const rejouer = corpsDe(hookCode, "rejouerDemonstration")

  const horsDe = (motif: RegExp, autorises: Array<{ debut: number; fin: number } | null>): number[] => {
    const hors: number[] = []
    const re = new RegExp(motif.source, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(hookCode))) {
      const pos = m.index
      if (!autorises.some((b) => b && pos >= b.debut && pos <= b.fin)) hors.push(ligne(pos))
    }
    return hors
  }

  const departs = horsDe(/setDemonstration\(\s*true\s*\)/, [demarrer])
  const rejeux = horsDe(/setRejeu\(\s*\(?\s*n\s*\)?\s*=>/, [rejouer, demarrer])
  const corps = (b: { debut: number; fin: number } | null) => (b ? hookCode.slice(b.debut, b.fin) : "")

  return [
    {
      nom: "les deux chemins existent",
      ok: !!demarrer && !!rejouer,
      detail: "`demarrerDemonstration` ou `rejouerDemonstration` est introuvable dans le noyau",
    },
    {
      nom: "un seul démarrage",
      ok: departs.length === 0 && !/setDemonstration\(\s*true\s*\)/.test(playerCode),
      detail:
        `setDemonstration(true) appelé hors de demarrerDemonstration, ligne(s) ${departs.join(", ")}` +
        ` (ou remis en direct dans le player, ce qui court-circuiterait la remise en état)`,
    },
    {
      nom: "un seul rejeu",
      ok: rejeux.length === 0 && !/setRejeu\(\s*\(?\s*n\s*\)?\s*=>/.test(playerCode),
      detail:
        `setRejeu(n => n + 1) appelé hors de rejouerDemonstration et de demarrerDemonstration,` +
        ` ligne(s) ${rejeux.join(", ")} (ou remis en direct dans le player)`,
    },
    {
      nom: "démarrer restaure d'abord",
      ok: /avantRef\.current\?\.\(\)/.test(corps(demarrer)),
      detail: "`demarrerDemonstration` n'appelle pas le crochet de restauration en tête",
    },
    {
      nom: "rejouer restaure d'abord",
      ok: /avantRef\.current\?\.\(\)/.test(corps(rejouer)),
      detail: "`rejouerDemonstration` n'appelle pas le crochet de restauration en tête",
    },
  ]
}

for (const p of verifierChemins(hook, src)) exige(p.nom, p.ok, p.detail)

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

/* ── Le piège ──────────────────────────────────────────────────────────────
   `npx tsx scripts/simulation/check-demo-rejeu.ts --piege`

   Ce contrôle vient d'être ASSOUPLI : il accepte désormais `setRejeu` dans
   `demarrerDemonstration`. Un assouplissement non repiégé est un faux témoin en
   puissance — on en a déjà payé sept sur ce chantier, dont un DANS ce fichier
   (il rougissait sur un commentaire). On vérifie donc, sur des sources modifiées
   en mémoire, qu'il rougit toujours sur ce qu'il protège, et seulement là. */
if (process.argv.includes("--piege")) {
  let tout = true
  const dire = (nom: string, reussi: boolean, detail: string) => {
    if (!reussi) tout = false
    console.log(`  ${reussi ? "✓" : "✗"} ${nom} — ${detail}`)
  }
  const rupture = (h: string, p: string, nom: string) => verifierChemins(h, p).find((x) => x.nom === nom)?.ok === false

  console.log("PIÈGE — on casse chaque propriété et on exige que le contrôle rougisse.\n")

  dire("sources réelles", verifierChemins(hook, src).every((x) => x.ok), "aucune rupture")

  // 1. Un démarrage direct, hors des deux fonctions.
  dire("démarrage hors fonction",
    rupture(hook + "\nfunction __p(){ setDemonstration(true) }\n", src, "un seul démarrage"),
    "le contrôle rougit")

  // 2. Un démarrage direct DANS LE PLAYER.
  dire("démarrage dans le player",
    rupture(hook, src + "\nfunction __p(){ setDemonstration(true) }\n", "un seul démarrage"),
    "le contrôle rougit")

  // 3. Un rejeu direct, hors des deux fonctions.
  dire("rejeu hors fonction",
    rupture(hook + "\nfunction __p(){ setRejeu((n) => n + 1) }\n", src, "un seul rejeu"),
    "le contrôle rougit")

  // 4. Un rejeu direct DANS LE PLAYER.
  dire("rejeu dans le player",
    rupture(hook, src + "\nfunction __p(){ setRejeu((n) => n + 1) }\n", "un seul rejeu"),
    "le contrôle rougit")

  /* 5. LE CHEMIN QU'ON VIENT D'AUTORISER — il doit rester VERT.
   *    C'est le remède du bouton de recours : démarrer une démonstration déjà à
   *    l'écran passe par la clé de remontage, sinon rien ne rejoue. */
  dire("rejeu DANS demarrerDemonstration (chemin légitime)",
    verifierChemins(hook, src).find((x) => x.nom === "un seul rejeu")?.ok === true,
    "le contrôle reste vert — c'est le remède du bouton de recours")

  // 6. La restauration retirée de chaque chemin.
  dire("démarrer sans restauration",
    rupture(hook.replace(/(const demarrerDemonstration = useCallback\(\(\) => \{\s*\n\s*)avantRef\.current\?\.\(\)/, "$1"),
      src, "démarrer restaure d'abord"),
    "le contrôle rougit")
  dire("rejouer sans restauration",
    rupture(hook.replace(/(const rejouerDemonstration = useCallback\(\(\) => \{\s*\n\s*)avantRef\.current\?\.\(\)/, "$1"),
      src, "rejouer restaure d'abord"),
    "le contrôle rougit")

  /* 7. LE FAUX TÉMOIN QUI A FAIT ROUGIR CE FICHIER LE 07/08/2026.
   *    La version d'avant cherchait dans le texte BRUT : une ligne de
   *    documentation citant `setDemonstration(true)` était comptée comme un
   *    appel, et le contrôle désignait un commentaire comme une rupture. */
  dire("un commentaire n'est pas un appel",
    verifierChemins(hook + "\n// setDemonstration(true) et setRejeu((n) => n + 1) cités en commentaire\n", src)
      .every((x) => x.ok),
    "citer les deux appels en commentaire ne déclenche rien")

  // 8. Et une fonction renommée doit rendre le contrôle aveugle → rupture.
  dire("chemin disparu",
    rupture(hook.replace("const rejouerDemonstration = useCallback", "const autreChose = useCallback"),
      src, "les deux chemins existent"),
    "le contrôle rougit si un chemin n'existe plus")

  console.log(tout
    ? "\n✓ Le contrôle détecte bien ce qu'il prétend détecter, et laisse passer le chemin légitime."
    : "\n✗ PIÈGE EN ÉCHEC — ce contrôle ne prouve rien.")
  process.exit(tout ? 0 : 1)
}

/* ── Verdict ──────────────────────────────────────────────────────────────── */

for (const o of ok) console.log(`  ✓ ${o}`)
if (echecs.length) {
  console.error(`\n${echecs.length} rupture(s) du contrat de reconstitution :`)
  for (const e of echecs) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`\n${ok.length} propriétés vérifiées — le contrat de reconstitution tient.`)
