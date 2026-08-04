/**
 * Mesure de COUVERTURE de la formation PowerPoint — décisions D16/D17.
 *
 * Une formation se déclare complète en MESURANT, jamais en estimant. Ce contrôle
 * répond à deux questions, chiffres à l'appui :
 *
 *  1. Combien de contrôles la surface rend-elle, et pour chacun : est-il pressé
 *     par un apprenant qui joue le corpus, seulement CITÉ par une consigne, ou
 *     JAMAIS enseigné ?
 *  2. Quelles cibles de jugement (les types d'action observables) sont
 *     employées, et lesquelles ne le sont pas.
 *
 * Un bouton rendu que rien n'enseigne est une promesse morte, exactement comme
 * un bouton cité qui n'existe pas. Le premier ne se voit qu'en mesurant.
 *
 * D'OÙ VIENT LA MESURE DES BOUTONS PRESSÉS — et pourquoi pas du produit.
 *
 * `demonstrationPpt` porte bien une carte action → bouton, mais elle est
 * PARTIELLE : elle ignore les transitions et les notes, pourtant enseignées.
 * S'en servir aurait déclaré orphelins six boutons qui ne le sont pas. Écrire
 * une carte de plus ici aurait fait une quatrième copie de la dérivation de
 * gestes — les trois précédentes ont divergé en une heure. La mesure vient donc
 * du BANC : le joueur note chaque bouton qu'il presse réellement dans le
 * navigateur, et ce journal est la seule source qui ne peut pas mentir.
 *
 *     PPT_JOURNAL_BOUTONS=/tmp/ppt-boutons.txt \
 *       for f in scenarios/m*.json; do node joueur.cjs --s=$(basename $f); done
 *     npx tsx scripts/simulation/ppt/check-couverture-ppt.ts --journal=/tmp/ppt-boutons.txt
 *
 * Sans journal, le contrôle rend la partie statique et DIT que la mesure des
 * boutons n'a pas été faite, au lieu d'un vert vide.
 */

import { existsSync, readFileSync, readdirSync } from "fs"
import { join } from "path"
import { LIBELLES_CONTROLES_PPT } from "../../../lib/simulation/ppt/adaptateur"
import { CONTROLES_PPT } from "../../../lib/simulation/ppt/document"
import { OBSERVABLES_PPT } from "../../../lib/simulation/ppt/actions"

const CHROME = join(__dirname, "..", "..", "..", "components", "simulation", "ppt", "PptChrome.tsx")
const SURFACE = join(__dirname, "..", "..", "..", "components", "simulation", "ppt", "PptSurface.tsx")
const DOSSIER = join(__dirname, "..", "scenarios", "ppt")

/** Boutons déclarés mais VOLONTAIREMENT non rendus — décision D3, lot 1. */
const HORS_LOT_1: Record<string, string> = {
  "acc-taille-plus": "taille de police — réservée au lot 2",
  "acc-taille-moins": "taille de police — réservée au lot 2",
  "ins-tableau": "tableaux — hors lot 1 (D3)",
}

/**
 * PÉRIMÈTRE NON OUVERT — ce que la formation n'enseigne pas, et pourquoi.
 *
 * Une formation honnête sur son périmètre vaut mieux qu'une formation qui
 * prétend tout couvrir. Ces notions n'ont AUCUN geste dans la surface : les
 * écrire aurait produit des étapes infranchissables. Elles sont déclarées ici
 * pour figurer au dossier, pas oubliées.
 */
const PERIMETRE_NON_OUVERT: Array<[string, string]> = [
  ["Masque des diapositives", "aucune commande ni bouton — la cohérence est tenue à la main (m15)"],
  ["Animations avancées", "seules « Apparaître » et « Fondu » existent : ni trajectoire, ni emphase, ni volet"],
  ["Retrait d'une animation", "`addAnimation` est le seul geste du moteur — rien ne défait ce qui est posé"],
  ["Tableaux", "bouton déclaré, volontairement non rendu (D3) — compensé par m14"],
  ["Graphiques", "type d'objet présent dans le modèle, aucun bouton, aucune commande"],
  ["Taille de police", "boutons déclarés, non rendus (lot 2) — compensé par le gras et le retrait de texte"],
  ["Couleur du texte et remplissage", "champs présents dans le style, aucun sélecteur rendu"],
  ["Mode Plan", "`plan` existe dans les vues, seuls Normal et Trieuse ont un bouton"],
  ["Enregistrer sous / une copie", "aucun geste de fichier — m11 enseigne les deux versions sans les produire"],
]

function rendus(): Set<string> {
  const src = readFileSync(CHROME, "utf-8") + readFileSync(SURFACE, "utf-8")
  const out = new Set<string>()
  for (const [cle, val] of Object.entries(CONTROLES_PPT)) {
    if (!new RegExp(`CONTROLES_PPT\\.${cle}\\b`).test(src)) continue
    if (typeof val === "string") out.add(val)
    else if (typeof val === "function") {
      for (const id of Object.keys(LIBELLES_CONTROLES_PPT)) {
        const prefixe = String((val as (x: never) => string)("§§" as never)).replace("§§", "")
        if (id.startsWith(prefixe) && id !== prefixe) out.add(id)
      }
    }
  }
  return out
}

function main() {
  const argJournal = process.argv.find((a) => a.startsWith("--journal="))
  const journal = argJournal ? argJournal.slice("--journal=".length) : ""
  const presses = new Set<string>()
  if (journal && existsSync(journal))
    for (const l of readFileSync(journal, "utf-8").split("\n")) if (l.trim() && l.trim() !== "FINI") presses.add(l.trim())

  const dansLeDom = rendus()
  const typesEmployes = new Set<string>()
  const proses: string[] = []
  let chapitres = 0
  let etapes = 0

  for (const f of readdirSync(DOSSIER).filter((x) => x.endsWith(".json")).sort()) {
    const sc = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8"))
    chapitres += 1
    for (const s of sc.steps as Array<{ consigne?: string; aide?: { text?: string }; action: { type: string } }>) {
      etapes += 1
      typesEmployes.add(s.action.type)
      proses.push(`${s.consigne ?? ""} ${s.aide?.text ?? ""}`)
    }
  }

  const texte = proses.join(" \n ")
  /* Un bouton « cité » l'est en toutes lettres : l'apprenant l'atteint par son
   * libellé, jamais par son identifiant. */
  const cite = (id: string) => {
    const lib = (LIBELLES_CONTROLES_PPT as Record<string, string>)[id]
    return !!lib && texte.toLocaleLowerCase("fr").includes(lib.toLocaleLowerCase("fr"))
  }

  console.log(`── Couverture PowerPoint · ${chapitres} chapitres, ${etapes} étapes ──\n`)
  console.log(`  Contrôles rendus par la surface         : ${dansLeDom.size}`)

  if (!presses.size) {
    console.log("  ⚠ aucun journal de banc fourni : la mesure des boutons pressés N'A PAS été faite.")
    console.log("    Relancer le corpus avec PPT_JOURNAL_BOUTONS, puis --journal=<fichier>.")
  } else {
    const presElig = [...presses].filter((i) => dansLeDom.has(i))
    const jamais: string[] = []
    const seulementCites: string[] = []
    for (const id of [...dansLeDom].sort()) {
      if (presses.has(id)) continue
      if (cite(id)) seulementCites.push(id)
      else jamais.push(id)
    }
    console.log(`  Pressés en jouant le corpus            : ${presElig.length}`)
    console.log(`  Cités par une consigne, jamais pressés : ${seulementCites.length}`)
    console.log(`  JAMAIS enseignés                       : ${jamais.length}`)
    for (const id of seulementCites) console.log(`      cité seul  ${id.padEnd(26)} ${LIBELLES_CONTROLES_PPT[id] ?? ""}`)
    for (const id of jamais) console.log(`      ORPHELIN   ${id.padEnd(26)} ${LIBELLES_CONTROLES_PPT[id] ?? ""}`)
  }

  const declares = new Set<string>()
  for (const v of Object.values(CONTROLES_PPT)) if (typeof v === "string") declares.add(v)
  const nonRendus = [...declares].filter((id) => !dansLeDom.has(id)).sort()
  console.log(`\n  Déclarés mais volontairement NON rendus : ${nonRendus.length}`)
  for (const id of nonRendus) console.log(`      ${id.padEnd(26)} ${HORS_LOT_1[id] ?? "raison NON déclarée — à documenter"}`)

  const observables = [...OBSERVABLES_PPT]
  const inutilises = observables.filter((t) => !typesEmployes.has(t))
  console.log(`\n  Cibles de jugement observables          : ${observables.length}`)
  console.log(`  Employées par au moins un chapitre      : ${observables.length - inutilises.length}`)
  console.log(`  Jamais employées                        : ${inutilises.length}`)
  for (const t of inutilises) console.log(`      ORPHELINE  ${t}`)

  console.log(`\n  Périmètre NON OUVERT — déclaré, pas oublié :`)
  for (const [notion, raison] of PERIMETRE_NON_OUVERT) console.log(`      ${notion.padEnd(32)} ${raison}`)

  const orphelinsBoutons = presses.size ? [...dansLeDom].filter((id) => !presses.has(id)).length : -1
  const complet = orphelinsBoutons === 0 && inutilises.length === 0
  console.log(
    complet
      ? `\n✓ COMPLET — ${dansLeDom.size}/${dansLeDom.size} contrôles rendus sont pressés en jouant le corpus, ` +
          `${observables.length}/${observables.length} cibles de jugement sont employées. Aucun geste orphelin.`
      : "\n⚠ Voir ci-dessus : des gestes restent sans chapitre, ou la mesure n'est pas complète.",
  )
}

main()
