import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getUserById } from "@/lib/data/users"
import SettingsForm from "./form"

export default async function ParametresPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = (session.user as any).id
  const user = await getUserById(userId)
  if (!user) redirect("/login")

  return (
    <div className="w-full max-w-lg">
      <h1 className="text-xl font-semibold mb-6">Paramètres</h1>
      <SettingsForm
        user={JSON.parse(JSON.stringify({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        }))}
      />
    </div>
  )
}
