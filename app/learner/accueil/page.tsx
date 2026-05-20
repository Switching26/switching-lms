import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getLearnerEnrollments, getLearnerProgress } from "@/lib/data/formations"

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Bonjour"
  if (h < 18) return "Bon après-midi"
  return "Bonsoir"
}

function initials(title: string) {
  return title
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const COVER_GRADIENTS = [
  "linear-gradient(135deg, #4F46E5 0%, #818CF8 100%)",
  "linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)",
  "linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)",
  "linear-gradient(135deg, #10B981 0%, #34D399 100%)",
  "linear-gradient(135deg, #EC4899 0%, #F472B6 100%)",
  "linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)",
]

export default async function LearnerAccueil() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const firstName = session.user.firstName
  const enrollments = await getLearnerEnrollments(userId)
  const progressList = await getLearnerProgress(userId)

  // Compute progress per formation
  const formationStats = enrollments.map((e, idx) => {
    const chapters = e.formation.chapters
    const completed = progressList.filter((p) => p.completedAt && chapters.some((c: { id: string }) => c.id === p.chapterId)).length
    const total = chapters.length
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return {
      enrollment: e,
      formation: e.formation,
      completed,
      total,
      pct,
      gradient: COVER_GRADIENTS[idx % COVER_GRADIENTS.length],
    }
  })

  const totalCompleted = formationStats.reduce((s, f) => s + f.completed, 0)
  const totalChapters = formationStats.reduce((s, f) => s + f.total, 0)

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-20 h-20 rounded-2xl bg-brand-50 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink mb-2">Pas encore de formation</h1>
        <p className="text-ink-50 text-sm max-w-sm text-center">Contactez votre administrateur pour accéder à vos formations.</p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {/* Hero greeting */}
      <header className="animate-fade-in-up">
        <p className="text-brand-600 text-sm font-medium mb-2">Bienvenue dans votre espace</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink tracking-tight">
          {greeting()}{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-ink-50 mt-3 text-base max-w-2xl">
          {totalCompleted === 0
            ? `Vous avez ${enrollments.length} formation${enrollments.length > 1 ? "s" : ""} disponible${enrollments.length > 1 ? "s" : ""}. Choisissez celle par laquelle vous voulez commencer.`
            : totalCompleted >= totalChapters
              ? "Félicitations, vous avez terminé toutes vos formations !"
              : `Vous avez complété ${totalCompleted} chapitre${totalCompleted > 1 ? "s" : ""} sur ${totalChapters}. Continuez sur votre lancée.`}
        </p>
      </header>

      {/* Stats line */}
      <div className="animate-fade-in-up-delay-1 grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Formations" value={enrollments.length} accent="brand" />
        <StatCard label="Chapitres terminés" value={totalCompleted} accent="emerald" />
        <StatCard label="Total chapitres" value={totalChapters} accent="ink" />
      </div>

      {/* Formations grid */}
      <section className="animate-fade-in-up-delay-2">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold text-ink">Mes formations</h2>
          <span className="text-xs text-ink-50 tabular-nums">{enrollments.length} formation{enrollments.length > 1 ? "s" : ""}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {formationStats.map(({ formation, completed, total, pct, gradient, enrollment }) => (
            <Link
              key={formation.id}
              href={`/learner/formation?id=${formation.id}`}
              className="card card-hover group flex flex-col overflow-hidden"
            >
              {/* Cover */}
              <div className="relative h-[140px] overflow-hidden" style={{ background: formation.coverImageUrl ? undefined : gradient }}>
                {formation.coverImageUrl ? (
                  <>
                    <img src={formation.coverImageUrl} alt={formation.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display text-5xl font-bold text-white/40">{initials(formation.title)}</span>
                  </div>
                )}
                {/* Badge progress */}
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/95 text-ink shadow-sm backdrop-blur">
                  {pct}%
                </div>
                {/* Badge sections count */}
                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/90 text-ink-70 backdrop-blur">
                  {formation.sections.length} modules · {total} chapitres
                </div>
              </div>

              {/* Body */}
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-display text-lg font-semibold text-ink mb-2 leading-snug line-clamp-2 group-hover:text-brand-600 transition-colors">
                  {formation.title}
                </h3>
                {formation.description && (
                  <p className="text-sm text-ink-50 line-clamp-2 mb-4">{formation.description}</p>
                )}

                <div className="mt-auto">
                  <div className="progress-bar mb-3">
                    <div className="progress-bar-fill" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-50">
                    <span className="tabular-nums">{completed} / {total} chapitres</span>
                    <span className="text-brand-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                      {pct === 0 ? "Commencer →" : pct >= 100 ? "Revoir →" : "Reprendre →"}
                    </span>
                  </div>
                </div>

                {enrollment.expiresAt && (
                  <div className="mt-4 pt-4 border-t border-ink-10 flex items-center gap-2 text-[11px] text-amber-700">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Expire le {new Date(enrollment.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: "brand" | "emerald" | "ink" }) {
  const colors: Record<string, string> = {
    brand: "text-brand-600 bg-brand-50",
    emerald: "text-emerald-600 bg-emerald-50",
    ink: "text-ink bg-ink-10/40",
  }
  return (
    <div className="card p-4 sm:p-5 flex flex-col">
      <span className="text-xs uppercase tracking-wider text-ink-50 font-medium mb-1">{label}</span>
      <span className={`font-display text-2xl sm:text-3xl font-semibold ${colors[accent].split(" ")[0]}`}>{value}</span>
    </div>
  )
}
