import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getLearnerFormation } from "@/lib/data/formations"
import { getUserNotes } from "@/lib/data/notes"
import NotesEditor from "./editor"

export default async function NotesPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const enrollment = await getLearnerFormation(userId)
  const notes = await getUserNotes(userId)

  if (!enrollment) {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-semibold">Aucune formation</h1>
      </div>
    )
  }

  const chapters = enrollment.formation.chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    order: ch.order,
    note: notes.find((n) => n.chapterId === ch.id)?.content || "",
  }))

  return <NotesEditor chapters={JSON.parse(JSON.stringify(chapters))} userId={userId} />
}
