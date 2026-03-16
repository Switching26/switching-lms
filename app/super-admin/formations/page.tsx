import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getFormations } from "@/lib/data/formations"
import FormationsList from "./formations-list"

export default async function FormationsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const formations = await getFormations(true)

  const serialized = formations.map((f) => ({
    id: f.id,
    title: f.title,
    coverImageUrl: f.coverImageUrl,
    isPublished: f.isPublished,
    deletedAt: f.deletedAt ? f.deletedAt.toISOString() : null,
    chaptersCount: f.chapters.length,
    enrollmentsCount: f.enrollments.length,
  }))

  return <FormationsList formations={serialized} />
}
