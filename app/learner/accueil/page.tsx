import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getLearnerFormation, getLearnerProgress, hasDeletedEnrollment } from "@/lib/data/formations"
import Badge from "@/components/ui/Badge"

export default async function LearnerAccueil() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = (session.user as any).id
  const enrollment = await getLearnerFormation(userId)
  const progressList = await getLearnerProgress(userId)

  if (!enrollment) {
    const deletedEnrollment = await hasDeletedEnrollment(userId)
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-semibold mb-2">
          {deletedEnrollment ? "Cette formation n'est plus disponible" : "Aucune formation attribuée"}
        </h1>
        <p className="text-gray-400 text-sm">Contactez votre administrateur pour accéder à une formation.</p>
      </div>
    )
  }

  const formation = enrollment.formation
  const chapters = formation.chapters
  const completedChapters = progressList.filter((p) => p.completedAt).length
  const totalChapters = chapters.length
  const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0

  const lastProgress = progressList
    .filter((p) => p.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0]

  return (
    <div className="space-y-6">
      {/* Formation Card */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {formation.coverImageUrl ? (
          <div className="aspect-video max-h-[280px] overflow-hidden">
            <img src={formation.coverImageUrl} alt={formation.title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="aspect-video max-h-[280px] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <span className="text-4xl font-bold text-gray-300">
              {formation.title.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
            </span>
          </div>
        )}
        <div className="p-6">
          <h1 className="text-xl font-semibold mb-2">{formation.title}</h1>
          {formation.description && (
            <p className="text-sm text-gray-500 mb-4">{formation.description}</p>
          )}
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-sm font-medium">{progressPercent}%</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/learner/formation"
              className="flex items-center gap-3 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
            >
              {formation.coverImageUrl && (
                <img src={formation.coverImageUrl} alt="" className="w-8 h-8 rounded object-cover" />
              )}
              {completedChapters > 0 ? "Reprendre" : "Commencer"}
            </a>
            {enrollment.expiresAt && (
              <Badge variant="warning">
                Expire le {new Date(enrollment.expiresAt).toLocaleDateString("fr-FR")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Chapitres */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold mb-4">Chapitres</h2>
        <div className="space-y-2">
          {chapters.map((chapter) => {
            const chapterProgress = progressList.find((p) => p.chapterId === chapter.id)
            const status = chapterProgress?.completedAt
              ? "completed"
              : chapterProgress
              ? "in_progress"
              : "upcoming"

            return (
              <div key={chapter.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    status === "completed" ? "bg-green-500" : status === "in_progress" ? "bg-blue-500" : "bg-gray-300"
                  }`} />
                  <span className="text-sm">{chapter.title}</span>
                </div>
                <Badge variant={status === "completed" ? "success" : status === "in_progress" ? "blue" : "default"}>
                  {status === "completed" ? "Terminé" : status === "in_progress" ? "En cours" : "À venir"}
                </Badge>
              </div>
            )
          })}
        </div>
      </div>

      {/* Dernière activité */}
      {lastProgress && (
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-base font-semibold mb-2">Dernière activité</h2>
          <p className="text-sm text-gray-500">
            Chapitre terminé le {new Date(lastProgress.completedAt!).toLocaleDateString("fr-FR")}
          </p>
        </div>
      )}
    </div>
  )
}
