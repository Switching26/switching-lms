import { NextRequest, NextResponse } from "next/server"
import { assertTrainerOwnsAssignment } from "@/lib/trainer/access"
import { updateAssignmentSteps, type AssignmentStepsInput } from "@/lib/trainer/assignments"
import { listSessionsForAssignment } from "@/lib/trainer/sessions"
import { trainerApi, trainerJson } from "../../_utils"

export const dynamic = "force-dynamic"
type Context = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: Context) {
  return trainerApi(async (trainer) => {
    const assignment = await assertTrainerOwnsAssignment(trainer.id, params.id)
    const sessions = await listSessionsForAssignment(trainer.id, params.id)
    return NextResponse.json({ ...assignment, sessions })
  })
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return trainerApi(async (trainer) => {
    await assertTrainerOwnsAssignment(trainer.id, params.id)
    const input = await trainerJson(request, ["contactDone", "silaeAccessSent", "planningAgreed", "noAnswer", "planningNote"])
    return NextResponse.json(await updateAssignmentSteps(trainer.id, params.id, input as AssignmentStepsInput))
  })
}
