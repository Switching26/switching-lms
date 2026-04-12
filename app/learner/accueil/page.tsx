import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getLearnerFormation, getLearnerProgress, hasDeletedEnrollment } from "@/lib/data/formations"

export default async function LearnerAccueil() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const firstName = session.user.firstName
  const enrollment = await getLearnerFormation(userId)
  const progressList = await getLearnerProgress(userId)

  if (!enrollment) {
    const deletedEnrollment = await hasDeletedEnrollment(userId)
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-semibold mb-2 text-primary">
          {deletedEnrollment ? "Formation indisponible" : "Pas encore de formation"}
        </h1>
        <p className="text-warm-500 text-sm max-w-sm text-center leading-relaxed">
          Contactez votre administrateur pour accéder à une formation.
        </p>
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

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Bonjour"
    if (hour < 18) return "Bon après-midi"
    return "Bonsoir"
  }

  return (
    <div className="space-y-8">
      {/* Greeting + Stats */}
      <div className="animate-fade-in-up">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-primary tracking-tight">
          {greeting()}{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-warm-500 mt-2 text-[15px]">
          {completedChapters === 0
            ? "Prêt à commencer votre formation ?"
            : completedChapters >= totalChapters
            ? "Félicitations, vous avez terminé votre formation !"
            : `Vous avez complété ${completedChapters} chapitre${completedChapters > 1 ? "s" : ""} sur ${totalChapters}.`
          }
        </p>
      </div>

      {/* Formation Hero Card */}
      <div className="animate-fade-in-up-delay-1 rounded-2xl overflow-hidden bg-white border border-border shadow-sm hover:shadow-md transition-shadow duration-300">
        {/* Cover with gradient overlay */}
        <div className="relative h-[200px] sm:h-[260px] overflow-hidden">
          {formation.coverImageUrl ? (
            <>
              <img
                src={formation.coverImageUrl}
                alt={formation.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-warm-200 via-warm-100 to-warm-50 flex items-center justify-center">
              <span className="font-display text-6xl font-bold text-warm-300/60">
                {formation.title.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
              </span>
            </div>
          )}

          {/* Progress ring overlay */}
          <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2.5"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeDasharray={`${progressPercent}, 100`}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-bold text-sm sm:text-base">{progressPercent}%</span>
              </div>
            </div>
          </div>

          {/* Title on cover */}
          {formation.coverImageUrl && (
            <div className="absolute bottom-4 left-5 sm:bottom-6 sm:left-6 right-24 sm:right-28">
              <h2 className="font-display text-xl sm:text-2xl font-semibold text-white leading-snug">
                {formation.title}
              </h2>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 sm:p-7">
          {!formation.coverImageUrl && (
            <h2 className="font-display text-xl font-semibold text-primary mb-2">{formation.title}</h2>
          )}
          {formation.description && (
            <p className="text-warm-500 text-sm leading-relaxed mb-5 line-clamp-2">{formation.description}</p>
          )}

          {/* Linear progress */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-1 bg-warm-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out relative"
                style={{
                  width: `${Math.max(progressPercent, 2)}%`,
                  background: `linear-gradient(90deg, ${session.user.partnerColor || "#1a1a2e"}, ${session.user.partnerColor || "#1a1a2e"}cc)`,
                }}
              >
                {progressPercent > 0 && progressPercent < 100 && (
                  <div className="absolute inset-0 progress-shimmer rounded-full" />
                )}
              </div>
            </div>
            <span className="text-sm font-semibold text-warm-600 tabular-nums w-12 text-right">
              {completedChapters}/{totalChapters}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <a
              href="/learner/formation"
              className="group flex items-center justify-center gap-2.5 px-6 py-3 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
              style={{ backgroundColor: session.user.partnerColor || "#1a1a2e" }}
            >
              {completedChapters >= totalChapters ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Revoir la formation
                </>
              ) : completedChapters > 0 ? (
                <>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Reprendre
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Commencer
                </>
              )}
            </a>
            {enrollment.expiresAt && (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Expire le {new Date(enrollment.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chapters List */}
      <div className="animate-fade-in-up-delay-2 rounded-2xl bg-white border border-border p-5 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-semibold text-primary">Chapitres</h2>
          <span className="text-xs font-medium text-warm-400 tabular-nums">
            {completedChapters} / {totalChapters} terminé{completedChapters > 1 ? "s" : ""}
          </span>
        </div>
        <div className="space-y-1">
          {chapters.map((chapter, index) => {
            const chapterProgress = progressList.find((p) => p.chapterId === chapter.id)
            const status = chapterProgress?.completedAt
              ? "completed"
              : chapterProgress
              ? "in_progress"
              : "upcoming"

            return (
              <div
                key={chapter.id}
                className={`group flex items-center gap-3.5 p-3 sm:p-3.5 rounded-xl transition-all duration-200 ${
                  status === "completed"
                    ? "hover:bg-emerald-50/50"
                    : status === "in_progress"
                    ? "bg-blue-50/40 hover:bg-blue-50/60"
                    : "hover:bg-warm-50"
                }`}
              >
                {/* Status icon */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                  status === "completed"
                    ? "bg-emerald-100 text-emerald-600"
                    : status === "in_progress"
                    ? "bg-blue-100 text-blue-600"
                    : "bg-warm-100 text-warm-400"
                }`}>
                  {status === "completed" ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                {/* Title */}
                <span className={`flex-1 text-sm ${
                  status === "completed"
                    ? "text-warm-600"
                    : status === "in_progress"
                    ? "text-primary font-medium"
                    : "text-warm-500"
                }`}>
                  {chapter.title}
                </span>

                {/* Badge */}
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${
                  status === "completed"
                    ? "bg-emerald-100 text-emerald-700"
                    : status === "in_progress"
                    ? "bg-blue-100 text-blue-700"
                    : "text-warm-400"
                }`}>
                  {status === "completed" ? "Terminé" : status === "in_progress" ? "En cours" : "À venir"}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Last Activity */}
      {lastProgress && (
        <div className="animate-fade-in-up-delay-3 flex items-center gap-3 px-5 py-4 rounded-2xl bg-warm-50 border border-warm-200/60">
          <div className="w-8 h-8 rounded-lg bg-warm-200/60 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-warm-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-warm-600">
            Dernière activité le <span className="font-medium">{new Date(lastProgress.completedAt!).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
          </p>
        </div>
      )}
    </div>
  )
}
