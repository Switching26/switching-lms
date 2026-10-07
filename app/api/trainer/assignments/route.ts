import { NextRequest, NextResponse } from "next/server"
import { listAssignmentsForTrainer } from "@/lib/trainer/assignments"
import { TrainerAccessError } from "@/lib/trainer/access"
import { trainerApi } from "../_utils"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  return trainerApi(async (trainer) => {
    const archived = request.nextUrl.searchParams.get("archived")
    const status = request.nextUrl.searchParams.get("status")
    if ((archived !== null && !["true", "false"].includes(archived)) ||
      (status !== null && !["active", "archived"].includes(status))) throw new TrainerAccessError("Filtre invalide", 400)
    return NextResponse.json(await listAssignmentsForTrainer(trainer.id, { archived: archived === "true" || status === "archived" }))
  })
}
