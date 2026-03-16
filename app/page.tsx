import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"

const roleRoutes: Record<string, string> = {
  SUPER_ADMIN: "/super-admin/dashboard",
  PARTNER_ADMIN: "/partner-admin/dashboard",
  LEARNER: "/learner/accueil",
}

export default async function HomePage() {
  const session = await auth()

  if (session?.user) {
    const role = (session.user as any).role as string
    redirect(roleRoutes[role] || "/login")
  }

  redirect("/login")
}
