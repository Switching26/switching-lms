/**
 * Garde-fou du parcours post-évaluation : preuve que le lien
 * « étape ratée → compétence → chapitre à revoir » ne repose sur aucune
 * supposition.
 *
 *   npx tsx scripts/simulation/check-remediation.ts
 *
 * Deux moitiés, comme `check-journal-eval.ts` :
 *
 *  A. CONTENU — chaque bloc de remédiation rédigé est confronté au scénario
 *     d'évaluation RÉEL : identifiants d'étapes existants, couverture complète
 *     des étapes notées, compétences toutes utilisées, et surtout chaque renvoi
 *     `mNN-lNN` doit correspondre à un fichier de scénario qui existe. Un
 *     renvoi vers une leçon inexistante est refusé ICI, pas découvert par un
 *     apprenant.
 *
 *  B. MOTEUR — `construireBilan` et `resoudreRenvois` sur des journaux
 *     fabriqués, y compris les cas qui doivent produire du SILENCE : évaluation
 *     non annotée, journal périmé, chapitre dépublié.
 *
 * La convention de place (`Section.order` = numéro de module,
 * `Chapter.order` = 100/200/300 + index) n'est pas recopiée de mémoire : elle
 * est re-dérivée des noms de fichiers réels et comparée à `codeVersPlace`.
 */

import * as fs from "fs"
import * as path from "path"
import {
  codeVersPlace,
  construireBilan,
  litBlocRemediation,
  planDeRevision,
  resoudreRenvois,
  type ChapitreDuParcours,
  type EntreeJournalLue,
} from "../../lib/simulation/remediation"

const RACINE = path.resolve(__dirname, "../..")
const SCENARIOS = path.join(RACINE, "scripts/simulation/scenarios")

let echecs = 0
let total = 0

function verifie(intitule: string, condition: boolean, detail?: string) {
  total++
  if (!condition) {
    echecs++
    console.error(`  ✗ ${intitule}${detail ? ` — ${detail}` : ""}`)
  }
}

type EtapeScenario = { id: string; n: number; type: string; points: number }

function etapesDe(scenario: any): EtapeScenario[] {
  const steps = Array.isArray(scenario?.steps) ? scenario.steps : []
  return steps.map((s: any, i: number) => ({
    id: String(s?.id ?? ""),
    n: i + 1,
    type: String(s?.action?.type ?? ""),
    points: typeof s?.points === "number" ? s.points : 1,
  }))
}

/* ═══ A. Contenu : les 27 blocs, dans les scénarios réels ════════════════ */

/**
 * ÉCHEC DUR, ET SUR LES 27.
 *
 * La version de conception lisait des blocs pilotes déposés hors du dossier des
 * scénarios, et se contentait d'« au moins un ». Deux pilotes passaient donc au
 * vert pendant que vingt-cinq évaluations n'étaient pas annotées — et le moteur,
 * lui, aurait rendu un écran de repli sans que personne le sache.
 *
 * Le contrôle lit maintenant les scénarios EUX-MÊMES, exige les 27, et refuse au
 * premier défaut. C'est le garde-fou du semis : sans lui, une annotation oubliée
 * ne se voit qu'en production, sur le bilan d'un apprenant.
 */

const evaluations = fs
  .readdirSync(SCENARIOS)
  .filter((f) => /^m\d{2}-ev\d{2}\.json$/i.test(f))
  .sort()

console.log(`\n=== A. Blocs de remédiation dans les scénarios (${evaluations.length}) ===`)
verifie("A0 · les 27 évaluations portent un scénario", evaluations.length === 27, `${evaluations.length} trouvée(s)`)

/** Tous les codes de chapitre qui existent réellement sur le disque. */
const chapitresExistants = new Set(
  fs.readdirSync(SCENARIOS)
    .filter((f) => /^m\d{2}-(ev|[le])\d{2}\.json$/i.test(f))
    .map((f) => f.replace(/\.json$/i, "").toLowerCase()),
)

/** Genre d'un code de chapitre : leçon, exercice ou évaluation. */
function genreDuCode(code: string): "lecon" | "exercice" | "evaluation" | null {
  const m = /^m(\d{2})-(ev|[le])(\d{2})$/i.exec(code.trim())
  if (!m) return null
  const g = m[2].toLowerCase()
  return g === "l" ? "lecon" : g === "e" ? "exercice" : "evaluation"
}

function moduleDuCode(code: string): number | null {
  const m = /^m(\d{2})-/i.exec(code.trim())
  return m ? parseInt(m[1], 10) : null
}

let blocsValides = 0
const compteurs = { competences: 0, etapes: 0, points: 0, renvois: 0 }

for (const fichier of evaluations) {
  const cible = fichier.replace(/\.json$/i, "")
  const scenario = JSON.parse(fs.readFileSync(path.join(SCENARIOS, fichier), "utf8"))

  verifie(`A2 · ${cible} : le scénario est bien une ÉVALUATION`, scenario.mode === "EVALUATION")

  // Le bloc est lu par la MÊME fonction que celle qui le lira en production :
  // un bloc que le moteur refuserait ne doit pas passer ce contrôle.
  const bloc = litBlocRemediation(scenario)
  verifie(`A3 · ${cible} : le bloc remediation existe et est accepté`, bloc != null)
  if (!bloc) continue
  blocsValides++

  const etapes = etapesDe(scenario)
  const idsEtapes = etapes.map((e) => e.id)
  const notables = etapes.filter((e) => e.type !== "READ" && e.points > 0)

  // A4 — aucune annotation ne vise une étape fantôme.
  const fantomes = Object.keys(bloc.parEtape).filter((id) => !idsEtapes.includes(id))
  verifie(`A4 · ${cible} : aucune annotation sur une étape inexistante`, fantomes.length === 0, fantomes.join(", "))

  // A5 — couverture : toute étape notée porte une compétence. Sans cela le
  // bilan afficherait « partielle » et le conseil serait muet là où l'apprenant
  // a justement perdu des points.
  const nonCouvertes = notables.filter((e) => !bloc.parEtape[e.id]).map((e) => e.id)
  verifie(
    `A5 · ${cible} : les ${notables.length} étapes notées sont toutes annotées`,
    nonCouvertes.length === 0,
    nonCouvertes.join(", "),
  )

  // A5' — et rien d'autre : une étape de LECTURE annotée gonflerait une
  // compétence de points qui ne se jouent pas.
  const nonNotables = etapes.filter((e) => e.type === "READ" || e.points <= 0).map((e) => e.id)
  const annoteesEnTrop = Object.keys(bloc.parEtape).filter((id) => nonNotables.includes(id))
  verifie(`A5' · ${cible} : aucune étape non notée n'est annotée`, annoteesEnTrop.length === 0, annoteesEnTrop.join(", "))

  // A6 — aucune annotation ne pointe vers une compétence non déclarée.
  const idsCompetences = bloc.competences.map((c) => c.id)
  const orphelines = Object.entries(bloc.parEtape)
    .filter(([, comp]) => !idsCompetences.includes(comp))
    .map(([etape, comp]) => `${etape}→${comp}`)
  verifie(`A6 · ${cible} : aucune compétence référencée non déclarée`, orphelines.length === 0, orphelines.join(", "))

  // A7 — aucune compétence déclarée pour rien : une ligne vide dans le bilan
  // laisserait croire à une notion évaluée qui ne l'est pas.
  const utilisees = Object.values(bloc.parEtape)
  const inutilisees = idsCompetences.filter((id) => !utilisees.includes(id))
  verifie(`A7 · ${cible} : aucune compétence déclarée sans étape`, inutilisees.length === 0, inutilisees.join(", "))

  // A8 — chaque renvoi désigne un chapitre qui existera réellement en base.
  const renvoisCasses: string[] = []
  const renvoisVides: string[] = []
  for (const c of bloc.competences) {
    if (c.revoir.length === 0) renvoisVides.push(c.id)
    for (const code of c.revoir) {
      if (!codeVersPlace(code) || !chapitresExistants.has(code.trim().toLowerCase())) {
        renvoisCasses.push(`${c.id}→${code}`)
      }
    }
  }
  verifie(`A8 · ${cible} : tous les renvois pointent un chapitre existant`, renvoisCasses.length === 0, renvoisCasses.join(", "))
  verifie(`A9 · ${cible} : aucune compétence sans renvoi`, renvoisVides.length === 0, renvoisVides.join(", "))

  // A10 — un renvoi ne désigne jamais une ÉVALUATION, et surtout pas celle-ci :
  // « pour progresser, repassez l'évaluation » n'est pas un conseil de révision,
  // et renvoyer vers l'évaluation d'un autre module ne l'est pas davantage.
  const versEvaluation = bloc.competences
    .flatMap((c) => c.revoir.map((code) => ({ c: c.id, code })))
    .filter((x) => genreDuCode(x.code) === "evaluation")
  verifie(
    `A10 · ${cible} : aucun renvoi vers une évaluation`,
    versEvaluation.length === 0,
    versEvaluation.map((x) => `${x.c}→${x.code}`).join(", "),
  )

  // A11 — COHÉRENCE DE PARCOURS. Un renvoi vers un module que l'apprenant n'a
  // pas encore suivi n'est pas une révision : c'est un renvoi vers un chapitre
  // qu'il découvrira plus tard. Le contrôle ne juge pas la pertinence
  // pédagogique — cela reste une relecture humaine — mais il attrape
  // l'incohérence STRUCTURELLE : réviser le module 16 après l'évaluation du
  // module 3.
  const moduleCible = moduleDuCode(cible) ?? 0
  const enAval = bloc.competences
    .flatMap((c) => c.revoir.map((code) => ({ c: c.id, code, mod: moduleDuCode(code) ?? 0 })))
    .filter((x) => x.mod > moduleCible)
  verifie(
    `A11 · ${cible} : aucun renvoi vers un module postérieur`,
    enAval.length === 0,
    enAval.map((x) => `${x.c}→${x.code}`).join(", "),
  )

  // A12 — FORMAT des identifiants et des intitulés. Un `id` en majuscules ou
  // avec un espace passerait la lecture du moteur mais rendrait le corpus
  // impossible à relire d'un fichier à l'autre.
  const idsMalFormes = idsCompetences.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))
  verifie(`A12 · ${cible} : identifiants de compétence en minuscules-tirets`, idsMalFormes.length === 0, idsMalFormes.join(", "))

  // A13 — l'intitulé est LU par l'apprenant : il doit être une phrase, pas un
  // identifiant recopié, et l'énoncé doit exister pour toutes les compétences —
  // c'est lui qui explique ce qu'il fallait savoir faire.
  const titresDouteux = bloc.competences
    .filter((c) => c.titre.trim().length < 12 || c.titre.trim() === c.id)
    .map((c) => c.id)
  verifie(`A13 · ${cible} : intitulés rédigés pour l'apprenant`, titresDouteux.length === 0, titresDouteux.join(", "))
  const sansEnonce = bloc.competences.filter((c) => !c.enonce || c.enonce.trim().length < 20).map((c) => c.id)
  verifie(`A13' · ${cible} : chaque compétence porte un énoncé de rappel`, sansEnonce.length === 0, sansEnonce.join(", "))

  // A14 — ANTI-DIVULGATION. Un intitulé ou un énoncé qui citerait une référence
  // de cellule ou une formule attendue transformerait le bilan en corrigé. Le
  // bilan dit la NOTION, jamais la réponse.
  const fuites: string[] = []
  for (const c of bloc.competences) {
    for (const [champ, texte] of [["titre", c.titre], ["enonce", c.enonce ?? ""]] as const) {
      if (/=[A-Z]{2,}\s*\(/.test(texte)) fuites.push(`${c.id}.${champ} : formule`)
      if (/\b\$?[A-Z]{1,2}\$?\d{1,4}\b/.test(texte)) fuites.push(`${c.id}.${champ} : référence de cellule`)
    }
  }
  verifie(`A14 · ${cible} : aucun intitulé ne révèle une formule ou une cellule`, fuites.length === 0, fuites.join(" ; "))

  // A15 — pas deux compétences au même intitulé : l'apprenant lirait deux fois
  // la même ligne dans son bilan sans comprendre ce qui les distingue.
  const titres = bloc.competences.map((c) => c.titre.trim().toLowerCase())
  const titresEnDouble = titres.filter((t, i) => titres.indexOf(t) !== i)
  verifie(`A15 · ${cible} : aucun intitulé en double`, titresEnDouble.length === 0, titresEnDouble.join(", "))

  // A16 — pas de renvoi répété dans une même compétence : le bilan afficherait
  // deux fois le même bouton.
  const renvoisEnDouble = bloc.competences
    .filter((c) => new Set(c.revoir.map((r) => r.toLowerCase())).size !== c.revoir.length)
    .map((c) => c.id)
  verifie(`A16 · ${cible} : aucun renvoi répété`, renvoisEnDouble.length === 0, renvoisEnDouble.join(", "))

  // A17 — le barème du bloc doit retomber sur celui du scénario : c'est ce qui
  // garantit que le bilan et la note décrivent le même passage.
  const parComp = new Map<string, number>()
  for (const e of notables) {
    const c = bloc.parEtape[e.id]
    if (c) parComp.set(c, (parComp.get(c) ?? 0) + e.points)
  }
  const totalPoints = notables.reduce((s, e) => s + e.points, 0)
  const totalReparti = [...parComp.values()].reduce((s, p) => s + p, 0)
  verifie(`A17 · ${cible} : tous les points sont répartis`, totalReparti === totalPoints, `${totalReparti}/${totalPoints}`)

  compteurs.competences += bloc.competences.length
  compteurs.etapes += notables.length
  compteurs.points += totalPoints
  compteurs.renvois += bloc.competences.reduce((s, c) => s + c.revoir.length, 0)

  console.log(
    `  ${cible} · ${bloc.competences.length} compétences · ${notables.length} étapes notées · ${totalPoints} points`,
  )
  for (const c of bloc.competences) {
    console.log(`      ${String(parComp.get(c.id) ?? 0).padStart(2)} pt · ${c.id.padEnd(38)} → ${c.revoir.join(", ")}`)
  }
}

verifie("A1 · les 27 évaluations portent un bloc valide", blocsValides === 27, `${blocsValides}/27`)
console.log(
  `\n  Total : ${compteurs.competences} compétences · ${compteurs.etapes} étapes notées · ${compteurs.points} points · ${compteurs.renvois} renvois`,
)

/* ═══ A'. La convention de place est bien celle du semeur ════════════════ */

console.log(`\n=== A'. Convention de place (Section.order / Chapter.order) ===`)
{
  // Re-dérivation depuis les noms de fichiers réels, exactement comme
  // `chapterOrder()` de seed-module.ts : leçon 100+n, exercice 200+n, éval 300+n.
  const fichiers = fs.readdirSync(SCENARIOS).filter((f) => f.endsWith(".json"))
  let divergences = 0
  let controles = 0
  for (const f of fichiers) {
    const m = /^m(\d{2})-(ev|[le])(\d{2})\.json$/i.exec(f)
    if (!m) continue
    controles++
    const attenduSection = parseInt(m[1], 10)
    const genre = m[2].toLowerCase()
    const attenduOrdre = (genre === "l" ? 100 : genre === "e" ? 200 : 300) + parseInt(m[3], 10)
    const place = codeVersPlace(f.replace(/\.json$/i, ""))
    if (!place || place.sectionOrder !== attenduSection || place.chapterOrder !== attenduOrdre) divergences++
  }
  verifie(`A'1 · les ${controles} scénarios se placent comme le semeur les écrit`, divergences === 0, `${divergences} divergence(s)`)
  verifie("A'2 · un code hors convention n'est pas deviné", codeVersPlace("chapitre-3") === null)
  verifie("A'3 · un code partiel n'est pas deviné", codeVersPlace("m10-l") === null)
}

/* ═══ B. Moteur : le bilan sur des journaux fabriqués ════════════════════ */

console.log(`\n=== B. Moteur de bilan ===`)

// Le scénario ANNOTÉ tel qu'il est réellement sur le disque, et le même privé
// de son bloc : le moteur doit rendre un bilan complet du premier, et le silence
// du second. Les deux viennent du corpus, pas d'un montage de test.
const scenarioAnnote = JSON.parse(fs.readFileSync(path.join(SCENARIOS, "m10-ev01.json"), "utf8"))
const blocM10 = scenarioAnnote.remediation
const { remediation: _sansBloc, ...scenarioM10 } = scenarioAnnote
const etapesM10 = etapesDe(scenarioM10)
const idsM10 = new Set(etapesM10.map((e) => e.id))

/** Journal complet, avec la liste des étapes ratées passée en paramètre. */
function journalAvecEchecs(rates: string[], nonTentees: string[] = []): EntreeJournalLue[] {
  return etapesM10.map((e) => ({
    n: e.n,
    id: e.id,
    type: e.type,
    points: e.points,
    premierEssai: !rates.includes(e.id) && !nonTentees.includes(e.id),
    tentee: !nonTentees.includes(e.id),
  }))
}

/* B1 — sans faute : aucune priorité, aucune compétence en alerte. */
{
  const b = construireBilan({ scenario: scenarioAnnote, journal: journalAvecEchecs([]), idsDuScenario: idsM10 })
  verifie("B1a · score plein", b.score === 1 && b.pointsObtenus === b.pointsTotal)
  verifie("B1b · le barème vaut bien 25 points", b.pointsTotal === 25)
  verifie("B1c · aucune priorité de révision", b.priorites.length === 0)
  verifie("B1d · toutes les compétences acquises", b.competences.every((c) => c.statut === "acquis"))
  verifie("B1e · couverture complète", b.couverture === "complete" && b.etapesSansCompetence === 0)
}

/* B2 — l'emprunt entièrement raté : il pèse 7 points, il passe premier. */
{
  const b = construireBilan({
    scenario: scenarioAnnote,
    journal: journalAvecEchecs(["M10-EV01-11", "M10-EV01-12", "M10-EV01-13", "M10-EV01-14", "M10-EV01-05"]),
    idsDuScenario: idsM10,
  })
  verifie("B2a · la priorité 1 est la compétence la plus coûteuse", b.priorites[0]?.id === "simuler-emprunt")
  verifie("B2b · elle est classée à revoir", b.priorites[0]?.statut === "a-revoir")
  verifie("B2c · SI perdu en entier arrive ensuite", b.priorites[1]?.id === "decider-avec-si")
  verifie("B2d · les compétences intactes ne remontent pas", b.priorites.every((p) => p.statut !== "acquis"))
  verifie("B2e · les rangs d'étapes ratées sont exacts", JSON.stringify(b.priorites[0]?.etapesRatees) === "[11,12,13,14]")
  verifie("B2f · le score suit le barème (16/25)", b.pointsObtenus === 16 && b.pointsTotal === 25)
}

/* B3 — au plus trois priorités, même quand tout est raté. */
{
  const b = construireBilan({
    scenario: scenarioAnnote,
    journal: journalAvecEchecs(etapesM10.map((e) => e.id)),
    idsDuScenario: idsM10,
  })
  verifie("B3a · trois priorités au maximum", b.priorites.length === 3)
  verifie("B3b · le bilan complet reste disponible", b.competences.length === 7)
  verifie("B3c · score nul", b.pointsObtenus === 0)
}

/* B4 — question passée : comptée comme non traitée, jamais comme ratée. */
{
  const b = construireBilan({
    scenario: scenarioAnnote,
    journal: journalAvecEchecs([], ["M10-EV01-15"]),
    idsDuScenario: idsM10,
  })
  const jours = b.competences.find((c) => c.id === "jours-ouvres")
  verifie("B4a · l'étape passée est en non traitée", JSON.stringify(jours?.etapesNonTraitees) === "[15]")
  verifie("B4b · elle n'est pas comptée comme ratée", jours?.etapesRatees.length === 0)
  verifie("B4c · elle fait quand même perdre ses points", jours?.pointsObtenus === 0)
  verifie("B4d · et elle remonte en priorité", b.priorites[0]?.id === "jours-ouvres")
}

/* B5 — compétence à moitié réussie : fragile, pas « à revoir ». */
{
  const b = construireBilan({
    scenario: scenarioAnnote,
    journal: journalAvecEchecs(["M10-EV01-03"]),
    idsDuScenario: idsM10,
  })
  const rt = b.competences.find((c) => c.id === "recherche-table")
  verifie("B5a · 3 points sur 5 → fragile", rt?.statut === "fragile" && rt?.pointsObtenus === 3)
}

/* B5' — une notion manquée passe devant une notion presque tenue, même moins
   chère : c'est la règle de tri, et c'est le cas qui l'a fait écrire.
   `recherche-table` perd 2 points sur 5 (fragile), `decider-avec-si` perd ses
   2 seuls points (à revoir). Le conseil doit commencer par la seconde. */
{
  const b = construireBilan({
    scenario: scenarioAnnote,
    journal: journalAvecEchecs(["M10-EV01-03", "M10-EV01-05"]),
    idsDuScenario: idsM10,
  })
  verifie("B5'a · la notion manquée est en tête", b.priorites[0]?.id === "decider-avec-si")
  verifie("B5'b · la notion fragile suit", b.priorites[1]?.id === "recherche-table")
  verifie("B5'c · pertes en points identiques", b.priorites[0].pointsTotal - b.priorites[0].pointsObtenus === 2)
}

/* B6 — évaluation NON annotée : la note reste, le conseil disparaît. */
{
  const b = construireBilan({ scenario: scenarioM10, journal: journalAvecEchecs(["M10-EV01-05"]), idsDuScenario: idsM10 })
  verifie("B6a · le score est calculé", b.pointsTotal === 25 && b.pointsObtenus === 23)
  verifie("B6b · aucune compétence", b.competences.length === 0)
  verifie("B6c · couverture absente", b.couverture === "absente")
  verifie("B6d · aucune priorité", b.priorites.length === 0)
}

/* B7 — annotation partielle : diagnostic conservé, AUCUNE recommandation.
   Les points perdus sur les étapes non annotées échappent au classement : un
   « à revoir en premier » établi sur la moitié des données serait faux. */
{
  const partiel = {
    ...scenarioM10,
    remediation: {
      competences: blocM10.competences,
      parEtape: { "M10-EV01-02": "recherche-table", "M10-EV01-03": "recherche-table" },
    },
  }
  const b = construireBilan({ scenario: partiel, journal: journalAvecEchecs(["M10-EV01-13"]), idsDuScenario: idsM10 })
  verifie("B7a · couverture partielle signalée", b.couverture === "partielle")
  verifie("B7b · les étapes non annotées sont comptées", b.etapesSansCompetence === 12)
  verifie("B7c · aucune compétence inventée pour l'étape ratée", b.competences.length === 1)
  verifie("B7d · aucune priorité, même si une compétence est en échec", b.priorites.length === 0)
  verifie("B7e · le diagnostic reste lisible pour l'auteur", b.competences[0]?.id === "recherche-table")
}

/* B7' — une couverture partielle qui contiendrait une compétence en échec ne
   doit toujours rien recommander : c'est le cas que le filtre doit attraper. */
{
  const partiel = {
    ...scenarioM10,
    remediation: {
      competences: blocM10.competences,
      parEtape: { "M10-EV01-13": "simuler-emprunt", "M10-EV01-14": "simuler-emprunt" },
    },
  }
  const b = construireBilan({
    scenario: partiel,
    journal: journalAvecEchecs(["M10-EV01-13", "M10-EV01-14"]),
    idsDuScenario: idsM10,
  })
  verifie("B7'a · la compétence est bien en échec", b.competences[0]?.statut === "a-revoir")
  verifie("B7'b · et pourtant aucune priorité n'est publiée", b.priorites.length === 0)
}

/* B8 — fail-closed : UNE seule étape inconnue coupe le conseil. */
{
  const uneSeule: EntreeJournalLue[] = journalAvecEchecs([]).map((e, i) =>
    i === 4 ? { ...e, id: "ETAPE-SUPPRIMEE" } : e,
  )
  const b = construireBilan({ scenario: scenarioAnnote, journal: uneSeule, idsDuScenario: idsM10 })
  verifie("B8a · une étape inconnue suffit à fermer le bilan", b.perime)
  verifie("B8b · la note reste calculée", b.pointsTotal > 0)
  verifie("B8c · aucun conseil n'est produit", b.competences.length === 0 && b.priorites.length === 0)
}

/* B8' — sans liste de référence, le journal n'est pas vérifiable : même issue. */
{
  const b = construireBilan({ scenario: scenarioAnnote, journal: journalAvecEchecs([]), idsDuScenario: new Set<string>() })
  verifie("B8'a · référence vide → bilan fermé", b.perime && b.competences.length === 0)
  verifie("B8'b · la note survit", b.pointsTotal === 25)
}

/* B8'' — JOURNAL INCOMPLET : le sens qui manquait.
   Toutes les étapes présentes existent bien dans le scénario, donc le contrôle
   « identifiant inconnu » ne voit rien. Mais il en manque : le bilan serait
   alors calculé sur une partie des points, déclaré « couverture complète », et
   publierait un classement de priorités établi à l'aveugle. Un journal tronqué
   arrive par un bogue client, un envoi interrompu ou une requête forgée. */
{
  const complet = journalAvecEchecs(["M10-EV01-13", "M10-EV01-14"])
  const tronque = complet.filter((e) => e.id !== "M10-EV01-05" && e.id !== "M10-EV01-08")
  const b = construireBilan({ scenario: scenarioAnnote, journal: tronque, idsDuScenario: idsM10 })
  verifie("B8''a · toutes les étapes envoyées sont pourtant connues", tronque.every((e) => idsM10.has(e.id)))
  verifie("B8''b · un journal incomplet ferme le bilan", b.perime)
  verifie("B8''c · aucun conseil n'est publié", b.competences.length === 0 && b.priorites.length === 0)
  verifie("B8''d · la couverture n'est pas déclarée complète", b.couverture !== "complete")
  // Contre-épreuve : le MÊME journal complet, lui, produit bien un conseil.
  const entier = construireBilan({ scenario: scenarioAnnote, journal: complet, idsDuScenario: idsM10 })
  verifie("B8''e · contre-épreuve : le journal complet reste exploitable", !entier.perime && entier.priorites.length > 0)
  // Et une seule étape manquante suffit, y compris la dernière.
  const uneEnMoins = complet.filter((e) => e.id !== "M10-EV01-15")
  verifie(
    "B8''f · une seule étape notée manquante suffit",
    construireBilan({ scenario: scenarioAnnote, journal: uneEnMoins, idsDuScenario: idsM10 }).perime,
  )
  // Une étape NON notée absente du journal, en revanche, ne ferme rien :
  // l'énoncé d'ouverture ne compte aucun point et n'a rien à y faire.
  const sansEnonce = complet.filter((e) => e.id !== "M10-EV01-01")
  const c = construireBilan({ scenario: scenarioAnnote, journal: sansEnonce, idsDuScenario: idsM10 })
  verifie("B8''g · l'absence d'un écran de lecture ne ferme rien", !c.perime && c.priorites.length > 0)
}

/* B9 — journal absent (tentative d'avant le journal) : bilan vide et net. */
{
  const b = construireBilan({ scenario: scenarioAnnote, journal: null, idsDuScenario: idsM10 })
  verifie("B9a · rien à afficher", b.competences.length === 0 && b.pointsTotal === 0)
  verifie("B9b · pas de faux périmé", b.perime === false)
}

/* B10 — résolution des renvois : jamais de repli sur un chapitre voisin. */
{
  const parcours: ChapitreDuParcours[] = [
    { chapterId: "c-m10-l01", titre: "RECHERCHEV : retrouver une information", sectionOrder: 10, chapterOrder: 101, publie: true },
    { chapterId: "c-m10-l02", titre: "Gérer les erreurs avec SIERREUR", sectionOrder: 10, chapterOrder: 102, publie: false },
    { chapterId: "c-m10-l03", titre: "La fonction SI", sectionOrder: 10, chapterOrder: 103, publie: true },
  ]
  const r1 = resoudreRenvois(["m10-l01", "m10-l02"], parcours)
  verifie("B10a · le chapitre publié est résolu", r1.length === 1 && r1[0].chapterId === "c-m10-l01")
  verifie("B10b · le chapitre dépublié est retiré, pas remplacé", !r1.some((x) => x.chapterId === "c-m10-l03"))
  const r2 = resoudreRenvois(["m10-l09"], parcours)
  verifie("B10c · un chapitre absent ne résout rien", r2.length === 0)
  const r3 = resoudreRenvois(["m10-l01", "m10-l01"], parcours)
  verifie("B10d · pas de doublon", r3.length === 1)
  const r4 = resoudreRenvois(["m07-l01"], parcours)
  verifie("B10e · un autre module ne se rabat pas sur celui-ci", r4.length === 0)
}

/* B12 — un bloc invalide ne produit PAS un conseil partiel : il n'en produit
   aucun. Chaque variante ci-dessous a été un défaut plausible de rédaction. */
{
  const base = JSON.stringify(blocM10)
  const variantes: Array<[string, (b: any) => void]> = [
    ["compétence sans id", (b) => { delete b.competences[2].id }],
    ["compétence sans titre", (b) => { b.competences[1].titre = "  " }],
    ["deux compétences de même id", (b) => { b.competences[1].id = b.competences[0].id }],
    ["compétence sans renvoi", (b) => { b.competences[0].revoir = [] }],
    ["renvoi non textuel", (b) => { b.competences[0].revoir = [42] }],
    ["annotation vers une compétence inconnue", (b) => { b.parEtape["M10-EV01-02"] = "notion-fantome" }],
    ["annotation non textuelle", (b) => { b.parEtape["M10-EV01-02"] = true }],
    ["parEtape vide", (b) => { b.parEtape = {} }],
    ["competences vide", (b) => { b.competences = [] }],
    ["competences non tableau", (b) => { b.competences = { a: 1 } }],
    ["énoncé non textuel", (b) => { b.competences[0].enonce = 7 }],
  ]
  for (const [nom, casser] of variantes) {
    const bloc = JSON.parse(base)
    casser(bloc)
    verifie(`B12 · refusé : ${nom}`, litBlocRemediation({ remediation: bloc }) === null)
    const bilan = construireBilan({
      scenario: { ...scenarioM10, remediation: bloc },
      journal: journalAvecEchecs(["M10-EV01-13"]),
      idsDuScenario: idsM10,
    })
    verifie(`B12 · aucun conseil : ${nom}`, bilan.competences.length === 0 && bilan.priorites.length === 0)
    verifie(`B12 · note conservée : ${nom}`, bilan.pointsTotal === 25)
  }
  verifie("B12 · le bloc réel, lui, est accepté", litBlocRemediation({ remediation: JSON.parse(base) }) !== null)
}

/* B11 — plan de révision de formation : sélection sans fusion entre évaluations. */
{
  const b10 = construireBilan({
    scenario: scenarioAnnote,
    journal: journalAvecEchecs(["M10-EV01-11", "M10-EV01-12", "M10-EV01-13", "M10-EV01-14"]),
    idsDuScenario: idsM10,
  })
  const b10bis = construireBilan({
    scenario: scenarioAnnote,
    journal: journalAvecEchecs(["M10-EV01-15"]),
    idsDuScenario: idsM10,
  })
  const plan = planDeRevision([
    { chapterId: "c-ev10", titreEvaluation: "S'évaluer · Fonctions avancées", bilan: b10 },
    { chapterId: "c-ev10b", titreEvaluation: "S'évaluer · bis", bilan: b10bis },
  ])
  verifie("B11a · la perte la plus lourde arrive en tête", plan[0]?.competence.id === "simuler-emprunt")
  verifie("B11b · les points perdus sont exacts", plan[0]?.pointsPerdus === 7)
  verifie("B11c · le plan reste court", plan.length <= 3)
  // Contrat explicite : SÉLECTION, pas agrégation. Deux évaluations différentes
  // qui portent la même compétence restent deux lignes rattachées à leur module.
  const memeId = planDeRevision([
    { chapterId: "c-ev-a", titreEvaluation: "A", bilan: b10 },
    { chapterId: "c-ev-b", titreEvaluation: "B", bilan: b10 },
  ])
  const emprunts = memeId.filter((x) => x.competence.id === "simuler-emprunt")
  verifie("B11d · pas de fusion entre deux évaluations", emprunts.length === 2)
  verifie("B11e · chaque ligne garde son module d'origine", emprunts[0].chapterId !== emprunts[1].chapterId)
  verifie("B11f · les points perdus ne sont pas additionnés", emprunts.every((x) => x.pointsPerdus === 7))
  const cles = memeId.map((x) => x.cle)
  verifie("B11g · les clés sont uniques", cles.length === cles.filter((c, i) => cles.indexOf(c) === i).length)
  // Un même chapitre passé deux fois ne doit pas dupliquer la ligne.
  const doublon = planDeRevision([
    { chapterId: "c-ev-a", titreEvaluation: "A", bilan: b10 },
    { chapterId: "c-ev-a", titreEvaluation: "A", bilan: b10 },
  ])
  verifie("B11h · un chapitre en double ne double pas la ligne", doublon.filter((x) => x.competence.id === "simuler-emprunt").length === 1)
  // Un bilan à couverture partielle n'alimente pas le plan.
  const partiel = construireBilan({
    scenario: { ...scenarioM10, remediation: { competences: blocM10.competences, parEtape: { "M10-EV01-13": "simuler-emprunt" } } },
    journal: journalAvecEchecs(["M10-EV01-13"]),
    idsDuScenario: idsM10,
  })
  verifie("B11i · un bilan partiel n'entre pas dans le plan", planDeRevision([{ chapterId: "c-x", titreEvaluation: "X", bilan: partiel }]).length === 0)
}

/* ═══ Verdict ════════════════════════════════════════════════════════════ */

console.log(`\n${echecs === 0 ? "✓" : "✗"} ${total - echecs}/${total} contrôles passés`)
if (echecs > 0) process.exit(1)
