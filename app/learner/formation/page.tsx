import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getLearnerFormation, getLearnerProgress } from "@/lib/data/formations"
import FormationPlayer from "./player"

export default async function FormationPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = (session.user as any).id
  const enrollment = await getLearnerFormation(userId)
  const progressList = await getLearnerProgress(userId)

  if (!enrollment) {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-semibold">Aucune formation</h1>
      </div>
    )
  }

  const chapters = enrollment.formation.chapters.map((ch) => ({
    ...ch,
    completed: progressList.some((p) => p.chapterId === ch.id && p.completedAt),
    inProgress: progressList.some((p) => p.chapterId === ch.id && !p.completedAt),
    lastPosition: progressList.find((p) => p.chapterId === ch.id)?.lastPosition || 0,
  }))

  return (
    <FormationPlayer
      formationTitle={enrollment.formation.title}
      chapters={JSON.parse(JSON.stringify(chapters))}
      userId={userId}
    />
  )
}
