import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getEmailLogs } from "@/lib/data/emails"
import Badge from "@/components/ui/Badge"

const emailTypeBadge: Record<string, { label: string; variant: string }> = {
  ACCOUNT_CREATED: { label: "Création compte", variant: "blue" },
  FORMATION_ASSIGNED: { label: "Formation attribuée", variant: "success" },
  CHAPTER_COMPLETED: { label: "Chapitre terminé", variant: "purple" },
  FORMATION_COMPLETED: { label: "Formation terminée", variant: "warning" },
}

export default async function EmailsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const logs = await getEmailLogs()

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Emails envoyés</h1>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Destinataire</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Date</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const badge = emailTypeBadge[log.type] || { label: log.type, variant: "default" }
              return (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {log.user.firstName} {log.user.lastName}
                    <span className="text-gray-400 ml-2">{log.user.email}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(log.sentAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={log.success ? "success" : "error"}>
                      {log.success ? "Envoyé" : "Échec"}
                    </Badge>
                  </td>
                </tr>
              )
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  Aucun email envoyé
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
