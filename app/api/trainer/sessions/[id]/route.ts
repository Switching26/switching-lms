import { NextRequest, NextResponse } from "next/server"
import { deleteTrainerSession, updateTrainerSession, type TrainerSessionInput } from "@/lib/trainer/sessions"
import { trainerApi, trainerJson } from "../../_utils"

export const dynamic = "force-dynamic"
type Context = { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: Context) {
  return trainerApi(async (trainer) => {
    const input = await trainerJson(request, ["startsAt", "durationMinutes", "status", "note"])
    return NextResponse.json(await updateTrainerSession(trainer.id, params.id, input as TrainerSessionInput))
  })
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  return trainerApi(async (trainer) => NextResponse.json(await deleteTrainerSession(trainer.id, params.id)))
}
