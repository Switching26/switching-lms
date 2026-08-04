/**
 * PowerPoint — LA propriété centrale : une évaluation jouée sans faute sort à 100 %.
 *
 * C'est le critère de sortie que le contrat impose à chaque application (§7,
 * décision D6), et l'analogue exact de `check-note-nonregression` pour Excel.
 *
 * ═══ POURQUOI CE CONTRÔLE, ET PAS UN COMPTEUR D'ÉTAPES ═══
 *
 * Excel avait 18 évaluations sur 27 PLAFONNÉES — 46 % pour un parcours parfait
 * sur le module 1, 78 % sur le 27, 95 % sur le 4 — et rien ne le signalait : les
 * étapes se franchissaient, le chapitre se terminait, la note était simplement
 * fausse. Trois étages de causes, tous dans le CLASSEMENT d'une observation :
 *
 *   1. une frappe juste sur une étape jugée par l'état comptait une vraie faute ;
 *   2. un geste de repérage avant d'agir comptait une vraie faute ;
 *   3. un passage obligé (ouvrir une boîte avant que l'état jugé n'existe)
 *      comptait une vraie faute.
 *
 * Aucun compteur d'étapes ne voit cela. Seule la NOTE le voit.
 *
 * ═══ CE QUE LE CONTRÔLE MESURE ═══
 *
 *  · un parcours PARFAIT sort à 100 % ;
 *  · un parcours identique avec UNE faute volontaire sort STRICTEMENT en dessous
 *    — sans ce contre-test, un juge qui dirait « ok » à tout donnerait aussi
 *    100 %, et le vert ne prouverait rien ;
 *  · les gestes intermédiaires d'une étape à chemin libre ne coûtent RIEN.
 *
 * Le juge est `jugerEtape` avec l'adaptateur PowerPoint : celui-là même qui
 * tourne côté serveur. Pas de second juge, pas de simulation du classement.
 */

import { jugerEtape } from "../../../lib/simulation/frappe"
import { computeScore } from "../../../lib/simulation/validate"
import { adaptateurPpt } from "../../../lib/simulation/ppt/adaptateur"
import { deckDepuisDeclaration, appliquerGeste, type DeckState } from "../../../lib/simulation/ppt/document"
import type { SimulationStep } from "../../../lib/simulation/types"

/* ═══════════ L'ÉVALUATION DE CONTRÔLE ═══════════ */

const EVALUATION = {
  ppt: { slides: [{ layout: "diapositive-de-titre" as const }] },
  steps: [
    { id: "V-01", consigne: "Renseignez le titre.", points: 1, action: { type: "P_TYPE_TEXT", cible: "ph:titre", accept: ["Bilan 2026"] } },
    { id: "V-02", consigne: "Ajoutez une diapositive.", points: 1, action: { type: "P_ADD_SLIDE" } },
    { id: "V-03", consigne: "La présentation doit compter deux diapositives.", points: 2, action: { type: "P_EXPECT_DECK", deck: { nbSlides: 2 } } },
    { id: "V-04", consigne: "Appliquez la disposition « Titre seul ».", points: 1, action: { type: "P_SET_LAYOUT", layout: "titre-seul" } },
    { id: "V-05", consigne: "Lancez le diaporama.", points: 1, action: { type: "P_EXPECT_SHOW", show: { actif: true, index: 0 } } },
    { id: "V-06", consigne: "Quittez le diaporama.", points: 1, action: { type: "P_EXPECT_SHOW", show: { actif: false } } },
  ],
} as const

/** Les gestes d'un apprenant qui fait EXACTEMENT ce que chaque consigne demande. */
type Coup = { geste: Parameters<typeof appliquerGeste>[1]; canal: string; specifique?: (d: DeckState) => any }

function parcoursParfait(): Array<{ etape: number; coups: Coup[] }> {
  return [
    { etape: 0, coups: [{ geste: { type: "editText", objectId: "obj1", paragraphe: 0, text: "Bilan 2026" }, canal: "keyboard" }] },
    { etape: 1, coups: [{ geste: { type: "addSlide" }, canal: "ribbon" }] },
    // Étape à chemin libre : elle est DÉJÀ satisfaite par le geste précédent.
    // C'est le cas qui plafonnait Excel — l'état rapporté ne satisfait pas encore
    // l'attente pendant qu'on construit, et chaque rapport comptait une faute.
    { etape: 2, coups: [{ geste: { type: "selectSlide", index: 1 }, canal: "mouse" }] },
    { etape: 3, coups: [{ geste: { type: "setLayout", index: 1, layout: "titre-seul" }, canal: "ribbon" }] },
    { etape: 4, coups: [{ geste: { type: "startShow", depuis: "debut" }, canal: "ribbon" }] },
    { etape: 5, coups: [{ geste: { type: "endShow" }, canal: "keyboard" }] },
  ]
}

/* ═══════════ SIMULATION D'UN PASSAGE ═══════════ */

type Resultat = { note: number; details: Array<{ id: string; premierEssai: boolean; fautes: number; franchie: boolean }> }

/**
 * Rejoue le parcours dans le vrai juge et calcule la note comme le serveur.
 *
 * `faute` : rang de l'étape où l'on injecte volontairement un geste faux avant
 * le bon — c'est le contre-test.
 */
function jouer(faute?: number): Resultat {
  let deck = deckDepuisDeclaration(EVALUATION.ppt as any)
  const details: Resultat["details"] = []
  const parcours = parcoursParfait()

  for (let i = 0; i < EVALUATION.steps.length; i++) {
    const s = EVALUATION.steps[i] as unknown as SimulationStep
    let fautes = 0
    let franchie = false

    const emettre = (obs: any) => {
      const j = jugerEtape(s, obs, adaptateurPpt)
      if (j.compte === "faute") fautes++
      if (j.ok) franchie = true
    }

    // Geste FAUX volontaire, avant le bon : il doit coûter le « premier essai ».
    if (faute === i) {
      const d2 = appliquerGeste(deck, { type: "selectSlide", index: 0 })
      emettre({ kind: "p:typed", cible: "ph:titre", objectId: "obj1", paragraphe: 0, text: "REPONSE-FAUSSE", channel: "keyboard" })
      void d2
    }

    for (const c of parcours[i].coups) {
      deck = appliquerGeste(deck, c.geste)
      // Deux observations par geste, comme le player : la spécifique puis l'état.
      const spec = observationSpecifique(c.geste, deck, c.canal)
      if (spec) emettre(spec)
      emettre({ kind: "p:deckChange", deck, channel: c.canal })
    }

    details.push({ id: s.id, premierEssai: franchie && fautes === 0, fautes, franchie })
  }

  const note = computeScore(
    EVALUATION.steps as unknown as SimulationStep[],
    Object.fromEntries(details.map((d) => [d.id, d.premierEssai])),
  )
  return { note, details }
}

/** Miroir minimal de `observationDuGeste` du player, pour les gestes utilisés ici. */
function observationSpecifique(geste: any, apres: DeckState, channel: string): any {
  const i = apres.activeSlide ?? 0
  switch (geste.type) {
    case "editText": {
      const o = apres.slides[i]?.objects.find((x) => x.id === geste.objectId)
      return { kind: "p:typed", cible: o?.placeholder ? `ph:${o.placeholder}` : geste.objectId, objectId: geste.objectId, paragraphe: 0, text: geste.text, channel }
    }
    case "addSlide":
      return { kind: "p:slideAdd", index: i, layout: apres.slides[i]?.layout, channel }
    case "selectSlide":
      return { kind: "p:slideSelect", index: geste.index, channel }
    case "setLayout":
      return { kind: "p:layoutChange", index: geste.index, layout: geste.layout, channel }
    case "startShow":
    case "endShow":
      return { kind: "p:showChange", show: apres.show, channel }
    default:
      return null
  }
}

/* ═══════════ EXÉCUTION ═══════════ */

function principal() {
  const parfait = jouer()
  const avecFaute = jouer(0)
  const pct = (n: number) => `${Math.round(n * 100)} %`

  console.log("── Parcours PARFAIT ──")
  for (const d of parfait.details)
    console.log(`  ${d.franchie ? (d.premierEssai ? "✓" : "△") : "✗"} ${d.id}  franchie=${d.franchie}  fautes=${d.fautes}`)
  console.log(`  note = ${pct(parfait.note)}`)

  console.log("\n── CONTRE-TEST : une faute volontaire à l'étape 1 ──")
  console.log(`  note = ${pct(avecFaute.note)}`)

  const problemes: string[] = []
  const nonFranchies = parfait.details.filter((d) => !d.franchie)
  if (nonFranchies.length)
    problemes.push(`${nonFranchies.length} étape(s) non franchies sur un parcours parfait : ${nonFranchies.map((d) => d.id).join(", ")}`)
  const plafonnees = parfait.details.filter((d) => d.franchie && d.fautes > 0)
  if (plafonnees.length)
    problemes.push(
      `${plafonnees.length} étape(s) franchies mais comptées FAUTIVES sur un parcours parfait : ` +
        plafonnees.map((d) => `${d.id} (${d.fautes})`).join(", ") +
        ` — c'est le défaut qui plafonnait 18 évaluations Excel sur 27`,
    )
  if (parfait.note < 1) problemes.push(`un parcours parfait ne sort pas à 100 % mais à ${pct(parfait.note)}`)
  // Sans ce contre-test, un juge qui dirait « ok » à tout donnerait aussi 100 %.
  // ⚠️ Tant qu'un plafonnement est signalé ci-dessus, le contre-test est MASQUÉ :
  // l'étape où l'on injecte la faute a déjà perdu son point. Le dire, plutôt que
  // de laisser lire « le contrôle ne prouve rien » comme un défaut du contrôle.
  if (avecFaute.note >= parfait.note)
    problemes.push(
      plafonnees.length
        ? "le contre-test ne descend pas — MASQUÉ par le plafonnement ci-dessus, il redeviendra concluant une fois celui-ci corrigé"
        : "le contre-test ne descend pas : le contrôle ne prouve rien",
    )

  if (problemes.length) {
    console.error("\n✗ note PowerPoint :\n")
    for (const p of problemes) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  console.log(`\n✓ évaluation à ${pct(parfait.note)} sur un parcours sans faute, ${pct(avecFaute.note)} avec une faute volontaire.`)
}

if (require.main === module) principal()
