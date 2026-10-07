import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { requireTrainer, TrainerAccessError, type TrainerIdentity } from "@/lib/trainer/access"

export async function trainerApi(handler: (trainer: TrainerIdentity) => Promise<Response>): Promise<Response> {
  try {
    return await handler(await requireTrainer())
  } catch (error) {
    if (error instanceof TrainerAccessError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Élève ou séance introuvable" }, { status: 404 })
    }
    console.error("[TRAINER] API failure", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 })
  }
}

export async function trainerJson(request: NextRequest, allowedFields: readonly string[]): Promise<Record<string, unknown>> {
  let input: unknown
  try { input = await request.json() } catch { throw new TrainerAccessError("JSON invalide", 400) }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TrainerAccessError("Objet JSON obligatoire", 400)
  const values = input as Record<string, unknown>
  const keys = Object.keys(values)
  if (!keys.length || keys.some((key) => !allowedFields.includes(key))) throw new TrainerAccessError("Champ inconnu ou modification vide", 400)
  return values
}
