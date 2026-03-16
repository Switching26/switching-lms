"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
  partner: { id: string; name: string } | null
  enrollments: { formation: { title: string } }[]
  createdAt: string
}

interface PartnerOption {
  id: string
  name: string
}

interface FormationOption {
  id: string
  title: string
}

function generatePassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let pw = ""
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  return pw
}

export default function UsersTable({
  users: initialUsers,
  partners,
  formations,
  isPartnerAdmin,
}: {
  users: User[]
  partners?: PartnerOption[]
  formations?: FormationOption[]
  isPartnerAdmin?: boolean
}) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [filter, setFilter] = useState<"all" | "internal" | "partner">("all")
  const [message, setMessage] = useState("")

  // Modal states
  const [createOpen, setCreateOpen] = useState(false)
  const [passwordModal, setPasswordModal] = useState<string | null>(null)
  const [assignModal, setAssignModal] = useState<string | null>(null)
  const [progressModal, setProgressModal] = useState<string | null>(null)
  const [progressData, setProgressData] = useState<any>(null)
  const [loadingProgress, setLoadingProgress] = useState(false)

  // Create form
  const [newFirstName, setNewFirstName] = useState("")
  const [newLastName, setNewLastName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState("LEARNER")
  const [newPartnerId, setNewPartnerId] = useState("")
  const [newPassword, setNewPassword] = useState(generatePassword())
  const [creating, setCreating] = useState(false)

  // Password form
  const [pw, setPw] = useState("")
  const [pwConfirm, setPwConfirm] = useState("")
  const [pwSaving, setPwSaving] = useState(false)

  // Assign form
  const [assignFormationId, setAssignFormationId] = useState("")
  const [assignExpires, setAssignExpires] = useState("")
  const [assigning, setAssigning] = useState(false)

  const filtered = users.filter((u) => {
    if (filter === "internal") return !u.partnerId
    if (filter === "partner") return !!u.partnerId
    return true
  })

  const flash = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 3000)
  }

  // Impersonate
  const handleImpersonate = async (userId: string) => {
    try {
      const res = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.ok) {
        window.location.href = data.redirectUrl
      } else {
        flash(data.error || "Erreur lors de l'impersonation")
      }
    } catch {
      flash("Erreur réseau")
    }
  }

  // Create user
  const handleCreate = async () => {
    if (!newFirstName.trim() || !newLastName.trim() || !newEmail.trim()) {
      flash("Tous les champs sont requis")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/user/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: newFirstName,
          lastName: newLastName,
          email: newEmail,
          password: newPassword,
          userRole: newRole,
          partnerId: newPartnerId || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        flash(data.error || "Erreur lors de la création")
        return
      }
      flash("Utilisateur créé avec succès")
      setCreateOpen(false)
      setNewFirstName("")
      setNewLastName("")
      setNewEmail("")
      setNewRole("LEARNER")
      setNewPartnerId("")
      setNewPassword(generatePassword())
      router.refresh()
    } catch {
      flash("Erreur réseau")
    } finally {
      setCreating(false)
    }
  }

  // Change password
  const handlePassword = async () => {
    if (!pw || pw.length < 6) { flash("Min 6 caractères"); return }
    if (pw !== pwConfirm) { flash("Les mots de passe ne correspondent pas"); return }
    setPwSaving(true)
    try {
      const res = await fetch(`/api/user/${passwordModal}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pw }),
      })
      if (res.ok) {
        flash("Mot de passe mis à jour")
        setPasswordModal(null)
        setPw("")
        setPwConfirm("")
      } else {
        const data = await res.json()
        flash(data.error || "Erreur")
      }
    } catch { flash("Erreur réseau") }
    finally { setPwSaving(false) }
  }

  // Assign formation
  const handleAssign = async () => {
    if (!assignFormationId) { flash("Sélectionnez une formation"); return }
    setAssigning(true)
    try {
      const res = await fetch(`/api/user/${assignModal}/assign-formation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formationId: assignFormationId, expiresAt: assignExpires || null }),
      })
      if (res.ok) {
        flash("Formation attribuée")
        setAssignModal(null)
        setAssignFormationId("")
        setAssignExpires("")
        router.refresh()
      } else {
        const data = await res.json()
        flash(data.error || "Erreur")
      }
    } catch { flash("Erreur réseau") }
    finally { setAssigning(false) }
  }

  // Toggle status
  const toggleStatus = async (userId: string) => {
    try {
      const res = await fetch(`/api/user/${userId}/toggle-status`, { method: "PUT" })
      if (res.ok) {
        const { isActive } = await res.json()
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive } : u))
      }
    } catch {}
  }

  // Open progress
  const openProgress = async (userId: string) => {
    setProgressModal(userId)
    setLoadingProgress(true)
    setProgressData(null)
    try {
      const res = await fetch(`/api/user/${userId}/progress`)
      if (res.ok) setProgressData(await res.json())
    } finally { setLoadingProgress(false) }
  }

  return (
    <>
      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 mb-4 ${message.includes("Erreur") || message.includes("correspondent") || message.includes("Min") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {message}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {!isPartnerAdmin && (["all", "internal", "partner"] as const).map((f) => (
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
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
        >
          + Nouvel utilisateur
        </button>
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
                  <button onClick={() => toggleStatus(u.id)} title="Cliquer pour changer">
                    <Badge variant={u.isActive ? "success" : "error"}>
                      {u.isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {(u.role === "LEARNER" || u.role === "PARTNER_ADMIN") && (
                      <button
                        onClick={() => handleImpersonate(u.id)}
                        className="text-sm text-gray-400 hover:text-orange-500"
                        title="Voir son espace"
                      >
                        {"👁"}
                      </button>
                    )}
                    <button
                      onClick={() => setAssignModal(u.id)}
                      className="text-sm text-gray-400 hover:text-primary"
                      title="Attribuer formation"
                    >
                      +
                    </button>
                    <button
                      onClick={() => { setPasswordModal(u.id); setPw(""); setPwConfirm("") }}
                      className="text-sm text-gray-400 hover:text-primary"
                      title="Modifier mot de passe"
                    >
                      🔑
                    </button>
                    <button
                      onClick={() => openProgress(u.id)}
                      className="text-sm text-gray-400 hover:text-primary"
                      title="Fiche suivi"
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

      {/* ===== CREATE USER MODAL ===== */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvel utilisateur">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Prénom</label>
              <input
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nom</label>
              <input
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
            />
          </div>

          {!isPartnerAdmin && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Rôle</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary bg-white"
                >
                  <option value="LEARNER">Apprenant</option>
                  <option value="PARTNER_ADMIN">Admin partenaire</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Appartenance</label>
                <select
                  value={newPartnerId}
                  onChange={(e) => setNewPartnerId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary bg-white"
                >
                  <option value="">Interne (aucun partenaire)</option>
                  {partners?.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Mot de passe temporaire</label>
            <div className="flex gap-2">
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary font-mono"
              />
              <button
                onClick={() => setNewPassword(generatePassword())}
                className="px-3 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors"
              >
                Générer
              </button>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Création..." : "Créer et envoyer invitation"}
          </button>
        </div>
      </Modal>

      {/* ===== PASSWORD MODAL ===== */}
      <Modal
        open={!!passwordModal}
        onClose={() => setPasswordModal(null)}
        title="Modifier le mot de passe"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nouveau mot de passe</label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmer</label>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={handlePassword}
            disabled={pwSaving}
            className="w-full py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {pwSaving ? "Mise à jour..." : "Mettre à jour"}
          </button>
        </div>
      </Modal>

      {/* ===== ASSIGN FORMATION MODAL ===== */}
      <Modal
        open={!!assignModal}
        onClose={() => setAssignModal(null)}
        title="Attribuer une formation"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Formation</label>
            <select
              value={assignFormationId}
              onChange={(e) => setAssignFormationId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary bg-white"
            >
              <option value="">Sélectionner une formation</option>
              {formations?.map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date d'expiration (optionnel)</label>
            <input
              type="date"
              value={assignExpires}
              onChange={(e) => setAssignExpires(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
            />
          </div>
          {assignModal && users.find((u) => u.id === assignModal)?.partnerId && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
              Cet utilisateur appartient à un partenaire. 1 licence sera déduite du pool.
            </p>
          )}
          <button
            onClick={handleAssign}
            disabled={assigning}
            className="w-full py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {assigning ? "Attribution..." : "Attribuer"}
          </button>
        </div>
      </Modal>

      {/* ===== PROGRESS MODAL ===== */}
      <Modal
        open={!!progressModal}
        onClose={() => { setProgressModal(null); setProgressData(null) }}
        title="Fiche de suivi détaillée"
      >
        {loadingProgress ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : progressData ? (
          <div className="space-y-4">
            {/* KPIs */}
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
                    ? new Date(progressData.lastLogin).toLocaleDateString("fr-FR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })
                    : "—"}
                </p>
              </div>
            </div>

            {/* Login history */}
            {progressData.loginHistory?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Historique connexions</h3>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {progressData.loginHistory.map((date: string, i: number) => (
                    <div key={i} className="text-xs text-gray-500 py-1 border-b border-gray-50">
                      {new Date(date).toLocaleDateString("fr-FR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chapters table */}
            {progressData.chapters?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Par chapitre</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs text-gray-500 py-2">Chapitre</th>
                        <th className="text-left text-xs text-gray-500 py-2">Statut</th>
                        <th className="text-left text-xs text-gray-500 py-2">Temps</th>
                        <th className="text-left text-xs text-gray-500 py-2">Sessions</th>
                        <th className="text-left text-xs text-gray-500 py-2">Position</th>
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
                          <td className="py-2 text-gray-500">{ch.sessionCount}</td>
                          <td className="py-2 text-gray-500">{ch.lastPosition}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <a
              href={`/api/export/user-progress?userId=${progressModal}`}
              className="inline-block px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90"
            >
              Export CSV
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Aucune donnée de progression</p>
        )}
      </Modal>
    </>
  )
}
