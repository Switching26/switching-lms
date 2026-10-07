import { NextRequest, NextResponse } from "next/server"
import { deleteContactEvent } from "@/lib/trainer/contacts"
import { trainerApi } from "../../../../_utils"

export const dynamic = "force-dynamic"
export async function DELETE(_request: NextRequest, { params }: { params: { id: string; eventId: string } }) {
  return trainerApi(async trainer => NextResponse.json(await deleteContactEvent(trainer.id, params.id, params.eventId)))
}
