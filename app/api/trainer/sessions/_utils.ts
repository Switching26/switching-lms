import { NextResponse } from "next/server"
import { trainerApi } from "../_utils"
import { TrainerConflictError } from "@/lib/trainer/sessions"
import type { TrainerIdentity } from "@/lib/trainer/access"

/** Keep the socle's structured conflicts for the calendar confirmation screen. */
export function trainerSessionApi(handler: (trainer: TrainerIdentity) => Promise<Response>) {
  return trainerApi(async (trainer) => {
    try { return await handler(trainer) }
    catch (error) {
      if (error instanceof TrainerConflictError) {
        return NextResponse.json({ error: error.message, conflicts: error.conflicts }, { status: 409 })
      }
      throw error
    }
  })
}
