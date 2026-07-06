import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getLearnerEnrollments } from "@/lib/data/formations"
import { getUserNotes } from "@/lib/data/notes"
import NotesEditor from "./editor"

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ chapitre?: string }> }) {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const { chapitre: requestedChapterId } = await searchParams

  const enrollments = await getLearnerEnrollments(userId)
  const notes = await getUserNotes(userId)

  // Toutes les notes de l'apprenant, tous formations confondues, classées par
  // formation puis par chapitre. Plus de bascule d'une formation à l'autre :
  // tout est visible dans une seule page « Mes notes ».
  const chapters = enrollments.flatMap((e) =>
    e.formation.chapters.map((ch: any, index: number) => ({
      id: ch.id,
      title: ch.title,
      order: index + 1,
      note: notes.find((n) => n.chapterId === ch.id)?.content || "",
      formationId: e.formation.id,
      formationTitle: e.formation.title,
    }))
  )

  if (chapters.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="font-display text-xl font-semibold text-ink">Aucune formation</h1>
        <p className="text-ink-50 text-sm mt-2">Vous n'avez pas encore de formation à laquelle attacher des notes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink tracking-tight">Mes notes</h1>
        <p className="text-ink-50 mt-2 text-sm">
          Toutes vos notes, classées par formation puis par chapitre. L'enregistrement est automatique.
        </p>
      </header>
      <NotesEditor
        chapters={JSON.parse(JSON.stringify(chapters))}
        userId={userId}
        initialChapterId={requestedChapterId}
      />
    </div>
  )
}
