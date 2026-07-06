import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getLearnerEnrollments, getLearnerFormationById } from "@/lib/data/formations"
import { getUserNotes } from "@/lib/data/notes"
import NotesEditor from "./editor"
import FormationSwitcher from "@/components/learner/FormationSwitcher"

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ id?: string; chapitre?: string }> }) {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const { id: formationId, chapitre: requestedChapterId } = await searchParams

  const allEnrollments = await getLearnerEnrollments(userId)
  const enrollment = await getLearnerFormationById(userId, formationId)
  const notes = await getUserNotes(userId)

  if (!enrollment) {
    return (
      <div className="text-center py-20">
        <h1 className="font-display text-xl font-semibold text-ink">Aucune formation</h1>
        <p className="text-ink-50 text-sm mt-2">Vous n'avez pas encore de formation à laquelle attacher des notes.</p>
      </div>
    )
  }

  const chapters = enrollment.formation.chapters.map((ch: any, index: number) => ({
    id: ch.id,
    title: ch.title,
    order: index + 1,
    note: notes.find((n) => n.chapterId === ch.id)?.content || "",
  }))

  const switcherFormations = allEnrollments.map((e) => ({
    id: e.formation.id,
    title: e.formation.title,
  }))

  return (
    <div>
      <FormationSwitcher
        formations={switcherFormations}
        currentId={enrollment.formationId}
        basePath="/learner/notes"
      />
      <NotesEditor
        chapters={JSON.parse(JSON.stringify(chapters))}
        userId={userId}
        formationId={enrollment.formationId}
        initialChapterId={requestedChapterId}
      />
    </div>
  )
}
