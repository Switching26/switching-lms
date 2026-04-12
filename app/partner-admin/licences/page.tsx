import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getPartnerLicenseStats } from "@/lib/data/licenses"
import KPICard from "@/components/ui/KPICard"

export default async function LicencesPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const partnerId = session.user.partnerId
  if (!partnerId) redirect("/login")

  const { licenses, totalSeats, usedSeats } = await getPartnerLicenseStats(partnerId)
  const usagePercent = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0

  return (
    <div className="space-y-8">
      <div className="animate-fade-in-up">
        <h1 className="font-display text-3xl font-semibold text-primary tracking-tight">Licences</h1>
        <p className="text-warm-500 mt-1 text-[15px]">Gérez vos places de formation</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in-up-delay-1">
        <KPICard
          label="Total licences"
          value={totalSeats}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          }
        />
        <KPICard
          label="Utilisées"
          value={usedSeats}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
        />
        <KPICard
          label="Taux d'utilisation"
          value={`${usagePercent}%`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          }
        />
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm animate-fade-in-up-delay-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-primary">Utilisation globale</span>
          <span className="text-sm text-warm-500 font-medium tabular-nums">{usedSeats}/{totalSeats}</span>
        </div>
        <div className="w-full bg-warm-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-3 rounded-full transition-all duration-1000 ease-out relative"
            style={{
              width: `${Math.max(usagePercent, 2)}%`,
              background: usagePercent > 90
                ? "linear-gradient(90deg, #ef4444, #dc2626)"
                : usagePercent > 70
                ? "linear-gradient(90deg, #f59e0b, #d97706)"
                : "linear-gradient(90deg, #10b981, #059669)",
            }}
          >
            {usagePercent > 0 && usagePercent < 100 && (
              <div className="absolute inset-0 progress-shimmer rounded-full" />
            )}
          </div>
        </div>
      </div>

      {/* Detail par formation */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm animate-fade-in-up-delay-3">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-display text-base font-semibold text-primary">Détail par formation</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-warm-100 bg-warm-50/50">
              <th className="text-left text-[11px] font-semibold text-warm-500 uppercase tracking-wider px-6 py-3">Formation</th>
              <th className="text-left text-[11px] font-semibold text-warm-500 uppercase tracking-wider px-6 py-3">Places</th>
              <th className="text-left text-[11px] font-semibold text-warm-500 uppercase tracking-wider px-6 py-3">Utilisées</th>
              <th className="text-left text-[11px] font-semibold text-warm-500 uppercase tracking-wider px-6 py-3">Disponibles</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((l) => {
              const available = l.totalSeats - l.usedSeats
              return (
                <tr key={l.id} className="border-b border-warm-50 hover:bg-warm-50/50 transition-colors">
                  <td className="px-6 py-3.5 text-sm font-medium text-primary">{l.formation.title}</td>
                  <td className="px-6 py-3.5 text-sm text-warm-500 tabular-nums">{l.totalSeats}</td>
                  <td className="px-6 py-3.5 text-sm text-warm-500 tabular-nums">{l.usedSeats}</td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums ${
                      available === 0
                        ? "bg-rose-50 text-rose-700 border border-rose-100"
                        : available <= 2
                        ? "bg-amber-50 text-amber-700 border border-amber-100"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                    }`}>
                      {available}
                    </span>
                  </td>
                </tr>
              )
            })}
            {licenses.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-warm-400">
                  Aucune licence
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
