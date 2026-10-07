import { NextRequest, NextResponse } from "next/server"
import { cancelSession, deleteSession, updateSession, type TrainerSessionInput } from "@/lib/trainer/sessions"
import { notifySessionChange } from "@/lib/trainer/session-mails"
import { trainerJson } from "../../_utils"
import { trainerSessionApi } from "../_utils"

export const dynamic = "force-dynamic"
type Context = { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: Context) {
  return trainerSessionApi(async (trainer) => {
    const input = await trainerJson(request, ["startsAt", "durationMinutes", "status", "note", "visioUrl"])
    const change = await updateSession(trainer.id, params.id, input as TrainerSessionInput)
    const notification = await notifySessionChange(change.before, change.after)
    return NextResponse.json({ ...change.after, notification })
  })
}

/** Compatibility shortcut: POST the session itself to cancel it. */
export async function POST(_request: NextRequest, { params }: Context) {
  return trainerSessionApi(async (trainer) => {
    const change = await cancelSession(trainer.id, params.id)
    const notification = await notifySessionChange(change.before, change.after)
    return NextResponse.json({ ...change.after, notification })
  })
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  return trainerSessionApi(async (trainer) => {
    const change = await deleteSession(trainer.id, params.id)
    const notification = await notifySessionChange(change.before, change.after)
    return NextResponse.json({ success: true, notification })
  })
}
