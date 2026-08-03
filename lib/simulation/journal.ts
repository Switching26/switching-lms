/**
 * Journal par étape d'une tentative de simulation (`SimulationAttempt.stepLog`).
 *
 * Ce journal est une PREUVE de parcours : il alimente le détail affiché à
 * l'apprenant et, à terme, les justificatifs Qualiopi. Il transite pourtant par
 * le navigateur. Deux règles en découlent, et ce module existe pour les tenir :
 *
 *  1. Le serveur ne croit du client QUE les deux booléens qu'il est seul à
 *     connaître — l'étape a-t-elle été tentée, et réussie du premier essai.
 *     Le numéro d'étape, son type et son barème sont RECONSTRUITS depuis le
 *     scénario en base. Sinon un navigateur pourrait s'attribuer cent points ou
 *     déguiser une étape notée en écran de lecture.
 *
 *  2. Aucune cible attendue n'entre dans le journal. Il repart vers le client
 *     dans le détail des résultats : y mettre les réponses en ferait un canal
 *     de fuite pour les évaluations notées.
 */

/** Une entrée de journal, telle qu'on accepte de l'écrire en base. */
export type EntreeJournal = {
  /** Rang de l'étape dans le scénario, 1-based. Reconstruit côté serveur. */
  n: number
  id: string
  /** Type d'action, repris du scénario serveur. */
  type: string
  /** Barème de l'étape, repris du scénario serveur. */
  points: number
  premierEssai: boolean
  tentee: boolean
}

/** Une étape telle que le scénario la décrit, réduite à ce qui nous intéresse. */
type EtapeServeur = { n: number; type: string; points: number }

/**
 * Indexe les étapes du scénario par identifiant.
 *
 * Le scénario est stocké en `Json` : on ne peut rien présumer de sa forme, d'où
 * les vérifications pas à pas plutôt qu'un cast.
 */
export function etapesDuScenario(scenario: unknown): Map<string, EtapeServeur> {
  const index = new Map<string, EtapeServeur>()
  if (!scenario || typeof scenario !== "object") return index
  const steps = (scenario as { steps?: unknown }).steps
  if (!Array.isArray(steps)) return index

  steps.forEach((step, i) => {
    if (!step || typeof step !== "object") return
    const o = step as { id?: unknown; action?: unknown; points?: unknown }
    if (typeof o.id !== "string" || !o.id) return
    const action = o.action
    const type =
      action && typeof action === "object" && typeof (action as { type?: unknown }).type === "string"
        ? ((action as { type: string }).type)
        : ""
    // Même convention que `computeScore` : une étape sans barème vaut 1 point.
    const points = typeof o.points === "number" && Number.isFinite(o.points) ? o.points : 1
    index.set(o.id, { n: i + 1, type, points })
  })
  return index
}

/**
 * Assainit le journal envoyé par le navigateur, en le recalant sur le scénario.
 *
 * Une entrée dont l'identifiant n'existe pas dans le scénario est écartée : ni
 * corrigée, ni devinée. Un journal partiel vaut mieux qu'un journal inventé.
 *
 * Renvoie `undefined` si rien d'exploitable n'a été reçu, pour que la colonne
 * garde sa valeur précédente au lieu d'être écrasée par du vide.
 */
export function sanitizeStepLog(raw: unknown, scenario: unknown): EntreeJournal[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const index = etapesDuScenario(scenario)
  if (index.size === 0) return undefined

  const entrees: EntreeJournal[] = []
  const vus = new Set<string>()
  // Le journal ne peut pas être plus long que le scénario ; la tranche borne
  // aussi le coût d'un envoi volumineux.
  for (const item of raw.slice(0, index.size)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    if (typeof o.id !== "string") continue
    const etape = index.get(o.id)
    // Identifiant inconnu du scénario, ou déjà journalisé : on écarte.
    if (!etape || vus.has(o.id)) continue
    vus.add(o.id)
    entrees.push({
      n: etape.n,
      id: o.id,
      type: etape.type,
      points: etape.points,
      // Les deux seules informations que le client détient réellement.
      premierEssai: o.premierEssai === true,
      tentee: o.tentee === true || o.premierEssai === true,
    })
  }

  entrees.sort((a, b) => a.n - b.n)
  return entrees.length ? entrees : undefined
}

/**
 * Faut-il écrire ce journal en base ?
 *
 * Deux règles, chacune corrigeant un défaut concret :
 *
 *  1. **Seule une ÉVALUATION réellement terminée** dépose un journal. Sans
 *     cela, un PUT fabriqué en cours de parcours — ou un simple enregistrement
 *     d'étape — écraserait la preuve du passage complet.
 *
 *  2. **Le journal doit décrire la tentative dont on affiche la note.** Les
 *     résultats montrent `bestScore` ; laisser un retake moins bon remplacer le
 *     journal afficherait un détail qui contredit le score affiché juste à
 *     côté. On ne remplace donc que si le score courant atteint ou dépasse le
 *     meilleur — à égalité, le journal le plus frais gagne.
 */
export function doitRemplacerJournal(opts: {
  mode: string
  /** `finish` ET toutes les étapes franchies. */
  termine: boolean
  journal: EntreeJournal[] | undefined
  /** Score du passage courant, 0..1. */
  score: number | undefined
  /** Meilleur score déjà enregistré, ou null pour une première tentative. */
  bestScoreExistant: number | null
}): boolean {
  if (opts.mode !== "EVALUATION") return false
  if (!opts.termine) return false
  if (!opts.journal || opts.journal.length === 0) return false
  if (opts.score === undefined) return false
  return opts.bestScoreExistant == null || opts.score >= opts.bestScoreExistant
}

/**
 * Résumé d'un journal, EN POINTS et non en nombre d'étapes.
 *
 * Le barème de `computeScore` est pondéré : compter les étapes donnerait un
 * détail qui contredit le score affiché — « 5 sur 9 réussies » à côté d'un
 * « 15 % » sur un scénario où les étapes ne pèsent pas toutes pareil.
 *
 * Les écrans de lecture et les étapes à zéro point sont exclus, exactement
 * comme dans `computeScore`. Renvoie `null` si rien n'est notable.
 */
export function resumeJournal(
  stepLog: unknown,
): { pointsReussis: number; pointsTotal: number } | null {
  if (!Array.isArray(stepLog)) return null
  let pointsReussis = 0
  let pointsTotal = 0
  for (const item of stepLog) {
    if (!item || typeof item !== "object") continue
    const o = item as { type?: unknown; points?: unknown; premierEssai?: unknown }
    if (o.type === "READ") continue
    const points = typeof o.points === "number" && Number.isFinite(o.points) ? o.points : 1
    if (points <= 0) continue
    pointsTotal += points
    if (o.premierEssai === true) pointsReussis += points
  }
  return pointsTotal > 0 ? { pointsReussis, pointsTotal } : null
}

/**
 * Ce que l'atelier a le droit d'AFFIRMER après avoir envoyé la complétion.
 *
 * Deux affirmations, et elles étaient toutes deux faites trop tôt :
 *
 *  • « cette note est enregistrée dans Mes résultats » — annoncée même quand le
 *    serveur refusait la complétion (journal incomplet) ou quand la requête
 *    n'arrivait pas ;
 *  • « ce chapitre est terminé » (`onCompleted`, qui coche le chapitre dans le
 *    sommaire de la page apprenant) — émise AVANT la réponse, donc y compris
 *    quand la base ne cochait rien. L'écart ne se révélait qu'au rechargement.
 *
 * L'aperçu admin est le seul cas où l'on affirme sans écrire : rien n'y est
 * jamais persisté, et refuser de conclure y rendrait la relecture d'un atelier
 * interminable.
 *
 * Fonction pure, pour être vérifiable hors navigateur.
 */
export function deciderApresCompletion(opts: {
  /** Aperçu admin : aucune écriture n'était attendue. */
  preview: boolean
  /** Réponse du PUT, ou `null` si elle n'est jamais arrivée. */
  reponse: { noteEnregistree?: boolean; completed?: boolean } | null
}): { noteEnregistree: boolean; cocherLeChapitre: boolean } {
  if (opts.preview) return { noteEnregistree: true, cocherLeChapitre: true }
  const r = opts.reponse
  // STRICT dans les deux sens : seule une confirmation EXPLICITE autorise une
  // affirmation. Un champ absent, une réponse muette ou une réponse jamais
  // arrivée valent « on ne sait pas », donc « on n'affirme rien ».
  return {
    noteEnregistree: r?.noteEnregistree === true,
    cocherLeChapitre: r?.completed === true,
  }
}
