import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getAllUsersByPartner } from "@/lib/data/users"
import { getFormationsForPartner } from "@/lib/data/formations"
import UsersTable from "../../super-admin/utilisateurs/table"

export const dynamic = "force-dynamic"

export default async function PartnerUtilisateursPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const partnerId = session.user.partnerId
  if (!partnerId) redirect("/login")

  const [users, formations] = await Promise.all([
    getAllUsersByPartner(partnerId),
    // Catalogue restreint aux formations sous licence pour cet organisme.
    getFormationsForPartner(partnerId),
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
