import { NextRequest, NextResponse } from "next/server"
import { LearnerPlanningError, readLearnerPlanning, requirePlanningLearner } from "./_data"

export const dynamic = "force-dynamic"

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" }

export async function GET(request: NextRequest) {
  try {
    const learner = await requirePlanningLearner()
    // This route has no target selector. The signed session is its only owner.
    if (["learnerId", "assignmentId", "sessionId", "trainerId"].some(key => request.nextUrl.searchParams.has(key))) {
      return NextResponse.json({ error: "Vous ne pouvez consulter que votre planning." }, { status: 403, headers })
    }
    return NextResponse.json(await readLearnerPlanning(learner.id), { headers })
  } catch (error) {
    if (error instanceof LearnerPlanningError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers })
    }
    throw error
  }
}
