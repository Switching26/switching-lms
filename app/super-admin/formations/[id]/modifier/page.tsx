import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { getFormationById } from "@/lib/data/formations"
import FormationEditor from "../../editor"

export default async function ModifierFormationPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) redirect("/login")

  const formation = await getFormationById(params.id)
  if (!formation) notFound()

  return (
    <FormationEditor
      initial={JSON.parse(JSON.stringify({
        id: formation.id,
        title: formation.title,
        description: formation.description,
        coverImageUrl: formation.coverImageUrl,
        isPublished: formation.isPublished,
        chapters: formation.chapters.map((ch) => ({
          id: ch.id,
          title: ch.title,
          description: ch.description,
          content: ch.content,
          videoUrl: ch.videoUrl,
          videoDuration: ch.videoDuration,
          order: ch.order,
          isPublished: ch.isPublished,
          attachments: ch.attachments,
        })),
      }))}
    />
  )
}
