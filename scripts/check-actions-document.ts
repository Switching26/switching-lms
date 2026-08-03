/**
 * Contrôle des deux actions d'un document — player classique ET simulateur.
 *
 *   npx tsx scripts/check-actions-document.ts
 *
 * Ce contrôle lit les SOURCES. C'est volontaire : les propriétés protégées ici
 * ne se voient ni au typage ni à l'exécution d'un composant isolé.
 *
 * Ce que l'on protège :
 *  1. MUTUALISATION RÉELLE — les deux players consomment le même composant.
 *     Sans cela, une correction faite d'un côté laisse l'autre en arrière, ce
 *     qui est exactement ce que la refonte devait supprimer.
 *  2. PLUS AUCUN BOUTON TEXTE « Télécharger » dans ces surfaces.
 *  3. LIENS TOUJOURS NORMALISÉS — jamais un `fileUrl` brut dans un `href` :
 *     `/api/files/<nom>` est la seule route qui vérifie session, inscription et
 *     expiration.
 *  4. AUCUNE ACTION DE TÉLÉCHARGEMENT DANS LA VISIONNEUSE — elle sert la
 *     consultation, le téléchargement reste la flèche de la ligne.
 *  5. CIBLE TACTILE ET LIBELLÉS — 44 px, `aria-label` et `title` sur les deux
 *     boutons, sinon une commande sans texte est inutilisable.
 *
 * Ce qu'il NE voit PAS, et qu'il faut donc vérifier au navigateur : le rendu
 * réel, le focus rendu à la fermeture, et le fait que la visionneuse s'affiche
 * au-dessus de l'atelier.
 */

import { readFileSync } from "fs"
import { join } from "path"

const RACINE = process.cwd()
const PARTAGE = "components/learner/DocumentActions.tsx"
const VISIONNEUSE = "components/learner/PdfViewer.tsx"
const CLASSIQUE = "app/learner/formation/player.tsx"
const SIMULATEUR = "components/simulation/PanneauRessources.tsx"

let echecs = 0
let total = 0

function lire(chemin: string): string {
  return readFileSync(join(RACINE, chemin), "utf8")
}

function exiger(intitule: string, condition: boolean, detail = "") {
  total++
  if (!condition) {
    echecs++
    console.log(`  ✗ ${intitule}${detail ? ` — ${detail}` : ""}`)
  }
}

const partage = lire(PARTAGE)
const visionneuse = lire(VISIONNEUSE)
const classique = lire(CLASSIQUE)
const simulateur = lire(SIMULATEUR)

/* ── 1. Mutualisation réelle ───────────────────────────────────────────── */

const consommateurs = [
  { nom: "player classique", source: classique },
  { nom: "cockpit du simulateur", source: simulateur },
]

for (const c of consommateurs) {
  exiger(
    `${c.nom} : consomme le composant partagé`,
    c.source.includes('from "@/components/learner/DocumentActions"'),
  )
  exiger(
    `${c.nom} : monte la visionneuse partagée`,
    c.source.includes('from "@/components/learner/PdfViewer"') && c.source.includes("<PdfViewer"),
  )
}

/* ── 2. Plus aucun bouton texte « Télécharger » ────────────────────────── */

for (const c of consommateurs) {
  // On cherche le mot rendu comme CONTENU d'un élément, pas dans un
  // commentaire ni dans un `aria-label` (où il est au contraire obligatoire).
  const contenuRendu = c.source.match(/>\s*Télécharger\s*</g) || []
  exiger(
    `${c.nom} : aucun bouton texte « Télécharger »`,
    contenuRendu.length === 0,
    `${contenuRendu.length} occurrence(s) rendue(s)`,
  )
}

/* ── 3. Aucun lien de fichier non normalisé ────────────────────────────── */

for (const c of consommateurs.concat([{ nom: "composant partagé", source: partage }])) {
  exiger(
    `${c.nom} : pas de href sur un fileUrl brut`,
    !/href=\{[^}]*\.fileUrl\s*\}/.test(c.source),
  )
  exiger(
    `${c.nom} : pas de chemin /uploads/ écrit en dur`,
    !/["'`]\/uploads\//.test(c.source),
  )
}

// Le composant partagé et la visionneuse passent bien par la normalisation.
exiger("composant partagé : normalise via toApiFileUrl", partage.includes("toApiFileUrl(doc.fileUrl)"))
exiger("visionneuse : normalise via toApiFileUrl", visionneuse.includes("toApiFileUrl(doc.fileUrl)"))

/* ── 4. La visionneuse ne propose aucun téléchargement ─────────────────── */

// `\b…\b` et non `download[=\s}]` : un attribut booléen s'écrit aussi
// `<a href download>`, que la première écriture laissait passer (vu au piège).
exiger("visionneuse : aucun attribut download", !/\bdownload\b/.test(visionneuse))
exiger("visionneuse : aucune ancre", !/<a[\s>]/.test(visionneuse))
exiger(
  "visionneuse : aucun bouton texte « Télécharger »",
  (visionneuse.match(/>\s*Télécharger\s*</g) || []).length === 0,
)
exiger("visionneuse : le document reste visible", visionneuse.includes("<iframe"))

/* ── 5. Cible tactile, libellés, ordre des actions ─────────────────────── */

exiger("composant partagé : cible tactile 44 px", partage.includes("h-11 w-11"))
exiger("composant partagé : libellé sur les deux actions", (partage.match(/aria-label=/g) || []).length >= 3)
exiger("composant partagé : infobulle desktop", (partage.match(/\btitle=/g) || []).length >= 3)
exiger(
  "composant partagé : les libellés nomment le document",
  partage.includes("libelleConsulter(nom)") && partage.includes("libelleTelecharger(nom)"),
)
exiger("visionneuse : bouton de fermeture nommé", visionneuse.includes('aria-label="Fermer la visionneuse"'))
exiger("visionneuse : cible tactile 44 px", visionneuse.includes("h-11 w-11"))

// L'ordre validé est œil PUIS flèche : consulter d'abord, télécharger ensuite.
const posConsulter = partage.indexOf('data-action="consulter"')
const posTelecharger = partage.indexOf('data-action="telecharger"')
exiger("ordre œil puis flèche", posConsulter > 0 && posTelecharger > posConsulter)

/* ── 6. Non-régression du player classique ─────────────────────────────── */

// Le piège 0a : l'hôte Vimeo ne doit JAMAIS être démonté ni keyé.
exiger("player classique : hôte Vimeo toujours monté", classique.includes("<VimeoPlayer"))
exiger(
  "player classique : aucune clé sur l'hôte Vimeo",
  !/<VimeoPlayer[^>]*\bkey=/.test(classique),
)
// Les capacités classiques restent en place.
const capacites = [
  ["quiz", "<ExerciseBlock"],
  ["prise de notes", "<ChapterNotes"],
  ["atelier de simulation", "<SimulationChapter"],
  ["verrou de visionnage", "watchGate"],
  ["suivi du temps", "timeDeltaSeconds"],
] as const
for (const [libelle, marqueur] of capacites) {
  exiger(`player classique : ${libelle} préservé`, classique.includes(marqueur))
}

/* ── 7. Le piège qui produit un débordement horizontal ─────────────────── */

// Une colonne de grille ne descend PAS sous le contenu de ses enfants tant que
// `min-width` vaut `auto` : sans `min-w-0`, un nom de document long pousserait
// toute la page à droite sur téléphone. Le player le porte déjà — c'est ce qui
// le protège, et il ne faut pas le perdre.
exiger("player classique : colonne de contenu en min-w-0", /className="[^"]*\bmin-w-0\b/.test(classique))
// Et dans la ligne partagée, c'est l'identité qui doit pouvoir rétrécir,
// jamais les actions (elles sont `flex-shrink-0`).
exiger("ligne partagée : l'identité peut rétrécir", partage.includes("min-w-0"))
exiger("ligne partagée : les actions ne rétrécissent pas", partage.includes("flex-shrink-0"))
exiger("ligne partagée : le nom est tronqué, pas débordant", partage.includes("truncate"))

console.log(`\nActions document — ${total} vérifications, ${echecs} échec(s)`)
if (echecs) process.exitCode = 1
else console.log("✓ un seul composant pour les deux players, liens protégés, visionneuse sans téléchargement.")
