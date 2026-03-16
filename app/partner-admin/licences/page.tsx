import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getPartnerLicenseStats } from "@/lib/data/licenses"
import KPICard from "@/components/ui/KPICard"

export default async function LicencesPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const partnerId = (session.user as any).partnerId
  if (!partnerId) redirect("/login")

  const { licenses, totalSeats, usedSeats } = await getPartnerLicenseStats(partnerId)
  const usagePercent = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Licences</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard label="Total licences" value={totalSeats} />
        <KPICard label="Utilisées" value={usedSeats} />
        <KPICard label="Taux d'utilisation" value={`${usagePercent}%`} />
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Utilisation globale</span>
          <span className="text-sm text-gray-500">{usedSeats}/{totalSeats}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-primary h-3 rounded-full transition-all"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
      </div>

      {/* Detail par formation */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Formation</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Places totales</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Utilisées</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Disponibles</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((l) => (
              <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{l.formation.title}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.totalSeats}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.usedSeats}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.totalSeats - l.usedSeats}</td>
              </tr>
            ))}
            {licenses.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  Aucune licence
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
