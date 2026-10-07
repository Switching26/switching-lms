import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { TrainerAccessError } from "@/lib/trainer/access"
import { deleteUnavailability, updateUnavailability, type TrainerUnavailabilityInput } from "@/lib/trainer/unavailability"
import { trainerApi, trainerJson } from "../../_utils"

export const dynamic = "force-dynamic"
type Context = { params: { id: string } }
export async function GET(_request: NextRequest, { params }: Context) {
  return trainerApi(async trainer => {
    const row = await prisma.trainerUnavailability.findFirst({ where: { id: params.id, trainerId: trainer.id } })
    if (!row) throw new TrainerAccessError("Indisponibilité introuvable", 404)
    return NextResponse.json(row)
  })
}
export async function PATCH(request: NextRequest, { params }: Context) {
  return trainerApi(async trainer => {
    const input = await trainerJson(request, ["startsAt", "endsAt", "note"])
    return NextResponse.json(await updateUnavailability(trainer.id, params.id, input as TrainerUnavailabilityInput))
  })
}
export async function DELETE(_request: NextRequest, { params }: Context) {
  return trainerApi(async trainer => NextResponse.json(await deleteUnavailability(trainer.id, params.id)))
}
