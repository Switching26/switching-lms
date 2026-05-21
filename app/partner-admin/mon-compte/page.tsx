import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getUserById } from "@/lib/data/users"
import ProfileForm from "@/components/profile/ProfileForm"

export default async function MonComptePage() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const user = await getUserById(userId)
  if (!user) redirect("/login")

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary mb-1">Mon compte</h1>
        <p className="text-sm text-warm-500">Gérez vos informations personnelles et votre mot de passe.</p>
      </div>
      <ProfileForm
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
