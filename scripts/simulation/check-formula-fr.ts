/**
 * Vérification du traducteur de formules français ↔ moteur.
 *
 * Le LMS n'a pas de lanceur de tests, et en ajouter un pour ce seul fichier
 * changerait les dépendances et le build Railway. Ce script est donc autonome :
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/simulation/check-formula-fr.ts
 * `scripts/` est exclu du tsconfig, il n'entre donc jamais dans le build Next.
 *
 * Ce qui est vérifié ici n'est pas cosmétique : une erreur de traduction donne un
 * résultat de calcul FAUX sans message d'erreur. C'est le pire défaut possible
 * dans un exercice noté, d'où les cas volontairement tordus.
 */

import {
  frToEngine,
  engineToFr,
  errorToFr,
  englishNameOf,
  isKnownFrenchFunction,
  frenchFunctionNames,
} from "../../lib/simulation/formula-fr"

let pass = 0
const failures: string[] = []

function eq(label: string, got: string, expected: string) {
  if (got === expected) {
    pass++
  } else {
    failures.push(`${label}\n    obtenu   : ${got}\n    attendu  : ${expected}`)
  }
}

/** Aller-retour : ce que l'apprenant tape doit revenir identique à l'affichage. */
function roundTrip(label: string, fr: string, engine: string) {
  eq(`${label} · FR→moteur`, frToEngine(fr), engine)
  eq(`${label} · moteur→FR`, engineToFr(engine), fr)
}

/* ── 1. Le cas qui a motivé tout ce fichier ───────────────────────────────── */
roundTrip("NB.SI avec point-virgule", '=NB.SI(A1:A5;">10")', '=COUNTIF(A1:A5,">10")')
roundTrip("SOMME.SI", '=SOMME.SI(A1:A5;">10")', '=SUMIF(A1:A5,">10")')
roundTrip("NB.SI.ENS", '=NB.SI.ENS(A1:A5;">10")', '=COUNTIFS(A1:A5,">10")')

/* ── 2. Virgule décimale française vs virgule séparatrice ─────────────────── */
roundTrip("VPM décimales + arguments", "=VPM(0,05/12;60;-10000)", "=PMT(0.05/12,60,-10000)")
roundTrip("décimale seule", "=ARRONDI(3,14159;2)", "=ROUND(3.14159,2)")
roundTrip("décimale sans zéro initial", "=SOMME(,5;1,5)", "=SUM(.5,1.5)")
roundTrip("notation scientifique", "=SOMME(1,5E+10;2)", "=SUM(1.5E+10,2)")

/* ── 3. Chaînes de caractères : rien ne doit être touché à l'intérieur ────── */
roundTrip(
  "point-virgule DANS une chaîne",
  '=SI(A1>10;"oui; peut-être";"non")',
  '=IF(A1>10,"oui; peut-être","non")',
)
roundTrip(
  "virgule DANS une chaîne",
  '=SI(A1>10;"un, deux";"trois")',
  '=IF(A1>10,"un, deux","trois")',
)
roundTrip(
  "guillemets échappés",
  '=SI(A1=1;"il dit ""bonjour""";"")',
  '=IF(A1=1,"il dit ""bonjour""","")',
)
roundTrip(
  "nom de fonction DANS une chaîne",
  '=SI(A1=1;"utilise SOMME(x)";"")',
  '=IF(A1=1,"utilise SOMME(x)","")',
)
roundTrip("chaîne vide", '=SI(A1;"";"x")', '=IF(A1,"","x")')

/* ── 4. Noms de feuille ───────────────────────────────────────────────────── */
roundTrip("feuille quotée avec espace", "=SOMME('Mon budget'!A1:A5)", "=SUM('Mon budget'!A1:A5)")
roundTrip("feuille non quotée", "=SOMME(Feuil2!A1:A5)", "=SUM(Feuil2!A1:A5)")
eq(
  "feuille quotée contenant un point-virgule",
  frToEngine("=SOMME('Ventes; Nord'!A1)"),
  "=SUM('Ventes; Nord'!A1)",
)

/* ── 5. Noms définis : ne JAMAIS les traduire ─────────────────────────────── */
// `TVA` n'est pas suivi d'une parenthèse : c'est un nom défini, pas une fonction.
roundTrip("nom défini simple", "=B3*TVA", "=B3*TVA")
// Piège : un nom défini qui porte le nom d'une fonction. Sans parenthèse → intact.
eq("nom défini homonyme d'une fonction", frToEngine("=SOMME(MOYENNE)"), "=SUM(MOYENNE)")
// Références absolues et mixtes.
roundTrip("références absolues", "=B3*$C$1", "=B3*$C$1")
roundTrip("référence mixte", "=SOMME(A$1:A5)", "=SUM(A$1:A5)")

/* ── 6. Imbrication et fonctions longues ──────────────────────────────────── */
roundTrip(
  "SI imbriqué",
  '=SI(A1>10;SI(A1>20;"haut";"moyen");"bas")',
  '=IF(A1>10,IF(A1>20,"haut","moyen"),"bas")',
)
roundTrip(
  "RECHERCHEV complet",
  "=RECHERCHEV(A2;Tarifs!$A$2:$C$50;3;FAUX)",
  "=VLOOKUP(A2,Tarifs!$A$2:$C$50,3,FALSE)",
)
roundTrip(
  "SI.ERREUR + RECHERCHEV",
  '=SI.ERREUR(RECHERCHEV(A2;B:C;2;FAUX);"introuvable")',
  '=IFERROR(VLOOKUP(A2,B:C,2,FALSE),"introuvable")',
)
roundTrip("plages disjointes", "=SOMME(A1:A5;C1:C5)", "=SUM(A1:A5,C1:C5)")
roundTrip("constantes logiques", "=SI(VRAI;1;0)", "=IF(TRUE,1,0)")

/* ── 7. Casse et espaces ──────────────────────────────────────────────────── */
eq("minuscules acceptées", frToEngine("=somme(a1:a5)"), "=SUM(a1:a5)")
eq("casse mixte", frToEngine("=Nb.Si(A1:A5;1)"), "=COUNTIF(A1:A5,1)")
eq("espace avant parenthèse", frToEngine("=SOMME (A1:A5)"), "=SUM (A1:A5)")

/* ── 8. Habitude anglo-saxonne tolérée ────────────────────────────────────── */
// Un apprenant qui tape la virgule par réflexe ne doit pas voir sa formule cassée.
eq("virgule séparatrice tolérée", frToEngine('=NB.SI(A1:A5,">10")'), '=COUNTIF(A1:A5,">10")')

/* ── 9. Entrées dégénérées ────────────────────────────────────────────────── */
eq("chaîne vide", frToEngine(""), "")
eq("texte sans formule", frToEngine("Bonjour"), "Bonjour")
eq("nombre seul", frToEngine("12,5"), "12.5")
eq("formule incomplète en cours de saisie", frToEngine("=SOMME(A1;"), "=SUM(A1,")
eq("guillemet non fermé", frToEngine('=SI(A1;"abc'), '=IF(A1,"abc')

/* ── 10. Erreurs affichées ────────────────────────────────────────────────── */
eq("erreur nom", errorToFr("#NAME?"), "#NOM?")
eq("erreur valeur", errorToFr("#VALUE!"), "#VALEUR!")
eq("erreur division", errorToFr("#DIV/0!"), "#DIV/0!")
eq("erreur inconnue laissée intacte", errorToFr("#SPILL!"), "#SPILL!")

/* ── 11. Table de fonctions ───────────────────────────────────────────────── */
eq("équivalent anglais", englishNameOf("moyenne") ?? "", "AVERAGE")
eq("fonction hors périmètre", String(englishNameOf("FONCTION_BIDON")), "null")
eq("fonction connue", String(isKnownFrenchFunction("NB.JOURS.OUVRES")), "true")

const names = frenchFunctionNames()
if (names.length < 100) failures.push(`Table trop courte : ${names.length} fonctions`)
else pass++

// Aucun doublon d'équivalent anglais qui masquerait une fonction française.
const seen = new Map<string, string>()
let collisions = 0
for (const fr of names) {
  const en = englishNameOf(fr)!
  if (seen.has(en) && engineToFr(`=${en}()`) !== `=${seen.get(en)}()`) collisions++
  if (!seen.has(en)) seen.set(en, fr)
}
if (collisions > 0) failures.push(`${collisions} collision(s) d'affichage inverse`)
else pass++

/* ── Rapport ──────────────────────────────────────────────────────────────── */
console.log(`\n${pass} vérification(s) réussie(s), ${failures.length} échec(s)`)
console.log(`Table : ${names.length} fonctions françaises couvertes.`)
if (failures.length) {
  console.log("\n=== ÉCHECS ===")
  for (const f of failures) console.log("  ✗ " + f)
  process.exit(1)
}
console.log("Traducteur de formules conforme.\n")
