import { NextRequest, NextResponse } from "next/server"
import { TrainerAccessError } from "@/lib/trainer/access"
import { addContactEvent, deleteContactEvent, listContactEvents, type AddContactEventInput } from "@/lib/trainer/contacts"
import { trainerApi, trainerJson } from "../../../_utils"

export const dynamic = "force-dynamic"
type Context = { params: { id: string } }
export async function GET(_request: NextRequest, { params }: Context) {
  return trainerApi(async trainer => NextResponse.json(await listContactEvents(trainer.id, params.id)))
}
export async function POST(request: NextRequest, { params }: Context) {
  return trainerApi(async trainer => {
    const input = await trainerJson(request, ["kind", "occurredAt", "note"])
    return NextResponse.json(await addContactEvent(trainer.id, params.id, input as unknown as AddContactEventInput), { status: 201 })
  })
}
export async function DELETE(request: NextRequest, { params }: Context) {
  return trainerApi(async trainer => {
    const eventId = request.nextUrl.searchParams.get("eventId") ?? (await trainerJson(request, ["eventId"])).eventId
    if (typeof eventId !== "string" || !eventId.trim()) throw new TrainerAccessError("Identifiant du contact obligatoire", 400)
    return NextResponse.json(await deleteContactEvent(trainer.id, params.id, eventId))
  })
}
