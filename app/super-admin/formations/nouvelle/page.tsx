import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import FormationEditor from "../editor"

export default async function NouvelleFormationPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return <FormationEditor />
}
