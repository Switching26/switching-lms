import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function AccueilPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Accueil Apprenant</h1>
      <p>Connecté en tant que : {session.user?.email}</p>
    </div>
  )
}
