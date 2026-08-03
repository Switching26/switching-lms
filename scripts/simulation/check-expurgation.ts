/**
 * Preuve qu'une ÉVALUATION notée ne livre AUCUNE réponse au navigateur.
 *
 *   npx tsx scripts/simulation/check-expurgation.ts
 *
 * Le défaut corrigé : `stripGradedSecrets` ne retirait que cinq clés, et
 * seulement au premier niveau de l'étape. Les réponses vivent dans `action` —
 * `accept`, `cells`, `chart`, `pivot`, `macro`, `pageSetup`, `ref` — donc elles
 * partaient toutes, en clair, dans la réponse du GET. Ce contrôle interdit le
 * retour en arrière.
 *
 * Trois familles :
 *
 *  E. les 27 évaluations réelles passent par `expurgerScenarioNote`, et on
 *     cherche dans le JSON servi chaque chaîne attendue du scénario d'origine.
 *     C'est le contrôle qui compte : il ne teste pas une règle, il teste le
 *     corpus.
 *  F. l'expurgation elle-même, sur des cas construits — profondeur, clé
 *     inconnue, tableau, bloc `remediation`, champ ajouté à un type connu.
 *  G. ce que l'expurgation doit CONSERVER : sans les références de cellules,
 *     l'atelier ne sait plus quoi lire et l'évaluation devient injouable.
 */

import * as fs from "fs"
import * as path from "path"
import {
  CLES_SECRETES,
  actionPublique,
  chercherFuites,
  consigneNommeLaCible,
  corpusPublicDuScenario,
  expurgerScenarioNote,
  retirerClesSecretes,
} from "../../lib/simulation/expurge"
import { LIBELLE_CONTROLE, natureEtape, resumerAttendu, resumerFait } from "../../lib/simulation/attendu"

const RACINE = path.resolve(__dirname, "../..")
const SCENARIOS = path.join(RACINE, "scripts/simulation/scenarios")

let echecs = 0
let total = 0

function verifie(intitule: string, condition: boolean, detail?: string) {
  total++
  if (!condition) {
    echecs++
    console.error(`  ✗ ${intitule}${detail ? ` — ${detail}` : ""}`)
  }
}

/* ═══ E. Les 27 évaluations réelles ══════════════════════════════════════ */

console.log(`\n=== E. Expurgation des évaluations réelles ===`)

const evaluations = fs
  .readdirSync(SCENARIOS)
  .filter((f) => /^m\d{2}-ev\d{2}\.json$/i.test(f))
  .sort()

verifie("E0 · les 27 évaluations sont présentes", evaluations.length === 27, `${evaluations.length} trouvée(s)`)

/** Toutes les feuilles textuelles d'une valeur, à toute profondeur. */
function feuilles(v: unknown, out: string[] = [], prof = 0): string[] {
  if (prof > 12) return out
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    out.push(String(v))
    return out
  }
  if (Array.isArray(v)) {
    for (const e of v) feuilles(e, out, prof + 1)
    return out
  }
  if (!v || typeof v !== "object") return out
  for (const [cle, val] of Object.entries(v as Record<string, unknown>)) {
    // La CLÉ compte aussi : une référence de cellule attendue (`"C11"`) est une
    // clé, et un nom de champ de tableau croisé également.
    out.push(cle)
    feuilles(val, out, prof + 1)
  }
  return out
}

/**
 * Ce qu'une étape déclare et que le navigateur ne doit PAS recevoir.
 *
 * La définition n'est pas une liste écrite à la main — elle se déduit de la
 * projection elle-même : est secret tout ce que porte l'action d'origine et que
 * `actionPublique` ne reconduit pas. Écrire la liste à part la ferait diverger
 * de la règle qu'elle est censée contrôler, et c'est exactement le piège dans
 * lequel l'ancienne expurgation était tombée.
 */
function secretsDuScenario(scenario: unknown): string[] {
  const out: string[] = []
  const steps = (scenario as { steps?: unknown[] })?.steps
  for (const step of Array.isArray(steps) ? steps : []) {
    const s = step as { action?: unknown; aide?: unknown; montrer?: unknown; feedback?: unknown }
    const projection = JSON.stringify(actionPublique(s.action))
    for (const feuille of feuilles(s.action)) {
      if (!projection.includes(JSON.stringify(feuille).slice(1, -1))) out.push(feuille)
    }
    // `aide` et `feedback` ne sont reconduits nulle part : tout leur contenu est
    // secret par construction.
    for (const cle of ["aide", "feedback"] as const) {
      if (s[cle] !== undefined) out.push(...feuilles(s[cle]))
    }
  }
  return out
}

let fuitesTotales = 0
let secretsControles = 0
let secretsExclusifs = 0
let secretsAussiPublics = 0
const exemplesPublics: string[] = []

for (const fichier of evaluations) {
  const brut = JSON.parse(fs.readFileSync(path.join(SCENARIOS, fichier), "utf8"))
  const servi = expurgerScenarioNote(brut)
  const secrets = secretsDuScenario(brut)
  const corpusPublic = corpusPublicDuScenario(brut)
  secretsControles += secrets.length

  /* CLASSIFICATION — c'est le cœur de ce contrôle.
   *
   * Une chaîne déclarée dans un attendu peut être PUBLIQUE : « Montant » est
   * le champ attendu d'un tableau croisé ET l'en-tête d'une colonne du
   * classeur de départ ; « Histogramme » est le type de graphique attendu ET
   * le mot de la consigne. Exiger leur absence reviendrait à exiger que
   * l'apprenant ne voie plus son propre classeur — et ferait passer pour une
   * fuite ce qui est du contenu.
   *
   * Ne sont donc des SECRETS que les chaînes introuvables dans le corpus
   * public : formules acceptées, valeurs de résultat, plages à nommer. Ce sont
   * elles, et elles seules, qui doivent être absentes du scénario servi. */
  const exclusifs = secrets.filter((s) => {
    const a = String(s ?? "").trim()
    if (a.length < 6) return false
    return !corpusPublic.includes(JSON.stringify(a).slice(1, -1))
  })
  const publics = secrets.filter((s) => {
    const a = String(s ?? "").trim()
    return a.length >= 6 && corpusPublic.includes(JSON.stringify(a).slice(1, -1))
  })
  secretsExclusifs += exclusifs.length
  secretsAussiPublics += publics.length
  for (const p of publics.slice(0, 2)) if (exemplesPublics.length < 6) exemplesPublics.push(`${fichier}:${p.slice(0, 28)}`)

  const fuites = chercherFuites(servi, secrets, corpusPublic)
  if (fuites.length) fuitesTotales += fuites.length
  verifie(`E1 · ${fichier} : aucune réponse dans le scénario servi`, fuites.length === 0, fuites.slice(0, 4).join(" ; "))

  // E1' — le contrôle ci-dessus ne vaut que s'il a réellement quelque chose à
  // chercher : une évaluation dont tous les attendus seraient « publics »
  // rendrait E1 vert pour une mauvaise raison.
  verifie(
    `E1' · ${fichier} : des réponses distinctives ont bien été confrontées`,
    exclusifs.length > 0,
    `${secrets.length} chaîne(s) d'attendu, aucune distinctive`,
  )

  // Contrôle direct, indépendant du détecteur : plus aucune étape ne porte les
  // champs qui contiennent une réponse.
  const etapes = (servi.steps ?? []) as Array<Record<string, unknown>>
  const restes: string[] = []
  for (const e of etapes) {
    const a = (e.action ?? {}) as Record<string, unknown>
    for (const cle of ["accept", "aide", "feedback", "chart", "pageSetup", "poste", "expect", "values", "ascending", "column2"]) {
      if (a[cle] !== undefined) restes.push(`${e.id}.action.${cle}`)
    }
    if (e.aide !== undefined) restes.push(`${e.id}.aide`)
    if (a.type === "DEFINE_NAME" && a.ref !== undefined) restes.push(`${e.id}.action.ref`)
    if (a.type === "SORT_RANGE" && a.column !== undefined) restes.push(`${e.id}.action.column`)
    // Les tables de cellules ne gardent QUE leurs références : toute valeur
    // résiduelle est une réponse.
    // Les tables de cellules attendues ne partent plus du tout.
    if (a.cells !== undefined) restes.push(`${e.id}.action.cells`)
    if ((a.pivot as Record<string, unknown>)?.cells !== undefined) restes.push(`${e.id}.action.pivot.cells`)
    if ((a.macro as Record<string, unknown>)?.effet !== undefined) restes.push(`${e.id}.action.macro.effet`)
  }
  verifie(`E2 · ${fichier} : aucun champ d'attendu résiduel`, restes.length === 0, restes.slice(0, 5).join(", "))

  // Le bloc de remédiation ne part jamais pendant l'épreuve : lire « m10-l02 »
  // dans l'onglet réseau désignerait la notion d'une question non encore lue.
  verifie(`E3 · ${fichier} : le bloc remediation est retiré`, (servi as Record<string, unknown>).remediation === undefined)
  verifie(
    `E3' · ${fichier} : aucune trace du mot remediation`,
    !JSON.stringify(servi).includes("remediation"),
  )

  // Le nombre d'étapes, leur ordre et leur barème ne bougent pas : le score en
  // dépend, et le journal est recalé dessus.
  const brutSteps = (brut.steps ?? []) as Array<Record<string, unknown>>
  verifie(`E4 · ${fichier} : toutes les étapes sont servies`, etapes.length === brutSteps.length)
  verifie(
    `E5 · ${fichier} : identifiants et barèmes intacts`,
    etapes.every((e, i) => e.id === brutSteps[i].id && (e.points ?? undefined) === (brutSteps[i].points ?? undefined)),
  )
  verifie(
    `E6 · ${fichier} : les consignes sont intactes`,
    etapes.every((e, i) => e.consigne === brutSteps[i].consigne),
  )
}

console.log(
  `  ${secretsControles} chaînes d'attendu classées · ${secretsExclusifs} secrètes (absentes du corpus public, donc exigées absentes du scénario servi)` +
    ` · ${secretsAussiPublics} déjà visibles ailleurs, donc non exigibles`,
)
if (exemplesPublics.length) console.log(`  déjà visibles, exemples : ${exemplesPublics.join(", ")}`)
console.log(`  ${fuitesTotales} fuite(s)`)

/* ═══ F. L'expurgation elle-même ═════════════════════════════════════════ */

console.log(`\n=== F. Règles d'expurgation ===`)
{
  // F1 — profondeur : une clé secrète enfouie est retirée elle aussi.
  const profond = retirerClesSecretes({ a: { b: [{ c: { accept: ["=SOMME(A1)"] } }] } }) as any
  verifie("F1 · une clé secrète en profondeur est retirée", profond.a.b[0].c.accept === undefined)
  verifie("F1' · le reste de la structure survit", profond.a.b.length === 1)

  // F2 — le balayage attrape ce que la projection ne connaît pas : un type
  // d'action ajouté demain sans passer par `actionPublique`.
  const inconnu = expurgerScenarioNote({
    steps: [{ id: "X", consigne: "c", action: { type: "TYPE_FUTUR", accept: ["=A1"], cible: "B2" } }],
  }) as any
  verifie("F2 · un type inconnu ne garde que son type", JSON.stringify(inconnu.steps[0].action) === '{"type":"TYPE_FUTUR"}')

  // F3 — un champ ajouté à un type CONNU ne passe pas non plus : la projection
  // est une liste blanche, pas une liste noire.
  const ajoute = actionPublique({ type: "TYPE", target: "D3", accept: ["=A1"], indice: "commence par SI" }) as any
  verifie("F3 · un champ non listé d'un type connu est abandonné", ajoute.indice === undefined)
  verifie("F3' · les champs listés restent", ajoute.target === "D3")
  verifie("F3'' · accept ne passe jamais", ajoute.accept === undefined)

  // F4 — `aide` et `montrer` : la démonstration d'un énoncé reste, celle d'une
  // question notée disparaît (elle rejouerait le geste attendu).
  const aides = expurgerScenarioNote({
    steps: [
      { id: "R", consigne: "c", action: { type: "READ" }, montrer: [{ type: "MONTRER", cible: "C1", texte: "ici" }], aide: { text: "indice" } },
      { id: "Q", consigne: "c", action: { type: "TYPE", target: "D3", accept: ["=A1"] }, montrer: [{ type: "TYPE", target: "D3", accept: ["=A1"] }], aide: { text: "indice" } },
    ],
  }) as any
  verifie("F4 · la démonstration d'un énoncé est conservée", Array.isArray(aides.steps[0].montrer))
  verifie("F4' · celle d'une question notée est retirée", aides.steps[1].montrer === undefined)
  verifie("F4'' · aucune aide ne part", aides.steps.every((s: any) => s.aide === undefined))

  // F4''' — fail-closed : un seul geste qui n'est pas un `MONTRER` pur, et
  // TOUTE la démonstration de l'énoncé est abandonnée. Une démonstration
  // amputée laisserait croire à l'apprenant qu'il a tout vu.
  const impure = expurgerScenarioNote({
    steps: [
      {
        id: "R", consigne: "c", action: { type: "READ" },
        montrer: [
          { type: "MONTRER", cible: "C1", texte: "ici" },
          { type: "TYPE", target: "D3", accept: ["=A1"] },
        ],
      },
    ],
  }) as any
  verifie("F4''' · un geste non-MONTRER emporte toute la démonstration", impure.steps[0].montrer === undefined)
  const avecEcriture = expurgerScenarioNote({
    steps: [
      {
        id: "R", consigne: "c", action: { type: "READ" },
        montrer: [{ type: "MONTRER", cible: "C1", texte: "ici", ecrire: { cell: "D3", valeur: "42" } }],
      },
    ],
  }) as any
  verifie("F4'''' · un MONTRER qui ÉCRIT emporte toute la démonstration", avecEcriture.steps[0].montrer === undefined)

  // F4''''' — et le corpus réel, lui, garde bien ses 26 énoncés démontrés :
  // le fail-closed ne doit pas avoir tout emporté au passage.
  let enoncesDemontres = 0
  for (const f of evaluations) {
    const s = expurgerScenarioNote(JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))) as any
    enoncesDemontres += (s.steps as any[]).filter((e) => Array.isArray(e.montrer) && e.montrer.length).length
  }
  verifie("F4''''' · les 26 énoncés démontrés du corpus sont conservés", enoncesDemontres === 26, `${enoncesDemontres}`)

  // F5 — les tables de cellules attendues ne partent plus DU TOUT : leurs
  // références disaient où le résultat était attendu, ce que la consigne ne dit
  // pas toujours. L'atelier relève la zone utile, le serveur y prélève.
  const etat = actionPublique({ type: "EXPECT_STATE", cells: { D3: { f: "=SOMME(A1:A9)" }, D4: { v: 42 } } }) as any
  verifie("F5 · aucune référence de cellule attendue ne part", etat.cells === undefined)
  verifie("F5' · le type d'étape, lui, reste", etat.type === "EXPECT_STATE")

  // F6 — pivot et macro : rien de leur attendu ne part.
  const pivot = actionPublique({ type: "EXPECT_PIVOT", pivot: { rows: ["Région"], values: [{ name: "Montant" }], cells: { H4: { v: 1200 } } } }) as any
  verifie("F6 · le tableau croisé attendu ne part pas", pivot.pivot === undefined)
  const macro = actionPublique({ type: "EXPECT_MACRO", macro: { name: "Mise_en_forme", contains: ['Range("B4")'], effet: { B4: { v: 7 } } } }) as any
  verifie("F7 · les fragments de code attendus partent", macro.macro.contains === undefined)
  verifie("F7' · l'effet attendu ne part pas", macro.macro.effet === undefined)

  // F8 — les attendus purement structurels disparaissent en entier.
  for (const [type, champ] of [["EXPECT_CHART", "chart"], ["EXPECT_PAGE_SETUP", "pageSetup"], ["EXPECT_POSTE", "poste"]] as const) {
    const a = actionPublique({ type, [champ]: { quelquechose: 1 } }) as any
    verifie(`F8 · ${type} ne sert que son type`, JSON.stringify(a) === JSON.stringify({ type }))
  }

  // F9 — une structure circulaire ne fait pas tomber la route.
  const boucle: Record<string, unknown> = { a: 1 }
  boucle.moi = boucle
  let survecu = true
  try {
    retirerClesSecretes(boucle)
  } catch {
    survecu = false
  }
  verifie("F9 · une structure circulaire est bornée, pas fatale", survecu)
}

/* ═══ G. Ce qui doit SURVIVRE à l'expurgation ════════════════════════════ */

console.log(`\n=== G. L'évaluation reste jouable ===`)
{
  // Sans ces champs-là, l'atelier ne sait plus quelle cellule verrouiller, quoi
  // relire, ni quoi afficher : l'évaluation devient injouable. C'est le pendant
  // exact des contrôles E — l'expurgation doit être stricte, pas aveugle.
  let manques: string[] = []
  for (const fichier of evaluations) {
    const brut = JSON.parse(fs.readFileSync(path.join(SCENARIOS, fichier), "utf8"))
    const servi = expurgerScenarioNote(brut) as any
    const etapes = servi.steps as Array<Record<string, any>>
    const brutSteps = brut.steps as Array<Record<string, any>>
    etapes.forEach((e, i) => {
      const ab = brutSteps[i].action
      const a = e.action
      // La cible d'une saisie ne reste que si la consigne la nomme.
      if (ab.type === "TYPE" && a.target !== undefined && a.target !== ab.target) manques.push(`${e.id}: target`)
      // Les références de cellules attendues ne sont PLUS servies : l'atelier
      // relève la zone utile et le serveur y prélève ce qu'il attend. Ce qui
      // doit rester, c'est le TYPE d'étape, sans lequel l'atelier ne saurait
      // pas quelle observation produire.
      if (ab.type === "EXPECT_STATE" || ab.type === "EXPECT_FORMAT") {
        if (a.type !== ab.type) manques.push(`${e.id}: type d'étape`)
        if (a.cells !== undefined) manques.push(`${e.id}: cells servies`)
      }
      if (ab.type === "CLICK_CONTROL" && a.control !== undefined && a.control !== ab.control) manques.push(`${e.id}: control`)
      if (ab.type === "SORT_RANGE" && a.range !== undefined && a.range !== ab.range) manques.push(`${e.id}: range de tri`)
      if (ab.type === "EXPECT_PIVOT" && a.pivot !== undefined) manques.push(`${e.id}: pivot servi`)
      if (ab.type === "EXPECT_MACRO" && (a.macro as any)?.effet !== undefined) manques.push(`${e.id}: effet de macro`)
    })
  }
  verifie("G1 · tout ce dont l'atelier a besoin est conservé", manques.length === 0, manques.slice(0, 6).join(" ; "))

  // G2 — le classeur de départ n'est pas une réponse : il doit partir entier,
  // sinon l'apprenant démarre devant une feuille vide.
  const brut = JSON.parse(fs.readFileSync(path.join(SCENARIOS, "m10-ev01.json"), "utf8"))
  const servi = expurgerScenarioNote(brut) as any
  verifie("G2 · le classeur de départ est servi", JSON.stringify(servi.workbook) === JSON.stringify(brut.workbook))
  verifie("G3 · le ruban est servi", JSON.stringify(servi.ribbon) === JSON.stringify(brut.ribbon))
  verifie("G4 · le titre et l'intro sont servis", servi.title === brut.title && JSON.stringify(servi.intro) === JSON.stringify(brut.intro))
}

/* ═══ H. Chemins interdits, injectés dans une évaluation RÉELLE ══════════ */

console.log(`\n=== H. Chemins interdits ===`)
{
  // On ne se contente pas de constater que le corpus actuel est propre : on
  // pose soi-même une réponse à chacun des endroits où quelqu'un pourrait la
  // mettre demain, dans un scénario réel, et on vérifie qu'elle ne ressort pas.
  const MARQUEUR = "REPONSE-SECRETE-A-NE-JAMAIS-SERVIR-42"
  const brut = JSON.parse(fs.readFileSync(path.join(SCENARIOS, "m10-ev01.json"), "utf8"))

  const chemins: Array<[string, (s: any) => void]> = [
    ["action.accept", (s) => { s.steps[1].action.accept = [MARQUEUR] }],
    ["action.cells[].f", (s) => { s.steps[1].action = { type: "EXPECT_STATE", cells: { D3: { f: MARQUEUR } } } }],
    ["action.cells[].anyOf", (s) => { s.steps[1].action = { type: "EXPECT_STATE", cells: { D3: { anyOf: [MARQUEUR] } } } }],
    ["action.cells[].v", (s) => { s.steps[1].action = { type: "EXPECT_STATE", cells: { D3: { v: MARQUEUR } } } }],
    ["étape.aide.text", (s) => { s.steps[1].aide = { text: MARQUEUR, showTarget: true } }],
    ["étape.feedback", (s) => { s.steps[1].feedback = MARQUEUR }],
    ["étape.expected", (s) => { s.steps[1].expected = MARQUEUR }],
    ["étape.solution", (s) => { s.steps[1].solution = { formule: MARQUEUR } }],
    ["étape.attendu (imbriqué)", (s) => { s.steps[1].setup = { ...s.steps[1].setup, bloc: { attendu: MARQUEUR } } }],
    ["action.hint imbriqué", (s) => { s.steps[1].action.divers = { profond: { hint: MARQUEUR } } }],
    ["montrer d'une étape notée", (s) => { s.steps[1].montrer = [{ type: "TYPE", target: "D3", accept: [MARQUEUR] }] }],
    ["montrer d'un énoncé (écrire)", (s) => { s.steps[0].montrer = [{ type: "MONTRER", cible: "C1", texte: "ok", ecrire: { cell: "D3", valeur: MARQUEUR } }] }],
    ["pivot.values[].name", (s) => { s.steps[1].action = { type: "EXPECT_PIVOT", pivot: { values: [{ name: MARQUEUR }], cells: { H4: { v: 1 } } } } }],
    ["macro.contains", (s) => { s.steps[1].action = { type: "EXPECT_MACRO", macro: { name: "M", contains: [MARQUEUR] } } }],
    ["chart.title", (s) => { s.steps[1].action = { type: "EXPECT_CHART", chart: { title: MARQUEUR } } }],
    ["pageSetup", (s) => { s.steps[1].action = { type: "EXPECT_PAGE_SETUP", pageSetup: { entete: MARQUEUR } } }],
    ["poste.classeur", (s) => { s.steps[1].action = { type: "EXPECT_POSTE", poste: { classeur: MARQUEUR } } }],
    ["DEFINE_NAME.ref", (s) => { s.steps[1].action = { type: "DEFINE_NAME", name: "Tarifs", ref: MARQUEUR } }],
    ["FILTER_COLUMN.values", (s) => { s.steps[1].action = { type: "FILTER_COLUMN", column: "C", values: [MARQUEUR] } }],
    ["SORT_RANGE.column", (s) => { s.steps[1].action = { type: "SORT_RANGE", range: "A2:E13", column: MARQUEUR, ascending: false } }],
    ["remediation du scénario", (s) => { s.remediation = { competences: [{ id: "x", titre: MARQUEUR, revoir: ["m10-l01"] }], parEtape: { "M10-EV01-02": "x" } } }],
    ["remediation dans une étape", (s) => { s.steps[1].remediation = { note: MARQUEUR } }],
  ]

  for (const [nom, poser] of chemins) {
    const copie = JSON.parse(JSON.stringify(brut))
    poser(copie)
    const servi = JSON.stringify(expurgerScenarioNote(copie))
    verifie(`H · ${nom} ne ressort pas`, !servi.includes(MARQUEUR))
  }

  // Contre-épreuve : sans expurgation, ces mêmes marqueurs SORTENT. Sans elle,
  // les vingt-deux contrôles ci-dessus passeraient tout aussi bien sur une
  // fonction qui ne fait rien.
  let sortentSansExpurgation = 0
  for (const [, poser] of chemins) {
    const copie = JSON.parse(JSON.stringify(brut))
    poser(copie)
    if (JSON.stringify(copie).includes(MARQUEUR)) sortentSansExpurgation++
  }
  verifie(
    "H' · contre-épreuve : tous ces chemins fuiraient sans expurgation",
    sortentSansExpurgation === chemins.length,
    `${sortentSansExpurgation}/${chemins.length}`,
  )
}

/* ═══ I. Les phrases de l'atelier survivent, sans changer ailleurs ═══════ */

console.log(`\n=== I. Critère et carte de franchissement ===`)
{
  /* `resumerAttendu` (« Attendu : … ») et `resumerFait` (la carte d'étape
   * franchie) lisent l'action. Privées des champs expurgés, elles écrivaient
   * « sur la colonne undefined » ou levaient une exception. Elles ont donc reçu
   * des replis — et il faut prouver deux choses OPPOSÉES :
   *
   *   1. hors évaluation, RIEN ne change : tous les champs sont là, chaque
   *      repli est inatteignable, la formulation est exactement l'ancienne ;
   *   2. en évaluation, plus aucune exception ni « undefined » à l'écran.
   */
  const REPLIS = [
    "le filtre demandé",
    "l'enregistreur de macros utilisé",
    "Le tableau est trié.",
    "Le filtre est posé.",
  ]

  const tousScenarios = fs.readdirSync(SCENARIOS).filter((f) => f.endsWith(".json")).sort()
  const nonEvaluations = tousScenarios.filter((f) => !/-ev\d{2}\.json$/i.test(f))
  let repliAtteintHorsEvaluation: string[] = []
  let phrasesControlees = 0
  for (const f of nonEvaluations) {
    const s = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))
    for (const step of (s.steps ?? []) as any[]) {
      phrasesControlees += 2
      const a = resumerAttendu(step.action)
      const b = resumerFait(step.action)
      for (const phrase of [a, b]) {
        if (phrase && REPLIS.includes(phrase)) repliAtteintHorsEvaluation.push(`${f}/${step.id}: ${phrase}`)
        // Le repli du tri ne se distingue pas par une phrase entière : il se
        // reconnaît à l'absence de « sur la colonne » là où le scénario en
        // déclare une.
        if (step.action?.type === "SORT_RANGE" && step.action.column && phrase && !phrase.includes("colonne")) {
          repliAtteintHorsEvaluation.push(`${f}/${step.id}: tri sans colonne`)
        }
      }
    }
  }
  verifie(
    `I1 · aucun repli n'est atteint sur les ${nonEvaluations.length} leçons et exercices`,
    repliAtteintHorsEvaluation.length === 0,
    repliAtteintHorsEvaluation.slice(0, 4).join(" ; "),
  )
  console.log(`  ${phrasesControlees} phrases de leçon/exercice inchangées`)

  // I2 — sur les évaluations expurgées : ni exception, ni « undefined » affiché.
  const accidents: string[] = []
  for (const f of evaluations) {
    const servi = expurgerScenarioNote(JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))) as any
    for (const step of servi.steps as any[]) {
      for (const nom of ["resumerAttendu", "resumerFait"] as const) {
        try {
          const phrase = nom === "resumerAttendu" ? resumerAttendu(step.action) : resumerFait(step.action)
          if (phrase && /undefined|NaN|\[object/.test(phrase)) accidents.push(`${f}/${step.id}: « ${phrase} »`)
        } catch (e) {
          accidents.push(`${f}/${step.id}: ${nom} a levé ${(e as Error).message}`)
        }
      }
      try {
        natureEtape(step.action, "EVALUATION")
      } catch (e) {
        accidents.push(`${f}/${step.id}: natureEtape a levé ${(e as Error).message}`)
      }
    }
  }
  verifie("I2 · aucune phrase cassée sur les 27 évaluations expurgées", accidents.length === 0, accidents.slice(0, 4).join(" ; "))

  // I3 — le seul changement VOLONTAIRE : la colonne d'un tri n'est plus
  // annoncée pendant une évaluation notée. C'est la réponse à « appliquez le
  // premier des deux tris » ; l'afficher revenait à la souffler.
  const m19 = expurgerScenarioNote(JSON.parse(fs.readFileSync(path.join(SCENARIOS, "m19-ev01.json"), "utf8"))) as any
  const tris = (m19.steps as any[]).filter((e) => e.action.type === "SORT_RANGE")
  verifie("I3 · le corpus contient bien des tris notés", tris.length > 0)
  verifie(
    "I3' · la colonne de tri n'est plus annoncée en évaluation",
    tris.every((e) => !(resumerAttendu(e.action) ?? "").includes("colonne")),
  )
}

/* ═══ J. AUCUNE COORDONNÉE QUE LA CONSIGNE NE DONNE PAS ══════════════════
 *
 * Une coordonnée peut ÊTRE la réponse : « trouvez la ligne en trop » servie avec
 * `row: 7`, « placez-vous sur la cellule fautive » servie avec `cell: "E6"`.
 * Mesure avant correction : 187 cibles servies sur 353 n'étaient nommées nulle
 * part dans leur consigne.
 *
 * La règle est donc : une coordonnée ne part qu'à la condition que la consigne
 * de SON étape la nomme. Ce contrôle la vérifie champ par champ sur tout le
 * corpus, et porte les contre-épreuves des quatre cas signalés. */

console.log(`\n=== J. Coordonnées servies ===`)
{
  const COORDONNEES = ["cell", "range", "row", "column", "ref", "target", "name", "to", "from", "element", "control"]

  let servies = 0
  let retirees = 0
  const muettes: string[] = []
  const tablesRestantes: string[] = []

  for (const fichier of evaluations) {
    const brut = JSON.parse(fs.readFileSync(path.join(SCENARIOS, fichier), "utf8"))
    const servi = expurgerScenarioNote(brut) as any
    const brutSteps = brut.steps as any[]

    ;(servi.steps as any[]).forEach((e, i) => {
      const a = e.action ?? {}
      const ab = brutSteps[i].action ?? {}
      const consigne: string = brutSteps[i].consigne ?? ""

      for (const champ of COORDONNEES) {
        if (ab[champ] !== undefined && a[champ] === undefined) retirees++
        const v = a[champ]
        if (v === undefined || typeof v === "object") continue
        servies++
        const cherche = champ === "control" ? (LIBELLE_CONTROLE[String(v)] ?? String(v)) : String(v)
        if (!consigneNommeLaCible(consigne, cherche)) muettes.push(`${e.id}.${champ}=${cherche}`)
      }

      // Les tables de cellules attendues ne partent plus DU TOUT : ni valeurs,
      // ni références. Elles disaient où le résultat était attendu.
      if (a.cells !== undefined) tablesRestantes.push(`${e.id}.cells`)
      if (a.pivot && Object.keys(a.pivot).length) tablesRestantes.push(`${e.id}.pivot`)
      if (a.macro && (a.macro as any).effet) tablesRestantes.push(`${e.id}.macro.effet`)
    })
  }

  console.log(`  ${servies} coordonnées servies · ${retirees} retirées · ${muettes.length} muettes`)
  verifie("J1 · aucune coordonnée absente de sa consigne", muettes.length === 0, muettes.slice(0, 6).join(", "))
  verifie("J2 · aucune table de cellules attendues ne part", tablesRestantes.length === 0, tablesRestantes.slice(0, 6).join(", "))
  verifie("J3 · le corpus servait bien des coordonnées muettes avant correction", retirees > 0, `${retirees}`)

  // J4 — CONTRE-ÉPREUVES des cas signalés par la revue. Chacun servait sa
  // réponse ; chacun doit désormais la taire, ET l'affichage doit rester lisible.
  const casSignales: Array<[string, string, string]> = [
    ["m04-ev01", "M04-EV01-03", "row"],
    ["m07-ev01", "M07-EV01-05", "cell"],
    ["m26-ev01", "M26-EV01-06", "range"],
    ["m27-ev01", "M27-EV01-02", "cell"],
  ]
  for (const [fichier, id, champ] of casSignales) {
    const brut = JSON.parse(fs.readFileSync(path.join(SCENARIOS, `${fichier}.json`), "utf8"))
    const avant = (brut.steps as any[]).find((e) => e.id === id)
    const apres = (expurgerScenarioNote(brut) as any).steps.find((e: any) => e.id === id)
    verifie(`J4a · ${id} : le corpus porte bien la cible`, avant?.action?.[champ] !== undefined)
    verifie(`J4b · ${id} : elle n'est plus servie`, apres?.action?.[champ] === undefined)
    const phrase = resumerAttendu(apres.action) ?? ""
    verifie(`J4c · ${id} : la phrase affichée reste propre`, !/undefined|NaN|\[object/.test(phrase), phrase)
    verifie(`J4d · ${id} : et ne cite pas la cible`, !phrase.includes(String(avant.action[champ])), phrase)
  }

  // J5 — ce que la consigne NOMME reste servi : l'expurgation doit être stricte,
  // pas aveugle. Sans cela l'atelier perdrait des cibles dont il a besoin.
  const m10 = JSON.parse(fs.readFileSync(path.join(SCENARIOS, "m10-ev01.json"), "utf8"))
  const m10servi = expurgerScenarioNote(m10) as any
  const etape2 = m10servi.steps.find((e: any) => e.id === "M10-EV01-02")
  verifie("J5a · une cible nommée dans la consigne reste servie", etape2?.action?.target === "D3")
  verifie("J5b · et sa réponse ne part toujours pas", etape2?.action?.accept === undefined)
}

/* ═══ Verdict ════════════════════════════════════════════════════════════ */

console.log(`\n${echecs === 0 ? "✓" : "✗"} ${total - echecs}/${total} contrôles passés`)
if (echecs > 0) process.exit(1)
