import { NextRequest, NextResponse } from "next/server"
import type { Prisma, SimulationAttempt } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { doitRemplacerJournal } from "@/lib/simulation/journal"
import { cloturerPassage, passageDeclare, passagePourCloture, reporterUneSeuleFois } from "@/lib/simulation/run"
import { expurgerScenarioNote } from "@/lib/simulation/expurge"
import { publierPour } from "@/lib/simulation/registre"
import type { ActionApp } from "@/lib/simulation/contrats"
import { chargerContexteSimulation } from "@/lib/simulation/acces"
import { bilanPublie, type BilanPublie } from "@/lib/simulation/bilan"

/**
 * Simulation bureautique d'un chapitre.
 *
 * GET  → le scénario à jouer + l'état de reprise de l'apprenant.
 * PUT  → progression dans la simulation (étape, erreurs, aides) et complétion.
 *
 * Deux règles de sécurité portent ce fichier :
 *
 *  1. Mêmes gardes que /api/progress/[chapterId] : chapitre publié, apprenant
 *     inscrit, accès ni expiré ni pas encore ouvert. Un chapitre de simulation
 *     n'est pas plus public qu'une vidéo.
 *
 *  2. En mode EVALUATION, le scénario servi est EXPURGÉ des réponses attendues.
 *     En leçon et en exercice la consigne dit déjà quoi faire, donc la cible
 *     attendue ne révèle rien et la validation peut rester côté client (retour
 *     instantané). En évaluation notée, envoyer les cibles au navigateur rendrait
 *     le score sans valeur : la correction se fait alors pas à pas côté serveur.
 *     Même principe que getAssessmentForCandidate pour les tests de positionnement.
 */

type ScenarioStep = Record<string, unknown>
type Scenario = { steps?: ScenarioStep[] } & Record<string, unknown>

export async function GET(_req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const userId = session.user.id
  // Le contournement de relecture ne vaut QUE pour le GET : le PUT reste soumis
  // à publication et inscription, donc aucune progression parasite.
  const superAdmin = session.user.role === "SUPER_ADMIN"

  const ctx = await chargerContexteSimulation(params.chapterId, userId, superAdmin)
  if ("error" in ctx) return ctx.error
  const { simulation } = ctx

  const attempt = await prisma.simulationAttempt.findUnique({
    where: { simulationId_userId: { simulationId: simulation.id, userId } },
    select: {
      currentStep: true,
      maxStepSeen: true,
      errorCount: true,
      hintCount: true,
      bestScore: true,
      attemptCount: true,
      completedAt: true,
    },
  })

  const raw = (simulation.scenario ?? {}) as Scenario
  const graded = simulation.mode === "EVALUATION"

  return NextResponse.json(
    {
      id: simulation.id,
      app: simulation.app,
      mode: simulation.mode,
      stepCount: simulation.stepCount,
      version: simulation.version,
      // Le client corrige lui-même en leçon/exercice, jamais en évaluation.
      // Ce drapeau est LU par l'atelier : à faux, il n'a plus les réponses et
      // demande le verdict à `verify`.
      clientValidation: !graded,
      /*
       * 🔴 LA PROJECTION DOIT ÊTRE CELLE DE L'APPLICATION, PAS CELLE D'EXCEL.
       *
       * `expurgerScenarioNote` retombe sur `actionPublique` — la projection
       * d'EXCEL — quand on ne lui en passe aucune. Les types préfixés `W_`,
       * `P_` et `O_` tombent alors dans son `default`, qui ne conserve que le
       * `type` : toute l'action est jetée avant d'atteindre l'apprenant.
       *
       * Ce n'était pas qu'un affichage dégradé. `WordPlayer` construit
       * `zonesCibles` depuis `cible(action)` — l'action SERVIE — et
       * `lireEtat(zonesCibles)` ne calcule le format que de ces zones-là.
       * Privé de sa `zone`, un `W_EXPECT_FORMAT` n'était donc JAMAIS observé :
       * le juge répondait éternellement « pas encore posée » à un apprenant qui
       * venait de mettre le passage en gras. 28 étapes notées, 9 évaluations
       * Word sur 19, dont deux plafonnées à 58,8 %.
       *
       * `publierPour` déduit l'application du PRÉFIXE de chaque action, comme
       * `adaptateurPourType` : le choix se fait action par action, jamais
       * d'après `simulation.app`. Excel n'ayant pas de préfixe lui revient, et
       * `adaptateurExcel.publier` EST `actionPublique` — les 27 évaluations en
       * production reçoivent donc exactement les mêmes octets qu'avant.
       *
       * Le registre est importé ICI et non dans `expurge.ts` : `registre.ts →
       * excel-adaptateur.ts → expurge.ts`, donc l'importer là-bas fermerait un
       * cycle d'initialisation sur le fichier même qui protège les notes. Une
       * route est un consommateur, en bout de chaîne : elle peut.
       */
      scenario: graded ? expurgerScenarioNote(raw, (a) => publierPour(a as ActionApp)) : raw,
      attempt: attempt ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PUT(req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const userId = session.user.id

  const ctx = await chargerContexteSimulation(params.chapterId, userId)
  if ("error" in ctx) return ctx.error
  const { chapter, simulation } = ctx

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  // `score` n'est plus lu : la note d'une évaluation est recalculée côté serveur
  // (voir plus bas). Le champ n'est même plus extrait du corps, pour qu'aucune
  // relecture future ne croie pouvoir s'en servir.
  const { currentStep, errorDelta, hintDelta, timeDeltaSeconds, finish, newSession, runId, enveloppe } =
    body as {
      currentStep?: unknown
      errorDelta?: unknown
      hintDelta?: unknown
      timeDeltaSeconds?: unknown
      finish?: unknown
      newSession?: unknown
      runId?: unknown
      enveloppe?: unknown
    }

  /* LA CLÉ DE L'ENVELOPPE EST OBLIGATOIRE.
   *
   * Chaque remontée porte des deltas qui s'AJOUTENT. Sans clé, une réponse
   * perdue puis un renvoi de la même enveloppe comptaient deux fois les erreurs,
   * les aides et le temps passé. La clé scelle l'enveloppe : le serveur la
   * dépose dans la même transaction que les incréments, et une clé déjà vue
   * n'écrit plus rien. Elle est exigée, jamais suppléée — une clé inventée ici
   * rouvrirait le trou en silence. */
  const cleEnveloppe = typeof enveloppe === "string" ? enveloppe.trim() : ""
  if (!cleEnveloppe || cleEnveloppe.length > 100) {
    return NextResponse.json(
      { error: "Remontée non recevable", motif: "enveloppe-absente" },
      { status: 400 },
    )
  }

  // Bornage systématique de tout ce qui vient du navigateur.
  const clampInt = (v: unknown, max: number): number | undefined => {
    if (v === undefined || v === null) return undefined
    const n = Number(v)
    if (!Number.isFinite(n)) return undefined
    return Math.min(Math.max(Math.round(n), 0), max)
  }
  const lastStepIndex = Math.max(simulation.stepCount - 1, 0)
  const safeStep = clampInt(currentStep, lastStepIndex)
  // Un envoi ne peut pas déclarer plus d'une poignée d'erreurs ou d'aides :
  // le client flush à chaque étape, pas en fin de parcours.
  const safeErrors = clampInt(errorDelta, 50) ?? 0
  const safeHints = clampInt(hintDelta, 50) ?? 0
  const safeTime = clampInt(timeDeltaSeconds, 900) ?? 0
  /* LE NAVIGATEUR NE DÉCLARE PLUS AUCUNE RÉUSSITE.
   *
   * Le corps du PUT portait un `stepLog` de deux booléens par étape, et un
   * `score`. Les deux venaient du client. Une requête fabriquée portant tous les
   * identifiants avec `premierEssai: true` obtenait 100 % sans avoir joué —
   * reproduit sur `m10-ev01` : 15 entrées, 25/25 points.
   *
   * La note d'une évaluation se calcule désormais depuis les seuls verdicts que
   * le serveur a lui-même écrits, étape par étape, dans `verify`. Le champ
   * `stepLog` du corps n'est plus lu, et le journal déposé en base est
   * RECONSTRUIT depuis ces verdicts. */
  const existing = await prisma.simulationAttempt.findUnique({
    where: { simulationId_userId: { simulationId: simulation.id, userId } },
  })

  const nextStep = safeStep ?? existing?.currentStep ?? 0
  /* `maxStepSeen` ne recule jamais : la navigation est libre, revenir en arrière
   * ne doit pas faire perdre la progression réellement atteinte. Le maximum est
   * donc pris sur l'état RELU DANS LA TRANSACTION — le prendre sur `existing`,
   * lu avant le verrou, laissait un report concurrent le faire reculer. */
  const nextMax = (frais: SimulationAttempt | null) => Math.max(nextStep, frais?.maxStepSeen ?? 0)
  // Pour les seules décisions prises AVANT la transaction (complétion déclarée),
  // la lecture d'entrée suffit : elles ne sont pas monotones et sont revérifiées
  // sur `attempt.maxStepSeen` après écriture.
  const maxDeclare = nextMax(existing)
  const done = finish === true
  const nowDate = new Date()
  // Le chapitre n'est terminé que si TOUTES les étapes ont été franchies. On
  // applique la même règle à la tentative : sans cela une tentative pouvait
  // porter une date de fin alors que le chapitre restait inachevé.
  const toutesEtapes = simulation.stepCount > 0 && maxDeclare >= simulation.stepCount - 1

  /* LA NOTE VIENT DU REGISTRE SERVEUR, ET DE LUI SEUL.
   *
   * À la clôture d'une évaluation, on relit le passage ouvert et ses verdicts —
   * ceux que `verify` a écrits, étape par étape, après avoir jugé lui-même
   * chaque observation. Le journal déposé en base est reconstruit à partir de
   * là ; le navigateur n'a plus rien déclaré.
   *
   * Sans passage ouvert, il n'y a rien à noter : c'est le cas d'une requête qui
   * arrive sans être passée par l'atelier. Fail-closed — pas de note, pas de
   * complétion.
   *
   * Leçons et exercices ne sont pas concernés : ils ne notent rien. */
  const evaluation = simulation.mode === "EVALUATION"

  /* LA CLÔTURE EXIGE LE PASSAGE EXACT, ET UN CURSEUR SERVEUR ARRIVÉ AU BOUT.
   *
   * Le passage n'est plus « celui qui est ouvert » : le navigateur doit le
   * désigner, et il doit lui appartenir, porter la bonne version de scénario, ne
   * pas être clos, et surtout avoir vu sa DERNIÈRE étape passer côté serveur.
   * `toutesEtapes` (dérivé de `currentStep`/`maxStepSeen`, deux nombres du
   * client) ne suffit plus : il ne sert qu'aux leçons et aux exercices, qui ne
   * notent rien. */
  const cloture =
    done && evaluation && typeof runId === "string" && runId.trim()
      ? await passagePourCloture({
          runId: runId.trim(),
          simulationId: simulation.id,
          userId,
          scenarioVersion: simulation.version,
          stepCount: simulation.stepCount,
        })
      : null
  const run = cloture && !("refus" in cloture) ? cloture.run : null
  // Le rang du passage sert à tenir `attemptCount` à jour, y compris quand la
  // clôture est refusée : le passage a bien été ouvert, il compte.
  const rangDuPassage = evaluation ? (await passageDeclare(runId, simulation.id, userId))?.passage ?? null : null
  /* La clôture est TRANSACTIONNELLE et IDEMPOTENTE : elle lit les verdicts,
   * calcule la note et pose `closedAt` sous un seul verrou, si bien qu'aucun
   * verdict ne peut s'écrire entre le calcul et la clôture. Reclore un passage
   * déjà clos rend la MÊME note sans rien modifier — c'est ce qui permet au
   * navigateur de réessayer sa clôture quand l'écriture de la tentative a
   * échoué, sans imposer de repasser l'évaluation. */
  const releve = run ? await cloturerPassage({ runId: run.id, scenario: simulation.scenario }) : null
  const scoreServeur = releve?.score
  const safeStepLog = releve?.journal

  // Hors évaluation, la complétion reste celle d'avant : franchir toutes les
  // étapes. En évaluation, c'est le curseur serveur qui décide, et lui seul.
  const termine = evaluation ? done && releve !== null : done && toutesEtapes
  /* LE NOMBRE DE PASSAGES VIENT DU SERVEUR, PAS DU CLIENT.
   *
   * `attemptCount` était incrémenté sur une condition dérivée de l'état
   * client — « une tentative était terminée, et voilà un envoi à l'étape 0 ».
   * Un navigateur pouvait donc le gonfler, ou l'empêcher de bouger.
   *
   * En ÉVALUATION, il est désormais recopié du rang du passage serveur : c'est
   * `SimulationRun.passage`, incrémenté par la seule route d'ouverture, et il
   * compte exactement les passages réellement ouverts. Leçons et exercices,
   * eux, n'ouvrent pas de passage et gardent l'ancienne règle — ils ne notent
   * rien, et le compteur n'y sert qu'à l'affichage. */
  const nouvelleTentative = (frais: SimulationAttempt | null) =>
    !evaluation && Boolean(frais?.completedAt) && !done && nextStep === 0
  // Le journal n'est déposé que par une évaluation réellement terminée, et
  // seulement s'il décrit la tentative dont la note sera affichée.
  const ecrireJournal = (frais: SimulationAttempt | null) =>
    doitRemplacerJournal({
      mode: simulation.mode,
      termine,
      journal: safeStepLog,
      score: scoreServeur,
      // Relu dans la transaction : le journal doit rester cohérent avec la
      // meilleure note RÉELLE, pas avec celle qu'on avait vue avant le verrou.
      bestScoreExistant: frais?.bestScore ?? null,
    })

  /* LE REPORT EST FAIT UNE FOIS ET UNE SEULE — voir `reporterUneSeuleFois`.
   *
   * Tout ce qui suit contient des incréments (`errorCount`, `hintCount`,
   * `timeSpentSeconds`) et une écriture de rang (`attemptCount`). Rejoué, il
   * doublerait les compteurs. Il est donc emballé dans une fonction, que la
   * clôture d'une évaluation exécute sous reçu, et que le reste — leçons,
   * exercices, envois de progression — appelle directement : eux n'ont pas de
   * passage serveur, et leurs envois successifs DOIVENT bien s'additionner. */
  const reporter = async (
    db: Prisma.TransactionClient,
    /* L'ÉTAT RELU DANS LA TRANSACTION, après le verrou du couple. C'est le seul
     * sur lequel il est permis de calculer : `existing`, lu à l'entrée de la
     * route, est périmé dès qu'un autre report a commité entre-temps. */
    frais: SimulationAttempt | null,
  ) => {
  const attempt = await db.simulationAttempt.upsert({
    where: { simulationId_userId: { simulationId: simulation.id, userId } },
    create: {
      simulationId: simulation.id,
      userId,
      currentStep: nextStep,
      maxStepSeen: nextMax(frais),
      errorCount: safeErrors,
      hintCount: safeHints,
      // Le score n'existe qu'à la complétion d'une évaluation, et il vient du
      // serveur. En cours de parcours, aucune note n'est écrite.
      score: termine ? scoreServeur : undefined,
      bestScore: termine ? scoreServeur : undefined,
      stepLog: (ecrireJournal(frais) ? safeStepLog : undefined) as never,
      completedAt: termine ? nowDate : null,
    },
    update: {
      // Sur une nouvelle tentative on repart d'une date de fin vide, pour que
      // celle-ci puisse être atteinte de nouveau. La preuve de parcours n'est pas
      // perdue : c'est `Progress.completedAt` du chapitre qui porte, et il
      // n'est jamais remis à zéro. La tentative décrit le passage en cours,
      // `Progress` décrit l'acquis.
      ...(nouvelleTentative(frais) ? { attemptCount: { increment: 1 }, completedAt: null } : {}),
      /* Synchronisation du compteur d'essais sur le rang du passage serveur.
       * `Math.max` et non une affectation sèche : un ancien passage clos rejoué
       * porte un rang PLUS PETIT, et le recopier tel quel ferait reculer le
       * compteur — l'apprenant verrait son nombre d'essais diminuer. */
      ...(evaluation && rangDuPassage
        ? { attemptCount: Math.max(frais?.attemptCount ?? 0, rangDuPassage) }
        : {}),
      currentStep: nextStep,
      maxStepSeen: nextMax(frais),
      errorCount: { increment: safeErrors },
      hintCount: { increment: safeHints },
      // Idem : on n'écrit une note QUE pour une évaluation réellement terminée,
      // journal complet à l'appui. Un envoi de progression n'a pas de note à
      // porter, et un passage fermé par la garde ci-dessus n'en produit aucune.
      ...(termine && scoreServeur !== undefined
        ? {
            score: scoreServeur,
            // bestScore survit à une reprise moins réussie.
            bestScore:
              frais?.bestScore != null ? Math.max(frais.bestScore, scoreServeur) : scoreServeur,
          }
        : {}),
      ...(ecrireJournal(frais) ? { stepLog: safeStepLog as never } : {}),
      // On ne réécrit pas completedAt d'une simulation déjà terminée : la date
      // de première réussite est ce qui compte pour les preuves de parcours.
      ...(termine && !frais?.completedAt ? { completedAt: nowDate } : {}),
    },
  })

  // Complétion du CHAPITRE : une simulation est terminée quand toutes ses étapes
  // ont été franchies. Contrairement à la vidéo, il n'y a pas de seuil à 25/50 % —
  // franchir une étape suppose d'avoir réellement effectué la bonne action.
  // Même garde qu'au-dessus : une évaluation sans passage serveur exploitable ne
  // valide pas le chapitre. `Progress.completedAt` est une preuve de parcours,
  // elle ne se pose pas sur un passage dont on ne peut rien affirmer.
  const chapterCompleted =
    done &&
    simulation.stepCount > 0 &&
    attempt.maxStepSeen >= simulation.stepCount - 1 &&
    (!evaluation || releve !== null)

  await db.progress.upsert({
    where: { userId_chapterId: { userId, chapterId: chapter.id } },
    create: {
      userId,
      chapterId: chapter.id,
      timeSpentSeconds: safeTime,
      lastPosition: nextStep,
      sessionCount: 1,
      completedAt: chapterCompleted ? nowDate : null,
    },
    update: {
      timeSpentSeconds: { increment: safeTime },
      lastPosition: nextStep,
      // Une seule incrémentation par session, comme le suivi vidéo : le client
      // envoie une remontée à chaque étape, compter chacune comme une session
      // aurait gonflé le chiffre d'un facteur dix.
      sessionCount: { increment: newSession === true ? 1 : 0 },
      ...(chapterCompleted ? { completedAt: nowDate } : {}),
    },
  })
    return { attempt, chapterCompleted }
  }

  /* TOUT REPORT PASSE PAR LE MÊME CHEMIN — clôture d'évaluation comme simple
   * remontée de progression. C'est ce qui garantit qu'ils sont sérialisés ENTRE
   * EUX : le verrou porte sur le couple (simulation, apprenant), pas sur une
   * ligne de passage, et deux passages distincts du même apprenant ne peuvent
   * plus reporter en parallèle dans la même tentative.
   *
   * Quand le report est refusé — passage déjà reporté, ou enveloppe déjà
   * comptée — on ne réécrit RIEN : on rend l'état tel qu'il est en base. */
  let report: { attempt: SimulationAttempt; chapterCompleted: boolean }
  const passageAClore = evaluation && releve !== null && run ? run.id : null
  const fait = await reporterUneSeuleFois(
    {
      runId: passageAClore,
      simulationId: simulation.id,
      userId,
      enveloppe: cleEnveloppe,
    },
    reporter,
  )
  if (fait.reporte) {
    report = fait.valeur
  } else {
    const dejaLa = await prisma.simulationAttempt.findUnique({
      where: { simulationId_userId: { simulationId: simulation.id, userId } },
    })
    const progres = await prisma.progress.findUnique({
      where: { userId_chapterId: { userId, chapterId: chapter.id } },
      select: { completedAt: true },
    })
    if (!dejaLa) {
      // Refus sans tentative en base : il n'y a rien d'honnête à répondre.
      return NextResponse.json(
        { error: "Remontée non recevable", motif: fait.motif },
        { status: 409 },
      )
    }
    report = { attempt: dejaLa, chapterCompleted: progres?.completedAt != null }
  }

  /* LA NOTE EST-ELLE VRAIMENT ENREGISTRÉE ?
   *
   * Cette réponse vient du REÇU DU PASSAGE, et de rien d'autre. Deux versions
   * fausses l'ont précédée :
   *
   *  · `termine` seul, qui disait seulement « la clôture est valide » : un
   *    report refusé continuait d'annoncer une note écrite ;
   *  · puis une comparaison `score === scoreServeur && completedAt != null`,
   *    qui reste un faux positif dès qu'un passage ANTÉRIEUR portait exactement
   *    la même note. Un score identique ne prouve pas que CE passage-ci a été
   *    reporté.
   *
   * Le reçu, lui, le prouve : ou bien le report vient d'avoir lieu, ou bien il
   * est refusé parce que CE passage porte déjà son reçu — c'est-à-dire qu'il a
   * bel et bien été reporté. Toute autre issue, y compris une collision de clé
   * d'enveloppe sur un passage jamais reporté, vaut « non enregistrée ». */
  const noteAcquittee =
    passageAClore !== null && (fait.reporte === true || fait.motif === "deja-reporte")
  const { attempt, chapterCompleted } = report

  /**
   * BILAN DU PASSAGE QUI VIENT D'ÊTRE JOUÉ.
   *
   * Il décrit la tentative COURANTE, pas la meilleure — c'est celle que
   * l'apprenant vient de vivre, et lui montrer le bilan d'un passage antérieur
   * serait incompréhensible. « Mes résultats » décrit l'autre, à partir du
   * journal stocké, et les deux écrans disent lequel ils décrivent.
   *
   * Le journal employé est `safeStepLog`, celui que le serveur vient de recaler
   * sur le scénario en base — jamais celui envoyé par le navigateur.
   */
  let bilan: BilanPublie | null = null
  if (termine && evaluation && safeStepLog) {
    // Les chapitres de la formation, pour traduire « m10-l05 » en chapitre réel.
    // Une seule requête, sur la formation déjà chargée.
    const chapitres = await prisma.chapter.findMany({
      where: { formationId: chapter.formationId },
      select: { id: true, title: true, order: true, isPublished: true, section: { select: { order: true } } },
    })
    bilan = bilanPublie({
      scenario: simulation.scenario,
      journal: safeStepLog,
      chapitres: chapitres.map((c) => ({
        chapterId: c.id,
        titre: c.title,
        sectionOrder: c.section?.order ?? 0,
        chapterOrder: c.order,
        publie: c.isPublished,
      })),
    })
  }

  return NextResponse.json({
    ok: true,
    ...(bilan ? { bilan } : {}),
    /* L'atelier doit pouvoir être HONNÊTE sur ce qui a été enregistré.
     *
     * Quand la garde ci-dessus ferme le passage — journal incomplet — aucune
     * note n'est écrite. Sans ce drapeau, la carte de fin continuerait
     * d'annoncer « cette note est enregistrée dans Mes résultats », ce qui
     * serait faux. Il n'est émis que là où il a un sens : la fin d'une
     * évaluation.
     *
     * Il vient du reçu du passage — voir `noteAcquittee` plus haut. */
    ...(done && evaluation ? { noteEnregistree: noteAcquittee } : {}),
    currentStep: attempt.currentStep,
    maxStepSeen: attempt.maxStepSeen,
    errorCount: attempt.errorCount,
    hintCount: attempt.hintCount,
    bestScore: attempt.bestScore,
    completed: chapterCompleted,
  })
}
