/**
 * Ouverture et reprise d'un PASSAGE d'évaluation.
 *
 * L'atelier appelle cette route au moment où l'apprenant commence réellement —
 * pas au chargement de la page : ouvrir un passage en survolant un chapitre
 * gonflerait le compteur d'essais sans que rien n'ait été joué.
 *
 *  • sans `nouveau` : rend le passage ouvert s'il existe (reprise après un
 *    rechargement de page, les verdicts déjà acquis sont conservés), sinon en
 *    ouvre un ;
 *  • avec `nouveau: true` : « Repasser l'évaluation » — le passage courant est
 *    clos et un rang supérieur est ouvert, donc sans aucun verdict hérité.
 *
 * La réponse ne porte QUE l'identifiant du passage et son rang. Elle ne dit rien
 * du scénario, rien des verdicts déjà posés, rien du score en cours : ce serait
 * autant d'oracles.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { chargerContexteSimulation } from "@/lib/simulation/acces"
import { ouvrirPassage } from "@/lib/simulation/run"

export async function POST(req: NextRequest, { params }: { params: { chapterId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const userId = session.user.id
  // Mêmes gardes que partout ailleurs, y compris le contournement de relecture
  // du super-admin : sans lui, l'aperçu d'une évaluation non publiée n'ouvrirait
  // aucun passage et deviendrait injouable.
  const superAdmin = session.user.role === "SUPER_ADMIN"

  const ctx = await chargerContexteSimulation(params.chapterId, userId, superAdmin)
  if ("error" in ctx) return ctx.error
  const { simulation } = ctx

  if (simulation.mode !== "EVALUATION") {
    return NextResponse.json(
      { error: "Seule une évaluation notée ouvre un passage" },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => null)
  const nouveau = !!body && typeof body === "object" && (body as { nouveau?: unknown }).nouveau === true

  const run = await ouvrirPassage({
    simulationId: simulation.id,
    userId,
    scenarioVersion: simulation.version,
    nouveau,
  })

  return NextResponse.json(
    { runId: run.id, passage: run.passage },
    { headers: { "Cache-Control": "no-store" } },
  )
}
