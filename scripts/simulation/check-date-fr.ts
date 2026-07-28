/**
 * Contrôle du convertisseur de dates et d'heures françaises.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs","noImplicitAny":false}' \
 *     scripts/simulation/check-date-fr.ts
 *
 * Les numéros de série attendus ont été établis contre le moteur lui-même : il rend
 * 46207 pour « 07/04/2026 », c'est-à-dire le 4 juillet — lecture américaine. Le
 * 7 avril vaut 46119, et c'est celui-là qu'un contenu français doit obtenir.
 */
import {
  serialDepuisDateFr,
  fractionDepuisHeureFr,
  lireDateOuHeureFr,
  dateFrDepuisSerial,
} from "../../lib/simulation/date-fr"

let reussies = 0
const echecs: string[] = []
const eq = (titre: string, obtenu: unknown, attendu: unknown) => {
  if (JSON.stringify(obtenu) === JSON.stringify(attendu)) reussies++
  else echecs.push(`${titre} : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`)
}

/* Lecture française, là où le moteur lisait à l'américaine. */
eq("7 avril 2026", serialDepuisDateFr("07/04/2026"), 46119)
eq("7 avril, jour non paddé", serialDepuisDateFr("7/4/2026"), 46119)
eq("12 mai 2026", serialDepuisDateFr("12/05/2026"), 46154)
eq("3 janvier 2026", serialDepuisDateFr("03/01/2026"), 46025)
eq("séparateur tiret", serialDepuisDateFr("07-04-2026"), 46119)
eq("séparateur point", serialDepuisDateFr("07.04.2026"), 46119)

/* Le jour au-delà de 12 prouve l'ordre : aucune lecture américaine n'est possible. */
eq("21 avril 2026", serialDepuisDateFr("21/04/2026"), 46133)
eq("31 décembre 2026", serialDepuisDateFr("31/12/2026"), 46387)

/* Année sur deux chiffres, règle d'Excel. */
eq("16/3/26 → 2026", serialDepuisDateFr("16/3/26"), 46097)
eq("16/3/98 → 1998", serialDepuisDateFr("16/3/98"), 35870)
eq("année omise", serialDepuisDateFr("15/03", 2026), 46096)

/* Refus des saisies fautives : une date inexistante ne doit pas glisser. */
eq("31 février refusé", serialDepuisDateFr("31/02/2026"), null)
eq("mois 13 refusé", serialDepuisDateFr("01/13/2026"), null)
eq("29 février 2026 refusé", serialDepuisDateFr("29/02/2026"), null)
eq("29 février 2024 accepté", serialDepuisDateFr("29/02/2024"), 45351)
eq("texte quelconque", serialDepuisDateFr("bonjour"), null)
eq("nombre seul", serialDepuisDateFr("42"), null)
eq("avant mars 1900 refusé", serialDepuisDateFr("15/01/1900"), null)

/* Heures. */
eq("08:30", fractionDepuisHeureFr("08:30"), 0.3541666666666667)
eq("8:30 sans zéro", fractionDepuisHeureFr("8:30"), 0.3541666666666667)
eq("15:45", fractionDepuisHeureFr("15:45"), 0.65625)
eq("minuit", fractionDepuisHeureFr("00:00"), 0)
eq("avec secondes", fractionDepuisHeureFr("08:30:15"), (8 * 3600 + 30 * 60 + 15) / 86400)
eq("minutes invalides", fractionDepuisHeureFr("08:75"), null)
eq("heure hors bornes", fractionDepuisHeureFr("25:00"), null)

/* Point d'entrée unique. */
eq("date reconnue", lireDateOuHeureFr("07/04/2026"), { genre: "date", valeur: 46119, format: "dd/mm/yyyy" })
eq("heure reconnue", lireDateOuHeureFr("08:30"), { genre: "heure", valeur: 0.3541666666666667, format: "hh:mm" })
eq("heure avec secondes", lireDateOuHeureFr("08:30:15"), {
  genre: "heure",
  valeur: (8 * 3600 + 30 * 60 + 15) / 86400,
  format: "hh:mm:ss",
})
eq("ni date ni heure", lireDateOuHeureFr("Dupont"), null)

/* Aller-retour. */
eq("retour 46119", dateFrDepuisSerial(46119), "07/04/2026")
eq("retour 46025", dateFrDepuisSerial(46025), "03/01/2026")
for (const t of ["01/01/2026", "29/02/2024", "31/12/1999", "15/08/2030"]) {
  eq(`aller-retour ${t}`, dateFrDepuisSerial(serialDepuisDateFr(t)!), t)
}

console.log(`\n${reussies} vérification(s) réussie(s), ${echecs.length} échec(s)`)
if (echecs.length) {
  console.log("\n=== ÉCHECS ===")
  for (const e of echecs) console.log("  ✗ " + e)
  process.exit(1)
}
console.log("Lecture française des dates et des heures conforme.\n")
