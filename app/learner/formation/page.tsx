import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import {
  getLearnerEnrollments,
  getLearnerFormationById,
  getLearnerProgress,
  hasDeletedEnrollment,
} from "@/lib/data/formations"
import { getUserNotesForFormation } from "@/lib/data/notes"
import FormationPlayer from "./player"
import FormationSwitcher from "@/components/learner/FormationSwitcher"

export default async function FormationPage({ searchParams }: { searchParams: Promise<{ id?: string; chapitre?: string }> }) {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const { id: formationId, chapitre: requestedChapterId } = await searchParams

  const allEnrollments = await getLearnerEnrollments(userId)
  const enrollment = await getLearnerFormationById(userId, formationId)
  const progressList = await getLearnerProgress(userId)

  if (!enrollment) {
    const deletedEnrollment = await hasDeletedEnrollment(userId)
    return (
      <div className="text-center py-20">
        <h1 className="font-display text-xl font-semibold mb-2">
          {deletedEnrollment ? "Cette formation n'est plus disponible" : "Aucune formation"}
        </h1>
        <p className="text-ink-50 text-sm">Contactez votre administrateur pour accéder à une formation.</p>
      </div>
    )
  }

  if (enrollment.expiresAt && new Date(enrollment.expiresAt) < new Date()) {
    return (
      <div className="text-center py-20">
        <div className="inline-block bg-amber-50 border border-amber-200 rounded-xl px-8 py-6">
          <h1 className="font-display text-xl font-semibold text-amber-700 mb-2">Accès expiré</h1>
          <p className="text-sm text-amber-600">
            Votre accès à cette formation a expiré le{" "}
            {new Date(enrollment.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
          </p>
        </div>
      </div>
    )
  }

  const chapters = enrollment.formation.chapters.map((ch: any) => ({
    ...ch,
    completed: progressList.some((p) => p.chapterId === ch.id && p.completedAt),
    inProgress: progressList.some((p) => p.chapterId === ch.id && !p.completedAt),
    lastPosition: progressList.find((p) => p.chapterId === ch.id)?.lastPosition || 0,
  }))

  const sections = (enrollment.formation as any).sections || []
  const formationAttachments = (enrollment.formation as any).attachments || []

  // Notes de l'apprenant pour cette formation (bloc « Prise de notes » du player)
  const notes = await getUserNotesForFormation(userId, enrollment.formationId)
  const initialNotes: Record<string, string> = {}
  notes.forEach((n) => { initialNotes[n.chapterId] = n.content })

  const switcherFormations = allEnrollments.map((e) => ({
    id: e.formation.id,
    title: e.formation.title,
  }))

  return (
    <div>
      <FormationSwitcher
        formations={switcherFormations}
        currentId={enrollment.formationId}
        basePath="/learner/formation"
      />
      <FormationPlayer
        key={enrollment.formationId}
        formationTitle={enrollment.formation.title}
        formationCoverUrl={enrollment.formation.coverImageUrl || null}
        chapters={JSON.parse(JSON.stringify(chapters))}
        sections={JSON.parse(JSON.stringify(sections))}
        formationAttachments={JSON.parse(JSON.stringify(formationAttachments))}
        userId={userId}
        formationId={enrollment.formationId}
        initialChapterId={requestedChapterId}
        initialNotes={initialNotes}
      />
    </div>
  )
}
