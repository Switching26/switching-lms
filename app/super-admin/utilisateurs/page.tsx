import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getUsers, getArchivedUsers } from "@/lib/data/users"
import { getPartners } from "@/lib/data/partners"
import { getFormations } from "@/lib/data/formations"
import UsersTable from "./table"

export const dynamic = "force-dynamic"

export default async function UtilisateursPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const [users, archivedUsers, partners, formations] = await Promise.all([
    getUsers(),
    getArchivedUsers(),
    getPartners(),
    getFormations(),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Utilisateurs</h1>
      <UsersTable
        users={JSON.parse(JSON.stringify(users))}
        archivedUsers={JSON.parse(JSON.stringify(archivedUsers))}
        partners={partners.map((p) => ({ id: p.id, name: p.name }))}
        formations={formations.map((f) => ({ id: f.id, title: f.title }))}
      />
    </div>
  )
}
