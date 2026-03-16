"use client"

import { useState } from "react"
import Badge from "@/components/ui/Badge"
import Modal from "@/components/ui/Modal"

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  isActive: boolean
  partnerId: string | null
  partner: { name: string } | null
  enrollments: { formation: { title: string } }[]
  createdAt: string
}

export default function UsersTable({ users }: { users: User[] }) {
  const [filter, setFilter] = useState<"all" | "internal" | "partner">("all")
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [progressData, setProgressData] = useState<any>(null)
  const [loadingProgress, setLoadingProgress] = useState(false)

  const filtered = users.filter((u) => {
    if (filter === "internal") return !u.partnerId
    if (filter === "partner") return !!u.partnerId
    return true
  })

  const openProgress = async (userId: string) => {
    setSelectedUser(userId)
    setLoadingProgress(true)
    try {
      const res = await fetch(`/api/user/${userId}/progress`)
      if (res.ok) setProgressData(await res.json())
    } finally {
      setLoadingProgress(false)
    }
  }

  return (
    <>
      <div className="flex gap-2 mb-4">
        {(["all", "internal", "partner"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === f ? "bg-primary text-white" : "bg-white border border-border text-gray-500 hover:bg-gray-50"
            }`}
          >
            {f === "all" ? "Tous" : f === "internal" ? "Internes" : "Partenaires"}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Nom</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Email</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Appartenance</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Formation</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Statut</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{u.firstName} {u.lastName}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  {u.partner ? (
                    <Badge variant="purple">{u.partner.name}</Badge>
                  ) : (
                    <Badge>Interne</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {u.enrollments[0]?.formation.title || "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.isActive ? "success" : "error"}>
                    {u.isActive ? "Actif" : "Inactif"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-xs text-gray-400 hover:text-primary">✏️</button>
                    <button className="text-xs text-gray-400 hover:text-primary">🔑</button>
                    <button
                      onClick={() => openProgress(u.id)}
                      className="text-xs text-gray-400 hover:text-primary"
                    >
                      📊
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Aucun utilisateur
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Progress Modal */}
      <Modal
        open={!!selectedUser}
        onClose={() => { setSelectedUser(null); setProgressData(null) }}
        title="Fiche de suivi"
      >
        {loadingProgress ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : progressData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Temps total</p>
                <p className="text-sm font-semibold">
                  {Math.round((progressData.totalTime || 0) / 60)} min
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Dernière connexion</p>
                <p className="text-sm font-semibold">
                  {progressData.lastLogin
                    ? new Date(progressData.lastLogin).toLocaleDateString("fr-FR")
                    : "—"}
                </p>
              </div>
            </div>

            {progressData.chapters?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Par chapitre</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-gray-500 py-2">Chapitre</th>
                      <th className="text-left text-xs text-gray-500 py-2">Statut</th>
                      <th className="text-left text-xs text-gray-500 py-2">Temps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progressData.chapters.map((ch: any) => (
                      <tr key={ch.id} className="border-b border-gray-50">
                        <td className="py-2">{ch.title}</td>
                        <td className="py-2">
                          <Badge variant={ch.completedAt ? "success" : "default"}>
                            {ch.completedAt ? "Terminé" : "En cours"}
                          </Badge>
                        </td>
                        <td className="py-2 text-gray-500">{Math.round(ch.timeSpent / 60)} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <a
              href={`/api/export/user-progress?userId=${selectedUser}`}
              className="inline-block px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90"
            >
              Export CSV
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Aucune donnée</p>
        )}
      </Modal>
    </>
  )
}
