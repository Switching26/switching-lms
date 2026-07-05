import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getActiveUsersCount } from "@/lib/data/users"
import { getFormationsCount } from "@/lib/data/formations"
import { getPartnersCount } from "@/lib/data/partners"
import { getTotalLicensesSold } from "@/lib/data/licenses"
import { getRecentActivity } from "@/lib/data/emails"
import KPICard from "@/components/ui/KPICard"
import Badge from "@/components/ui/Badge"
import { emailTypeLabel } from "@/lib/email-type-labels"

const emailTypeVariant: Record<string, string> = {
  ACCOUNT_CREATED: "blue",
  FORMATION_ASSIGNED: "success",
  CHAPTER_COMPLETED: "purple",
  FORMATION_COMPLETED: "warning",
}

export default async function SuperAdminDashboard() {
  const session = await auth()
  if (!session) redirect("/login")

  const [activeUsers, formations, partners, licenses, recentActivity] = await Promise.all([
    getActiveUsersCount(),
    getFormationsCount(),
    getPartnersCount(),
    getTotalLicensesSold(),
    getRecentActivity(),
  ])

  return (
    <div className="space-y-8">
      <div className="animate-fade-in-up">
        <h1 className="font-display text-3xl font-semibold text-ink tracking-tight">Dashboard</h1>
        <p className="text-ink-50 mt-1 text-[15px]">Vue d'ensemble de la plateforme</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up-delay-1">
        <KPICard
          label="Apprenants actifs"
          value={activeUsers}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
        />
        <KPICard
          label="Formations"
          value={formations}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
            </svg>
          }
        />
        <KPICard
          label="Partenaires"
          value={partners}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
            </svg>
          }
        />
        <KPICard
          label="Licences vendues"
          value={licenses}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          }
        />
      </div>

      <div className="bg-white rounded-2xl border border-ink-10 p-6 shadow-sm animate-fade-in-up-delay-2">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-semibold text-ink">Activité récente</h2>
          <span className="text-xs text-ink-50 font-medium">{recentActivity.length} événement{recentActivity.length > 1 ? "s" : ""}</span>
        </div>
        {recentActivity.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-10 h-10 text-ink-30 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-ink-50">Aucune activité récente</p>
          </div>
        ) : (
          <div className="space-y-0">
            {recentActivity.map((log, i) => {
              const variant = emailTypeVariant[log.type] || "default"
              return (
                <div key={log.id} className={`flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-2 sm:gap-3 ${i > 0 ? "border-t border-ink-10" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                    <Badge variant={variant}>{emailTypeLabel(log.type)}</Badge>
                    <span className="text-sm font-medium text-ink">{log.user.firstName} {log.user.lastName}</span>
                    <span className="text-xs text-ink-50 truncate hidden sm:inline">{log.user.email}</span>
                  </div>
                  <span className="text-xs text-ink-50 shrink-0 font-medium tabular-nums">
                    {new Date(log.sentAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
