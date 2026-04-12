import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getLearnerFormation, getLearnerProgress, hasDeletedEnrollment } from "@/lib/data/formations"
import FormationPlayer from "./player"

export default async function FormationPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const enrollment = await getLearnerFormation(userId)
  const progressList = await getLearnerProgress(userId)

  if (!enrollment) {
    const deletedEnrollment = await hasDeletedEnrollment(userId)
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-semibold mb-2">
          {deletedEnrollment ? "Cette formation n'est plus disponible" : "Aucune formation"}
        </h1>
        <p className="text-gray-400 text-sm">Contactez votre administrateur pour accéder à une formation.</p>
      </div>
    )
  }

  // Check enrollment expiration
  if (enrollment.expiresAt && new Date(enrollment.expiresAt) < new Date()) {
    return (
      <div className="text-center py-20">
        <div className="inline-block bg-orange-50 border border-orange-200 rounded-xl px-8 py-6">
          <h1 className="text-xl font-semibold text-orange-700 mb-2">Accès expiré</h1>
          <p className="text-sm text-orange-600">
            Votre accès à cette formation a expiré le{" "}
            {new Date(enrollment.expiresAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Contactez votre administrateur pour renouveler votre accès.
          </p>
        </div>
      </div>
    )
  }

  const chapters = enrollment.formation.chapters.map((ch) => ({
    ...ch,
    completed: progressList.some((p) => p.chapterId === ch.id && p.completedAt),
    inProgress: progressList.some((p) => p.chapterId === ch.id && !p.completedAt),
    lastPosition: progressList.find((p) => p.chapterId === ch.id)?.lastPosition || 0,
  }))

  const sections = (enrollment.formation as any).sections || []
  const formationAttachments = (enrollment.formation as any).attachments || []

  return (
    <FormationPlayer
      formationTitle={enrollment.formation.title}
      formationCoverUrl={enrollment.formation.coverImageUrl || null}
      chapters={JSON.parse(JSON.stringify(chapters))}
      sections={JSON.parse(JSON.stringify(sections))}
      formationAttachments={JSON.parse(JSON.stringify(formationAttachments))}
      userId={userId}
    />
  )
}
