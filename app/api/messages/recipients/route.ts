import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { allowedLearners, currentMessageIdentity } from "../_access"
import { canTrainerSeeLearner, requireTrainer, TrainerAccessError } from "@/lib/trainer/access"
export const dynamic = "force-dynamic"
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  try {
    const user = await currentMessageIdentity(session.user)
    if (user.role === "TRAINER") {
      await requireTrainer()
      return NextResponse.json(await prisma.user.findMany({ where: { id: { in: await allowedLearners(user.id) } },
        select: { id: true, firstName: true, lastName: true, email: true }, orderBy: { lastName: "asc" } }))
    }
    if (user.role !== "LEARNER") return NextResponse.json([])
    const assignments = await prisma.trainerAssignment.findMany({ where: { learnerId: user.id },
      include: { trainer: { select: { id: true, firstName: true, lastName: true, email: true } } } })
    const trainers = new Map()
    for (const a of assignments) if (await canTrainerSeeLearner(a.trainerId, user.id)) trainers.set(a.trainerId, a.trainer)
    return NextResponse.json(Array.from(trainers.values()))
  } catch (e) {
    if (e instanceof TrainerAccessError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
