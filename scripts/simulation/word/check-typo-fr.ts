/**
 * Contrôle de la typographie française — module pur, donc vérifiable sans
 * navigateur, en quelques millisecondes.
 *
 * Même rôle que `check-formula-fr.ts` et `check-date-fr.ts` côté Excel : la
 * logique délicate se vérifie hors du bruit du rendu. Une erreur de
 * transformation ici produirait un texte faux SILENCIEUSEMENT.
 *
 * ⚠️ CE CONTRÔLE EST PIÉGÉ. Un détecteur qu'on n'a pas piégé ne prouve rien :
 * la moitié basse du fichier vérifie qu'il REFUSE ce qu'il doit refuser, pas
 * seulement qu'il accepte ce qu'il doit accepter. Sans cette moitié, une
 * fonction qui rendrait toujours « tout va bien » passerait au vert.
 *
 * USAGE
 *   npx tsx scripts/simulation/word/check-typo-fr.ts
 */

import {
  INSECABLE,
  corrigerFrappe,
  defautsTypographiques,
  estTypographieFrancaise,
  franciser,
  normaliserTypographie,
} from "../../../lib/simulation/word/typo-fr"

let echecs = 0
let total = 0

function verifie(intitule: string, obtenu: unknown, attendu: unknown) {
  total++
  const a = JSON.stringify(obtenu)
  const b = JSON.stringify(attendu)
  if (a !== b) {
    echecs++
    console.log(`  ✗ ${intitule}\n      obtenu  ${a}\n      attendu ${b}`)
  }
}

/** Rend les caractères invisibles lisibles dans un message d'échec. */
function lisible(s: string): string {
  return s.replace(/ /g, "⍽").replace(/\r/g, "⏎")
}

console.log("── franciser : ce que l'apprenant obtient réellement ──")

verifie(
  "guillemets ouvrants et fermants",
  lisible(franciser('Il a dit "bonjour" puis rien.')),
  "Il a dit «⍽bonjour⍽» puis rien.",
)
verifie("deux-points", lisible(franciser("Voici : la liste")), "Voici⍽: la liste")
verifie("espace ordinaire remplacée", lisible(franciser("oui !")), "oui⍽!")
verifie("sans espace devant", lisible(franciser("oui!")), "oui⍽!")
verifie("point-virgule", lisible(franciser("un ; deux")), "un⍽; deux")
verifie("point d'interrogation", lisible(franciser("quoi ?")), "quoi⍽?")
verifie(
  "les quatre signes d'un coup",
  lisible(franciser("oui : non ; peut-être ! vraiment ?")),
  "oui⍽: non⍽; peut-être⍽! vraiment⍽?",
)
verifie("guillemet en tête de texte", lisible(franciser('"Bonjour"')), "«⍽Bonjour⍽»")
verifie(
  "guillemet après parenthèse ouvrante",
  lisible(franciser('(voir "ici")')),
  "(voir «⍽ici⍽»)",
)
verifie("suite de signes", lisible(franciser("Quoi ?!")), "Quoi⍽?!")
verifie("signe en tête de paragraphe", lisible(franciser("? seul")), "? seul")
verifie(
  "insécable déjà posée, ne pas doubler",
  lisible(franciser(`déjà${INSECABLE}!`)),
  "déjà⍽!",
)
verifie("le point ordinaire ne bouge pas", franciser("Fin."), "Fin.")
verifie("la virgule ne bouge pas", franciser("un, deux"), "un, deux")
verifie(
  "apostrophe puis guillemet : le guillemet ouvre",
  lisible(franciser(`l'"essai"`)),
  "l'«⍽essai⍽»",
)

console.log("── corrigerFrappe : la frappe caractère par caractère ──")

verifie("ouvrant", corrigerFrappe("Il a dit ", '"'), {
  inserer: "«" + INSECABLE,
  supprimerAvant: 0,
})
verifie("fermant", corrigerFrappe("Il a dit « bonjour", '"'), {
  inserer: INSECABLE + "»",
  supprimerAvant: 0,
})
// Word OUVRE une citation après une espace : `bonjour "` commence une nouvelle
// citation, il ne ferme pas la précédente. Ma première attente disait l'inverse
// et supposait une absorption d'espace — le contrôle a montré que la branche
// correspondante était morte, elle a été retirée du module.
verifie("guillemet après une espace : il OUVRE", corrigerFrappe("bonjour ", '"'), {
  inserer: "\u00ab" + INSECABLE,
  supprimerAvant: 0,
})
verifie("point d'exclamation après espace", corrigerFrappe("oui ", "!"), {
  inserer: INSECABLE + "!",
  supprimerAvant: 1,
})
verifie("lettre ordinaire", corrigerFrappe("bonjou", "r"), { inserer: "r", supprimerAvant: 0 })

console.log("── normaliserTypographie : la tolérance des étapes qui n'enseignent pas la typographie ──")

verifie(
  "insécables et guillemets ramenés à une forme comparable",
  normaliserTypographie(franciser('Il a dit "oui" !')),
  'Il a dit "oui"!',
)
verifie(
  "une saisie naïve et une saisie francisée deviennent comparables",
  normaliserTypographie(franciser('Il a dit "oui" !')) === normaliserTypographie('Il a dit "oui" !'),
  true,
)

console.log("── PIÈGES : le contrôle doit REFUSER ──")

// 1. Un guillemet droit resté dans le texte.
verifie("guillemet droit repéré", defautsTypographiques('Il a dit "oui"').length, 2)
verifie("… et le texte est déclaré fautif", estTypographieFrancaise('Il a dit "oui"'), false)

// 2. Une espace ordinaire devant un point d'exclamation.
verifie("espace ordinaire devant !", defautsTypographiques("oui !").length, 1)
verifie(
  "message parlant",
  defautsTypographiques("oui !")[0].message.includes("insécable"),
  true,
)

// 3. Aucune espace du tout devant les deux-points.
verifie("insécable manquante", defautsTypographiques("Voici: la liste").length, 1)

// 4. Un guillemet français sans son insécable.
verifie("« sans insécable", defautsTypographiques("« oui »").length, 2)

// 5. Ce que `franciser` produit doit être IRRÉPROCHABLE — c'est la propriété
//    centrale : la transformation et la relecture doivent être d'accord. Si
//    elles divergent, l'apprenant serait corrigé sur un texte que le simulateur
//    vient lui-même de produire.
for (const source of [
  'Il a dit "bonjour" puis : oui ! et non ? enfin ; fin',
  '"Rapport annuel" : les chiffres',
  "Quoi ?! Vraiment ?",
  "un ; deux : trois ! quatre ?",
  "(voir \"ici\") et là",
]) {
  const produit = franciser(source)
  verifie(
    `franciser produit un texte irréprochable — ${JSON.stringify(source.slice(0, 28))}`,
    defautsTypographiques(produit).map((d) => d.message),
    [],
  )
}

// 6. Idempotence : franciser deux fois ne doit rien ajouter. Sans cette
//    propriété, une démonstration qui rejoue la saisie doublerait les
//    insécables — et l'étape refuserait sa propre réponse.
for (const source of [
  'Il a dit "bonjour" !',
  "Voici : la liste",
  "Quoi ?",
  '"Titre"',
]) {
  verifie(
    `idempotent — ${JSON.stringify(source)}`,
    lisible(franciser(franciser(source))),
    lisible(franciser(source)),
  )
}

console.log()
if (echecs === 0) {
  console.log(`✓ ${total} vérifications, 0 échec.`)
  process.exit(0)
} else {
  console.log(`✗ ${echecs} échec(s) sur ${total} vérifications.`)
  process.exit(1)
}
