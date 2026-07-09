import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function Home({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  // `partner` est propagé par le start_url de la PWA installée (/?partner=slug)
  // pour conserver le branding partenaire au premier lancement hors session.
  const { partner } = await searchParams
  const session = await auth()

  if (!session?.user) {
    redirect(partner ? `/login?partner=${encodeURIComponent(partner)}` : "/login")
  }

  const role = session.user.role

  if (role === "SUPER_ADMIN") redirect("/super-admin/dashboard")
  if (role === "PARTNER_ADMIN") redirect("/partner-admin/dashboard")
  if (role === "LEARNER") redirect("/learner/accueil")

  redirect("/login")
}
