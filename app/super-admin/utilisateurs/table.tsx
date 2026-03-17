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
  reference: string | null
  role: string
  isActive: boolean
  archivedAt: string | null
  partnerId: string | null
  partner: { id: string; name: string } | null
  enrollments: { id: string; formationId: string; expiresAt: string | null; formation: { id: string; title: string } }[]
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

type StatusFilter = "all" | "active" | "inactive" | "archived"

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active")
  const [orgFilter, setOrgFilter] = useState<"all" | "internal" | "partner">("all")
  const [message, setMessage] = useState("")
  const [search, setSearch] = useState("")

  // Modal states
  const [createOpen, setCreateOpen] = useState(false)
  const [editModal, setEditModal] = useState<User | null>(null)
  const [passwordModal, setPasswordModal] = useState<string | null>(null)
  const [progressModal, setProgressModal] = useState<string | null>(null)
  const [progressData, setProgressData] = useState<any>(null)
  const [loadingProgress, setLoadingProgress] = useState(false)
  const [archiveModal, setArchiveModal] = useState<User | null>(null)
  const [deleteModal, setDeleteModal] = useState<User | null>(null)
  const [deactivateModal, setDeactivateModal] = useState<User | null>(null)

  // Create form
  const [newFirstName, setNewFirstName] = useState("")
  const [newLastName, setNewLastName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState("LEARNER")
  const [newPartnerId, setNewPartnerId] = useState("")
  const [newPassword, setNewPassword] = useState(generatePassword())
  const [newReference, setNewReference] = useState("")
  const [creating, setCreating] = useState(false)

  // Edit form
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editIsActive, setEditIsActive] = useState(true)
  const [editRole, setEditRole] = useState("LEARNER")
  const [editPartnerId, setEditPartnerId] = useState("")
  const [editFormationId, setEditFormationId] = useState("")
  const [editExpiresAt, setEditExpiresAt] = useState("")
  const [editReference, setEditReference] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  // Password form
  const [pw, setPw] = useState("")
  const [pwConfirm, setPwConfirm] = useState("")
  const [pwSaving, setPwSaving] = useState(false)

  // Assign form (kept for quick assign from action button)
  const [assignModal, setAssignModal] = useState<string | null>(null)
  const [assignFormationId, setAssignFormationId] = useState("")
  const [assignExpires, setAssignExpires] = useState("")
  const [assigning, setAssigning] = useState(false)

  // Filter users
  const filtered = users.filter((u) => {
    // Status filter
    if (statusFilter === "active" && (!u.isActive || u.archivedAt)) return false
    if (statusFilter === "inactive" && (u.isActive || u.archivedAt)) return false
    if (statusFilter === "archived" && !u.archivedAt) return false
    // Org filter (super admin only)
    if (!isPartnerAdmin) {
      if (orgFilter === "internal" && u.partnerId) return false
      if (orgFilter === "partner" && !u.partnerId) return false
    }
    // Search
    if (search) {
      const q = search.toLowerCase()
      const match = u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.partner?.name.toLowerCase().includes(q) ||
        (u.reference && u.reference.toLowerCase().includes(q))
      if (!match) return false
    }
    return true
  })

  const statusCounts = {
    all: users.length,
    active: users.filter((u) => u.isActive && !u.archivedAt).length,
    inactive: users.filter((u) => !u.isActive && !u.archivedAt).length,
    archived: users.filter((u) => !!u.archivedAt).length,
  }

  const flash = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 3000)
  }

  const updateUserInList = (updated: User) => {
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u))
  }

  const removeUserFromList = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id))
  }

  // ─── IMPERSONATE ───
  const handleImpersonate = async (userId: string) => {
    try {
      const res = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.ok) window.location.href = data.redirectUrl
      else flash(data.error || "Erreur lors de l'impersonation")
    } catch { flash("Erreur réseau") }
  }

  // ─── RESEND ACTIVATION ───
  const [resending, setResending] = useState<string | null>(null)
  const handleResendActivation = async (user: User) => {
    setResending(user.id)
    try {
      const res = await fetch("/api/auth/resend-activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      })
      if (res.ok) flash("Lien d'activation renvoyé")
      else flash("Erreur lors du renvoi")
    } catch { flash("Erreur réseau") }
    finally { setResending(null) }
  }

  // ─── CREATE USER ───
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
          reference: newReference || null,
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
      setNewReference("")
      setNewPassword(generatePassword())
      router.refresh()
    } catch { flash("Erreur réseau") }
    finally { setCreating(false) }
  }

  // ─── OPEN EDIT MODAL ───
  const openEdit = (u: User) => {
    setEditModal(u)
    setEditFirstName(u.firstName)
    setEditLastName(u.lastName)
    setEditEmail(u.email)
    setEditReference(u.reference || "")
    setEditIsActive(u.isActive)
    setEditRole(u.role)
    setEditPartnerId(u.partnerId || "")
    setEditFormationId(u.enrollments[0]?.formationId || "")
    setEditExpiresAt(u.enrollments[0]?.expiresAt ? u.enrollments[0].expiresAt.split("T")[0] : "")
  }

  // ─── SAVE EDIT ───
  const handleEdit = async () => {
    if (!editModal) return
    if (!editFirstName.trim() || !editLastName.trim() || !editEmail.trim()) {
      flash("Tous les champs sont requis")
      return
    }
    setEditSaving(true)
    try {
      const body: any = {
        firstName: editFirstName,
        lastName: editLastName,
        email: editEmail,
        reference: editReference || null,
        isActive: editIsActive,
        formationId: editFormationId || null,
        expiresAt: editExpiresAt || null,
      }
      if (!isPartnerAdmin) {
        body.role = editRole
        body.partnerId = editPartnerId || null
      }
      const res = await fetch(`/api/users/${editModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const updated = await res.json()
        updateUserInList(updated)
        flash("Utilisateur modifié")
        setEditModal(null)
      } else {
        const data = await res.json()
        flash("Erreur : " + (data.error || "Échec"))
      }
    } catch { flash("Erreur réseau") }
    finally { setEditSaving(false) }
  }

  // ─── CHANGE PASSWORD ───
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

  // ─── ASSIGN FORMATION ───
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

  // ─── QUICK STATUS TOGGLE ───
  const handleStatusClick = async (u: User) => {
    if (u.role === "SUPER_ADMIN") return
    if (u.isActive) {
      // Show confirmation before deactivating
      setDeactivateModal(u)
    } else {
      // Reactivate immediately
      try {
        const res = await fetch(`/api/users/${u.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        })
        if (res.ok) {
          updateUserInList({ ...u, isActive: true })
          flash(`${u.firstName} ${u.lastName} réactivé`)
        }
      } catch { flash("Erreur réseau") }
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivateModal) return
    try {
      const res = await fetch(`/api/users/${deactivateModal.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      })
      if (res.ok) {
        updateUserInList({ ...deactivateModal, isActive: false })
        flash(`${deactivateModal.firstName} ${deactivateModal.lastName} désactivé`)
      }
    } catch { flash("Erreur réseau") }
    finally { setDeactivateModal(null) }
  }

  // ─── PROGRESS ───
  const openProgress = async (userId: string) => {
    setProgressModal(userId)
    setLoadingProgress(true)
    setProgressData(null)
    try {
      const res = await fetch(`/api/user/${userId}/progress`)
      if (res.ok) setProgressData(await res.json())
    } finally { setLoadingProgress(false) }
  }

  // ─── ARCHIVE ───
  const handleArchive = async () => {
    if (!archiveModal) return
    try {
      const res = await fetch(`/api/users/${archiveModal.id}/archive`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        updateUserInList({ ...archiveModal, isActive: false, archivedAt: data.archivedAt })
        flash(`${archiveModal.firstName} ${archiveModal.lastName} archivé`)
      } else {
        const data = await res.json()
        flash(data.error || "Erreur lors de l'archivage")
      }
    } catch { flash("Erreur réseau") }
    finally { setArchiveModal(null) }
  }

  // ─── RESTORE ───
  const handleRestore = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}/restore`, { method: "POST" })
      if (res.ok) {
        updateUserInList({ ...user, isActive: true, archivedAt: null })
        flash(`${user.firstName} ${user.lastName} restauré`)
      } else {
        const data = await res.json()
        flash(data.error || "Erreur lors de la restauration")
      }
    } catch { flash("Erreur réseau") }
  }

  // ─── DELETE ───
  const handleDelete = async () => {
    if (!deleteModal) return
    try {
      const res = await fetch(`/api/users/${deleteModal.id}`, { method: "DELETE" })
      if (res.ok) {
        removeUserFromList(deleteModal.id)
        flash(`${deleteModal.firstName} ${deleteModal.lastName} supprimé définitivement`)
      } else {
        const data = await res.json()
        flash(data.error || "Erreur lors de la suppression")
      }
    } catch { flash("Erreur réseau") }
    finally { setDeleteModal(null) }
  }

  const isArchived = (u: User) => !!u.archivedAt

  return (
    <>
      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 mb-4 ${message.includes("Erreur") || message.includes("correspondent") || message.includes("Min") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {message}
        </div>
      )}

      {/* ═══ STATUS FILTERS ═══ */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["all", "active", "inactive", ...(isPartnerAdmin ? [] : ["archived"])] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === f ? "bg-white shadow-sm text-black" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f === "all" ? "Tous" : f === "active" ? "Actifs" : f === "inactive" ? "Inactifs" : "Archivés"}
              {" "}
              <span className="text-xs text-gray-400">({statusCounts[f]})</span>
            </button>
          ))}
        </div>

        {!isPartnerAdmin && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["all", "internal", "partner"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setOrgFilter(f)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  orgFilter === f ? "bg-white shadow-sm text-black" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f === "all" ? "Tous" : f === "internal" ? "Internes" : "Partenaires"}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-border rounded-lg outline-none focus:border-black w-48"
        />

        <div className="ml-auto">
          <button
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
          >
            + Nouvel utilisateur
          </button>
        </div>
      </div>

      {/* ═══ TABLE ═══ */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Nom</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Référence</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Email</th>
              {!isPartnerAdmin && <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Appartenance</th>}
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Formation</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Statut</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isArchived(u) ? "opacity-60" : ""}`}>
                <td className="px-4 py-3">
                  <div>
                    <span className="text-sm font-medium">{u.firstName} {u.lastName}</span>
                    {u.role === "PARTNER_ADMIN" && (
                      <Badge variant="purple">Admin</Badge>
                    )}
                    {u.role === "SUPER_ADMIN" && (
                      <Badge variant="error">Super Admin</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.reference ? (
                    <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md font-medium">{u.reference}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                {!isPartnerAdmin && (
                  <td className="px-4 py-3">
                    {u.partner ? (
                      <Badge variant="purple">{u.partner.name}</Badge>
                    ) : (
                      <Badge>Interne</Badge>
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-gray-500">
                  {u.enrollments[0]?.formation.title || "—"}
                </td>
                <td className="px-4 py-3">
                  {isArchived(u) ? (
                    <Badge variant="default">Archivé</Badge>
                  ) : (
                    <button
                      onClick={() => handleStatusClick(u)}
                      title={u.role === "SUPER_ADMIN" ? "" : u.isActive ? "Cliquer pour désactiver" : "Cliquer pour réactiver"}
                      disabled={u.role === "SUPER_ADMIN"}
                    >
                      <Badge variant={u.isActive ? "success" : "warning"}>
                        {u.isActive ? "Actif" : "Invité"}
                      </Badge>
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    {isArchived(u) ? (
                      <>
                        <button onClick={() => handleRestore(u)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-green-50 hover:text-green-600 rounded transition-colors" title="Restaurer">
                          Restaurer
                        </button>
                        {!isPartnerAdmin && (
                          <button onClick={() => setDeleteModal(u)} className="px-2 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors" title="Supprimer définitivement">
                            Supprimer
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => openEdit(u)}
                          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                          title="Modifier"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => { setPasswordModal(u.id); setPw(""); setPwConfirm("") }}
                          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                          title="Changer mot de passe"
                        >
                          MDP
                        </button>
                        {(u.role === "LEARNER" || u.role === "PARTNER_ADMIN") && !isPartnerAdmin && (
                          <button
                            onClick={() => handleImpersonate(u.id)}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-orange-50 hover:text-orange-600 rounded transition-colors"
                            title="Voir son espace"
                          >
                            Voir
                          </button>
                        )}
                        <button
                          onClick={() => openProgress(u.id)}
                          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                          title="Fiche suivi"
                        >
                          Suivi
                        </button>
                        {!u.isActive && !u.archivedAt && u.role !== "SUPER_ADMIN" && (
                          <button
                            onClick={() => handleResendActivation(u)}
                            disabled={resending === u.id}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                            title="Renvoyer le lien d'activation"
                          >
                            {resending === u.id ? "Envoi..." : "Renvoyer activation"}
                          </button>
                        )}
                        {u.role !== "SUPER_ADMIN" && (
                          <button
                            onClick={() => setArchiveModal(u)}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
                            title="Archiver"
                          >
                            Archiver
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isPartnerAdmin ? 6 : 7} className="px-4 py-8 text-center text-sm text-gray-400">
                  Aucun utilisateur
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ═══ DEACTIVATE CONFIRMATION MODAL ═══ */}
      <Modal open={!!deactivateModal} onClose={() => setDeactivateModal(null)} title="Désactiver cet utilisateur ?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            <strong>{deactivateModal?.firstName} {deactivateModal?.lastName}</strong> ne pourra plus se connecter.
          </p>
          <p className="text-sm text-gray-500">
            Le message &quot;Votre compte est désactivé&quot; sera affiché lors de la connexion.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeactivateModal(null)} className="flex-1 py-2.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors">
              Annuler
            </button>
            <button onClick={confirmDeactivate} className="flex-1 py-2.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">
              Désactiver
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══ EDIT USER MODAL ═══ */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Modifier l'utilisateur">
        {editModal && (
          <div className="space-y-5">
            {/* Personal info */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Informations personnelles</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Prénom</label>
                  <input
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nom</label>
                  <input
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                />
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">Référence interne (optionnel)</label>
                <input
                  value={editReference}
                  onChange={(e) => setEditReference(e.target.value)}
                  placeholder="Ex: 2024-001, MAT-123, DOSSIER-456..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                />
                <p className="text-xs text-gray-400 mt-1">Permet de retrouver cet utilisateur via la recherche</p>
              </div>
            </div>

            {/* Access & status */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Accès et statut</h3>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 mb-3">
                <div>
                  <p className="text-sm font-medium">Statut du compte</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {editIsActive ? "L'utilisateur peut se connecter" : "L'utilisateur ne peut plus se connecter"}
                  </p>
                </div>
                <button
                  onClick={() => setEditIsActive(!editIsActive)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${editIsActive ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${editIsActive ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date de début</label>
                  <input
                    type="date"
                    value={editModal.enrollments[0]?.expiresAt ? "" : ""}
                    disabled
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-gray-50 text-gray-400"
                    title="La date de début est la date d'inscription"
                  />
                  <p className="text-xs text-gray-400 mt-1">Inscrit le {new Date(editModal.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date de fin d'accès</label>
                  <input
                    type="date"
                    value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                  />
                </div>
              </div>
            </div>

            {/* Formation */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Formation attribuée</h3>
              <select
                value={editFormationId}
                onChange={(e) => setEditFormationId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white"
              >
                <option value="">Aucune formation</option>
                {formations?.map((f) => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
              </select>
            </div>

            {/* Super admin only: partner + role */}
            {!isPartnerAdmin && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 mb-3">Appartenance et rôle</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Partenaire</label>
                    <select
                      value={editPartnerId}
                      onChange={(e) => setEditPartnerId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white"
                    >
                      <option value="">Interne</option>
                      {partners?.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rôle</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white"
                    >
                      <option value="LEARNER">Apprenant</option>
                      <option value="PARTNER_ADMIN">Admin partenaire</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors">
                Annuler
              </button>
              <button
                onClick={handleEdit}
                disabled={editSaving}
                className="flex-1 py-2.5 bg-black text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {editSaving ? "Enregistrement..." : "Enregistrer les modifications"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ ARCHIVE CONFIRMATION MODAL ═══ */}
      <Modal open={!!archiveModal} onClose={() => setArchiveModal(null)} title="Archiver l'utilisateur">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Êtes-vous sûr de vouloir archiver <strong>{archiveModal?.firstName} {archiveModal?.lastName}</strong> ?
          </p>
          <p className="text-sm text-gray-500">
            L&apos;utilisateur sera désactivé et ne pourra plus se connecter.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setArchiveModal(null)} className="flex-1 py-2.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors">
              Annuler
            </button>
            <button onClick={handleArchive} className="flex-1 py-2.5 bg-black text-white text-sm rounded-lg hover:opacity-90">
              Archiver
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Supprimer définitivement">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Cette action est irréversible.</p>
          <p className="text-sm text-gray-500">
            Toutes les données de <strong>{deleteModal?.firstName} {deleteModal?.lastName}</strong> seront supprimées définitivement.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteModal(null)} className="flex-1 py-2.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors">
              Annuler
            </button>
            <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">
              Supprimer définitivement
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══ CREATE USER MODAL ═══ */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvel utilisateur">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Prénom</label>
              <input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nom</label>
              <input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Référence interne (optionnel)</label>
            <input
              value={newReference}
              onChange={(e) => setNewReference(e.target.value)}
              placeholder="Ex: 2024-001, MAT-123, DOSSIER-456..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
            />
            <p className="text-xs text-gray-400 mt-1">Permet de retrouver cet utilisateur via la recherche</p>
          </div>
          {!isPartnerAdmin && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Rôle</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white">
                  <option value="LEARNER">Apprenant</option>
                  <option value="PARTNER_ADMIN">Admin partenaire</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Appartenance</label>
                <select value={newPartnerId} onChange={(e) => setNewPartnerId(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white">
                  <option value="">Interne (aucun partenaire)</option>
                  {partners?.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
            <p className="text-sm text-blue-700">Un email d&apos;activation sera envoyé automatiquement à l&apos;utilisateur pour qu&apos;il crée son mot de passe.</p>
          </div>
          <button onClick={handleCreate} disabled={creating} className="w-full py-2.5 bg-black text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
            {creating ? "Création..." : "Créer et envoyer invitation"}
          </button>
        </div>
      </Modal>

      {/* ═══ PASSWORD MODAL ═══ */}
      <Modal open={!!passwordModal} onClose={() => setPasswordModal(null)} title="Modifier le mot de passe">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nouveau mot de passe</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" minLength={6} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmer</label>
            <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
          </div>
          <button onClick={handlePassword} disabled={pwSaving} className="w-full py-2.5 bg-black text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
            {pwSaving ? "Mise à jour..." : "Mettre à jour"}
          </button>
        </div>
      </Modal>

      {/* ═══ ASSIGN FORMATION MODAL ═══ */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Attribuer une formation">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Formation</label>
            <select value={assignFormationId} onChange={(e) => setAssignFormationId(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white">
              <option value="">Sélectionner une formation</option>
              {formations?.map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date d&apos;expiration (optionnel)</label>
            <input type="date" value={assignExpires} onChange={(e) => setAssignExpires(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
          </div>
          <button onClick={handleAssign} disabled={assigning} className="w-full py-2.5 bg-black text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
            {assigning ? "Attribution..." : "Attribuer"}
          </button>
        </div>
      </Modal>

      {/* ═══ PROGRESS MODAL ═══ */}
      <Modal open={!!progressModal} onClose={() => { setProgressModal(null); setProgressData(null) }} title="Fiche de suivi détaillée">
        {loadingProgress ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : progressData ? (
          <div className="space-y-4">
            {(() => {
              const progressUser = users.find((u) => u.id === progressModal)
              return progressUser ? (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold">{progressUser.firstName} {progressUser.lastName}</span>
                  {progressUser.reference && (
                    <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md font-medium">
                      Réf: {progressUser.reference}
                    </span>
                  )}
                </div>
              ) : null
            })()}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Temps total</p>
                <p className="text-sm font-semibold">{Math.round((progressData.totalTime || 0) / 60)} min</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Dernière connexion</p>
                <p className="text-sm font-semibold">
                  {progressData.lastLogin
                    ? new Date(progressData.lastLogin).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </p>
              </div>
            </div>
            {progressData.loginHistory?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Historique connexions</h3>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {progressData.loginHistory.map((date: string, i: number) => (
                    <div key={i} className="text-xs text-gray-500 py-1 border-b border-gray-50">
                      {new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {progressData.exercises?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Exercices</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs text-gray-500 py-2">Exercice</th>
                        <th className="text-left text-xs text-gray-500 py-2">Type</th>
                        <th className="text-left text-xs text-gray-500 py-2">Score</th>
                        <th className="text-left text-xs text-gray-500 py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progressData.exercises.map((ex: any) => (
                        <tr key={ex.id} className="border-b border-gray-50">
                          <td className="py-2">{ex.exerciseTitle}</td>
                          <td className="py-2">
                            <Badge variant="default">
                              {ex.exerciseType === "QCM" ? "QCM" : ex.exerciseType === "VRAI_FAUX" ? "V/F" : "Réd."}
                            </Badge>
                          </td>
                          <td className="py-2 text-gray-500">
                            {ex.score != null ? `${Math.round(ex.score * 100)}%` : "—"}
                          </td>
                          <td className="py-2 text-gray-500">
                            {new Date(ex.completedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <a
              href={`/api/export/user-progress?userId=${progressModal}`}
              className="inline-block px-4 py-2 bg-black text-white text-sm rounded-lg hover:opacity-90"
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
