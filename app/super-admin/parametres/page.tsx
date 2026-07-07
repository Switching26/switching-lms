import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getUserById } from "@/lib/data/users"
import ProfileForm from "@/components/profile/ProfileForm"
import PlatformSettings from "@/components/admin/PlatformSettings"

export default async function ParametresPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const user = await getUserById(session.user.id)
  if (!user) redirect("/login")

  return (
    <div className="w-full max-w-3xl space-y-10">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary mb-1">Paramètres</h1>
        <p className="text-sm text-warm-500">Votre compte et la configuration de la plateforme.</p>
      </div>

      {/* MON COMPTE */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Mon compte</h2>
        <ProfileForm
          user={JSON.parse(JSON.stringify({
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
          }))}
        />
      </section>

      {/* CONFIGURATION PLATEFORME */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Configuration de la plateforme</h2>
          <p className="text-sm text-warm-500">Email, vidéo et stockage — visible uniquement par le super-administrateur.</p>
        </div>
        <PlatformSettings />
      </section>
    </div>
  )
}
