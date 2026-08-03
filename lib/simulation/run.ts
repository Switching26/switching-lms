/**
 * LE PASSAGE D'ÉVALUATION, TENU PAR LE SERVEUR.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE MODULE FERME
 *
 * La note d'une évaluation se calculait depuis deux booléens par étape —
 * `premierEssai`, `tentee` — que le NAVIGATEUR déposait dans le corps du PUT.
 * Le serveur les assainissait (rang, type, barème repris du scénario), mais il
 * les croyait. Une requête fabriquée portant tous les identifiants d'étapes avec
 * `premierEssai: true` obtenait **100 % sans avoir joué une seule étape**.
 * Reproduit avant correction, sur `m10-ev01` : 15 entrées, 25/25 points.
 *
 * La correction n'est pas un durcissement de la validation d'entrée : c'est un
 * déplacement de la source de vérité. Le client ne déclare plus AUCUNE réussite.
 * Seul `POST /api/simulations/[chapterId]/verify` écrit un verdict, et il ne
 * l'écrit qu'après avoir jugé lui-même l'observation contre le scénario en base.
 * La note finale se calcule depuis ces verdicts, et depuis rien d'autre.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CELA SUFFIT
 *
 * Fabriquer un verdict demande de produire une observation que `jugerEtape`
 * accepte — donc de connaître la réponse. Or le scénario servi en évaluation
 * n'en contient plus aucune (`expurge.ts`). Les deux verrous sont solidaires :
 * le registre ne vaut que parce que le scénario est expurgé, et l'expurgation ne
 * vaut que parce que la note ne dépend plus des affirmations du client.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LES QUATRE RÈGLES DU REGISTRE
 *
 *  1. **Un verdict par étape et par passage** — contrainte d'unicité en base, pas
 *     une vérification applicative : deux requêtes simultanées ne peuvent pas
 *     produire deux lignes.
 *  2. **`premierEssai` est immuable** — posé une fois, jamais relevé. Les essais
 *     suivants sont autorisés (l'apprenant doit pouvoir avancer) mais ils ne
 *     rendent pas le point perdu.
 *  3. **L'ordre est imposé** — on ne corrige pas l'étape 9 d'un passage qui n'a
 *     jamais dépassé la 2. Sans cela, un client pourrait balayer les étapes dans
 *     n'importe quel ordre pour sonder le juge.
 *  4. **Le passage est borné** — lié à l'apprenant, à la simulation, à son rang
 *     et à la version du scénario. Un identifiant de passage rejoué appartenant à
 *     un autre passage, ou à quelqu'un d'autre, est refusé.
 */

import { Prisma, type SimulationAttempt } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { etapesDuScenario, type EntreeJournal } from "./journal"

export type VerdictServeur = {
  stepId: string
  stepIndex: number
  premierEssai: boolean
  tentee: boolean
  reussie: boolean
  fautes: number
  passee: boolean
}

/**
 * VERROU DE PASSAGE, pour la durée d'une transaction.
 *
 * Toute écriture de verdict et la clôture passent par ce verrou : c'est lui qui
 * empêche qu'un verdict s'écrive APRÈS que la note a été calculée. Sans lui, la
 * vérification « le passage est-il ouvert ? » et l'écriture qui suit étaient
 * deux instants distincts, et il y avait de la place entre les deux.
 *
 * `FOR UPDATE` sérialise : une seconde transaction qui vise le même passage
 * attend la fin de la première, puis relit — et voit `closedAt` posé.
 */
async function verrouillerPassageOuvert(
  tx: Prisma.TransactionClient,
  runId: string,
): Promise<boolean> {
  const lignes = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "SimulationRun"
    WHERE "id" = ${runId} AND "closedAt" IS NULL
    FOR UPDATE
  `
  return lignes.length > 0
}

/* ═══════════════════════════ OUVERTURE DU PASSAGE ═══════════════════════════ */

/**
 * Le passage ACTIF d'un apprenant sur une évaluation, s'il en a un.
 *
 * Sert à la reprise : recharger la page ne doit pas ouvrir un second passage et
 * perdre les verdicts déjà acquis.
 */
export function passageActif(simulationId: string, userId: string) {
  return prisma.simulationRun.findFirst({
    where: { simulationId, userId, closedAt: null },
    orderBy: { passage: "desc" },
  })
}

/**
 * Ouvre un passage, ou rend celui qui est déjà ouvert.
 *
 * `nouveau: true` — « Repasser l'évaluation » : le passage courant est clos et un
 * rang supérieur est ouvert. Sans cela, un apprenant repassant l'évaluation
 * conserverait ses verdicts, donc son ancienne note.
 *
 * L'ouverture est IDEMPOTENTE : la contrainte d'unicité `(simulation, apprenant,
 * passage)` absorbe deux appels simultanés — le second retombe sur la ligne
 * créée par le premier au lieu d'en créer une seconde.
 */
export async function ouvrirPassage(opts: {
  simulationId: string
  userId: string
  scenarioVersion: number
  nouveau?: boolean
}) {
  const actif = await passageActif(opts.simulationId, opts.userId)

  if (actif) {
    /* REPRISE : QUE FAIT-ON D'UN PASSAGE RESTÉ OUVERT ?
     *
     * L'atelier repart TOUJOURS de la première question sur une évaluation
     * (choix Samuel du 02/08/2026 : les réussites d'une session fermée ne sont
     * pas persistées, reprendre au milieu noterait ~0 % un apprenant qui avait
     * tout juste). Reprendre le passage serveur tel quel serait donc incohérent :
     * l'apprenant rejouerait des étapes dont le registre porte déjà le verdict,
     * et une question qu'il avait passée resterait perdue alors qu'il la rejoue.
     *
     * Restaurer le classeur à l'étape atteinte n'est pas possible en évaluation :
     * l'atelier n'a plus les réponses des étapes précédentes, c'est précisément
     * ce qui ferme la fuite. La seule sémantique cohérente est donc d'ABANDONNER
     * le passage entamé et d'en ouvrir un neuf — ce que l'écran d'ouverture
     * annonce déjà en toutes lettres.
     *
     * Deux exceptions, et une seule vraie :
     *  • un passage SANS AUCUN VERDICT n'a rien coûté : le rouvrir ne perd rien
     *    et évite de brûler un rang à chaque rechargement de page ;
     *  • `nouveau` demande explicitement un passage neuf.
     *
     * Les verdicts du passage abandonné ne sont jamais réutilisés, et aucun
     * `premierEssai` acquis n'est dégradé : ils restent tels quels dans un
     * passage clos, consultables.
     */
    const dejaJoue = await prisma.simulationStepVerdict.count({ where: { runId: actif.id } })
    const memeVersion = actif.scenarioVersion === opts.scenarioVersion
    if (!opts.nouveau && memeVersion && dejaJoue === 0) return actif
    await prisma.simulationRun.update({ where: { id: actif.id }, data: { closedAt: new Date() } })
  }

  const dernier = await prisma.simulationRun.findFirst({
    where: { simulationId: opts.simulationId, userId: opts.userId },
    orderBy: { passage: "desc" },
    select: { passage: true },
  })
  const rang = (dernier?.passage ?? 0) + 1

  try {
    return await prisma.simulationRun.create({
      data: {
        simulationId: opts.simulationId,
        userId: opts.userId,
        passage: rang,
        scenarioVersion: opts.scenarioVersion,
      },
    })
  } catch {
    // Course à l'ouverture : quelqu'un a créé ce rang entre-temps. On prend le
    // sien plutôt que d'échouer — c'est le même passage.
    const existant = await prisma.simulationRun.findUnique({
      where: {
        simulationId_userId_passage: {
          simulationId: opts.simulationId,
          userId: opts.userId,
          passage: rang,
        },
      },
    })
    if (existant) return existant
    throw new Error("Ouverture du passage impossible")
  }
}

/**
 * Le passage que le navigateur DÉCLARE, s'il lui appartient vraiment.
 *
 * Sert à tenir `SimulationAttempt.attemptCount` sur le rang réel du passage,
 * plutôt que sur une condition dérivée de l'état client. Renvoie `null` pour un
 * identifiant inconnu ou appartenant à quelqu'un d'autre : l'appartenance est
 * dans le filtre, pas dans un contrôle après coup.
 */
export async function passageDeclare(
  runId: unknown,
  simulationId: string,
  userId: string,
): Promise<{ passage: number } | null> {
  if (typeof runId !== "string" || !runId.trim()) return null
  return prisma.simulationRun.findFirst({
    where: { id: runId.trim(), simulationId, userId },
    select: { passage: true },
  })
}

/* ═══════════════════════════ ÉCRITURE D'UN VERDICT ══════════════════════════ */

export type MotifRefus = "run-inconnu" | "run-clos" | "run-perime" | "hors-ordre" | "etape-inconnue"

/**
 * Retrouve le passage et vérifie qu'il a le droit de recevoir ce verdict.
 *
 * Quatre refus, tous fail-closed : passage inconnu **ou appartenant à quelqu'un
 * d'autre** (indistinguables volontairement — un identifiant de passage ne doit
 * pas révéler son existence), passage clos, version de scénario périmée, étape
 * hors de l'ordre atteint.
 */
export async function passagePourVerdict(opts: {
  runId: string
  simulationId: string
  userId: string
  scenarioVersion: number
  stepIndex: number
}): Promise<{ run: { id: string; maxStepIndex: number } } | { refus: MotifRefus }> {
  const run = await prisma.simulationRun.findFirst({
    // L'appartenance fait partie du filtre, pas d'un contrôle après coup : un
    // passage d'un autre apprenant est simplement introuvable.
    where: { id: opts.runId, simulationId: opts.simulationId, userId: opts.userId },
    select: { id: true, maxStepIndex: true, closedAt: true, scenarioVersion: true },
  })
  if (!run) return { refus: "run-inconnu" }
  if (run.closedAt) return { refus: "run-clos" }
  if (run.scenarioVersion !== opts.scenarioVersion) return { refus: "run-perime" }
  // On avance d'une étape à la fois. Revenir en arrière est permis — une
  // observation tardive de l'étape précédente arrive encore —, sauter ne l'est
  // pas : ce serait un moyen de sonder le juge sur toutes les étapes.
  //
  // Sur un passage NEUF, `maxStepIndex` vaut -1 : seule l'étape 0 est donc
  // recevable. À 0, l'étape 1 l'aurait été aussi, alors que rien n'a encore été
  // franchi.
  if (opts.stepIndex > run.maxStepIndex + 1) return { refus: "hors-ordre" }
  return { run }
}

/**
 * Le passage a-t-il le droit d'être CLÔTURÉ, et de produire une note ?
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE FONCTION FERME
 *
 * La clôture se contentait de reprendre « le passage ouvert » et de vérifier que
 * l'apprenant disait avoir atteint la dernière étape — `currentStep` et
 * `maxStepSeen`, deux nombres envoyés par le navigateur. Une requête pouvait
 * donc ouvrir un passage, n'y jouer AUCUNE étape, puis annoncer
 * `currentStep: stepCount - 1, finish: true` : le chapitre était validé, une
 * note de 0 % enregistrée, et le passage clos. Complétion forgée depuis l'état
 * client.
 *
 * Le curseur qui compte est celui du SERVEUR : `maxStepIndex`, avancé seulement
 * par une réussite jugée ici ou par une question explicitement passée. Il doit
 * avoir atteint la dernière étape du scénario. Ce que le navigateur raconte de
 * sa progression n'entre plus dans la décision.
 */
export async function passagePourCloture(opts: {
  runId: string
  simulationId: string
  userId: string
  scenarioVersion: number
  /** Nombre d'étapes du scénario : la dernière porte l'index `stepCount - 1`. */
  stepCount: number
}): Promise<{ run: { id: string; maxStepIndex: number } } | { refus: MotifRefus | "inacheve" }> {
  const run = await prisma.simulationRun.findFirst({
    // Appartenance dans le filtre : le passage d'un autre est introuvable.
    where: { id: opts.runId, simulationId: opts.simulationId, userId: opts.userId },
    select: { id: true, maxStepIndex: true, closedAt: true, scenarioVersion: true },
  })
  if (!run) return { refus: "run-inconnu" }
  /* Un passage DÉJÀ CLOS reste clôturable : c'est le retry idempotent. Le PUT
   * clôt le passage puis écrit la tentative ; si cette seconde écriture échoue,
   * le navigateur doit pouvoir réessayer sur LE MÊME passage, et non se voir
   * imposer de repasser l'évaluation. `cloturerPassage` rend alors la même note
   * sans rien modifier. */
  if (run.scenarioVersion !== opts.scenarioVersion) return { refus: "run-perime" }
  // LE CURSEUR SERVEUR, ET LUI SEUL. Un passage dont le serveur n'a jamais vu
  // la dernière étape n'est pas terminé, quoi qu'annonce le navigateur. Sur un
  // passage neuf le curseur vaut -1, donc même un scénario à une seule étape
  // exige d'avoir franchi cette étape-là.
  if (opts.stepCount <= 0 || run.maxStepIndex < opts.stepCount - 1) return { refus: "inacheve" }
  return { run }
}

/**
 * Enregistre ce qu'une observation vaut pour une étape, SANS jamais relire puis
 * réécrire.
 *
 * Chaque écriture est une instruction conditionnelle unique, donc atomique :
 * c'est ce qui rend le registre juste sous deux requêtes simultanées. Une
 * lecture suivie d'une écriture, elle, aurait pu perdre une faute — et une faute
 * perdue est un point donné à tort.
 */
export async function enregistrerVerdict(opts: {
  runId: string
  stepId: string
  stepIndex: number
  compte: "reussite" | "faute" | "tatonnement" | "rien"
}): Promise<"ecrit" | "rien-a-ecrire" | "passage-clos"> {
  const { runId, stepId, stepIndex, compte } = opts

  // Un tâtonnement ne touche pas la note : il n'a rien à écrire.
  if (compte === "tatonnement" || compte === "rien") return "rien-a-ecrire"

  return prisma.$transaction(async (tx) => {
    // AUCUNE ÉCRITURE APRÈS LA CLÔTURE. Le verrou tient jusqu'au commit : une
    // clôture concurrente attend, puis trouve le verdict déjà posé ; une
    // écriture concurrente attend, puis trouve le passage clos et renonce.
    if (!(await verrouillerPassageOuvert(tx, runId))) return "passage-clos"

    if (compte === "faute") {
      /* UNE FAUTE RETIRE LE POINT, QUEL QUE SOIT SON ORDRE D'ARRIVÉE.
       *
       * La règle est volontairement MONOTONE — `premierEssai` ne remonte
       * jamais — et c'est ce qui la rend juste sous concurrence : un seul geste
       * produit plusieurs observations, elles partent en parallèle, et leur
       * ordre d'arrivée n'est pas leur ordre d'émission. */
      const n = await tx.simulationStepVerdict.updateMany({
        where: { runId, stepId },
        data: { premierEssai: false, tentee: true, fautes: { increment: 1 } },
      })
      if (n.count === 0) {
        await tx.simulationStepVerdict
          .create({ data: { runId, stepId, stepIndex, premierEssai: false, tentee: true, fautes: 1 } })
          .catch(() =>
            tx.simulationStepVerdict.updateMany({
              where: { runId, stepId },
              data: { premierEssai: false, tentee: true, fautes: { increment: 1 } },
            }),
          )
      }
      return "ecrit"
    }

    /* RÉUSSITE. Le point « premier essai » ne s'accorde QUE si aucune faute n'a
     * été comptée ET si l'apprenant n'a pas renoncé à l'étape. Les deux
     * conditions sont dans le WHERE, donc évaluées par la base au moment de
     * l'écriture — pas par nous, avant, dans une fenêtre où tout peut changer. */
    const promu = await tx.simulationStepVerdict.updateMany({
      where: { runId, stepId, fautes: 0, passee: false },
      data: { premierEssai: true, tentee: true, reussie: true },
    })
    if (promu.count === 0) {
      // L'étape existe déjà mais ne peut plus gagner le point : on note quand
      // même qu'elle a fini par être franchie, sans toucher à la note. Une
      // question PASSÉE, elle, garde `tentee: false` — l'apprenant y a renoncé.
      const marque = await tx.simulationStepVerdict.updateMany({
        where: { runId, stepId, passee: false },
        data: { tentee: true, reussie: true },
      })
      if (marque.count === 0) {
        const dejaPassee = await tx.simulationStepVerdict.count({ where: { runId, stepId, passee: true } })
        if (dejaPassee > 0) {
          // Rien à faire : une question passée ne se regagne pas.
          await avancerCurseurDansTx(tx, runId, stepIndex)
          return "ecrit"
        }
        await tx.simulationStepVerdict
          .create({ data: { runId, stepId, stepIndex, premierEssai: true, tentee: true, reussie: true } })
          .catch(() =>
            tx.simulationStepVerdict.updateMany({
              where: { runId, stepId, passee: false },
              data: { tentee: true, reussie: true },
            }),
          )
      }
    }

    await avancerCurseurDansTx(tx, runId, stepIndex)
    return "ecrit"
  })
}

/** Avance le curseur d'ordre, sans jamais le faire reculer. */
async function avancerCurseurDansTx(
  tx: Prisma.TransactionClient,
  runId: string,
  stepIndex: number,
): Promise<void> {
  await tx.simulationRun.updateMany({
    where: { id: runId, maxStepIndex: { lt: stepIndex } },
    data: { maxStepIndex: stepIndex },
  })
}

/**
 * L'apprenant RENONCE à une étape.
 *
 * Le marqueur est posé EN BASE, et il est irréversible dans le passage : sans
 * lui, « passer » se contentait d'avancer le curseur, et une correction déjà en
 * vol pouvait revenir après coup, écrire une réussite et accorder le point d'une
 * question abandonnée. C'est `passee` qui ferme cette porte, et il est vérifié
 * dans le WHERE de la promotion — pas lu avant, puis supposé stable.
 */
export async function marquerPassee(opts: {
  runId: string
  stepId: string
  stepIndex: number
}): Promise<"ecrit" | "passage-clos"> {
  const { runId, stepId, stepIndex } = opts
  return prisma.$transaction(async (tx) => {
    if (!(await verrouillerPassageOuvert(tx, runId))) return "passage-clos"

    // Monotone, comme le retrait du point : une fois passée, l'étape le reste.
    const n = await tx.simulationStepVerdict.updateMany({
      where: { runId, stepId },
      data: { passee: true, premierEssai: false, tentee: false },
    })
    if (n.count === 0) {
      await tx.simulationStepVerdict
        .create({ data: { runId, stepId, stepIndex, passee: true, premierEssai: false, tentee: false } })
        .catch(() =>
          tx.simulationStepVerdict.updateMany({
            where: { runId, stepId },
            data: { passee: true, premierEssai: false, tentee: false },
          }),
        )
    }
    await avancerCurseurDansTx(tx, runId, stepIndex)
    return "ecrit"
  })
}

/* ═══════════════════════════ NOTE ET JOURNAL FINAUX ═════════════════════════ */

/**
 * La note d'un passage, calculée depuis les SEULS verdicts serveur.
 *
 * Une étape notée sans verdict vaut zéro : c'est une question passée, ou une
 * étape jamais franchie. Rien n'est supposé en faveur de l'apprenant, et rien
 * n'est cru du navigateur.
 */
export function noterDepuisVerdicts(
  scenario: unknown,
  verdicts: VerdictServeur[],
): { score: number; pointsObtenus: number; pointsTotal: number; journal: EntreeJournal[] } {
  const index = etapesDuScenario(scenario)
  const parEtape = new Map(verdicts.map((v) => [v.stepId, v]))

  const journal: EntreeJournal[] = []
  let pointsObtenus = 0
  let pointsTotal = 0

  index.forEach((e, id) => {
    const v = parEtape.get(id)
    journal.push({
      n: e.n,
      id,
      type: e.type,
      points: e.points,
      premierEssai: v?.premierEssai === true,
      tentee: v?.tentee === true,
    })
    // Mêmes exclusions que `computeScore` : ni écran de lecture, ni étape à zéro
    // point.
    if (e.type === "READ" || e.points <= 0) return
    pointsTotal += e.points
    if (v?.premierEssai) pointsObtenus += e.points
  })

  journal.sort((a, b) => a.n - b.n)
  return {
    score: pointsTotal > 0 ? pointsObtenus / pointsTotal : 0,
    pointsObtenus,
    pointsTotal,
    journal,
  }
}

/** Les verdicts d'un passage, dans l'ordre des étapes. */
export async function verdictsDuPassage(runId: string): Promise<VerdictServeur[]> {
  const lignes = await prisma.simulationStepVerdict.findMany({
    where: { runId },
    orderBy: { stepIndex: "asc" },
    select: { stepId: true, stepIndex: true, premierEssai: true, tentee: true, reussie: true, fautes: true, passee: true },
  })
  return lignes
}


/**
 * CLÔTURE D'UN PASSAGE — transactionnelle et IDEMPOTENTE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE NE PEUT PAS ÊTRE UNE SUITE D'APPELS
 *
 * Lire les verdicts, calculer la note, puis marquer le passage clos laissait une
 * fenêtre : un verdict encore en vol pouvait s'écrire entre le calcul et la
 * clôture, et la note enregistrée ne décrivait alors plus le registre. Tout se
 * fait donc sous le MÊME verrou que les écritures de verdicts — celles-ci
 * attendent la fin de la clôture, puis trouvent `closedAt` posé et renoncent.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EST IDEMPOTENTE
 *
 * Le PUT clôt le passage PUIS écrit la tentative de l'apprenant. Si la seconde
 * écriture échoue — réseau, redémarrage —, le passage serait clos sans que la
 * note soit visible nulle part, et l'apprenant devrait tout refaire. Reclore un
 * passage déjà clos rend donc la MÊME note, calculée depuis les mêmes verdicts,
 * sans rien modifier : le navigateur peut réessayer sa clôture autant de fois
 * qu'il le faut, sur le même passage.
 */
export async function cloturerPassage(opts: {
  runId: string
  scenario: unknown
}): Promise<{
  score: number
  pointsObtenus: number
  pointsTotal: number
  journal: EntreeJournal[]
  dejaClos: boolean
}> {
  return prisma.$transaction(async (tx) => {
    // On verrouille le passage QU'IL SOIT OUVERT OU NON : reclore doit être
    // possible, et doit rendre exactement la même chose.
    const lignes = await tx.$queryRaw<Array<{ id: string; closedAt: Date | null }>>`
      SELECT "id", "closedAt" FROM "SimulationRun" WHERE "id" = ${opts.runId} FOR UPDATE
    `
    const dejaClos = lignes.length > 0 && lignes[0].closedAt !== null

    const verdicts = await tx.simulationStepVerdict.findMany({
      where: { runId: opts.runId },
      orderBy: { stepIndex: "asc" },
      select: {
        stepId: true, stepIndex: true, premierEssai: true,
        tentee: true, reussie: true, fautes: true, passee: true,
      },
    })
    const releve = noterDepuisVerdicts(opts.scenario, verdicts)

    if (!dejaClos) {
      await tx.simulationRun.updateMany({
        where: { id: opts.runId, closedAt: null },
        data: { closedAt: new Date(), score: releve.score },
      })
    }
    return { ...releve, dejaClos }
  })
}


/**
 * REPORT DU PASSAGE SUR LA TENTATIVE — UNE FOIS ET UNE SEULE, ET SANS COURSE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LES TROIS DÉFAUTS QUE CETTE FONCTION FERME
 *
 * Le PUT ne se contente pas de clore le passage : il REPORTE ensuite sur
 * `SimulationAttempt` et `Progress`. Ce report contient des écritures qui ne
 * sont pas idempotentes — `errorCount`, `hintCount`, `timeSpentSeconds` en
 * incréments — et des écritures qui doivent être monotones — `attemptCount`,
 * `bestScore`, le journal qui va avec.
 *
 *  1. **Le même passage rejoué.** Le serveur commit, la réponse se perd, le
 *     navigateur réessaie — ce que la clôture idempotente l'autorise justement
 *     à faire. Les trois compteurs étaient incrémentés deux fois.
 *
 *  2. **Deux passages DIFFÉRENTS reportés en même temps.** C'est le défaut le
 *     plus vicieux, et le verrou posé sur la ligne du RUN ne l'attrapait pas :
 *     deux passages clos distincts du même couple (simulation, apprenant),
 *     reçus vides tous les deux, verrouillent deux lignes DIFFÉRENTES. Rien ne
 *     les sérialise, ils reportent tous les deux, et ils écrivent dans la MÊME
 *     tentative. Reproduit : rang 1 retardé, rang 2 immédiat, état final
 *     `attemptCount = 1` après être passé à 2. Même exposition sur `bestScore`
 *     et sur le journal.
 *
 *  3. **Des valeurs lues avant la transaction.** `attemptCount`, `bestScore`,
 *     `completedAt` étaient lus par la route AVANT d'entrer en transaction.
 *     Même sérialisés, deux reports successifs partaient donc du même état
 *     périmé, et le second écrasait le premier avec un `Math.max` calculé sur
 *     une valeur qui n'existait plus.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 *
 * Trois gardes, dans cet ordre, toutes dans la MÊME transaction :
 *
 *  a. **verrou consultatif sur le couple (simulation, apprenant)** —
 *     `pg_advisory_xact_lock`. Il ne porte pas sur une ligne mais sur le
 *     couple, ce qui sérialise les reports de passages DIFFÉRENTS. Il est pris
 *     EN PREMIER, toujours, pour que l'ordre de prise soit le même partout et
 *     qu'aucun interblocage ne soit possible.
 *  b. **reçu du passage** — `SimulationRun.attemptSyncedAt`, sous
 *     `FOR UPDATE`, pour le rejeu du même passage.
 *  c. **reçu de l'enveloppe** — `SimulationFlush`, pour le rejeu d'une
 *     remontée non finale, qui n'a pas de passage à clore.
 *
 * Les valeurs sensibles sont ensuite **relues dans la transaction**, après le
 * verrou, et passées au rapporteur : c'est le seul état sur lequel il a le
 * droit de calculer.
 *
 * Un réessai AVANT le commit retrouve tout dans l'état d'origine : la
 * transaction a été annulée avec les deux reçus.
 */
export async function reporterUneSeuleFois<T>(
  cle: {
    /** Passage à clore, s'il y en a un. Absent sur une remontée non finale. */
    runId: string | null
    simulationId: string
    userId: string
    /** Clé d'idempotence de l'enveloppe, produite par le navigateur. */
    enveloppe: string
  },
  reporter: (tx: Prisma.TransactionClient, frais: SimulationAttempt | null) => Promise<T>,
): Promise<{ reporte: true; valeur: T } | { reporte: false; motif: MotifNonReport }> {
  const { runId, simulationId, userId, enveloppe } = cle
  return prisma.$transaction(async (tx) => {
    /* (a) Le verrou du COUPLE, pris avant tout le reste. `hashtext` rend un
     * entier 32 bits ; la variante à deux entiers de `pg_advisory_xact_lock`
     * accepte exactement cela, et le verrou est relâché au commit comme au
     * rollback, sans rien à nettoyer. */
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${simulationId}), hashtext(${userId}))`,
    )

    // (b) Le reçu du passage, quand il y en a un.
    if (runId) {
      const verrou = await tx.$queryRaw<Array<{ attemptSyncedAt: Date | null }>>(
        Prisma.sql`SELECT "attemptSyncedAt" FROM "SimulationRun" WHERE "id" = ${runId} FOR UPDATE`,
      )
      // Passage introuvable : rien à reporter, et surtout rien à inventer.
      if (!verrou.length) return { reporte: false as const, motif: "passage-inconnu" as const }
      if (verrou[0].attemptSyncedAt != null) {
        return { reporte: false as const, motif: "deja-reporte" as const }
      }
    }

    /* (c) Le reçu de l'enveloppe. On l'INSÈRE : c'est l'insertion elle-même qui
     * fait garde, sous la contrainte d'unicité. Lire puis écrire laisserait une
     * fenêtre — ici, deux enveloppes de même clé ne peuvent pas coexister. */
    try {
      await tx.simulationFlush.create({ data: { simulationId, userId, cle: enveloppe } })
    } catch {
      return { reporte: false as const, motif: "enveloppe-deja-comptee" as const }
    }

    /* Les valeurs sensibles, relues APRÈS le verrou. Tout ce que le rapporteur
     * calcule — `Math.max` du rang, `Math.max` de la meilleure note, le journal
     * qui doit rester cohérent avec elle, la date de première réussite — doit
     * partir de cet état-là, jamais d'une lecture faite avant la transaction. */
    const frais = await tx.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId, userId } },
    })

    const valeur = await reporter(tx, frais)
    if (runId) {
      await tx.simulationRun.update({ where: { id: runId }, data: { attemptSyncedAt: new Date() } })
    }
    return { reporte: true as const, valeur }
  })
}

export type MotifNonReport = "passage-inconnu" | "deja-reporte" | "enveloppe-deja-comptee"
