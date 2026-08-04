/**
 * PowerPoint — contrôle des scénarios, et de leur JOUABILITÉ.
 *
 * Décliné de `check-scenario` et `check-jouabilite` (contrat §7). Il fusionne
 * les deux parce qu'ils lisent le même fichier et que séparer aurait doublé le
 * temps d'analyse pour rien.
 *
 * ═══ CE QU'IL VÉRIFIE, ET POURQUOI CHACUN A COÛTÉ QUELQUE CHOSE ═══
 *
 *  1. l'action est ÉMISE par la surface (`adaptateur.observables`). Une action
 *     absente rend l'étape injouable : l'apprenant fait ce qu'on lui demande et
 *     rien ne se passe. Excel l'a payé avec `CLICK_CELL_MODIFIER`, inscrit au
 *     format sur une supposition et jamais émis ;
 *  2. la cible d'un déplacement TIENT DANS LA SCÈNE. Défaut trouvé par le spike
 *     lui-même : `y = 400` pour un objet haut de 200 dans 540 unités — l'objet
 *     ne pouvait pas atteindre la position demandée, l'étape était infranchissable ;
 *  3. un objet DÉSIGNÉ par son identifiant existe dans la déclaration. Défaut
 *     trouvé en JOUANT le pilote : `P_MOVE_OBJECT` visait `img-resultats`, alors
 *     que l'image venait d'être créée par le ruban et portait un identifiant
 *     généré. Un objet créé à l'exécution se vérifie par `P_EXPECT_DECK`, qui
 *     apparie par type ;
 *  4. une saisie a au moins une réponse acceptée, et aucune n'est vide ;
 *  5. une leçon MONTRE le geste (`==…==`), une évaluation n'a PAS d'aide ;
 *  6. les identifiants d'étapes sont uniques — ce sont des index de reprise.
 *
 * `--piege` rejoue le contrôle sur des scénarios volontairement fautifs : un
 * détecteur qu'on n'a pas piégé ne prouve rien.
 */

import { readFileSync, readdirSync, existsSync } from "fs"
import { join } from "path"
import { OBSERVABLES_PPT, SCENE_16_9, SCENE_4_3 } from "../../../lib/simulation/ppt/actions"
import { LAYOUTS, cadreDansLaScene } from "../../../lib/simulation/ppt/document"
import { LIBELLES_CONTROLES_PPT } from "../../../lib/simulation/ppt/adaptateur"

type Anomalie = { fichier: string; etape: string; message: string }

const DOSSIER = join(__dirname, "..", "scenarios", "ppt")

/** Cadre d'un objet, tel que la déclaration du scénario le connaît. */
function cadresDeclares(scenario: any): Record<string, { x: number; y: number; w: number; h: number }> {
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
  for (const sd of scenario?.ppt?.slides ?? []) {
    const layout = sd.layout ?? "titre-et-contenu"
    for (const ph of LAYOUTS[layout as keyof typeof LAYOUTS]?.placeholders ?? []) {
      out[`ph:${ph.type}`] = { ...ph.rect }
    }
    for (const o of sd.objets ?? []) {
      if (o.id) out[o.id] = o.rect ?? { x: 300, y: 220, w: 300, h: 120 }
    }
  }
  return out
}

export function controlerScenario(fichier: string, scenario: any): Anomalie[] {
  const a: Anomalie[] = []
  const ajouter = (etape: string, message: string) => a.push({ fichier, etape, message })

  const scene = scenario?.ppt?.format === "4:3" ? SCENE_4_3 : SCENE_16_9
  const declares = cadresDeclares(scenario)
  const mode = scenario?.mode ?? "LESSON"
  const vus = new Set<string>()

  if (!Array.isArray(scenario?.steps) || scenario.steps.length === 0) {
    ajouter("—", "aucune étape")
    return a
  }

  for (const s of scenario.steps) {
    const id = s?.id ?? "(sans identifiant)"
    const t = s?.action?.type

    // (6) Les identifiants sont un CONTRAT avec les apprenants en cours :
    // `currentStep` / `maxStepSeen` sont des index, un doublon rend une reprise
    // indéchiffrable.
    if (vus.has(id)) ajouter(id, "identifiant d'étape en double")
    vus.add(id)

    if (!s?.consigne || String(s.consigne).trim() === "") ajouter(id, "consigne vide")

    // (1) L'action doit être émise par la surface. Les primitives génériques du
    // noyau (`READ`, `MONTRER`, `KEY`, `CLICK_CONTROL`…) ne portent pas de
    // préfixe et ne relèvent pas de cette liste.
    if (typeof t === "string" && t.startsWith("P_") && !OBSERVABLES_PPT.has(t)) {
      ajouter(id, `action « ${t} » non émise par la surface : l'étape serait injouable`)
    }

    // (5) Une LEÇON montre le geste ; une ÉVALUATION n'a pas d'aide.
    if (mode === "LESSON" && t !== "READ" && !/==[\s\S]+?==/.test(String(s.consigne ?? ""))) {
      ajouter(id, "leçon sans geste balisé `==…==` : la consigne ne montre pas quoi faire")
    }
    if (mode === "EVALUATION" && s?.aide?.text) {
      ajouter(id, "aide rédigée dans une évaluation notée")
    }

    // (4) Saisie.
    if (t === "P_TYPE_TEXT") {
      const acc = s.action.accept
      if (!Array.isArray(acc) || acc.length === 0) ajouter(id, "`P_TYPE_TEXT` sans réponse acceptée")
      else if (acc.some((x: unknown) => typeof x !== "string" || x.trim() === ""))
        ajouter(id, "`P_TYPE_TEXT` avec une réponse acceptée vide")
      if (typeof s.action.cible !== "string" || !s.action.cible)
        ajouter(id, "`P_TYPE_TEXT` sans cible")
    }

    // (3) Objet désigné par identifiant : il doit exister dans la déclaration.
    for (const champ of ["objectId"] as const) {
      const ref = s?.action?.[champ]
      if (typeof ref === "string" && ref && !declares[ref] && !ref.startsWith("ph:")) {
        ajouter(
          id,
          `« ${ref} » n'est déclaré nulle part dans \`ppt.slides\` : un objet créé à l'exécution porte un ` +
            `identifiant GÉNÉRÉ, inconnu de l'auteur. Le vérifier par \`P_EXPECT_DECK\`, qui apparie par type.`,
        )
      }
    }

    // (2) Jouabilité géométrique.
    if (t === "P_MOVE_OBJECT") {
      const base = declares[s.action.objectId]
      if (!cadreDansLaScene(s.action.rect ?? {}, scene, base)) {
        ajouter(
          id,
          `cible hors du cadre de la scène (${scene.w} × ${scene.h}) : l'objet ne peut pas atteindre cette position`,
        )
      }
      const tol = s.action.tolerance
      if (tol !== undefined && (typeof tol !== "number" || tol <= 0))
        ajouter(id, "tolérance invalide")
    }
    if (t === "P_EXPECT_DECK") {
      for (const sd of s.action.deck?.slides ?? []) {
        for (const o of sd.objets ?? []) {
          if (o.rect && !cadreDansLaScene(o.rect, scene, o.id ? declares[o.id] : undefined)) {
            ajouter(id, `cadre attendu hors de la scène (${scene.w} × ${scene.h})`)
          }
        }
      }
    }

    /* Déplacement de diapositive : UN CRAN À LA FOIS.
     *
     * Depuis la décision D11, le réordonnancement passe par « Monter » et
     * « Descendre », qui déplacent d'une position et émettent donc
     * `{from: i, to: i±1}`. Un `P_MOVE_SLIDE` de 3 vers 1 attendrait
     * `{from: 3, to: 1}` : aucune des deux observations produites ne
     * correspondrait, et l'étape serait infranchissable en cliquant pourtant
     * exactement ce qu'il faut. Pour un déplacement de plusieurs rangs, décrire
     * l'ORDRE attendu avec `P_EXPECT_DECK` — chemin libre, jugé sur le
     * résultat. */
    if (t === "P_MOVE_SLIDE" && Math.abs(s.action.to - s.action.from) !== 1) {
      ajouter(
        id,
        "`P_MOVE_SLIDE` de plus d'un rang : les boutons Monter/Descendre déplacent d'une " +
          "position à la fois, l'étape serait infranchissable. Décrire l'ordre attendu avec `P_EXPECT_DECK`.",
      )
    }

    // Un bouton cité doit porter un libellé, sinon la ligne « Attendu : … » dit
    // « un clic sur le bouton indiqué » — 239 étapes d'Excel dans ce cas.
    if (t === "CLICK_CONTROL" && s.action.control && !LIBELLES_CONTROLES_PPT[s.action.control]) {
      ajouter(id, `bouton « ${s.action.control} » sans libellé déclaré`)
    }
  }

  return a
}

/* ═══════════ PIÉGEAGE ═══════════ */

/**
 * Un détecteur qu'on n'a pas piégé ne prouve rien.
 *
 * Chaque piège est un cas RÉALISTE, tiré d'un défaut réellement rencontré — pas
 * une faute grossière que n'importe quoi attraperait. Le premier piège posé sur
 * Excel n'avait rien déclenché, et c'était NORMAL : il comparait la grille au
 * plan, une vérification circulaire.
 */
const PIEGES: Array<{ nom: string; scenario: unknown; attendu: RegExp }> = [
  {
    nom: "cible hors de la scène (le défaut du spike : y=400 pour un objet de 200 dans 540)",
    scenario: {
      mode: "LESSON",
      ppt: { slides: [{ layout: "titre-et-contenu", objets: [{ id: "img", objectType: "image", rect: { x: 100, y: 100, w: 300, h: 200 } }] }] },
      steps: [{ id: "T-01", consigne: "==Déplacez l'image==.", action: { type: "P_MOVE_OBJECT", objectId: "img", rect: { x: 100, y: 400 } } }],
    },
    attendu: /hors du cadre de la scène/,
  },
  {
    nom: "objet désigné par un identifiant généré à l'exécution (défaut trouvé en jouant)",
    scenario: {
      mode: "LESSON",
      ppt: { slides: [{ layout: "titre-et-contenu" }] },
      steps: [{ id: "T-02", consigne: "==Déplacez l'image==.", action: { type: "P_MOVE_OBJECT", objectId: "img-resultats", rect: { x: 100, y: 100 } } }],
    },
    attendu: /n'est déclaré nulle part/,
  },
  {
    nom: "action non émise par la surface",
    scenario: {
      mode: "LESSON",
      ppt: { slides: [{ layout: "titre-et-contenu" }] },
      steps: [{ id: "T-03", consigne: "==Faites-le==.", action: { type: "P_ROTATE_OBJECT", objectId: "x" } }],
    },
    attendu: /non émise par la surface/,
  },
  {
    nom: "saisie sans réponse acceptée",
    scenario: {
      mode: "LESSON",
      ppt: { slides: [{ layout: "titre-et-contenu" }] },
      steps: [{ id: "T-04", consigne: "==Saisissez le titre==.", action: { type: "P_TYPE_TEXT", cible: "ph:titre", accept: [] } }],
    },
    attendu: /sans réponse acceptée/,
  },
  {
    nom: "aide rédigée dans une évaluation notée",
    scenario: {
      mode: "EVALUATION",
      ppt: { slides: [{ layout: "titre-et-contenu" }] },
      steps: [{ id: "T-05", consigne: "Renseignez le titre.", action: { type: "P_TYPE_TEXT", cible: "ph:titre", accept: ["x"] }, aide: { text: "c'est le grand cadre" } }],
    },
    attendu: /aide rédigée dans une évaluation/,
  },
  {
    nom: "déplacement de diapositive de plus d'un rang (D11 : un cran à la fois)",
    scenario: {
      mode: "LESSON",
      ppt: { slides: [{ layout: "titre-et-contenu" }] },
      steps: [{ id: "T-07", consigne: "==Remontez-la==.", action: { type: "P_MOVE_SLIDE", from: 3, to: 1 } }],
    },
    attendu: /plus d'un rang/,
  },
  {
    nom: "identifiant d'étape en double",
    scenario: {
      mode: "LESSON",
      ppt: { slides: [{ layout: "titre-et-contenu" }] },
      steps: [
        { id: "T-06", consigne: "==A==.", action: { type: "P_ADD_SLIDE" } },
        { id: "T-06", consigne: "==B==.", action: { type: "P_ADD_SLIDE" } },
      ],
    },
    attendu: /en double/,
  },
]

/** Contre-piège : un scénario SAIN ne doit produire aucune anomalie. */
const CONTRE_PIEGE = {
  mode: "LESSON",
  ppt: { slides: [{ layout: "titre-et-contenu", objets: [{ id: "img", objectType: "image", rect: { x: 100, y: 100, w: 300, h: 200 } }] }] },
  steps: [
    { id: "S-01", consigne: "==Saisissez « Bilan »== dans le titre.", action: { type: "P_TYPE_TEXT", cible: "ph:titre", accept: ["Bilan"] } },
    { id: "S-02", consigne: "==Déplacez l'image== en bas.", action: { type: "P_MOVE_OBJECT", objectId: "img", rect: { x: 560, y: 300 } } },
  ],
}

/* ═══════════ EXÉCUTION ═══════════ */

function principal() {
  const piege = process.argv.includes("--piege")
  let echecs = 0

  if (piege) {
    console.log("── Piégeage du détecteur ──")
    for (const p of PIEGES) {
      const trouve = controlerScenario("piege", p.scenario).some((x) => p.attendu.test(x.message))
      console.log(`  ${trouve ? "✓" : "✗"} ${p.nom}`)
      if (!trouve) echecs++
    }
    const faux = controlerScenario("contre-piege", CONTRE_PIEGE)
    console.log(`  ${faux.length === 0 ? "✓" : "✗"} contre-piège : un scénario sain ne déclenche rien${faux.length ? " → " + faux.map((f) => f.message).join(" | ") : ""}`)
    if (faux.length) echecs++
    console.log()
  }

  if (!existsSync(DOSSIER)) {
    console.log("  — aucun scénario PowerPoint pour l'instant.")
  } else {
    const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".json"))
    const anomalies: Anomalie[] = []
    for (const f of fichiers) {
      const scenario = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8"))
      anomalies.push(...controlerScenario(f, scenario))
    }
    if (anomalies.length) {
      console.error(`\n✗ ${anomalies.length} anomalie(s) :\n`)
      for (const x of anomalies) console.error(`  ✗ ${x.fichier} · ${x.etape} — ${x.message}`)
      echecs += anomalies.length
    } else {
      console.log(`✓ ${fichiers.length} scénario(s) PowerPoint — structure et jouabilité tenues.`)
    }
  }

  if (echecs) process.exit(1)
}

if (require.main === module) principal()
