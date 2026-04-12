import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  const role = session.user.role

  if (role === "SUPER_ADMIN") redirect("/super-admin/dashboard")
  if (role === "PARTNER_ADMIN") redirect("/partner-admin/dashboard")
  if (role === "LEARNER") redirect("/learner/accueil")

  redirect("/login")
}
