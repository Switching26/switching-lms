/**
 * Bilan par compétence d'une évaluation, et renvoi vers les leçons à revoir.
 *
 * MOTEUR PUR, SANS DÉPENDANCE. Il ne connaît ni la base, ni le parcours de
 * l'apprenant : on lui donne un scénario, un journal et une liste de référence,
 * il rend un bilan. C'est `lib/simulation/bilan.ts` qui fait le dernier pas —
 * traduire les renvois en chapitres réels et décider de ce qui est publiable —
 * et deux appelants s'en servent : la route `PUT /api/simulations/[chapterId]`
 * pour le passage qui vient d'être joué, et `lib/data/quiz.ts` pour le meilleur
 * passage affiché dans « Mes résultats ».
 *
 * Le garder pur n'est pas une coquetterie : c'est ce qui permet à
 * `check-remediation.ts` de l'éprouver sur les 27 scénarios réels et sur des
 * journaux fabriqués, sans base de données.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE LE MOTEUR SAIT, ET CE QU'IL NE SAIT PAS
 *
 * `SimulationAttempt.stepLog` ne contient QUE, par étape : son rang, son
 * identifiant, le type d'action, son barème, et deux booléens — réussie au
 * premier essai, tentée. Ni la saisie de l'apprenant, ni le nombre d'essais,
 * ni la durée. On peut donc dire « la question 3 a été ratée », jamais
 * « l'apprenant a confondu RECHERCHEV et RECHERCHEX ».
 *
 * Le lien entre une étape ratée et une leçon à revoir n'est donc PAS déductible
 * des données : il doit être DÉCLARÉ par l'auteur du scénario, dans le bloc
 * `remediation`. Aucune fonction de ce module n'infère quoi que ce soit d'un
 * texte de consigne, d'un nom de fonction Excel ou d'un type d'action — ces
 * heuristiques désignent la mauvaise leçon dès que la formation enseigne deux
 * fois la même notion, ce qui est le cas ici : `SI` est enseigné en m07-l01
 * ET en m10-l03, `SOMME.SI` en m07-l02 ET en m10-l04.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * RÈGLE DE SÛRETÉ : SILENCE PLUTÔT QU'APPROXIMATION
 *
 * Une étape sans compétence déclarée compte dans la note et n'apparaît dans
 * AUCUN conseil. Un renvoi qui ne se résout pas en chapitre réel est retiré,
 * jamais remplacé par un chapitre voisin. Une évaluation non annotée produit un
 * bilan vide : l'écran de fin retombe alors exactement sur ce qu'il affiche
 * aujourd'hui.
 */

/* ═══════════════════════ CONTENU DÉCLARÉ PAR L'AUTEUR ═══════════════════════ */

/**
 * Code de chapitre, exactement le nom du fichier de scénario sans extension :
 * `m10-l01` (leçon 1 du module 10), `m06-e02`, `m10-ev01`.
 *
 * C'est la seule clé stable dont dispose l'auteur : la base ne stocke ni code
 * ni slug, et le titre d'un chapitre peut être réécrit.
 */
export type CodeChapitre = string

export type CompetenceDeclaree = {
  /** Stable, en minuscules, unique dans l'évaluation : `recherche-table`. */
  id: string
  /** Intitulé affiché à l'apprenant, formulé en capacité : « Retrouver… ». */
  titre: string
  /** Une phrase de rappel, affichée sous l'intitulé quand la compétence est à revoir. */
  enonce?: string
  /** Chapitres à revoir, du plus utile au moins utile. Ordre respecté à l'affichage. */
  revoir: CodeChapitre[]
}

/**
 * Bloc à ajouter au scénario d'une ÉVALUATION (`Simulation.scenario` est du
 * JSON : aucune migration).
 *
 * `parEtape` est une table à part, et non un champ `competence` dans chaque
 * étape : la relecture d'un ajout de 27 blocs est tenable, celle de 295 étapes
 * modifiées ne l'est pas, et une annotation à moitié posée resterait invisible.
 */
export type BlocRemediation = {
  competences: CompetenceDeclaree[]
  /** Identifiant d'étape → identifiant de compétence. */
  parEtape: Record<string, string>
}

/* ═══════════════════════════ RÉSULTAT DU CALCUL ═══════════════════════════ */

export type StatutCompetence = "acquis" | "fragile" | "a-revoir"

export type LigneCompetence = {
  id: string
  titre: string
  enonce?: string
  pointsObtenus: number
  pointsTotal: number
  /** Rangs 1-based des étapes ratées à la première tentative, mais tentées. */
  etapesRatees: number[]
  /** Rangs 1-based des étapes jamais tentées (question passée, sortie en cours). */
  etapesNonTraitees: number[]
  revoir: CodeChapitre[]
  statut: StatutCompetence
}

export type Bilan = {
  pointsObtenus: number
  pointsTotal: number
  /** 0..1, recalculé depuis le journal. */
  score: number
  /** Toutes les compétences ayant au moins une étape notée dans le journal. */
  competences: LigneCompetence[]
  /** Au plus trois, non acquises, triées par points perdus décroissants. */
  priorites: LigneCompetence[]
  /**
   * `complete` : toutes les étapes notées portent une compétence. SEUL cas où
   *   `priorites` peut être non vide, et seul cas où l'interface a le droit
   *   d'afficher un conseil.
   * `partielle` : certaines étapes notées ne portent pas de compétence. Le
   *   diagnostic reste lisible pour l'auteur du contenu, mais aucune priorité
   *   n'est produite : conseiller une révision en ignorant une partie des
   *   points perdus, c'est conseiller à l'aveugle.
   * `absente` : aucune annotation exploitable.
   */
  couverture: "complete" | "partielle" | "absente"
  etapesSansCompetence: number
  /**
   * Le journal ne correspond pas au scénario actuel. Trois causes, une seule
   * conséquence : la note reste affichée, le bilan disparaît.
   *
   *  • au moins une étape du journal n'existe plus dans le scénario ;
   *  • au moins une étape NOTÉE du scénario manque au journal ;
   *  • aucune liste de référence n'a été fournie.
   *
   * Un seul écart suffit, dans un sens comme dans l'autre. Un scénario réécrit
   * décale les identifiants, et un journal tronqué fait classer les priorités
   * sur une partie seulement des points perdus : les deux produisent un conseil
   * faux sans rien signaler.
   */
  perime: boolean
}

/* ═════════════════════════ ENTRÉES, VOLONTAIREMENT LARGES ═════════════════ */

/** Une entrée de `SimulationAttempt.stepLog`, telle que `sanitizeStepLog` l'écrit. */
export type EntreeJournalLue = {
  n: number
  id: string
  type: string
  points: number
  premierEssai: boolean
  tentee: boolean
}

/** Un chapitre du parcours, réduit à ce qu'il faut pour résoudre un renvoi. */
export type ChapitreDuParcours = {
  chapterId: string
  titre: string
  /** `Section.order` — le semeur y met le numéro de module. */
  sectionOrder: number
  /** `Chapter.order` — 100+n pour une leçon, 200+n pour un exercice, 300+n pour une évaluation. */
  chapterOrder: number
  publie: boolean
}

export type RenvoiResolu = {
  code: CodeChapitre
  chapterId: string
  titre: string
}

/* ═══════════════════════════════ RÉSOLUTION ═══════════════════════════════ */

/**
 * Place d'un chapitre dans le parcours, déduite de son code.
 *
 * Ce n'est PAS une convention inventée ici : c'est celle qu'applique
 * `scripts/simulation/seed-module.ts`, seul écrivain de ces chapitres —
 * `Section.order = numéro de module`, `Chapter.order = (100 | 200 | 300) + index`
 * selon le genre. Le contrôle `check-remediation.ts` re-dérive ces valeurs
 * depuis les noms de fichiers réels pour vérifier qu'elles n'ont pas divergé.
 *
 * Un code hors convention renvoie `null` : on ne devine pas.
 */
export function codeVersPlace(code: string): { sectionOrder: number; chapterOrder: number } | null {
  const m = /^m(\d{2})-(ev|[le])(\d{2})$/i.exec(code.trim())
  if (!m) return null
  const module = parseInt(m[1], 10)
  const index = parseInt(m[3], 10)
  if (!module || !index) return null
  const genre = m[2].toLowerCase()
  const palier = genre === "l" ? 100 : genre === "e" ? 200 : 300
  return { sectionOrder: module, chapterOrder: palier + index }
}

/**
 * Traduit des codes en chapitres réels du parcours de l'apprenant.
 *
 * Un code qui ne correspond à aucun chapitre publié est ABANDONNÉ — pas de
 * repli sur le chapitre le plus proche, pas de lien vers le module. Mieux vaut
 * un conseil sans lien qu'un lien vers la mauvaise leçon.
 */
export function resoudreRenvois(
  codes: CodeChapitre[],
  chapitres: ChapitreDuParcours[],
): RenvoiResolu[] {
  const index = new Map<string, ChapitreDuParcours>()
  for (const c of chapitres) {
    if (!c.publie) continue
    index.set(`${c.sectionOrder}/${c.chapterOrder}`, c)
  }
  const sortie: RenvoiResolu[] = []
  const vus = new Set<string>()
  for (const code of codes) {
    const place = codeVersPlace(code)
    if (!place) continue
    const chap = index.get(`${place.sectionOrder}/${place.chapterOrder}`)
    if (!chap || vus.has(chap.chapterId)) continue
    vus.add(chap.chapterId)
    sortie.push({ code, chapterId: chap.chapterId, titre: chap.titre })
  }
  return sortie
}

/* ══════════════════════════════ CONSTRUCTION ══════════════════════════════ */

/**
 * Lit le bloc `remediation` d'un scénario JSON opaque.
 *
 * TOUT OU RIEN. La première version filtrait les entrées mal formées et gardait
 * le reste : un bloc à moitié valide produisait alors un conseil à moitié juste,
 * sans que personne le voie. Ici, la moindre anomalie rend `null` — le parcours
 * de révision disparaît entièrement pour cette évaluation, et
 * `check-remediation.ts` refuse le bloc avant même qu'il soit semé.
 *
 * Sont refusés : compétence sans `id` ou sans `titre`, `id` en double, `revoir`
 * absent, vide ou contenant autre chose que des chaînes, entrée de `parEtape`
 * dont la valeur n'est pas une chaîne, ou qui vise une compétence non déclarée.
 */
export function litBlocRemediation(scenario: unknown): BlocRemediation | null {
  if (!scenario || typeof scenario !== "object") return null
  const brut = (scenario as { remediation?: unknown }).remediation
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null
  const o = brut as { competences?: unknown; parEtape?: unknown }
  if (!Array.isArray(o.competences) || o.competences.length === 0) return null
  if (!o.parEtape || typeof o.parEtape !== "object" || Array.isArray(o.parEtape)) return null

  const competences: CompetenceDeclaree[] = []
  const ids: string[] = []
  for (const c of o.competences) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return null
    const x = c as Record<string, unknown>
    if (typeof x.id !== "string" || !x.id.trim()) return null
    if (typeof x.titre !== "string" || !x.titre.trim()) return null
    if (ids.includes(x.id)) return null
    if (x.enonce !== undefined && typeof x.enonce !== "string") return null
    if (!Array.isArray(x.revoir) || x.revoir.length === 0) return null
    if (x.revoir.some((r) => typeof r !== "string" || !r.trim())) return null
    ids.push(x.id)
    competences.push({
      id: x.id,
      titre: x.titre,
      ...(typeof x.enonce === "string" && x.enonce ? { enonce: x.enonce } : {}),
      revoir: x.revoir as string[],
    })
  }

  const parEtape: Record<string, string> = {}
  const entrees = Object.entries(o.parEtape as Record<string, unknown>)
  if (entrees.length === 0) return null
  for (const [etape, comp] of entrees) {
    if (!etape.trim()) return null
    if (typeof comp !== "string" || !comp.trim()) return null
    if (!ids.includes(comp)) return null
    parEtape[etape] = comp
  }
  return { competences, parEtape }
}

/**
 * Identifiants des étapes NOTÉES du scénario, mêmes exclusions que
 * `computeScore` : ni écran de lecture, ni étape à zéro point.
 *
 * Sert au contrôle d'EXHAUSTIVITÉ du journal. Le scénario est du JSON opaque :
 * on vérifie pas à pas plutôt que de caster.
 */
function etapesNoteesDuScenario(scenario: unknown): Set<string> {
  const ids = new Set<string>()
  if (!scenario || typeof scenario !== "object") return ids
  const steps = (scenario as { steps?: unknown }).steps
  if (!Array.isArray(steps)) return ids
  for (const step of steps) {
    if (!step || typeof step !== "object") continue
    const o = step as { id?: unknown; action?: unknown; points?: unknown }
    if (typeof o.id !== "string" || !o.id) continue
    const action = o.action
    const type =
      action && typeof action === "object" && typeof (action as { type?: unknown }).type === "string"
        ? (action as { type: string }).type
        : ""
    // Même convention que `computeScore` : une étape sans barème vaut 1 point.
    const points = typeof o.points === "number" && Number.isFinite(o.points) ? o.points : 1
    if (type === "READ" || points <= 0) continue
    ids.add(o.id)
  }
  return ids
}

/** Seuils de statut. `fragile` existe pour ne pas envoyer réviser sur une seule maladresse. */
function statutDe(obtenus: number, total: number): StatutCompetence {
  if (total <= 0 || obtenus >= total) return "acquis"
  return obtenus / total >= 0.5 ? "fragile" : "a-revoir"
}

/**
 * Construit le bilan d'UN passage.
 *
 * `journal` doit être celui du passage à décrire : celui de la tentative
 * courante pour l'écran de fin, celui stocké en base (donc le meilleur passage)
 * pour « Mes résultats ». Le module ne choisit pas à la place de l'appelant.
 *
 * `idsDuScenario` est OBLIGATOIRE : sans liste de référence, le journal n'est
 * pas vérifiable, et un bilan non vérifiable ne doit pas être affiché.
 */
export function construireBilan(opts: {
  scenario: unknown
  journal: EntreeJournalLue[] | null | undefined
  /** Identifiants d'étapes du scénario ACTUEL. Une liste vide ferme le conseil. */
  idsDuScenario: Set<string>
}): Bilan {
  const vide: Bilan = {
    pointsObtenus: 0,
    pointsTotal: 0,
    score: 0,
    competences: [],
    priorites: [],
    couverture: "absente",
    etapesSansCompetence: 0,
    perime: false,
  }

  const journal = Array.isArray(opts.journal) ? opts.journal : []
  if (journal.length === 0) return vide

  // Fail-closed, DANS LES DEUX SENS.
  //
  //  1. Une seule étape que le scénario actuel ne connaît plus, ou aucune liste
  //     de référence : le conseil est coupé. Pas de seuil de tolérance — un
  //     scénario réécrit décale les identifiants, et un bilan « à peu près
  //     juste » renvoie vers la mauvaise leçon.
  //
  //  2. Une seule étape NOTÉE du scénario absente du journal : même issue.
  //     C'est le sens qui manquait, et il était le plus dangereux : un journal
  //     tronqué — bogue client, envoi interrompu, requête forgée — voyait
  //     toutes ses étapes reconnues, donc « couverture complète », et publiait
  //     un classement des priorités établi sur une partie seulement des points
  //     perdus. Le conseil était faux sans que rien ne le signale, et le
  //     dénominateur de la note l'était aussi.
  const reference = opts.idsDuScenario
  const vusDansLeJournal = new Set(journal.map((e) => e.id))
  const attendues = etapesNoteesDuScenario(opts.scenario)
  let manqueUneEtapeNotee = false
  attendues.forEach((id) => {
    if (!vusDansLeJournal.has(id)) manqueUneEtapeNotee = true
  })
  const perime =
    reference.size === 0 || journal.some((e) => !reference.has(e.id)) || manqueUneEtapeNotee

  // Le barème : mêmes exclusions que `computeScore` et `resumeJournal` —
  // les écrans de lecture et les étapes à zéro point ne notent rien.
  const notables = journal.filter((e) => e.type !== "READ" && e.points > 0)
  let pointsObtenus = 0
  let pointsTotal = 0
  for (const e of notables) {
    pointsTotal += e.points
    if (e.premierEssai) pointsObtenus += e.points
  }
  const score = pointsTotal > 0 ? pointsObtenus / pointsTotal : 0

  const bloc = litBlocRemediation(opts.scenario)
  if (!bloc || perime) {
    return { ...vide, pointsObtenus, pointsTotal, score, perime }
  }

  const declarees = new Map(bloc.competences.map((c) => [c.id, c]))
  const lignes = new Map<string, LigneCompetence>()
  let sansCompetence = 0

  for (const e of notables) {
    const idComp = bloc.parEtape[e.id]
    const declaree = idComp ? declarees.get(idComp) : undefined
    // Étape non annotée, ou annotée vers une compétence non déclarée : elle
    // compte dans la note et ne produit aucun conseil.
    if (!declaree) {
      sansCompetence++
      continue
    }
    let ligne = lignes.get(declaree.id)
    if (!ligne) {
      ligne = {
        id: declaree.id,
        titre: declaree.titre,
        ...(declaree.enonce ? { enonce: declaree.enonce } : {}),
        pointsObtenus: 0,
        pointsTotal: 0,
        etapesRatees: [],
        etapesNonTraitees: [],
        revoir: declaree.revoir,
        statut: "acquis",
      }
      lignes.set(declaree.id, ligne)
    }
    ligne.pointsTotal += e.points
    if (e.premierEssai) ligne.pointsObtenus += e.points
    else if (e.tentee) ligne.etapesRatees.push(e.n)
    else ligne.etapesNonTraitees.push(e.n)
  }

  // Ordre d'affichage = ordre de déclaration, qui suit l'ordre du parcours.
  const competences = bloc.competences
    .map((c) => lignes.get(c.id))
    .filter((l): l is LigneCompetence => l != null)
    .map((l) => ({ ...l, statut: statutDe(l.pointsObtenus, l.pointsTotal) }))

  for (const l of competences) {
    l.etapesRatees.sort((a, b) => a - b)
    l.etapesNonTraitees.sort((a, b) => a - b)
  }

  const couverture = competences.length === 0 ? "absente" : sansCompetence > 0 ? "partielle" : "complete"

  // Une couverture incomplète ne produit AUCUNE priorité : les points perdus
  // sur les étapes non annotées sont invisibles au classement, donc le
  // « à revoir en premier » serait faux. Le détail par compétence reste
  // calculé, pour que l'auteur du contenu voie ce qui manque.
  const priorites = couverture !== "complete"
    ? []
    : competences
    .filter((l) => l.statut !== "acquis")
    .sort((a, b) => {
      // 1. Une notion manquée passe avant une notion presque tenue, même si
      //    elle coûte moins de points : renvoyer réviser ce qui est déjà à 80 %
      //    pendant qu'une notion à 0 % attend serait un mauvais conseil.
      const rang = (s: StatutCompetence) => (s === "a-revoir" ? 0 : 1)
      if (rang(a.statut) !== rang(b.statut)) return rang(a.statut) - rang(b.statut)
      // 2. À statut égal, ce qui coûte le plus cher.
      const perdusA = a.pointsTotal - a.pointsObtenus
      const perdusB = b.pointsTotal - b.pointsObtenus
      if (perdusA !== perdusB) return perdusB - perdusA
      // 3. À perte égale, la notion la plus en amont du parcours d'abord : on ne
      //    renvoie pas réviser le module 10 avant le module 6 dont il dépend.
      return placeMin(a.revoir) - placeMin(b.revoir)
    })
    .slice(0, 3)

  return {
    pointsObtenus,
    pointsTotal,
    score,
    competences,
    priorites,
    couverture,
    etapesSansCompetence: sansCompetence,
    perime,
  }
}

/** Rang du renvoi le plus amont d'une compétence, pour départager deux priorités. */
function placeMin(codes: CodeChapitre[]): number {
  let min = Number.MAX_SAFE_INTEGER
  for (const c of codes) {
    const p = codeVersPlace(c)
    if (!p) continue
    const rang = p.sectionOrder * 1000 + p.chapterOrder
    if (rang < min) min = rang
  }
  return min
}

export type EntreePlan = {
  /** Unique dans le plan : `<chapitre de l'évaluation>:<compétence>`. */
  cle: string
  competence: LigneCompetence
  /** Chapitre de l'ÉVALUATION d'où vient la priorité, pas celui à réviser. */
  chapterId: string
  titreEvaluation: string
  pointsPerdus: number
}

/**
 * SÉLECTIONNE les priorités les plus coûteuses parmi plusieurs bilans, pour
 * l'encart « À revoir en priorité » de « Mes résultats ».
 *
 * Ce n'est PAS une agrégation, et c'est délibéré : un identifiant de compétence
 * n'a de sens que dans son évaluation, `synthetiser` du module 10 et
 * `synthetiser` du module 16 seraient deux notions différentes. Additionner
 * leurs points perdus inventerait une compétence transversale que personne n'a
 * déclarée. Chaque entrée reste donc rattachée à son module d'origine, et la
 * clé le prouve.
 *
 * Les bilans dont la couverture n'est pas complète n'apportent rien : leurs
 * `priorites` sont déjà vides.
 */
export function planDeRevision(
  bilans: Array<{ chapterId: string; titreEvaluation: string; bilan: Bilan }>,
  limite = 3,
): EntreePlan[] {
  const items: EntreePlan[] = []
  const cles: string[] = []
  for (const b of bilans) {
    for (const competence of b.bilan.priorites) {
      const cle = `${b.chapterId}:${competence.id}`
      // Deux bilans du même chapitre ne devraient pas arriver ; si cela se
      // produit, on garde le premier plutôt que d'afficher deux fois la ligne.
      if (cles.includes(cle)) continue
      cles.push(cle)
      items.push({
        cle,
        competence,
        chapterId: b.chapterId,
        titreEvaluation: b.titreEvaluation,
        pointsPerdus: competence.pointsTotal - competence.pointsObtenus,
      })
    }
  }
  return items
    .sort((a, b) => b.pointsPerdus - a.pointsPerdus || placeMin(a.competence.revoir) - placeMin(b.competence.revoir))
    .slice(0, limite)
}
