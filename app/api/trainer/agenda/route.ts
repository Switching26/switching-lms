import { NextRequest, NextResponse } from "next/server"
import { TrainerAccessError } from "@/lib/trainer/access"
import { listTrainerAgenda } from "@/lib/trainer/sessions"
import { trainerApi } from "../_utils"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  return trainerApi(async (trainer) => {
    const from = request.nextUrl.searchParams.get("from")
    const to = request.nextUrl.searchParams.get("to")
    if (!from || !to) throw new TrainerAccessError("Dates from et to obligatoires", 400)
    return NextResponse.json(await listTrainerAgenda(trainer.id, from, to))
  })
}
