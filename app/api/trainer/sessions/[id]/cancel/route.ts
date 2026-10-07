import { NextRequest, NextResponse } from "next/server"
import { cancelSession } from "@/lib/trainer/sessions"
import { notifySessionChange } from "@/lib/trainer/session-mails"
import { trainerSessionApi } from "../../_utils"

export const dynamic = "force-dynamic"
type Context = { params: { id: string } }

export async function POST(_request: NextRequest, { params }: Context) {
  return trainerSessionApi(async (trainer) => {
    const change = await cancelSession(trainer.id, params.id)
    const notification = await notifySessionChange(change.before, change.after)
    return NextResponse.json({ ...change.after, notification })
  })
}
