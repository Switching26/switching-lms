import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getPartners } from "@/lib/data/partners"
import { getFormations } from "@/lib/data/formations"
import PartnersTable from "./table"

export const dynamic = "force-dynamic"

export default async function PartenairesPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const [partners, formations] = await Promise.all([
    getPartners(),
    getFormations(),
  ])

  const serializedPartners = partners.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    primaryColor: p.primaryColor,
    secondaryColor: p.secondaryColor,
    logoUrl: p.logoUrl,
    isActive: p.isActive,
    users: p.users.map((u) => ({ id: u.id, email: u.email, role: u.role })),
    licenses: p.licenses.map((l) => ({
      id: l.id,
      formationId: l.formationId,
      totalSeats: l.totalSeats,
      usedSeats: l.usedSeats,
      formation: { id: l.formation.id, title: l.formation.title },
    })),
  }))

  const formationOptions = formations.map((f) => ({ id: f.id, title: f.title }))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Partenaires</h1>
      <PartnersTable partners={serializedPartners} formations={formationOptions} />
    </div>
  )
}
