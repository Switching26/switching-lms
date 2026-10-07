import { NextRequest, NextResponse } from "next/server"
import { createSession, listSessionsForAssignment, type TrainerSessionInput } from "@/lib/trainer/sessions"
import { notifySessionChange } from "@/lib/trainer/session-mails"
import { trainerApi, trainerJson } from "../../../_utils"
import { trainerSessionApi } from "../../../sessions/_utils"

export const dynamic = "force-dynamic"
type Context = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: Context) {
  return trainerApi(async (trainer) => NextResponse.json(await listSessionsForAssignment(trainer.id, params.id)))
}

export async function POST(request: NextRequest, { params }: Context) {
  return trainerSessionApi(async (trainer) => {
    const input = await trainerJson(request, ["startsAt", "durationMinutes", "status", "note", "visioUrl"])
    const change = await createSession(trainer.id, params.id, input as TrainerSessionInput)
    const notification = await notifySessionChange(change.before, change.after)
    return NextResponse.json({ ...change.after, notification }, { status: 201 })
  })
}
