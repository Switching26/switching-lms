/**
 * Contrôle de la règle « cet atelier demande-t-il un plus grand écran ? ».
 *
 *   npx tsx scripts/simulation/check-acces-ecran.ts
 *
 * Ce que l'on protège, dans les deux sens :
 *
 *  1. Un téléphone ne doit JAMAIS ouvrir un atelier — ni tenu droit, ni couché,
 *     ce second cas étant celui qu'une règle sur la seule largeur laisse
 *     passer.
 *  2. Une tablette et un ordinateur doivent TOUJOURS l'ouvrir. Un blocage à
 *     tort est le défaut le plus coûteux : il empêche de travailler quelqu'un
 *     qui le pouvait, et rien à l'écran ne lui dit pourquoi.
 *
 * Les hauteurs de ce fichier sont des hauteurs UTILES, navigation déjà
 * retirée — c'est ce que la sonde mesure réellement.
 */

import {
  verdictEcranAtelier,
  LARGEUR_MINI_ATELIER,
  HAUTEUR_MINI_ATELIER,
} from "@/lib/simulation/acces-ecran"

type Cas = {
  nom: string
  largeur: number
  hauteur: number
  suffisant: boolean
  raison?: "largeur" | "hauteur" | null
}

const cas: Cas[] = [
  /* ── Téléphones : bloqués, quelle que soit l'orientation ──────────── */
  { nom: "iPhone SE, droit", largeur: 375, hauteur: 603, suffisant: false, raison: "largeur" },
  { nom: "iPhone 15, droit", largeur: 390, hauteur: 780, suffisant: false, raison: "largeur" },
  { nom: "iPhone 15 Pro Max, droit", largeur: 430, hauteur: 868, suffisant: false, raison: "largeur" },
  { nom: "Samsung Galaxy, droit", largeur: 412, hauteur: 851, suffisant: false, raison: "largeur" },
  // Couché, la largeur suffit : seule la hauteur les arrête. C'est LE cas que
  // la première version de la règle laissait passer.
  { nom: "iPhone 15, couché", largeur: 844, hauteur: 326, suffisant: false, raison: "hauteur" },
  { nom: "iPhone 15 Pro Max, couché", largeur: 932, hauteur: 366, suffisant: false, raison: "hauteur" },
  { nom: "Samsung Galaxy, couché", largeur: 915, hauteur: 348, suffisant: false, raison: "hauteur" },

  /* ── Tablettes : ouvertes, dans les deux sens ─────────────────────── */
  { nom: "iPad, portrait", largeur: 768, hauteur: 960, suffisant: true },
  { nom: "iPad, paysage", largeur: 1024, hauteur: 704, suffisant: true },
  { nom: "iPad Pro 11, portrait", largeur: 834, hauteur: 1130, suffisant: true },
  { nom: "iPad Pro 12,9, paysage", largeur: 1366, hauteur: 960, suffisant: true },
  // iPad paysage AVEC la bannière d'usurpation : il reste au-dessus du seuil.
  { nom: "iPad paysage + bannière d'usurpation", largeur: 1024, hauteur: 664, suffisant: true },

  /* ── Ordinateurs ──────────────────────────────────────────────────── */
  { nom: "portable 1366×768", largeur: 1366, hauteur: 704, suffisant: true },
  { nom: "1440×900", largeur: 1440, hauteur: 836, suffisant: true },
  { nom: "fenêtre réduite à 800", largeur: 800, hauteur: 700, suffisant: true },

  /* ── Frontières exactes ───────────────────────────────────────────── */
  { nom: "largeur pile au seuil", largeur: LARGEUR_MINI_ATELIER, hauteur: 800, suffisant: true },
  { nom: "largeur un pixel sous", largeur: LARGEUR_MINI_ATELIER - 1, hauteur: 800, suffisant: false, raison: "largeur" },
  { nom: "hauteur pile au seuil", largeur: 1024, hauteur: HAUTEUR_MINI_ATELIER, suffisant: true },
  { nom: "hauteur un pixel sous", largeur: 1024, hauteur: HAUTEUR_MINI_ATELIER - 1, suffisant: false, raison: "hauteur" },
  // Les deux manquent : c'est la largeur qui est nommée, elle guide le message.
  { nom: "les deux insuffisants", largeur: 400, hauteur: 400, suffisant: false, raison: "largeur" },

  /* ── En cas de doute, on laisse passer ────────────────────────────── */
  { nom: "zone pas encore mesurée", largeur: 0, hauteur: 0, suffisant: true },
  { nom: "élément en display:none", largeur: 0, hauteur: 900, suffisant: true },
  { nom: "hauteur non mesurée", largeur: 1440, hauteur: 0, suffisant: true },
  { nom: "mesure négative", largeur: -1, hauteur: -1, suffisant: true },
  { nom: "mesure non finie", largeur: Number.NaN, hauteur: 900, suffisant: true },
  { nom: "mesure infinie", largeur: Number.POSITIVE_INFINITY, hauteur: 900, suffisant: true },
]

let echecs = 0
for (const c of cas) {
  const obtenu = verdictEcranAtelier({ largeur: c.largeur, hauteur: c.hauteur })
  const raisonAttendue = c.suffisant ? null : c.raison ?? null
  const ok = obtenu.suffisant === c.suffisant && obtenu.raison === raisonAttendue
  if (!ok) {
    echecs++
    console.log(
      `  ✗ ${c.nom} (${c.largeur}×${c.hauteur}) → ` +
        `${obtenu.suffisant ? "ouvert" : `bloqué/${obtenu.raison}`}, ` +
        `attendu ${c.suffisant ? "ouvert" : `bloqué/${raisonAttendue}`}`,
    )
  }
}

/*
 * Un contrôle qui ne peut pas rougir ne protège rien : on vérifie que les deux
 * seuils MORDENT réellement, et qu'ils n'ont pas été mis à zéro par mégarde.
 */
if (LARGEUR_MINI_ATELIER < 768) {
  echecs++
  console.log(`  ✗ seuil de largeur descendu à ${LARGEUR_MINI_ATELIER} : un iPad portrait ne serait plus la référence`)
}
if (HAUTEUR_MINI_ATELIER <= 0) {
  echecs++
  console.log(`  ✗ seuil de hauteur à ${HAUTEUR_MINI_ATELIER} : un téléphone couché repasserait`)
}

console.log(`\nAccès à l'atelier par la taille d'écran — ${cas.length} vérifications, ${echecs} échec(s)`)
if (echecs) process.exitCode = 1
else console.log("✓ téléphones bloqués droits ET couchés, tablettes et ordinateurs ouverts, doute = ouvert.")
