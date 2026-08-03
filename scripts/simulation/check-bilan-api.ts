/**
 * Le bilan tel qu'il est PUBLIÉ : ce qu'il dit, ce qu'il tait, et quand il se tait.
 *
 *   npx tsx scripts/simulation/check-bilan-api.ts
 *
 * `check-remediation.ts` contrôle le moteur et les 27 annotations.
 * Celui-ci contrôle la couche qui les sert à l'apprenant : résolution des
 * renvois en chapitres réels, fermetures, et surtout ANTI-DIVULGATION — le
 * bilan repart au navigateur, et il ne doit contenir aucune réponse.
 *
 * Le parcours est reconstruit à partir des 246 fichiers de scénario, avec la
 * convention du semeur (`Section.order` = module, `Chapter.order` = 100/200/300
 * + index). Pas de base : c'est la couche pure qui est vérifiée.
 */

import * as fs from "fs"
import * as path from "path"
import { bilanPublie, lireJournalStocke } from "../../lib/simulation/bilan"
import { codeVersPlace, type ChapitreDuParcours, type EntreeJournalLue } from "../../lib/simulation/remediation"
import { corpusPublicDuScenario, expurgerScenarioNote } from "../../lib/simulation/expurge"
import { deciderApresCompletion, doitRemplacerJournal } from "../../lib/simulation/journal"
import { noterDepuisVerdicts } from "../../lib/simulation/run"

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

/* ═══ Le parcours, reconstruit depuis les fichiers ════════════════════════ */

const fichiers = fs.readdirSync(SCENARIOS).filter((f) => /^m\d{2}-(ev|[le])\d{2}\.json$/i.test(f)).sort()

function parcours(depublies: string[] = []): ChapitreDuParcours[] {
  return fichiers.map((f) => {
    const code = f.replace(/\.json$/i, "")
    const place = codeVersPlace(code)!
    const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))
    return {
      chapterId: `c-${code}`,
      titre: sc.title ?? code,
      sectionOrder: place.sectionOrder,
      chapterOrder: place.chapterOrder,
      publie: !depublies.includes(code),
    }
  })
}

const PARCOURS = parcours()
const evaluations = fichiers.filter((f) => /-ev\d{2}\.json$/i.test(f))

/** Journal complet d'un scénario, avec la liste des étapes ratées / passées. */
function journalDe(scenario: any, rates: string[] = [], passees: string[] = []): EntreeJournalLue[] {
  return (scenario.steps ?? []).map((s: any, i: number) => ({
    n: i + 1,
    id: s.id,
    type: s.action?.type ?? "",
    points: typeof s.points === "number" ? s.points : 1,
    premierEssai: !rates.includes(s.id) && !passees.includes(s.id),
    tentee: !passees.includes(s.id),
  }))
}

/* ═══ C. Les 27 évaluations produisent un bilan publiable ═════════════════ */

console.log(`\n=== C. Bilan publié sur les 27 évaluations ===`)
{
  let exploitables = 0
  const sansRenvoi: string[] = []
  for (const f of evaluations) {
    const scenario = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))
    const notables = (scenario.steps ?? []).filter(
      (s: any) => s.action?.type !== "READ" && (typeof s.points === "number" ? s.points : 1) > 0,
    )
    // Un passage entièrement raté : c'est le cas qui produit le plus de conseils.
    const b = bilanPublie({
      scenario,
      journal: journalDe(scenario, notables.map((s: any) => s.id)),
      chapitres: PARCOURS,
    })
    if (b.exploitable) exploitables++
    verifie(`C1 · ${f} : le bilan est exploitable`, b.exploitable)
    verifie(`C2 · ${f} : au plus trois priorités`, b.priorites.length <= 3, `${b.priorites.length}`)
    verifie(`C3 · ${f} : score nul sur un passage entièrement raté`, b.pointsObtenus === 0 && b.pointsTotal > 0)
    verifie(`C4 · ${f} : aucune priorité acquise`, b.priorites.every((p) => p.statut !== "acquis"))
    // Chaque priorité doit porter au moins un chapitre RÉEL : un conseil sans
    // porte de sortie n'est pas un conseil.
    for (const p of b.priorites) if (!p.revoir.length) sansRenvoi.push(`${f}:${p.id}`)
    // Toutes les compétences déclarées doivent apparaître au bilan complet.
    const bloc = scenario.remediation
    verifie(
      `C5 · ${f} : toutes les compétences déclarées sont au bilan`,
      b.competences.length === bloc.competences.length,
      `${b.competences.length}/${bloc.competences.length}`,
    )
  }
  verifie("C0 · les 27 évaluations publient un bilan", exploitables === 27, `${exploitables}/27`)
  verifie("C6 · chaque priorité porte un chapitre réel", sansRenvoi.length === 0, sansRenvoi.slice(0, 5).join(", "))
}

/* ═══ D. ANTI-DIVULGATION : le bilan ne contient aucune réponse ═══════════ */

console.log(`\n=== D. Anti-divulgation du bilan ===`)
{
  /** Toutes les chaînes d'attendu d'un scénario, à toute profondeur. */
  function reponses(scenario: any): string[] {
    const out: string[] = []
    const visiter = (v: unknown, secret: boolean, prof = 0) => {
      if (prof > 12) return
      if (typeof v === "string" || typeof v === "number") {
        if (secret) out.push(String(v))
        return
      }
      if (Array.isArray(v)) return v.forEach((e) => visiter(e, secret, prof + 1))
      if (!v || typeof v !== "object") return
      for (const [cle, val] of Object.entries(v as Record<string, unknown>)) {
        visiter(val, secret || ["accept", "cells", "chart", "pivot", "macro", "pageSetup", "poste", "aide", "effet"].includes(cle), prof + 1)
      }
    }
    for (const s of scenario.steps ?? []) visiter(s, false)
    return out.filter((x) => x.trim().length >= 6)
  }

  /* Comparaison INSENSIBLE AUX ACCENTS.
   *
   * Une chaîne d'attendu peut être du vocabulaire que la consigne emploie déjà :
   * `numberFormat: "monetaire"` face à « format monétaire », `type:
   * "histogramme"` face à « créez l'histogramme », `agg: "moyenne"` face à « la
   * vente moyenne ». Ce sont les mêmes mots, écrits sans accent côté machine.
   * Les compter comme fuites ferait passer le contenu de la consigne pour un
   * corrigé — et cacherait les vraies fuites dans le bruit. */
  const normaliser = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

  let confrontees = 0
  const fuites: string[] = []
  for (const f of evaluations) {
    const scenario = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))
    const notables = (scenario.steps ?? []).filter(
      (s: any) => s.action?.type !== "READ" && (typeof s.points === "number" ? s.points : 1) > 0,
    )
    const b = bilanPublie({ scenario, journal: journalDe(scenario, notables.map((s: any) => s.id)), chapitres: PARCOURS })
    const servi = normaliser(JSON.stringify(b))
    // Le corpus PUBLIC de comparaison : ce que l'apprenant a de toute façon sous
    // les yeux — consignes, classeur de départ, décor — plus le titre des
    // chapitres du parcours, qui s'affiche sur les boutons de renvoi.
    const publicVisible = normaliser(corpusPublicDuScenario(scenario) + JSON.stringify(PARCOURS))
    for (const r of reponses(scenario)) {
      confrontees++
      const aiguille = normaliser(JSON.stringify(r).slice(1, -1))
      if (servi.includes(aiguille) && !publicVisible.includes(aiguille)) fuites.push(`${f} : « ${r.slice(0, 40)} »`)
    }
    // Contrôle direct : aucune des clés d'attendu ne peut apparaître.
    for (const cle of ["accept", "anyOf", "attendu", "expected", "solution", "aide", "hint"]) {
      if (servi.includes(`"${cle}":`)) fuites.push(`${f} : clé ${cle}`)
    }
  }
  /* === LE TEXTE D'UN ENREGISTREMENT MANQUÉ DIT LA BONNE ISSUE ===========
   *
   * Il disait « Repassez l'évaluation ». Or le bouton juste en dessous ne
   * repasse rien : il réessaie l'enregistrement du MÊME passage, dont la note
   * est déjà calculée et conservée côté serveur. Envoyer l'apprenant refaire
   * quinze questions pour une panne de réseau serait une punition. */
  {
    const bf = fs.readFileSync(
      path.resolve(__dirname, "../../components/simulation/BilanFin.tsx"),
      "utf8",
    )
    const phrase = bf.slice(bf.indexOf("const phraseMeilleure"), bf.indexOf("return (", bf.indexOf("const phraseMeilleure")))
    verifie(
      "N1 · un enregistrement manqué renvoie vers le réessai, pas vers un nouveau passage",
      /Réessayez l'enregistrement ci-dessous : vous n'avez pas besoin de refaire l'évaluation\./.test(phrase),
    )
    verifie(
      "N2 · et ne demande plus de repasser l'évaluation",
      !/n'a pas été retenue[\s\S]{0,80}Repassez l'évaluation/.test(phrase),
    )
    // Le bouton visé existe bien, et il réessaie la clôture — pas un repassage.
    verifie(
      "N3 · le bouton de réessai de clôture est bien celui qui est désigné",
      /data-control="sim-reessayer-cloture"/.test(bf) && /onReessayer/.test(bf),
    )
  }

  console.log(`  ${confrontees} chaînes d'attendu confrontées au bilan publié`)
  verifie("D1 · aucune réponse dans le bilan publié", fuites.length === 0, fuites.slice(0, 5).join(" ; "))

  // D2 — et le scénario servi au GET ne porte pas le bloc `remediation` :
  // lire « m10-l02 » dans l'onglet réseau désignerait la notion d'une question.
  let avecBloc = 0
  for (const f of evaluations) {
    const servi = expurgerScenarioNote(JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8")))
    if (JSON.stringify(servi).includes("remediation")) avecBloc++
  }
  verifie("D2 · aucun scénario servi ne porte le bloc remediation", avecBloc === 0, `${avecBloc}`)
}

/* ═══ E. Les cas d'écran ══════════════════════════════════════════════════ */

console.log(`\n=== E. Cas d'écran ===`)

const m10 = JSON.parse(fs.readFileSync(path.join(SCENARIOS, "m10-ev01.json"), "utf8"))

/* E1 — 100 % : aucune priorité, toutes les compétences acquises. */
{
  const b = bilanPublie({ scenario: m10, journal: journalDe(m10), chapitres: PARCOURS })
  verifie("E1a · score plein", b.score === 1 && b.pointsObtenus === b.pointsTotal)
  verifie("E1b · aucune priorité", b.priorites.length === 0)
  verifie("E1c · toutes les compétences acquises", b.competences.every((c) => c.statut === "acquis"))
  verifie("E1d · le bilan reste exploitable", b.exploitable)
}

/* E2 — QUESTION PASSÉE : comptée comme non traitée, jamais comme ratée. */
{
  const b = bilanPublie({ scenario: m10, journal: journalDe(m10, [], ["M10-EV01-15"]), chapitres: PARCOURS })
  const ligne = b.competences.find((c) => c.id === "jours-ouvres")
  verifie("E2a · l'étape passée est en non traitée", JSON.stringify(ligne?.etapesNonTraitees) === "[15]")
  verifie("E2b · elle n'est pas comptée comme ratée", ligne?.etapesRatees.length === 0)
  verifie("E2c · elle fait perdre ses points", ligne?.pointsObtenus === 0)
  verifie("E2d · et elle remonte en priorité", b.priorites[0]?.id === "jours-ouvres")
}

/* E3 — PASSAGE COURANT ≠ MEILLEUR PASSAGE. Deux journaux différents du même
   scénario donnent deux bilans différents : c'est ce qui permet à l'écran de fin
   de décrire le passage joué pendant que « Mes résultats » décrit le meilleur. */
{
  const faible = bilanPublie({
    scenario: m10,
    journal: journalDe(m10, ["M10-EV01-11", "M10-EV01-12", "M10-EV01-13", "M10-EV01-14"]),
    chapitres: PARCOURS,
  })
  const bon = bilanPublie({ scenario: m10, journal: journalDe(m10, ["M10-EV01-05"]), chapitres: PARCOURS })
  verifie("E3a · le passage faible perd 7 points", faible.pointsTotal - faible.pointsObtenus === 7)
  verifie("E3b · le bon passage n'en perd que 2", bon.pointsTotal - bon.pointsObtenus === 2)
  verifie("E3c · les deux bilans diffèrent", faible.priorites[0]?.id !== bon.priorites[0]?.id)
  verifie("E3d · chacun décrit SON journal", faible.score < bon.score)
}

/* E4 — TENTATIVE ANCIENNE : aucun journal en base, donc aucun bilan. Pas de
   reconstitution : le détail n'a jamais été mesuré. */
{
  verifie("E4a · un journal absent ne donne rien", lireJournalStocke(null) === null)
  verifie("E4b · un journal vide non plus", lireJournalStocke([]) === null)
  verifie("E4c · une entrée sans barème est écartée", lireJournalStocke([{ id: "X", n: 1 }]) === null)
  const b = bilanPublie({ scenario: m10, journal: null, chapitres: PARCOURS })
  verifie("E4d · le bilan est fermé", !b.exploitable && b.competences.length === 0)
  verifie("E4e · et sans faux périmé", b.perime === false)
}

/* E5 — RENVOI DÉPUBLIÉ : le lien disparaît, jamais de repli sur un voisin. Si
   la compétence perd TOUS ses renvois, elle sort des priorités : un conseil sans
   porte de sortie n'est pas un conseil. */
{
  const journal = journalDe(m10, ["M10-EV01-11", "M10-EV01-12", "M10-EV01-13", "M10-EV01-14", "M10-EV01-15"])
  const avant = bilanPublie({ scenario: m10, journal, chapitres: PARCOURS })
  verifie("E5a · l'emprunt est bien en tête", avant.priorites[0]?.id === "simuler-emprunt")
  verifie("E5b · et il porte son renvoi", avant.priorites[0]?.revoir.length === 1)

  // m10-l05 est le SEUL renvoi de « simuler-emprunt ».
  const apres = bilanPublie({ scenario: m10, journal, chapitres: parcours(["m10-l05"]) })
  verifie("E5c · la compétence sans renvoi sort des priorités", !apres.priorites.some((p) => p.id === "simuler-emprunt"))
  verifie("E5d · elle reste au bilan complet", apres.competences.some((c) => c.id === "simuler-emprunt"))
  verifie("E5e · et sans lien mort", apres.competences.find((c) => c.id === "simuler-emprunt")?.revoir.length === 0)
  verifie("E5f · aucun repli sur un chapitre voisin", !JSON.stringify(apres.priorites).includes("c-m10-l04"))
  verifie("E5g · les autres priorités survivent", apres.priorites.length > 0)
}

/* E6 — JOURNAL INCOMPLET : fermeture, même si toutes les étapes envoyées sont
   connues du scénario. C'est le cas qu'un client bogué ou une requête forgée
   produit, et il publiait un classement établi sur une partie des points. */
{
  const complet = journalDe(m10, ["M10-EV01-13"])
  const tronque = complet.filter((e) => e.id !== "M10-EV01-05")
  const b = bilanPublie({ scenario: m10, journal: tronque, chapitres: PARCOURS })
  verifie("E6a · le bilan se ferme", !b.exploitable && b.perime)
  verifie("E6b · aucun conseil", b.priorites.length === 0 && b.competences.length === 0)
  verifie("E6c · contre-épreuve : le journal complet passe", bilanPublie({ scenario: m10, journal: complet, chapitres: PARCOURS }).exploitable)
}

/* E7 — ÉVALUATION NON ANNOTÉE : la note reste, le conseil disparaît. */
{
  const { remediation: _bloc, ...sansBloc } = m10
  const b = bilanPublie({ scenario: sansBloc, journal: journalDe(m10, ["M10-EV01-05"]), chapitres: PARCOURS })
  verifie("E7a · aucune compétence", b.competences.length === 0)
  verifie("E7b · couverture absente", b.couverture === "absente")
  verifie("E7c · bilan non exploitable", !b.exploitable)
  verifie("E7d · la note est pourtant calculée", b.pointsTotal === 25 && b.pointsObtenus === 23)
}

/* E8 — COUVERTURE PARTIELLE : diagnostic conservé, aucune recommandation. */
{
  const partiel = {
    ...m10,
    remediation: { competences: m10.remediation.competences, parEtape: { "M10-EV01-02": "recherche-table" } },
  }
  const b = bilanPublie({ scenario: partiel, journal: journalDe(m10, ["M10-EV01-13"]), chapitres: PARCOURS })
  verifie("E8a · couverture partielle", b.couverture === "partielle")
  verifie("E8b · aucune priorité", b.priorites.length === 0)
  verifie("E8c · non exploitable", !b.exploitable)
  verifie("E8d · la note survit", b.pointsTotal === 25)
}

/* ═══ F. LA NOTE NE VIENT QUE DES VERDICTS SERVEUR ═══════════════════════
 *
 * Le corps du PUT portait un journal de deux booléens par étape, déclarés par le
 * navigateur. Une requête fabriquée portant tous les identifiants avec
 * `premierEssai: true` obtenait 100 % sans avoir joué — reproduit sur
 * `m10-ev01` : 15 entrées, 25/25 points.
 *
 * La note se calcule désormais depuis les seuls verdicts que le serveur a
 * lui-même écrits dans `verify`. Ce que le client affirme n'entre plus nulle
 * part : `noterDepuisVerdicts` ne lit que le scénario et le registre. */

console.log(`\n=== F. La note ne vient que des verdicts serveur ===`)
{
  const verdict = (stepId: string, premierEssai: boolean, tentee = true) => ({
    stepId, stepIndex: 0, premierEssai, tentee, reussie: premierEssai, fautes: premierEssai ? 0 : 1,
  })
  const notables = (sc: any) =>
    (sc.steps ?? []).filter(
      (s: any) => s.action?.type !== "READ" && (typeof s.points === "number" ? s.points : 1) > 0,
    )

  // F1 — LE CAS FORGÉ, fermé. Aucun verdict serveur : la note est nulle, quoi
  // que le navigateur ait pu prétendre.
  {
    const r = noterDepuisVerdicts(m10, [])
    verifie("F1a · sans verdict serveur, la note est nulle", r.score === 0 && r.pointsObtenus === 0)
    verifie("F1b · le barème reste celui du scénario", r.pointsTotal === 25)
    verifie("F1c · le journal reconstruit couvre toutes les étapes", r.journal.length === (m10.steps ?? []).length)
    verifie("F1d · et n'y déclare aucune réussite", r.journal.every((e) => !e.premierEssai))
  }

  // F2 — un passage réellement joué : la note suit les verdicts, un par un.
  {
    const tous = notables(m10).map((s: any) => verdict(s.id, true))
    const parfait = noterDepuisVerdicts(m10, tous)
    verifie("F2a · tous les verdicts au premier essai valent 100 %", parfait.score === 1)
    const sansDeux = notables(m10)
      .map((s: any) => verdict(s.id, s.id !== "M10-EV01-13" && s.id !== "M10-EV01-14"))
    const partiel = noterDepuisVerdicts(m10, sansDeux)
    verifie("F2b · deux étapes manquées retirent leurs points", partiel.pointsObtenus === 20 && partiel.pointsTotal === 25)
    verifie("F2c · le journal reflète les verdicts", partiel.journal.filter((e) => e.premierEssai).length === notables(m10).length - 2)
  }

  // F3 — une étape SANS verdict vaut zéro : question passée, ou jamais franchie.
  // Rien n'est supposé en faveur de l'apprenant.
  {
    const sauf = notables(m10).filter((s: any) => s.id !== "M10-EV01-15").map((s: any) => verdict(s.id, true))
    const r = noterDepuisVerdicts(m10, sauf)
    verifie("F3a · l'étape sans verdict ne rapporte rien", r.pointsObtenus === 23 && r.pointsTotal === 25)
    const ligne = r.journal.find((e) => e.id === "M10-EV01-15")
    verifie("F3b · elle est journalisée comme non tentée", ligne?.tentee === false && ligne?.premierEssai === false)
  }

  // F4 — un verdict INVENTÉ sur une étape inconnue du scénario n'ajoute rien :
  // le barème et la liste des étapes viennent du scénario, jamais du registre.
  {
    const r = noterDepuisVerdicts(m10, [verdict("ETAPE-QUI-N-EXISTE-PAS", true), verdict("M10-EV01-02", true)])
    verifie("F4a · l'étape inconnue est ignorée", r.journal.every((e) => e.id !== "ETAPE-QUI-N-EXISTE-PAS"))
    verifie("F4b · seule l'étape réelle compte", r.pointsObtenus === 3 && r.pointsTotal === 25)
  }

  // F5 — les 27 évaluations : un registre complet retombe sur le barème exact.
  {
    let ecarts = 0
    for (const f of evaluations) {
      const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))
      const r = noterDepuisVerdicts(sc, notables(sc).map((s: any) => verdict(s.id, true)))
      const attendu = notables(sc).reduce((a: number, s: any) => a + (typeof s.points === "number" ? s.points : 1), 0)
      if (r.score !== 1 || r.pointsTotal !== attendu) ecarts++
    }
    verifie("F5 · les 27 évaluations se notent depuis leurs verdicts", ecarts === 0, `${ecarts} écart(s)`)
  }

  // F6 — LEÇONS ET EXERCICES INTACTS : ils ne déposent pas de journal.
  {
    const journal = noterDepuisVerdicts(m10, notables(m10).map((s: any) => verdict(s.id, true))).journal
    verifie("F6a · une leçon ne dépose jamais de journal",
      !doitRemplacerJournal({ mode: "LESSON", termine: true, journal, score: 1, bestScoreExistant: null }))
    verifie("F6b · ni un exercice",
      !doitRemplacerJournal({ mode: "EXERCISE", termine: true, journal, score: 1, bestScoreExistant: null }))
    verifie("F6c · un envoi non terminé n'écrit rien",
      !doitRemplacerJournal({ mode: "EVALUATION", termine: false, journal, score: 1, bestScoreExistant: null }))
  }

  // F7 — un passage MOINS bon ne remplace pas le journal du meilleur.
  {
    const moins = noterDepuisVerdicts(m10, notables(m10).map((s: any) => verdict(s.id, s.id !== "M10-EV01-13")))
    verifie("F7a · il ne remplace pas le meilleur",
      !doitRemplacerJournal({ mode: "EVALUATION", termine: true, journal: moins.journal, score: moins.score, bestScoreExistant: 1 }))
    verifie("F7b · à égalité, le plus frais gagne",
      doitRemplacerJournal({ mode: "EVALUATION", termine: true, journal: moins.journal, score: moins.score, bestScoreExistant: moins.score }))
  }
}

/* ═══ G. Ce que l'atelier a le droit d'affirmer après la complétion ══════ */

console.log(`\n=== G. Affirmations de fin de passage ===`)
{
  const d = deciderApresCompletion

  // G1 — cas nominal : le serveur confirme, l'atelier peut tout affirmer.
  {
    const r = d({ preview: false, reponse: { noteEnregistree: true, completed: true } })
    verifie("G1a · la note est annoncée enregistrée", r.noteEnregistree)
    verifie("G1b · le chapitre est coché", r.cocherLeChapitre)
  }

  // G2 — le serveur a REFUSÉ la complétion (journal incomplet) : ni l'un ni
  // l'autre. Annoncer « note enregistrée » serait faux, et cocher le chapitre
  // afficherait un acquis que la base ignore.
  {
    const r = d({ preview: false, reponse: { noteEnregistree: false, completed: false } })
    verifie("G2a · la note n'est pas annoncée enregistrée", !r.noteEnregistree)
    verifie("G2b · le chapitre n'est pas coché", !r.cocherLeChapitre)
  }

  // G3 — RÉSEAU TOMBÉ : la réponse n'est jamais arrivée. C'est le cas qui
  // manquait : le code ne passait à « non enregistrée » que sur un `false`
  // explicite, et laissait donc l'atelier affirmer un enregistrement qui n'avait
  // pas eu lieu.
  {
    const r = d({ preview: false, reponse: null })
    verifie("G3a · sans réponse, rien n'est affirmé", !r.noteEnregistree && !r.cocherLeChapitre)
  }

  // G4 — réponse ARRIVÉE mais MUETTE : un champ absent n'est pas une
  // confirmation. Ni la note, ni le chapitre.
  {
    const r = d({ preview: false, reponse: { noteEnregistree: true } })
    verifie("G4a · la note peut être annoncée quand elle est confirmée", r.noteEnregistree)
    verifie("G4b · mais le chapitre n'est pas coché sans confirmation", !r.cocherLeChapitre)
    const muet = d({ preview: false, reponse: {} })
    verifie("G4c · une réponse muette n'affirme rien du tout", !muet.noteEnregistree && !muet.cocherLeChapitre)
    const partiel = d({ preview: false, reponse: { completed: true } })
    verifie("G4d · une complétion sans confirmation de note n'annonce pas la note", !partiel.noteEnregistree)
  }

  // G5 — APERÇU ADMIN : rien n'est jamais écrit, et refuser de conclure rendrait
  // la relecture d'un atelier interminable.
  {
    const r = d({ preview: true, reponse: null })
    verifie("G5a · l'aperçu conclut quand même", r.noteEnregistree && r.cocherLeChapitre)
  }
}

console.log(`\n${echecs === 0 ? "✓" : "✗"} ${total - echecs}/${total} contrôles passés`)
if (echecs > 0) process.exit(1)
