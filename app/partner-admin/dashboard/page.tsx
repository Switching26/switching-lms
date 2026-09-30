import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getActiveUsersCount } from "@/lib/data/users"
import { getPartnerLicenseStats } from "@/lib/data/licenses"
import { getCompletionRate } from "@/lib/data/progress"
import { getRecentActivity } from "@/lib/data/emails"
import KPICard from "@/components/ui/KPICard"
import ActivityFeed from "@/components/ui/ActivityFeed"
import { Plus, ChevronRight, UsersRound } from "lucide-react"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

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
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { isInternal: true } })
  const internalFormations = partner?.isInternal ? await prisma.formation.findMany({
    where: { deletedAt: null }, orderBy: { title: "asc" },
    select: { id: true, title: true, _count: { select: { enrollments: { where: { user: { partnerId } } } } } },
  }) : []
  const dashboardLicenses = partner?.isInternal
    ? internalFormations.map((f) => ({ id: f.id, title: f.title, used: f._count.enrollments, total: null }))
    : licenseStats.licenses.map((l) => ({ id: l.id, title: l.formation.title, used: l.usedSeats, total: l.isUnlimited ? null : l.totalSeats }))
  const totalLearners = await prisma.user.count({ where: { partnerId, role: "LEARNER", archivedAt: null } })
  const invited = await prisma.user.count({ where: { partnerId, role: "LEARNER", archivedAt: null, isActive: false } })
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const newLearners = await prisma.user.count({ where: { partnerId, role: "LEARNER", archivedAt: null, createdAt: { gte: monthStart } } })

  return (
    <div className="space-y-8">
      <div className="lms-page-heading"><div><p className="lms-page-date">{new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>Vue d’ensemble</h1><p className="text-ink-50 mt-3 text-[15px]">Votre activité, en un coup d’œil.</p></div><Link className="lms-primary lms-create-shortcut" href="/partner-admin/utilisateurs?creer=1" aria-label="Nouvel utilisateur"><Plus size={19} /><span>Nouvel utilisateur</span></Link></div>
      <div className="lms-metrics grid grid-cols-2 lg:grid-cols-4">
        <KPICard label="Apprenants" value={totalLearners} sub={`${activeUsers} actifs`} />
        <KPICard label="Nouveaux inscrits" value={newLearners} sub="Ce mois-ci" />
        <KPICard label="Formations" value={dashboardLicenses.length} sub={partner?.isInternal ? "Catalogue interne" : "Sous licence"} />
        <KPICard label="Licences restantes" value={partner?.isInternal || licenseStats.hasUnlimited ? "Illimité" : Math.max(0, licenseStats.totalSeats - licenseStats.usedSeats)} sub={`${licenseStats.usedSeats} utilisées`} />
      </div>
      <p className="text-xs text-ink-50">Taux de complétion : {completionRate}%</p>

      <div className="lms-dashboard-columns">
      <section className="lms-dashboard-panel lms-dashboard-activity"><h2>Activité récente</h2><ActivityFeed activities={recentActivity} /></section>
      <div className="lms-dashboard-aside space-y-5">
      <section className="lms-dashboard-panel">
        <div className="flex items-baseline justify-between gap-2"><h2>Licences par formation</h2><Link className="text-xs text-brand-600" href="/partner-admin/licences">Voir les licences →</Link></div>
        {dashboardLicenses.length === 0 ? <p className="text-sm text-ink-50">Aucune licence attribuée.</p> : dashboardLicenses.map((l) => <div className="lms-license-row" key={l.id}>
          <h3>{l.title}</h3>
          <p>{l.used} utilisée{l.used > 1 ? "s" : ""} · {l.total === null ? "Illimité" : `${Math.max(0, l.total - l.used)} disponible${l.total - l.used > 1 ? "s" : ""} sur ${l.total}`}</p>
          {l.total !== null && <progress aria-label={`Utilisation des licences ${l.title}`} value={l.used} max={Math.max(l.total, 1)} />}
        </div>)}
      </section>
      <section className="lms-dashboard-panel flex items-start gap-4"><span className="lms-avatar"><UsersRound size={21} /></span><div><h3 className="font-semibold text-[16px]">{invited} compte{invited !== 1 ? "s" : ""} invité{invited !== 1 ? "s" : ""} / inactif{invited !== 1 ? "s" : ""}</h3><p className="text-xs text-ink-50 mt-2 leading-relaxed">Retrouvez les accès qui attendent leur activation.</p><Link className="lms-text-link mt-3" href="/partner-admin/utilisateurs?statut=inactive">Voir les apprenants <ChevronRight size={17} /></Link></div></section>
      </div>
      </div>
    </div>
  )
}
