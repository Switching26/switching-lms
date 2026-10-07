import { NextRequest, NextResponse } from "next/server"
import { assertTrainerOwnsAssignment } from "@/lib/trainer/access"
import { createTrainerSession, listSessionsForAssignment, type TrainerSessionInput } from "@/lib/trainer/sessions"
import { trainerApi, trainerJson } from "../../../_utils"

export const dynamic = "force-dynamic"
type Context = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: Context) {
  return trainerApi(async (trainer) => NextResponse.json(await listSessionsForAssignment(trainer.id, params.id)))
}

export async function POST(request: NextRequest, { params }: Context) {
  return trainerApi(async (trainer) => {
    await assertTrainerOwnsAssignment(trainer.id, params.id)
    const input = await trainerJson(request, ["startsAt", "durationMinutes", "status", "note"])
    return NextResponse.json(await createTrainerSession(trainer.id, params.id, input as TrainerSessionInput), { status: 201 })
  })
}
