/**
 * Le bilan tel qu'il est PUBLIÉ à l'apprenant.
 *
 * `remediation.ts` calcule un bilan à partir d'un journal et d'un scénario ; il
 * est pur et ne connaît ni la base ni le parcours. Ce module fait le dernier
 * pas : il traduit les renvois en chapitres réels, applique les fermetures, et
 * ne laisse sortir que ce qui est affichable.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI NE SORT JAMAIS D'ICI
 *
 * Aucune valeur attendue, aucune formule, aucune référence de cellule. Le bilan
 * ne contient que des intitulés de capacité rédigés par l'auteur, des rangs de
 * question et des identifiants de chapitre. `stepLog` lui-même n'a jamais porté
 * de cible attendue (`journal.ts`, règle 2), et `check-remediation.ts` refuse un
 * intitulé qui citerait une formule ou une cellule (A14).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LES FERMETURES, DANS L'ORDRE
 *
 *  1. journal absent, ou invérifiable contre le scénario actuel → rien ;
 *  2. bloc `remediation` absent ou mal formé → rien ;
 *  3. couverture incomplète → le détail reste, AUCUNE priorité ;
 *  4. renvoi qui ne se résout pas → le lien disparaît ; une priorité qui perd
 *     tous ses renvois sort des priorités — un conseil sans porte de sortie
 *     n'est pas un conseil.
 *
 * Dans les quatre cas la NOTE reste affichée : c'est le conseil qui se tait,
 * jamais le résultat.
 */

import {
  construireBilan,
  resoudreRenvois,
  type ChapitreDuParcours,
  type EntreeJournalLue,
  type LigneCompetence,
  type RenvoiResolu,
  type StatutCompetence,
} from "./remediation"
import { etapesDuScenario } from "./journal"

export type LignePubliee = {
  id: string
  titre: string
  enonce?: string
  statut: StatutCompetence
  pointsObtenus: number
  pointsTotal: number
  /** Rangs 1-based des questions manquées, et de celles jamais tentées. */
  etapesRatees: number[]
  etapesNonTraitees: number[]
  /** Chapitres réellement publiés vers lesquels envoyer l'apprenant. */
  revoir: RenvoiResolu[]
}

export type BilanPublie = {
  pointsObtenus: number
  pointsTotal: number
  /** 0..1, recalculé depuis le journal décrit. */
  score: number
  competences: LignePubliee[]
  /** Au plus trois, jamais acquises, toutes munies d'au moins un renvoi. */
  priorites: LignePubliee[]
  couverture: "complete" | "partielle" | "absente"
  /** Vrai quand le journal ne correspond plus au scénario actuel. */
  perime: boolean
  /** Vrai quand l'interface a le droit d'afficher des conseils. */
  exploitable: boolean
}

function publier(ligne: LigneCompetence, chapitres: ChapitreDuParcours[]): LignePubliee {
  return {
    id: ligne.id,
    titre: ligne.titre,
    ...(ligne.enonce ? { enonce: ligne.enonce } : {}),
    statut: ligne.statut,
    pointsObtenus: ligne.pointsObtenus,
    pointsTotal: ligne.pointsTotal,
    etapesRatees: ligne.etapesRatees,
    etapesNonTraitees: ligne.etapesNonTraitees,
    revoir: resoudreRenvois(ligne.revoir, chapitres),
  }
}

/**
 * Bilan publiable d'UN passage.
 *
 * `journal` est celui du passage à décrire — la tentative courante pour l'écran
 * de fin, le journal stocké (donc le meilleur passage) pour « Mes résultats ».
 * Ce module ne choisit pas à la place de l'appelant, et les deux écrans disent
 * lequel ils décrivent.
 */
export function bilanPublie(opts: {
  scenario: unknown
  journal: EntreeJournalLue[] | null | undefined
  /** Chapitres de la formation, pour résoudre les renvois. */
  chapitres: ChapitreDuParcours[]
}): BilanPublie {
  // La liste de référence vient du scénario EN BASE, jamais du client : c'est
  // elle qui rend le journal vérifiable.
  const idsDuScenario = new Set(etapesDuScenario(opts.scenario).keys())

  const brut = construireBilan({
    scenario: opts.scenario,
    journal: opts.journal,
    idsDuScenario,
  })

  const competences = brut.competences.map((l) => publier(l, opts.chapitres))
  // Une priorité sans aucun renvoi résolu ne dit à l'apprenant ni quoi rouvrir
  // ni où : elle sort. Le détail par compétence, lui, reste consultable.
  const priorites = brut.priorites
    .map((l) => publier(l, opts.chapitres))
    .filter((l) => l.revoir.length > 0)

  return {
    pointsObtenus: brut.pointsObtenus,
    pointsTotal: brut.pointsTotal,
    score: brut.score,
    competences,
    priorites,
    couverture: brut.couverture,
    perime: brut.perime,
    // Un bilan n'est exploitable que s'il décrit un passage vérifié ET
    // entièrement annoté. Sinon l'écran retombe sur la note seule.
    exploitable: !brut.perime && brut.couverture === "complete" && competences.length > 0,
  }
}

/**
 * Journal stocké → entrées lisibles.
 *
 * `SimulationAttempt.stepLog` est du JSON : on ne présume rien de sa forme.
 * Une entrée incomplète est écartée plutôt que complétée — un journal partiel
 * vaut mieux qu'un journal inventé, et `construireBilan` fermera de toute façon
 * si une étape ne correspond plus au scénario.
 */
export function lireJournalStocke(brut: unknown): EntreeJournalLue[] | null {
  if (!Array.isArray(brut)) return null
  const entrees: EntreeJournalLue[] = []
  for (const item of brut) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    if (typeof o.id !== "string" || typeof o.n !== "number" || typeof o.points !== "number") continue
    entrees.push({
      n: o.n,
      id: o.id,
      type: typeof o.type === "string" ? o.type : "",
      points: o.points,
      premierEssai: o.premierEssai === true,
      tentee: o.tentee === true || o.premierEssai === true,
    })
  }
  return entrees.length ? entrees : null
}
