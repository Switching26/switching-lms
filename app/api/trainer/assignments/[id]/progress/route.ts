import { NextRequest, NextResponse } from "next/server"
import { getAssignmentProgress } from "@/lib/trainer/assignments"
import { trainerApi } from "../../../_utils"

export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  return trainerApi(async (trainer) => NextResponse.json(await getAssignmentProgress(trainer.id, params.id)))
}
