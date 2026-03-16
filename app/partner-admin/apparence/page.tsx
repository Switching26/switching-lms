import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getPartnerById } from "@/lib/data/partners"
import AppearanceForm from "./form"

export default async function ApparencePage() {
  const session = await auth()
  if (!session) redirect("/login")

  const partnerId = (session.user as any).partnerId
  if (!partnerId) redirect("/login")

  const partner = await getPartnerById(partnerId)
  if (!partner) redirect("/login")

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Apparence</h1>
      <AppearanceForm
        partner={JSON.parse(JSON.stringify({
          id: partner.id,
          name: partner.name,
          primaryColor: partner.primaryColor,
          secondaryColor: partner.secondaryColor,
          logoUrl: partner.logoUrl,
        }))}
      />
    </div>
  )
}
