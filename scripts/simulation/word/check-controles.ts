/**
 * Contrôle des boutons du ruban Word — les DEUX sens.
 *
 * POURQUOI IL EXISTE. Dans ce simulateur, tout identifiant finit par émettre une
 * observation `control` : un bouton qui ne ferait RIEN validerait donc l'étape
 * tout en laissant l'apprenant devant un écran inchangé. Côté Excel, neuf
 * boutons trompaient ainsi l'apprenant, et aucun des contrôles existants ne
 * pouvait les voir — c'est structurel, pas accidentel.
 *
 * Trois propriétés, chacune correspondant à un défaut réel constaté ailleurs :
 *
 *  1. tout bouton RENDU par `WordChrome` a une commande dans `WordSurface`, ou
 *     figure explicitement parmi les décoratifs AVEC SA RAISON ÉCRITE ;
 *  2. tout bouton CITÉ par un scénario est réellement rendu — un bouton absent
 *     bloque l'apprenant sans message ;
 *  3. tout bouton rendu a un libellé français dans l'adaptateur : sans lui, la
 *     ligne « Attendu : … » affiche « un clic sur le bouton indiqué », une
 *     tautologie qui n'apprend rien.
 *
 * CE QU'IL NE PROUVE PAS, et qu'il faut dire : qu'une commande a réellement un
 * EFFET dans le moteur. Cela se mesure au navigateur, en cliquant et en
 * REGARDANT — c'est le rôle du joueur du banc.
 *
 * USAGE
 *   npx tsx scripts/simulation/word/check-controles.ts
 */

import * as fs from "fs"
import * as path from "path"
import { LIBELLES_CONTROLES_WORD } from "../../../lib/simulation/word/adaptateur"

const RACINE = path.join(__dirname, "..", "..", "..")
const CHROME = path.join(RACINE, "components", "simulation", "word", "WordChrome.tsx")
/**
 * ⚠️ LE RUBAN EST DÉCLARÉ AILLEURS QU'IL N'EST DESSINÉ.
 *
 * Onglets, groupes et boutons vivent dans `lib/simulation/word/ruban.ts` depuis
 * le 06/08/2026 : la démonstration doit savoir sous quel onglet vit un bouton
 * pour l'ouvrir avant de le désigner, et le contrôle qui le vérifie tourne sans
 * React. Lire le seul `WordChrome.tsx` ferait passer les 45 boutons du ruban
 * pour « non rendus » — 104 fausses anomalies, mesurées au déplacement.
 */
const RUBAN = path.join(RACINE, "lib", "simulation", "word", "ruban.ts")
const SURFACE = path.join(RACINE, "components", "simulation", "word", "WordSurface.tsx")
/**
 * Les surfaces MAISON, hors ruban : chacune rend ses propres `data-control`.
 *
 * Toute nouvelle surface doit être ajoutée ICI en même temps qu'elle est
 * écrite, sinon ses boutons passent pour des libellés orphelins et le contrôle
 * crie au loup — un détecteur qui crie au loup finit par ne plus être lu.
 */
const PANNEAUX = [
  "WordPageLayout.tsx",
  "WordHeaderFooter.tsx",
  "WordPrintPreview.tsx",
  "WordRuler.tsx",
  "WordProofing.tsx",
  "WordImagePicker.tsx",
  "WordLinkDialog.tsx",
].map((f) => path.join(RACINE, "components", "simulation", "word", f))
const SCENARIOS = path.join(RACINE, "scripts", "simulation", "scenarios", "word")

/**
 * Boutons volontairement sans commande de moteur, chacun avec sa raison.
 *
 * La raison n'est pas décorative : sans elle, un agent suivant lit la liste
 * comme une autorisation générale d'ajouter des boutons inertes.
 */
const DECORATIFS: Record<string, string> = {
  "w-copier": "presse-papiers : géré par le player, pas par le moteur",
  "w-couper": "presse-papiers : géré par le player, pas par le moteur",
  "w-coller": "presse-papiers : géré par le player, pas par le moteur",
  "w-inserer-tableau": "ouvre notre boîte de dialogue, qui exécute ensuite create-table",
  "w-mise-en-page":
    "ouvre le panneau de mise en page du player (le moteur n'a AUCUNE commande de marges et muter son modèle ne repeint pas)",
  "w-orientation-portrait": "bouton du panneau « Mise en page »",
  "w-orientation-paysage": "bouton du panneau « Mise en page »",
  "w-marges-normales": "bouton du panneau « Mise en page »",
  "w-marges-etroites": "bouton du panneau « Mise en page »",
  "w-marges-larges": "bouton du panneau « Mise en page »",
  "w-marge-haut": "champ du panneau « Mise en page »",
  "w-marge-bas": "champ du panneau « Mise en page »",
  "w-marge-gauche": "champ du panneau « Mise en page »",
  "w-marge-droite": "champ du panneau « Mise en page »",
  "w-mise-en-page-fermer": "bouton du panneau « Mise en page »",
  "w-entete-zone": "champ du panneau « En-tête et pied de page »",
  "w-pied-zone": "champ du panneau « En-tête et pied de page »",
  "w-filigrane-zone": "champ du panneau « En-tête et pied de page »",
  "w-numero-page": "case du panneau « En-tête et pied de page »",
  "w-entete-fermer": "bouton du panneau « En-tête et pied de page »",
  "w-print-copies": "champ de l'écran « Imprimer »",
  "w-print-plage-tout": "bouton de l'écran « Imprimer »",
  "w-print-plage-courante": "bouton de l'écran « Imprimer »",
  "w-print-plage-selection": "bouton de l'écran « Imprimer »",
  "w-print-rectoverso": "case de l'écran « Imprimer »",
  "w-print-zoom-plus": "bouton de l'écran « Imprimer »",
  "w-print-zoom-moins": "bouton de l'écran « Imprimer »",
  "w-print-fermer": "bouton de l'écran « Imprimer »",
  "w-taquet-type": "sélecteur de type, sur la règle",
  "w-verif-orthographe": "onglet du panneau « Vérification »",
  "w-verif-synonymes": "onglet du panneau « Vérification »",
  "w-verif-fermer": "bouton du panneau « Vérification »",
  "w-verification": "ouvre le panneau « Vérification », géré par le player",
  "w-inserer-image": "ouvre la galerie d'images, gérée par le player",
  "w-image-fermer": "bouton de la galerie d'images",
  "w-inserer-lien": "ouvre la boîte de lien, gérée par le player",
  "w-lien-adresse": "champ de la boîte « Insérer un lien »",
  "w-lien-valider": "bouton de la boîte « Insérer un lien »",
  "w-lien-fermer": "bouton de la boîte « Insérer un lien »",
  "w-entete-pied": "ouvre le panneau « En-tête et pied de page », géré par le player",
  "w-imprimer": "ouvre l'écran « Imprimer », géré par le player",
  "w-regle": "affiche ou masque la règle, géré par le player",
  "w-tableau-lignes": "champ de la boîte « Insérer un tableau »",
  "w-tableau-colonnes": "champ de la boîte « Insérer un tableau »",
  "w-tableau-annuler": "bouton de la boîte « Insérer un tableau »",
  "w-tableau-ok": "bouton de la boîte « Insérer un tableau »",
}

function lire(f: string): string {
  return fs.readFileSync(f, "utf8")
}

/** Les `data-control` réellement rendus, extraits du source du ruban. */
function controlesRendus(): string[] {
  // Les panneaux maison rendent leurs propres contrôles, hors du ruban.
  const src =
    lire(CHROME) + lire(RUBAN) + PANNEAUX.filter((f) => fs.existsSync(f)).map(lire).join("\n")
  const ids = new Set<string>()
  // ⚠️ Ne prendre QUE les identifiants de boutons : les onglets portent aussi
  // un champ `id`, et les compter les faisait passer pour des boutons inertes.
  // Le contrôle signalait trois anomalies qui n'existaient pas — un détecteur
  // qui crie au loup finit par ne plus être lu.
  for (const m of src.matchAll(/\bid:\s*"(w-[^"]+)"/g)) ids.add(m[1])
  for (const m of src.matchAll(/data-control="(w-[^"{]+)"/g)) ids.add(m[1])
  // ⚠️ Un panneau qui rend ses boutons par une TABLE écrit `data-control={c.controle}` :
  // l'identifiant n'est nulle part en littéral d'attribut, seulement dans la
  // table. Sans ce troisième motif, six boutons parfaitement rendus passaient
  // pour des libellés orphelins.
  for (const m of src.matchAll(/\bcontrole:\s*"(w-[^"]+)"/g)) ids.add(m[1])
  return [...ids]
}

/** Les identifiants qui ont une commande dans la surface. */
function controlesAvecCommande(): Set<string> {
  const src = lire(SURFACE)
  const ids = new Set<string>()
  const bloc = (nom: string) => {
    const i = src.indexOf(`const ${nom}`)
    if (i < 0) return ""
    const j = src.indexOf("\n}", i)
    return src.slice(i, j)
  }
  for (const nom of ["COMMANDE_PAR_CONTROLE", "COMMANDE_AVEC_VALEUR", "HABILLAGE_COMMANDE"]) {
    for (const m of bloc(nom).matchAll(/"([^"]+)":\s*"/g)) ids.add(m[1])
  }
  // Traités par un `if` explicite plutôt que par une table.
  for (const m of src.matchAll(/controle === "([^"]+)"/g)) ids.add(m[1])
  return ids
}

/** Les identifiants cités par les scénarios Word. */
function controlesCites(): { id: string; ou: string }[] {
  if (!fs.existsSync(SCENARIOS)) return []
  const out: { id: string; ou: string }[] = []
  for (const f of fs.readdirSync(SCENARIOS).filter((n) => n.endsWith(".json"))) {
    const sc = JSON.parse(lire(path.join(SCENARIOS, f))) as {
      steps?: { id?: string; action?: { type?: string; controle?: string } }[]
    }
    for (const s of sc.steps ?? []) {
      if (s.action?.type === "W_CLICK_CONTROL" && s.action.controle) {
        out.push({ id: s.action.controle, ou: `${f} · ${s.id}` })
      }
    }
  }
  return out
}

const rendus = controlesRendus()
const avecCommande = controlesAvecCommande()
const cites = controlesCites()
const anomalies: string[] = []

/* 1 — un bouton rendu doit agir, ou être déclaré décoratif AVEC SA RAISON. */
for (const id of rendus) {
  if (avecCommande.has(id)) continue
  if (DECORATIFS[id]) continue
  anomalies.push(
    `bouton rendu sans effet ni raison écrite : « ${id} » — il validerait l'étape sans rien faire`,
  )
}

/* 2 — un bouton cité par un scénario doit être rendu. */
for (const c of cites) {
  if (!rendus.includes(c.id)) {
    anomalies.push(`bouton cité mais absent du ruban : « ${c.id} » (${c.ou}) — étape injouable`)
  }
}

/* 3 — un bouton rendu doit avoir un libellé lisible. */
for (const id of rendus) {
  if (DECORATIFS[id] && (id.startsWith("w-tableau-") || id.startsWith("w-marge") || id.startsWith("w-orientation") || id === "w-mise-en-page-fermer")) continue
  if (!LIBELLES_CONTROLES_WORD[id]) {
    anomalies.push(
      `bouton sans libellé français : « ${id} » — « Attendu : … » afficherait une tautologie`,
    )
  }
}

/* 4 — un contrôle qui EXIGE une valeur doit offrir le moyen de la donner. */
const avecValeurRendus = new Set(
  [...lire(RUBAN).matchAll(/\bid:\s*"(w-[^"]+)",\s*texte:[^}]*valeurs:/g)].map((m) => m[1]),
)
const exigentValeur = (() => {
  const src = lire(SURFACE)
  const i = src.indexOf("const COMMANDE_AVEC_VALEUR")
  const j = src.indexOf("\n}", i)
  return [...src.slice(i, j).matchAll(/"([^"]+)":\s*"/g)].map((m) => m[1])
})()
for (const id of exigentValeur) {
  if (rendus.includes(id) && !avecValeurRendus.has(id)) {
    anomalies.push(
      `bouton « ${id} » exige une valeur mais n'offre aucun moyen de la choisir — inerte au clic`,
    )
  }
}

/* 5 — un libellé déclaré doit désigner quelque chose qui existe encore. */
for (const id of Object.keys(LIBELLES_CONTROLES_WORD)) {
  if (!rendus.includes(id)) {
    anomalies.push(`libellé orphelin : « ${id} » n'est plus rendu par le ruban`)
  }
}

console.log(
  `${rendus.length} bouton(s) rendu(s) · ${avecCommande.size} avec commande · ` +
    `${Object.keys(DECORATIFS).length} décoratif(s) justifié(s) · ${cites.length} cité(s) par un scénario`,
)
const inutilises = rendus.filter((id) => !cites.some((c) => c.id === id))
if (inutilises.length > 0) {
  console.log(`  (${inutilises.length} bouton(s) rendus qu'aucun scénario n'emploie encore)`)
}

if (anomalies.length === 0) {
  console.log("✓ Aucun bouton sans effet, aucun bouton manquant.")
  process.exit(0)
}
for (const a of anomalies) console.log(`  ✗ ${a}`)
console.log(`✗ ${anomalies.length} anomalie(s).`)
process.exit(1)
