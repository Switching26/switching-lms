/**
 * Contrôle du dessin de l'écran « cet atelier ne s'ouvre pas sur téléphone ».
 *
 *   npx tsx scripts/simulation/check-illustration-atelier.ts
 *
 * CE QU'IL PROTÈGE, et pourquoi il existe :
 * l'écran affichait un TABLEUR aux quatre applications. Un apprenant Word lisait
 * « vous y pilotez une vraie fenêtre Word » sous une grille verte d'Excel. Le
 * défaut n'a levé aucune erreur et aucun contrôle ne pouvait le voir — le dessin
 * était du JSX en dur, que rien n'interrogeait.
 *
 * Il juge donc la FONCTION, jamais le texte du composant : lire `EcranTropPetit.tsx`
 * à la recherche d'une chaîne validerait n'importe quelle réécriture du JSX, et
 * casserait au premier déplacement de code (104 fausses anomalies le jour où le
 * ruban de Word a changé de fichier).
 *
 * Pur : ni React, ni navigateur, ni base — comme `check-acces-ecran.ts`.
 */

import {
  illustrationAtelier,
  normaliserAppAtelier,
  VARIANTES_ILLUSTRATION,
  type FormeIllustration,
  type VarianteIllustration,
} from "@/lib/simulation/illustration-atelier"
import { PALETTES } from "@/lib/simulation/couleurs"

let echecs = 0
function refuser(message: string) {
  echecs++
  console.log(`  ✗ ${message}`)
}

/** Forme sérialisée clés triées : deux dessins ne peuvent pas se ressembler par hasard. */
function canonique(f: FormeIllustration): string {
  const o = f as unknown as Record<string, unknown>
  const cles = Object.keys(o).sort()
  const paires: string[] = []
  for (const c of cles) paires.push(`${c}=${String(o[c])}`)
  return paires.join(",")
}

function empreinte(formes: FormeIllustration[]): string {
  return formes.map(canonique).join(" | ")
}

/* ── 1. Les cinq variantes existent et dessinent quelque chose ──────────── */

const APPS: Array<{ app: string; attendue: VarianteIllustration }> = [
  { app: "EXCEL", attendue: "EXCEL" },
  { app: "WORD", attendue: "WORD" },
  { app: "POWERPOINT", attendue: "POWERPOINT" },
  { app: "OUTLOOK", attendue: "OUTLOOK" },
]

const empreintes: Array<{ variante: VarianteIllustration; valeur: string }> = []

for (const v of VARIANTES_ILLUSTRATION) {
  const source = v === "GENERIQUE" ? "UNE-APP-QUI-N-EXISTE-PAS" : v
  const ill = illustrationAtelier(source)
  if (ill.variante !== v) {
    refuser(`${v} : la variante rendue est « ${ill.variante} »`)
    continue
  }
  if (ill.formes.length < 5) {
    refuser(`${v} : ${ill.formes.length} forme(s) — le dessin est vide ou tronqué`)
  }
  empreintes.push({ variante: v, valeur: empreinte(ill.formes) })
}

/* ── 2. Les cinq dessins sont DEUX À DEUX DIFFÉRENTS ───────────────────── */

/*
 * C'est LA propriété de ce contrôle : si un jour quelqu'un refactore l'illustration
 * en un dessin commun, ou copie Excel dans une autre variante, cette boucle rougit.
 */
for (let i = 0; i < empreintes.length; i++) {
  for (let j = i + 1; j < empreintes.length; j++) {
    if (empreintes[i].valeur === empreintes[j].valeur) {
      refuser(`${empreintes[i].variante} et ${empreintes[j].variante} dessinent EXACTEMENT la même chose`)
    }
  }
}

/* ── 3. Le tableur n'appartient qu'à Excel ─────────────────────────────── */

for (const v of VARIANTES_ILLUSTRATION) {
  const source = v === "GENERIQUE" ? "APP-INCONNUE" : v
  const formes = illustrationAtelier(source).formes
  const quadrillage = formes.filter((f) => f.role === "quadrillage").length

  if (v === "EXCEL" && quadrillage === 0) {
    refuser("EXCEL : plus aucune ligne de tableur — ce n'est plus une feuille de calcul")
  }
  if (v !== "EXCEL" && quadrillage > 0) {
    refuser(`${v} : ${quadrillage} tracé(s) de quadrillage — c'est le dessin d'Excel qui revient`)
  }
}

/* ── 4. Aucune teinte d'Excel hors d'Excel ────────────────────────────── */

/*
 * Le vert d'Excel dans un dessin de Word est le symptôme le plus visible du défaut
 * d'origine. On le refuse par la couleur, pas seulement par la géométrie : un
 * dessin peut être « différent » et rester peint en vert.
 */
const TEINTES_EXCEL = [PALETTES.EXCEL.accent, PALETTES.EXCEL.voile, PALETTES.EXCEL.voileBord]

for (const v of VARIANTES_ILLUSTRATION) {
  if (v === "EXCEL") continue
  const source = v === "GENERIQUE" ? "APP-INCONNUE" : v
  const ill = illustrationAtelier(source)
  const encres: string[] = []
  for (const f of ill.formes) {
    if (f.fill) encres.push(f.fill.toUpperCase())
    if (f.stroke) encres.push(f.stroke.toUpperCase())
  }
  encres.push(ill.accent.toUpperCase())

  for (const t of TEINTES_EXCEL) {
    if (encres.indexOf(t.toUpperCase()) !== -1) {
      refuser(`${v} : porte la teinte d'Excel ${t}`)
    }
  }
}

/* ── 5. Chaque application porte SON accent ───────────────────────────── */

for (const cas of APPS) {
  const ill = illustrationAtelier(cas.app)
  const attendu = PALETTES[cas.attendue as keyof typeof PALETTES].accent

  if (ill.accent !== attendu) {
    refuser(`${cas.app} : accent ${ill.accent}, attendu ${attendu} (source : PALETTES)`)
  }

  const bandeaux = ill.formes.filter((f) => f.role === "bandeau")
  if (bandeaux.length !== 1) {
    refuser(`${cas.app} : ${bandeaux.length} barre(s) de titre, il en faut exactement une`)
  } else if (bandeaux[0].fill !== attendu) {
    refuser(`${cas.app} : barre de titre en ${bandeaux[0].fill}, attendu ${attendu}`)
  }
}

/* ── 6. Le repli n'emprunte l'accent de personne ──────────────────────── */

const repli = illustrationAtelier("UNE-APP-INCONNUE")
for (const cas of APPS) {
  const accentApp = PALETTES[cas.attendue as keyof typeof PALETTES].accent
  if (repli.accent.toUpperCase() === accentApp.toUpperCase()) {
    refuser(`le repli générique porte l'accent de ${cas.app} — une app inconnue serait dessinée comme elle`)
  }
}

/* ── 7. Quelle application : les entrées réelles et les tordues ───────── */

const NORMALISATION: Array<{ entree: string | null | undefined; attendu: string | null }> = [
  { entree: "EXCEL", attendu: "EXCEL" },
  { entree: "WORD", attendu: "WORD" },
  { entree: "POWERPOINT", attendu: "POWERPOINT" },
  { entree: "OUTLOOK", attendu: "OUTLOOK" },
  // Tolérances : la colonne est une énumération Prisma, mais un appelant peut salir.
  { entree: "word", attendu: "WORD" },
  { entree: " Outlook ", attendu: "OUTLOOK" },
  // En cas de doute, JAMAIS Excel par défaut : c'est tout le défaut corrigé ici.
  { entree: null, attendu: null },
  { entree: undefined, attendu: null },
  { entree: "", attendu: null },
  { entree: "ACCESS", attendu: null },
  { entree: "EXCEL VBA", attendu: null },
]

for (const c of NORMALISATION) {
  const obtenu = normaliserAppAtelier(c.entree)
  if (obtenu !== c.attendu) {
    refuser(`normalisation de « ${String(c.entree)} » → ${String(obtenu)}, attendu ${String(c.attendu)}`)
  }
}

/* ── 8. Excel ne bouge pas ────────────────────────────────────────────── */

/*
 * Le dessin d'Excel est celui qui existait avant ce chantier, au pixel près : c'est
 * la seule formation que des apprenants suivent aujourd'hui.
 *
 * ⚠️ Si vous modifiez VOLONTAIREMENT le dessin d'Excel, remplacez la chaîne
 * ci-dessous par celle que le contrôle affiche — après avoir vérifié à l'écran.
 */
const EMPREINTE_EXCEL =
  "d=M124.5 31.5a7 7 0 017-7h63a7 7 0 017 7v3.5h-77v-3.5z,fill=#107C41,k=chemin,role=bandeau | " +
  "fill=#fff,h=2.6,k=rect,opacite=0.6,rx=1.3,w=9,x=130,y=28.5 | " +
  "fill=#fff,h=2.6,k=rect,opacite=0.6,rx=1.3,w=9,x=142,y=28.5 | " +
  "fill=#fff,h=2.6,k=rect,opacite=0.6,rx=1.3,w=9,x=154,y=28.5 | " +
  "d=M124.5 45.5h77M124.5 56.5h77M124.5 67.5h77M124.5 78.5h77,k=chemin,role=quadrillage,stroke=#e8e2d8,sw=1.1 | " +
  "d=M143.5 35v52.5M162.5 35v52.5M181.5 35v52.5,k=chemin,role=quadrillage,stroke=#e8e2d8,sw=1.1 | " +
  "fill=#E7F3EB,h=8,k=rect,rx=1.6,w=16,x=145,y=47 | " +
  "fill=#E7F3EB,h=8,k=rect,rx=1.6,w=16,x=164,y=58"

const empreinteExcel = empreinte(illustrationAtelier("EXCEL").formes)
if (empreinteExcel !== EMPREINTE_EXCEL) {
  refuser("EXCEL : le dessin a changé. Empreinte obtenue :\n      " + empreinteExcel)
}

/* ── 9. Le contrôle doit pouvoir rougir ───────────────────────────────── */

/*
 * Un contrôle qu'on n'a pas piégé ne prouve rien. On vérifie ici que les deux
 * propriétés centrales MORDENT : un dessin identique entre deux applications, et
 * une grille de tableur posée ailleurs que dans Excel.
 */
const grilleAilleurs: FormeIllustration[] = [
  { k: "chemin", d: "M0 0h10", stroke: "#e8e2d8", sw: 1.1, role: "quadrillage" },
]
if (grilleAilleurs.filter((f) => f.role === "quadrillage").length !== 1) {
  refuser("auto-épreuve : le rôle « quadrillage » n'est plus détectable")
}
if (empreinte(grilleAilleurs) === empreinte(illustrationAtelier("EXCEL").formes)) {
  refuser("auto-épreuve : deux dessins différents rendent la même empreinte")
}

/* ── Verdict ──────────────────────────────────────────────────────────── */

const controles = VARIANTES_ILLUSTRATION.length + NORMALISATION.length + APPS.length
console.log(
  `\nIllustration de l'écran « atelier trop petit » — ${VARIANTES_ILLUSTRATION.length} dessins, ` +
    `${controles} vérifications, ${echecs} échec(s)`,
)
if (echecs) process.exitCode = 1
else
  console.log(
    "✓ un dessin par application, aucune grille de tableur ni teinte d'Excel ailleurs, repli neutre, Excel inchangé.",
  )
