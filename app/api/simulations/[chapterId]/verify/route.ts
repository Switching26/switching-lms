/**
 * Correction d'UNE étape, côté serveur, pour les simulations notées.
 *
 * POURQUOI CETTE ROUTE EXISTE
 * En mode EVALUATION, le scénario servi au navigateur ne doit pas contenir les
 * réponses attendues : sinon la note ne vaut rien, il suffit de lire la réponse
 * dans l'onglet réseau. Mais un scénario privé de ses réponses n'est plus
 * corrigible par le client — d'où cette route : le navigateur envoie ce que
 * l'apprenant a FAIT (l'observation), le serveur le confronte à l'étape réelle
 * qu'il relit en base, et ne renvoie qu'un verdict.
 *
 * Le juge est `jugerEtape`, exactement le même que côté navigateur en leçon et
 * en exercice. Deux implémentations finiraient par donner deux verdicts
 * différents sur la même action, et l'apprenant aurait raison de s'en plaindre.
 *
 * Ce que la réponse ne dit JAMAIS : la valeur attendue, la formule acceptée, ni
 * la cellule visée. Un message d'aide en cas d'échec reste possible — il est
 * rédigé par `validateStep` et ne révèle pas la réponse.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TROIS GARDES, ET POURQUOI CHACUNE
 *
 *  1. Les MÊMES accès que la route qui sert le scénario : `chargerContexteSimulation`
 *     est partagé. Cette route en avait sa propre version, plus permissive —
 *     elle ignorait l'expiration et la date d'ouverture de l'inscription. Tant
 *     qu'elle n'était appelée par personne, l'écart ne se voyait pas.
 *  2. RÉSERVÉE aux évaluations notées. Une leçon corrige côté navigateur avec
 *     son scénario complet ; lui ouvrir un juge distant n'apporterait rien et
 *     offrirait un oracle « ma réponse est-elle bonne ? » sur des chapitres qui
 *     n'en ont pas besoin.
 *  3. `stepId` OBLIGATOIRE et concordant avec le rang. Le rang seul ne suffit
 *     pas : un scénario corrigé entre le chargement de la page et le geste
 *     décale les identifiants, et le serveur corrigerait alors la mauvaise
 *     question sans que personne ne le voie. Le client l'envoie toujours.
 *  4. `runId` OBLIGATOIRE. Cette route n'est plus seulement un juge : elle ÉCRIT
 *     le verdict de l'étape dans le passage, et c'est de ces verdicts — d'eux
 *     seuls — que la note finale sera calculée. Un passage inconnu, clos,
 *     périmé, ou appartenant à quelqu'un d'autre est refusé sans distinction.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PAS D'ORACLE
 *
 * La réponse ne dit jamais ce qu'il fallait faire : ni valeur, ni formule, ni
 * cellule. Elle ne dit pas non plus l'état du registre — combien de points sont
 * acquis, quelles étapes sont validées —, ce qui permettrait de sonder le juge.
 * Et l'ordre est imposé : on ne peut pas interroger l'étape 9 d'un passage qui
 * n'a jamais dépassé la 2.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { chargerContexteSimulation } from "@/lib/simulation/acces"
import { jugerEtape } from "@/lib/simulation/frappe"
import { enregistrerVerdict, marquerPassee, passagePourVerdict } from "@/lib/simulation/run"
import type { ObservedAction } from "@/lib/simulation/validate"
import type { SimulationScenario, SimulationStep } from "@/lib/simulation/types"

export async function POST(req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const userId = session.user.id
  // Même contournement de RELECTURE que le GET, et pour la même raison : sans
  // lui, l'aperçu admin d'une évaluation non publiée devient injouable dès que
  // la correction passe côté serveur. Cette route n'écrit rien.
  const superAdmin = session.user.role === "SUPER_ADMIN"

  const ctx = await chargerContexteSimulation(params.chapterId, userId, superAdmin)
  if ("error" in ctx) return ctx.error
  const { simulation } = ctx

  if (simulation.mode !== "EVALUATION") {
    return NextResponse.json(
      { error: "La correction serveur est réservée aux évaluations notées" },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const { stepIndex, stepId, observed, runId, passer } = body as {
    stepIndex?: unknown
    stepId?: unknown
    observed?: unknown
    runId?: unknown
    passer?: unknown
  }

  const scenario = (simulation.scenario ?? {}) as unknown as SimulationScenario
  const steps: SimulationStep[] = Array.isArray(scenario.steps) ? scenario.steps : []
  // `stepIndex` est un rang 0-BASÉ, celui de `steps[]`. Le journal, lui, porte
  // un rang 1-basé (`n`) : les deux ne se confondent pas.
  const index = Number(stepIndex)
  if (!Number.isInteger(index) || index < 0 || index >= steps.length) {
    return NextResponse.json({ error: "Étape hors bornes" }, { status: 400 })
  }
  if (typeof stepId !== "string" || !stepId.trim()) {
    return NextResponse.json({ error: "Identifiant d'étape manquant" }, { status: 400 })
  }
  if (typeof runId !== "string" || !runId.trim()) {
    return NextResponse.json({ error: "Passage manquant" }, { status: 400 })
  }
  // « Passer la question » ne juge rien : elle avance seulement le curseur
  // d'ordre, pour que l'étape suivante puisse être corrigée. Aucun verdict n'est
  // écrit, donc l'étape reste sans point — c'est exactement ce qu'annonce
  // l'atelier à l'apprenant.
  const questionPassee = passer === true
  if (!questionPassee && (!observed || typeof observed !== "object")) {
    return NextResponse.json({ error: "Observation manquante" }, { status: 400 })
  }
  // Le rang et l'identifiant doivent désigner la MÊME étape. En cas d'écart, le
  // navigateur joue un scénario périmé : on refuse plutôt que de corriger une
  // question au hasard. 409 et non 400 : la requête est bien formée, c'est
  // l'état qui a divergé.
  if (steps[index]?.id !== stepId.trim()) {
    return NextResponse.json({ error: "Étape désynchronisée" }, { status: 409 })
  }

  const acces = await passagePourVerdict({
    runId: runId.trim(),
    simulationId: simulation.id,
    userId,
    scenarioVersion: simulation.version,
    stepIndex: index,
  })
  if ("refus" in acces) {
    // 409 : la requête est bien formée, c'est l'état du passage qui ne permet
    // pas d'y répondre. Le motif est rendu pour que l'atelier puisse le DIRE à
    // l'apprenant — un passage périmé demande de recharger, pas de recommencer
    // à taper —, et il ne révèle rien du contenu.
    return NextResponse.json({ error: "Passage non recevable", motif: acces.refus }, { status: 409 })
  }

  if (questionPassee) {
    /* « PASSER » EST IRRÉVERSIBLE, et il laisse une trace en base.
     *
     * Il se contentait d'avancer le curseur. Une correction déjà en vol pouvait
     * donc revenir après coup, écrire une réussite, et accorder le point d'une
     * question à laquelle l'apprenant venait de renoncer. Le marqueur `passee`
     * ferme cette porte, et il est vérifié au moment de l'écriture. */
    const pose = await marquerPassee({ runId: acces.run.id, stepId: stepId.trim(), stepIndex: index })
    if (pose === "passage-clos") {
      return NextResponse.json({ error: "Passage non recevable", motif: "run-clos" }, { status: 409 })
    }
    return NextResponse.json({ ok: false, passee: true }, { headers: { "Cache-Control": "no-store" } })
  }

  // L'observation vient du navigateur : c'est le geste de l'apprenant, pas une
  // vérité à croire aveuglément. Elle ne peut pourtant pas être fabriquée côté
  // serveur — seul le navigateur voit la grille. Le garde-fou réel est ailleurs :
  // le serveur ne révèle jamais l'attendu, donc forger une observation exige déjà
  // de connaître la réponse.
  //
  // `jugerEtape` rend le verdict ET le sort de la frappe — la seconde moitié du
  // jugement, que l'atelier calculait lui-même à partir des cellules attendues.
  // Il ne les a plus : c'est ici, et nulle part ailleurs, qu'elles sont lues.
  const jugement = jugerEtape(steps[index], observed as ObservedAction)

  /* C'EST ICI, ET NULLE PART AILLEURS, QUE LA NOTE SE CONSTRUIT.
   *
   * `compte` dit ce que l'observation vaut — réussite, faute, tâtonnement — et
   * le registre l'absorbe de façon monotone.
   *
   * ⚠️ AUCUN DRAPEAU DU CLIENT NE PEUT RENDRE UN ESSAI GRATUIT.
   *
   * Une version précédente acceptait un `siJuste` dans le corps : quand il était
   * posé, un échec n'écrivait aucune faute. Le navigateur n'avait alors qu'à le
   * poser systématiquement pour essayer autant de fois qu'il voulait, sans rien
   * payer, jusqu'à obtenir `ok: true` — puis empocher le point « premier essai ».
   * Un drapeau qui décide du coût d'un essai ne peut pas venir de celui qui
   * essaie. Il a été retiré du protocole, sans remplacement : toute observation
   * jugée compte selon les mêmes règles. */
  const ecriture = await enregistrerVerdict({
    runId: acces.run.id,
    stepId: stepId.trim(),
    stepIndex: index,
    compte: jugement.compte,
  })
  if (ecriture === "passage-clos") {
    return NextResponse.json({ error: "Passage non recevable", motif: "run-clos" }, { status: 409 })
  }

  /* UN ÉCHEC NE DIT RIEN D'AUTRE QU'« ÉCHEC ».
   *
   * `validateStep` rédige des messages destinés à une LEÇON, où l'apprenant a le
   * scénario complet et où rien n'est noté. Certains portent des éléments de
   * réponse — le sens d'un tri, le nombre de séries attendu, la visibilité d'une
   * série, une référence citée par une macro. Les relayer tels quels sur une
   * évaluation notée transformerait le juge en oracle : il suffirait d'essayer
   * pour se faire souffler la réponse, étape par étape.
   *
   * La réponse d'échec est donc CONSTANTE. Le détail reste disponible côté
   * serveur, dans le verdict enregistré et dans les journaux d'exécution, pour
   * le diagnostic — jamais dans le corps de la réponse.
   *
   * `frappe` ne sort pas non plus : son `ref` désignerait la cellule attendue
   * quand l'apprenant a tapé ailleurs.
   *
   * `compte` ne sort pas davantage sur un ÉCHEC : distinguer « vraie faute » de
   * « tâtonnement » revient à dire si le geste était du bon GENRE — donc à
   * renseigner sur l'action attendue. Sur une réussite, il n'apprend rien que
   * `ok` ne dise déjà. */
  return NextResponse.json(
    jugement.ok
      ? { ok: true }
      : { ok: false, message: "Ce n'est pas encore ce qui est attendu. Reprenez la consigne." },
    { headers: { "Cache-Control": "no-store" } },
  )
}
