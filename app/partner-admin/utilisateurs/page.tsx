import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getUsersByPartner } from "@/lib/data/users"
import { getFormations } from "@/lib/data/formations"
import UsersTable from "../../super-admin/utilisateurs/table"

export const dynamic = "force-dynamic"

export default async function PartnerUtilisateursPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const partnerId = (session.user as any).partnerId
  if (!partnerId) redirect("/login")

  const [users, formations] = await Promise.all([
    getUsersByPartner(partnerId),
    getFormations(),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Utilisateurs</h1>
      <UsersTable
        users={JSON.parse(JSON.stringify(users))}
        formations={formations.map((f) => ({ id: f.id, title: f.title }))}
        isPartnerAdmin
      />
    </div>
  )
}
