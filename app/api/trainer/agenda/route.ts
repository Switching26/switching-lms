import { NextRequest, NextResponse } from "next/server"
import { TrainerAccessError } from "@/lib/trainer/access"
import { listTrainerAgenda } from "@/lib/trainer/sessions"
import { listUnavailability } from "@/lib/trainer/unavailability"
import { trainerApi } from "../_utils"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  return trainerApi(async (trainer) => {
    const from = request.nextUrl.searchParams.get("from")
    const to = request.nextUrl.searchParams.get("to")
    if (!from || !to) throw new TrainerAccessError("Dates from et to obligatoires", 400)
    const [sessions, unavailability] = await Promise.all([
      listTrainerAgenda(trainer.id, from, to), listUnavailability(trainer.id, from, to),
    ])
    return NextResponse.json({ sessions, unavailability, timeZone: "Europe/Paris" })
  })
}
