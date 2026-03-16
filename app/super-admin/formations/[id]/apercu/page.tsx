import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getFormationById } from "@/lib/data/formations"
import Badge from "@/components/ui/Badge"

export default async function ApercuFormationPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) redirect("/login")

  const formation = await getFormationById(params.id)
  if (!formation) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{formation.title}</h1>
          <Badge variant={formation.isPublished ? "success" : "default"}>
            {formation.isPublished ? "En ligne" : "Brouillon"}
          </Badge>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/super-admin/formations/${formation.id}/modifier`}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90"
          >
            ✏️ Modifier
          </Link>
          <Link
            href="/super-admin/formations"
            className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            ← Retour
          </Link>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white rounded-xl border border-border p-6">
        {formation.coverImageUrl && (
          <img
            src={formation.coverImageUrl}
            alt={formation.title}
            className="w-full h-48 object-cover rounded-lg mb-4"
          />
        )}
        {formation.description && (
          <p className="text-sm text-gray-600">{formation.description}</p>
        )}
        <div className="mt-4 flex gap-4 text-sm text-gray-400">
          <span>{formation.chapters.length} chapitre{formation.chapters.length > 1 ? "s" : ""}</span>
          <span>{formation.enrollments.length} apprenant{formation.enrollments.length > 1 ? "s" : ""}</span>
          <span>Créée le {new Date(formation.createdAt).toLocaleDateString("fr-FR")}</span>
        </div>
      </div>

      {/* Chapitres */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold mb-4">Chapitres</h2>
        {formation.chapters.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucun chapitre</p>
        ) : (
          <div className="space-y-3">
            {formation.chapters.map((ch, i) => (
              <div key={ch.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-6">{i + 1}.</span>
                    <span className="text-sm font-medium">{ch.title}</span>
                    <Badge variant={ch.isPublished ? "success" : "default"}>
                      {ch.isPublished ? "Publié" : "Brouillon"}
                    </Badge>
                  </div>
                  {ch.videoDuration > 0 && (
                    <span className="text-xs text-gray-400">{ch.videoDuration} min</span>
                  )}
                </div>
                {ch.description && (
                  <p className="text-sm text-gray-500 ml-8 mb-2">{ch.description}</p>
                )}
                {ch.videoUrl && (
                  <p className="text-xs text-gray-400 ml-8 mb-1">🎬 {ch.videoUrl}</p>
                )}
                {ch.attachments.length > 0 && (
                  <div className="ml-8 mt-2 space-y-1">
                    {ch.attachments.map((att) => (
                      <div key={att.id} className="flex items-center gap-2 text-xs text-gray-400">
                        <span>📄</span>
                        <span>{att.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Apprenants inscrits */}
      {formation.enrollments.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-base font-semibold mb-4">Apprenants inscrits ({formation.enrollments.length})</h2>
          <div className="space-y-2">
            {formation.enrollments.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="text-sm">
                  {e.user.firstName} {e.user.lastName}
                  <span className="text-gray-400 ml-2">{e.user.email}</span>
                </div>
                <span className="text-xs text-gray-400">
                  Inscrit le {new Date(e.startedAt).toLocaleDateString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
