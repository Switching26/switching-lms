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
 * Le juge est `validateStep`, exactement le même que côté navigateur en
 * leçon et en exercice. Deux implémentations finiraient par donner deux
 * verdicts différents sur la même action, et l'apprenant aurait raison de s'en
 * plaindre.
 *
 * Ce que la réponse ne dit JAMAIS : la valeur attendue, la formule acceptée, ni
 * la cellule visée. Un message d'aide en cas d'échec reste possible — il est
 * rédigé par `validateStep` et ne révèle pas la réponse.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { validateStep, type ObservedAction } from "@/lib/simulation/validate"
import type { SimulationScenario, SimulationStep } from "@/lib/simulation/types"

export async function POST(req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const userId = session.user.id

  const chapter = await prisma.chapter.findUnique({
    where: { id: params.chapterId },
    include: { simulation: true },
  })
  if (!chapter?.simulation) {
    return NextResponse.json({ error: "Ce chapitre ne porte pas de simulation" }, { status: 404 })
  }
  if (!chapter.isPublished) {
    return NextResponse.json({ error: "Chapitre non publié" }, { status: 403 })
  }
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId, formationId: chapter.formationId } },
    select: { id: true },
  })
  if (!enrollment) {
    return NextResponse.json({ error: "Non inscrit à cette formation" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const { stepIndex, observed } = body as { stepIndex?: unknown; observed?: unknown }

  const scenario = (chapter.simulation.scenario ?? {}) as unknown as SimulationScenario
  const steps: SimulationStep[] = Array.isArray(scenario.steps) ? scenario.steps : []
  const index = Number(stepIndex)
  if (!Number.isInteger(index) || index < 0 || index >= steps.length) {
    return NextResponse.json({ error: "Étape hors bornes" }, { status: 400 })
  }
  if (!observed || typeof observed !== "object") {
    return NextResponse.json({ error: "Observation manquante" }, { status: 400 })
  }

  // L'observation vient du navigateur : c'est le geste de l'apprenant, pas une
  // vérité à croire aveuglément. Elle ne peut pourtant pas être fabriquée côté
  // serveur — seul le navigateur voit la grille. Le garde-fou réel est ailleurs :
  // le serveur ne révèle jamais l'attendu, donc forger une observation exige déjà
  // de connaître la réponse.
  const verdict = validateStep(steps[index], observed as ObservedAction)

  return NextResponse.json(
    {
      ok: verdict.ok,
      // `reason` sert au journal pédagogique, `message` s'affiche à l'apprenant.
      // Aucun des deux ne contient la réponse attendue.
      ...(verdict.ok ? {} : { reason: verdict.reason, message: verdict.message }),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
