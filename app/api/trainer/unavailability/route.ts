import { NextRequest, NextResponse } from "next/server"
import { createUnavailability, listUnavailability, type TrainerUnavailabilityInput } from "@/lib/trainer/unavailability"
import { trainerApi, trainerJson } from "../_utils"

export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  return trainerApi(async trainer => NextResponse.json(await listUnavailability(trainer.id,
    request.nextUrl.searchParams.get("from") ?? undefined, request.nextUrl.searchParams.get("to") ?? undefined)))
}
export async function POST(request: NextRequest) {
  return trainerApi(async trainer => {
    const input = await trainerJson(request, ["startsAt", "endsAt", "note"])
    return NextResponse.json(await createUnavailability(trainer.id, input as TrainerUnavailabilityInput), { status: 201 })
  })
}
