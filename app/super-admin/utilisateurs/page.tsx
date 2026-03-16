import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getUsers } from "@/lib/data/users"
import UsersTable from "./table"

export default async function UtilisateursPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const users = await getUsers()

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Utilisateurs</h1>
      <UsersTable users={JSON.parse(JSON.stringify(users))} />
    </div>
  )
}
