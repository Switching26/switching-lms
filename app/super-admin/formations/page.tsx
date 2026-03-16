import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getFormations } from "@/lib/data/formations"
import Badge from "@/components/ui/Badge"

export default async function FormationsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const formations = await getFormations()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Formations</h1>
        <button className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90">
          Nouvelle formation
        </button>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Titre</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Chapitres</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Apprenants</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Statut</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {formations.map((f) => (
              <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{f.title}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{f.chapters.length}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{f.enrollments.length}</td>
                <td className="px-4 py-3">
                  <Badge variant={f.isPublished ? "success" : "default"}>
                    {f.isPublished ? "Publiée" : "Brouillon"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <button className="text-gray-400 hover:text-primary text-xs">Modifier</button>
                    <button className="text-gray-400 hover:text-primary text-xs">Voir</button>
                  </div>
                </td>
              </tr>
            ))}
            {formations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Aucune formation
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
