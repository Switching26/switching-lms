import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronRight, Plus, UsersRound } from "lucide-react"
import { getActiveUsersCount } from "@/lib/data/users"
import { getFormationsCount } from "@/lib/data/formations"
import { getTotalLicensesSold } from "@/lib/data/licenses"
import { getRecentActivity } from "@/lib/data/emails"
import { prisma } from "@/lib/prisma"
import KPICard from "@/components/ui/KPICard"
import ActivityFeed from "@/components/ui/ActivityFeed"
import PartnerSummary from "@/components/ui/PartnerSummary"

export default async function SuperAdminDashboard() {
  const session = await auth()
  if (!session) redirect("/login")
  const [activeUsers, formations, licenses, recentActivity, partners, invited] = await Promise.all([
    getActiveUsersCount(), getFormationsCount(), getTotalLicensesSold(), getRecentActivity(),
    prisma.partner.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: {
      id: true, name: true, primaryColor: true, logoUrl: true, isInternal: true,
      _count: { select: { users: { where: { role: "LEARNER", isActive: true, archivedAt: null } } } },
      users: { where: { role: "PARTNER_ADMIN", isActive: true, archivedAt: null }, take: 1, orderBy: { createdAt: "asc" }, select: { id: true } },
      licenses: { select: { formationId: true, totalSeats: true } },
    } }),
    prisma.user.count({ where: { role: "LEARNER", archivedAt: null, isActive: false, loginLogs: { none: { OR: [{ userAgent: null }, { NOT: { userAgent: { startsWith: "riseup-import" } } }] } } } }),
  ])
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date())
  return <div className="space-y-8">
    <div className="lms-page-heading"><div><p className="lms-page-date">{date}</p><h1>Vue d’ensemble</h1><p className="text-ink-50 mt-3 text-[15px]">Une vue claire sur votre plateforme.</p></div><Link className="lms-primary lms-create-shortcut" href="/super-admin/utilisateurs?creer=1" aria-label="Nouvel utilisateur"><Plus size={19} /><span>Nouvel utilisateur</span></Link></div>
    <div className="lms-metrics grid grid-cols-2 lg:grid-cols-4">
      <KPICard label="Apprenants actifs" value={activeUsers} sub="Sur la plateforme" />
      <KPICard label="Formations" value={formations} sub="Au catalogue" />
      <KPICard label="Partenaires" value={partners.length} sub="Espaces distincts" />
      <KPICard label="Licences vendues" value={licenses} sub="Toutes formations" />
    </div>
    <div className="lms-dashboard-columns">
      <section className="lms-dashboard-panel lms-dashboard-activity"><div className="flex justify-between items-baseline"><h2>Activité récente</h2><span className="text-xs text-ink-50">{recentActivity.length} événements</span></div><ActivityFeed activities={recentActivity} /></section>
      <div className="lms-dashboard-aside space-y-5">
        <section className="lms-dashboard-panel"><div className="flex justify-between items-baseline"><h2>Partenaires</h2><Link className="lms-text-link" href="/super-admin/partenaires">Gérer <ChevronRight size={17} /></Link></div><PartnerSummary partners={partners.map(p => ({ id: p.id, name: p.name, primaryColor: p.primaryColor, logoUrl: p.logoUrl, isInternal: p.isInternal, learners: p._count.users, courses: p.isInternal ? formations : new Set(p.licenses.map(l => l.formationId)).size, seats: p.licenses.reduce((s, l) => s + l.totalSeats, 0), adminId: p.users[0]?.id }))} /></section>
        <section className="lms-dashboard-panel flex items-start gap-4"><span className="lms-avatar"><UsersRound size={21} /></span><div><h3 className="font-semibold text-[16px]">{invited} compte{invited !== 1 ? "s" : ""} invité{invited !== 1 ? "s" : ""}</h3><p className="text-xs text-ink-50 mt-2 leading-relaxed">Leurs liens restent valables jusqu’à l’activation.</p><Link className="lms-text-link mt-3" href="/super-admin/utilisateurs?statut=inactive">Voir les apprenants <ChevronRight size={17} /></Link></div></section>
      </div>
    </div>
  </div>
}
