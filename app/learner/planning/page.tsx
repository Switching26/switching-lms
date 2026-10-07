import { redirect } from "next/navigation"
import { LearnerPlanningError, readLearnerPlanning, requirePlanningLearner } from "@/app/api/learner/sessions/_data"
import Planning from "@/components/learner-planning/Planning"
import "./planning.css"

export const dynamic = "force-dynamic"

export default async function LearnerPlanningPage() {
  const learner = await requirePlanningLearner().catch(error => {
    if (error instanceof LearnerPlanningError) {
      if (error.status === 401) redirect("/login")
      redirect("/learner/accueil")
    }
    throw error
  })
  const data = await readLearnerPlanning(learner.id)
  if (!data.hasTrainer) redirect("/learner/accueil")
  return <Planning data={data} />
}
