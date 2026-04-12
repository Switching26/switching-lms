import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getActiveUsersCount } from "@/lib/data/users"
import { getPartnerLicenseStats } from "@/lib/data/licenses"
import { getCompletionRate } from "@/lib/data/progress"
import { getRecentActivity } from "@/lib/data/emails"
import KPICard from "@/components/ui/KPICard"
import Badge from "@/components/ui/Badge"

const emailTypeBadge: Record<string, { label: string; variant: string }> = {
  ACCOUNT_CREATED: { label: "Création compte", variant: "blue" },
  FORMATION_ASSIGNED: { label: "Formation attribuée", variant: "success" },
  CHAPTER_COMPLETED: { label: "Chapitre terminé", variant: "purple" },
  FORMATION_COMPLETED: { label: "Formation terminée", variant: "warning" },
}

export default async function PartnerDashboard() {
  const session = await auth()
  if (!session) redirect("/login")

  const partnerId = session.user.partnerId
  if (!partnerId) redirect("/login")

  const [activeUsers, licenseStats, completionRate, recentActivity] = await Promise.all([
    getActiveUsersCount(partnerId),
    getPartnerLicenseStats(partnerId),
    getCompletionRate(partnerId),
    getRecentActivity(partnerId),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <KPICard label="Apprenants actifs" value={activeUsers} />
        <KPICard label="Licences utilisées" value={`${licenseStats.usedSeats}/${licenseStats.totalSeats}`} />
        <KPICard label="Taux de complétion" value={`${completionRate}%`} />
      </div>

      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold mb-4">Activité récente</h2>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune activité récente</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((log) => {
              const badge = emailTypeBadge[log.type] || { label: log.type, variant: "default" }
              return (
                <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-gray-50 last:border-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-sm">{log.user.firstName} {log.user.lastName}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(log.sentAt).toLocaleDateString("fr-FR")}
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
