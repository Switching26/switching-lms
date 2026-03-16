import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getPartners } from "@/lib/data/partners"
import Badge from "@/components/ui/Badge"

export default async function PartenairesPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const partners = await getPartners()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Partenaires</h1>
        <button className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90">
          Nouveau partenaire
        </button>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Nom</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Apprenants</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Licences</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Formations</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Statut</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => {
              const totalSeats = p.licenses.reduce((s, l) => s + l.totalSeats, 0)
              const usedSeats = p.licenses.reduce((s, l) => s + l.usedSeats, 0)
              const formationCount = new Set(p.licenses.map((l) => l.formationId)).size

              return (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.primaryColor }} />
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.users.length}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{usedSeats}/{totalSeats}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formationCount}</td>
                  <td className="px-4 py-3">
                    <Badge variant={p.isActive ? "success" : "error"}>
                      {p.isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      <button className="text-gray-400 hover:text-primary text-xs">Modifier</button>
                      <button className="text-gray-400 hover:text-primary text-xs">Configurer</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {partners.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Aucun partenaire
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
