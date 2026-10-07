import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getAllUsers } from "@/lib/data/users"
import { getPartners } from "@/lib/data/partners"
import { getFormations } from "@/lib/data/formations"
import UsersTable from "./table"
import { prisma } from "@/lib/prisma"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function UtilisateursPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "SUPER_ADMIN") redirect("/")

  const [users, partners, formations, trainers] = await Promise.all([
    getAllUsers(),
    getPartners(),
    getFormations(),
    prisma.user.findMany({ where: { role: "TRAINER", isActive: true, archivedAt: null,
      partner: { slug: "switching", isInternal: true, isActive: true } },
      select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: "asc" } }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Utilisateurs</h1>
        <Link className="text-sm text-primary hover:underline py-3" href="/super-admin/formateurs">Suivi formateurs</Link></div>
      <UsersTable
        users={JSON.parse(JSON.stringify(users))}
        partners={partners.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
        formations={formations.map((f) => ({ id: f.id, title: f.title }))}
        trainers={trainers}
      />
    </div>
  )
}
