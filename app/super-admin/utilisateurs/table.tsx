"use client"

import { useState, useEffect, useRef, Fragment } from "react"
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
  enrollments: { id: string; formationId: string; startedAt: string; expiresAt: string | null; formation: { id: string; title: string } }[]
  _count?: { loginLogs: number }
  createdAt: string
}

// Jamais connecté = compte jamais réellement activé (ex. import RiseUp) :
// le bon geste d'accès est « Renvoyer activation », pas la réinitialisation.
function neverLoggedIn(u: User) {
  return (u._count?.loginLogs ?? 0) === 0
}

// Ordre d'affichage des rôles dans le tableau + libellés de section
const ROLE_ORDER: Record<string, number> = { SUPER_ADMIN: 0, PARTNER_ADMIN: 1, LEARNER: 2 }
const ROLE_GROUP_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super administrateurs",
  PARTNER_ADMIN: "Administrateurs",
  LEARNER: "Apprenants",
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

function dateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

// 4520 → "1h 15", 300 → "5 min", 45 → "moins d'1 min"
function formatSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return "0 min"
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m.toString().padStart(2, "0")}` : `${h}h`
  if (m > 0) return `${m} min`
  return "moins d'1 min"
}

// ─── Icônes du menu Actions (16px, stroke currentColor) ───
const IC = "w-4 h-4 shrink-0"
const IconEdit = <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
const IconKey = <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
const IconReset = <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
const IconChart = <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
const IconAssign = <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
const IconSend = <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
const IconArchive = <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>

type StatusFilter = "all" | "active" | "inactive" | "archived"

function isErrorFeedback(msg: string) {
  return /erreur|échec|echec|requis|correspondent|minimum|min\.|déjà|deja|introuvable|refus|licences|sélectionnez/i.test(msg)
}

function FeedbackBanner({ message }: { message: string }) {
  if (!message) return null
  const isError = isErrorFeedback(message)
  return (
    <div className={`text-sm rounded-lg px-4 py-3 ${isError ? "bg-red-50 text-red-600 border border-red-100" : "bg-green-50 text-green-700 border border-green-100"}`}>
      {message}
    </div>
  )
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active")
  const [orgFilter, setOrgFilter] = useState<"all" | "internal" | "partner">("all")
  const [message, setMessage] = useState("")
  const [modalMessage, setModalMessage] = useState("")
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
  const [reactivateModal, setReactivateModal] = useState<User | null>(null)
  const [resetModal, setResetModal] = useState<User | null>(null)
  const [loginLinkModal, setLoginLinkModal] = useState<User | null>(null)
  const [formationsModal, setFormationsModal] = useState<User | null>(null)

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
  const [editReference, setEditReference] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  // Formations attribuées (multi) — copie locale éditable des enrollments
  type EditEnrollment = { formationId: string; title: string; startedAt: string; expiresAt: string }
  const [editEnrollments, setEditEnrollments] = useState<EditEnrollment[]>([])
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [removingFormation, setRemovingFormation] = useState(false)
  const [editAddOpen, setEditAddOpen] = useState(false)
  const [editAddFormationId, setEditAddFormationId] = useState("")
  const [editAddStarts, setEditAddStarts] = useState(dateInputValue())
  const [editAddExpires, setEditAddExpires] = useState("")
  const [editAddSaving, setEditAddSaving] = useState(false)

  // Password form
  const [pw, setPw] = useState("")
  const [pwConfirm, setPwConfirm] = useState("")
  const [pwSaving, setPwSaving] = useState(false)

  // Assign form (kept for quick assign from action button)
  const [assignModal, setAssignModal] = useState<string | null>(null)
  const [assignFormationId, setAssignFormationId] = useState("")
  const [assignStarts, setAssignStarts] = useState(dateInputValue())
  const [assignExpires, setAssignExpires] = useState("")
  const [assigning, setAssigning] = useState(false)

  // Create form — optional formation assignment
  const [newFormationId, setNewFormationId] = useState("")
  const [newStartsAt, setNewStartsAt] = useState(dateInputValue())
  const [newExpiresAt, setNewExpiresAt] = useState("")
  const [newAssignFormation, setNewAssignFormation] = useState(false)

  // Actions dropdown
  // Two separate refs: the mobile card (.lg:hidden) and the desktop table
  // (.hidden.lg:block) are BOTH mounted in the DOM at once — only `display`
  // differs by breakpoint. A single shared ref bound to both containers of the
  // same row ends up pointing at the last-rendered one (desktop), so on mobile
  // the outside-click handler saw the tap on "Modifier" as OUTSIDE the menu and
  // closed it on mousedown before the click reached openEdit() → modale never
  // opened. Keeping one ref per variant fixes the mobile edit flow.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const desktopMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const insideMobile = mobileMenuRef.current?.contains(target)
      const insideDesktop = desktopMenuRef.current?.contains(target)
      if (!insideMobile && !insideDesktop) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
  }).sort((a, b) => {
    // Tri par rôle : super admins → admins → apprenants, puis par nom
    const ra = ROLE_ORDER[a.role] ?? 99
    const rb = ROLE_ORDER[b.role] ?? 99
    if (ra !== rb) return ra - rb
    const ln = (a.lastName || "").localeCompare(b.lastName || "", "fr", { sensitivity: "base" })
    if (ln !== 0) return ln
    return (a.firstName || "").localeCompare(b.firstName || "", "fr", { sensitivity: "base" })
  })

  const statusCounts = {
    all: users.length,
    active: users.filter((u) => u.isActive && !u.archivedAt).length,
    inactive: users.filter((u) => !u.isActive && !u.archivedAt).length,
    archived: users.filter((u) => !!u.archivedAt).length,
  }

  // Compteurs par groupe de rôle (pour les en-têtes de section du tableau)
  const roleGroupCounts: Record<string, number> = { SUPER_ADMIN: 0, PARTNER_ADMIN: 0, LEARNER: 0 }
  filtered.forEach((u) => { if (u.role in roleGroupCounts) roleGroupCounts[u.role]++ })
  const colCount = isPartnerAdmin ? 7 : 8

  const flash = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 3000)
  }

  const modalFlash = (msg: string) => {
    setModalMessage(msg)
  }

  const closeModalAfterFeedback = (close: () => void) => {
    window.setTimeout(() => {
      setModalMessage("")
      close()
    }, 1100)
  }

  const updateUserInList = (updated: User) => {
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u))
  }

  const removeUserFromList = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id))
  }

  const resetCreateForm = () => {
    setNewFirstName("")
    setNewLastName("")
    setNewEmail("")
    setNewRole("LEARNER")
    setNewPartnerId("")
    setNewReference("")
    setNewPassword(generatePassword())
    setNewAssignFormation(false)
    setNewFormationId("")
    setNewStartsAt(dateInputValue())
    setNewExpiresAt("")
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
  const [resetSending, setResetSending] = useState(false)
  const [loginLinkSending, setLoginLinkSending] = useState(false)

  const openResetModal = (user: User) => {
    setModalMessage("")
    setResetModal(user)
  }

  const openLoginLinkModal = (user: User) => {
    setModalMessage("")
    setLoginLinkModal(user)
  }

  const handleSendPasswordReset = async () => {
    if (!resetModal) return
    setResetSending(true)
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetModal.email }),
      })
      if (res.ok) {
        modalFlash("Mail de réinitialisation envoyé")
        closeModalAfterFeedback(() => setResetModal(null))
      } else {
        modalFlash("Erreur lors de l'envoi")
      }
    } catch {
      modalFlash("Erreur réseau")
    } finally {
      setResetSending(false)
    }
  }

  const handleSendLoginLink = async () => {
    if (!loginLinkModal) return
    setLoginLinkSending(true)
    try {
      const res = await fetch(`/api/user/${loginLinkModal.id}/send-login-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        modalFlash(data.emailSent === false ? "Erreur email : lien préparé, mais envoi non confirmé" : "Mail de connexion envoyé")
        closeModalAfterFeedback(() => setLoginLinkModal(null))
      } else {
        modalFlash(data.error || "Erreur lors de l'envoi")
      }
    } catch {
      modalFlash("Erreur réseau")
    } finally {
      setLoginLinkSending(false)
    }
  }

  const handleResendActivation = async (user: User) => {
    setResending(user.id)
    try {
      const res = await fetch(`/api/user/${user.id}/resend-activation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (res.ok) {
        const data = await res.json()
        flash(data.emailSent === false ? "Erreur email : lien généré, mais envoi non confirmé" : "Lien d'activation renvoyé")
      } else {
        flash("Erreur lors du renvoi")
      }
    } catch { flash("Erreur réseau") }
    finally { setResending(null) }
  }

  // ─── CREATE USER ───
  const handleCreate = async () => {
    if (!newFirstName.trim() || !newLastName.trim() || !newEmail.trim()) {
      modalFlash("Tous les champs sont requis")
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
        modalFlash(data.error || "Erreur lors de la création")
        return
      }
      const created = await res.json()
      let formationEmailSent = true
      // Optionally assign formation right after creation
      if (newAssignFormation && newFormationId && created.id) {
        try {
          const assignRes = await fetch(`/api/user/${created.id}/assign-formation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formationId: newFormationId, startedAt: newStartsAt || null, expiresAt: newExpiresAt || null }),
          })
          if (!assignRes.ok) {
            const data = await assignRes.json()
            modalFlash(`Utilisateur créé, mais formation non attribuée : ${data.error || "erreur inconnue"}`)
            closeModalAfterFeedback(() => {
              setCreateOpen(false)
              resetCreateForm()
              router.refresh()
            })
            return
          }
          const assignData = await assignRes.json()
          formationEmailSent = assignData.emailSent !== false
        } catch {
          modalFlash("Utilisateur créé, mais formation non attribuée : erreur réseau")
          closeModalAfterFeedback(() => {
            setCreateOpen(false)
            resetCreateForm()
            router.refresh()
          })
          return
        }
      }
      if (created.activationEmailSent === false) {
        modalFlash("Erreur email : utilisateur créé, mais invitation non envoyée")
      } else if (!formationEmailSent) {
        modalFlash("Erreur email : utilisateur créé, mais email formation non envoyé")
      } else {
        modalFlash("Utilisateur créé avec succès — invitation envoyée")
      }
      closeModalAfterFeedback(() => {
        setCreateOpen(false)
        resetCreateForm()
        router.refresh()
      })
    } catch { modalFlash("Erreur réseau") }
    finally { setCreating(false) }
  }

  // ─── OPEN EDIT MODAL ───
  const openEdit = (u: User) => {
    setModalMessage("")
    setEditModal(u)
    setEditFirstName(u.firstName)
    setEditLastName(u.lastName)
    setEditEmail(u.email)
    setEditReference(u.reference || "")
    setEditIsActive(u.isActive)
    setEditRole(u.role)
    setEditPartnerId(u.partnerId || "")
    setEditEnrollments(u.enrollments.map((e) => ({
      formationId: e.formationId,
      title: e.formation.title,
      startedAt: e.startedAt ? e.startedAt.split("T")[0] : dateInputValue(),
      expiresAt: e.expiresAt ? e.expiresAt.split("T")[0] : "",
    })))
    setRemoveConfirmId(null)
    setEditAddOpen(false)
    setEditAddFormationId("")
    setEditAddStarts(dateInputValue())
    setEditAddExpires("")
  }

  // ─── SAVE EDIT ───
  const handleEdit = async () => {
    if (!editModal) return
    if (!editFirstName.trim() || !editLastName.trim() || !editEmail.trim()) {
      modalFlash("Tous les champs sont requis")
      return
    }
    setEditSaving(true)
    try {
      // 1. Dates d'accès modifiées par formation (routes dédiées, avant le PUT
      //    pour que le re-fetch du PUT renvoie les enrollments à jour).
      for (const en of editEnrollments) {
        const original = editModal.enrollments.find((e) => e.formationId === en.formationId)
        if (!original) continue
        const origStart = original.startedAt ? original.startedAt.split("T")[0] : ""
        const origExpires = original.expiresAt ? original.expiresAt.split("T")[0] : ""
        if (en.startedAt !== origStart || en.expiresAt !== origExpires) {
          const patchRes = await fetch(`/api/user/${editModal.id}/assign-formation`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formationId: en.formationId, startedAt: en.startedAt || null, expiresAt: en.expiresAt || null }),
          })
          if (!patchRes.ok) {
            const data = await patchRes.json()
            modalFlash(`Erreur dates « ${en.title} » : ${data.error || "échec"}`)
            setEditSaving(false)
            return
          }
        }
      }
      // 2. Identité / statut / rôle / partenaire
      const body: any = {
        firstName: editFirstName,
        lastName: editLastName,
        email: editEmail,
        reference: editReference || null,
        isActive: editIsActive,
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
        modalFlash("Utilisateur modifié")
        closeModalAfterFeedback(() => setEditModal(null))
      } else {
        const data = await res.json()
        modalFlash("Erreur : " + (data.error || "Échec"))
      }
    } catch { modalFlash("Erreur réseau") }
    finally { setEditSaving(false) }
  }

  // ─── ADD FORMATION (from edit modal) ───
  const handleAddFormation = async () => {
    if (!editModal) return
    if (!editAddFormationId) { modalFlash("Sélectionnez une formation à attribuer"); return }
    setEditAddSaving(true)
    try {
      const res = await fetch(`/api/user/${editModal.id}/assign-formation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formationId: editAddFormationId, startedAt: editAddStarts || null, expiresAt: editAddExpires || null }),
      })
      const data = await res.json()
      if (res.ok) {
        const newEnrollment = {
          id: data.id,
          formationId: data.formationId,
          startedAt: data.startedAt,
          expiresAt: data.expiresAt,
          formation: { id: data.formationId, title: data.formation?.title || formations?.find((f) => f.id === data.formationId)?.title || "" },
        }
        const refreshedUser: User = { ...editModal, enrollments: [...editModal.enrollments, newEnrollment] }
        setEditModal(refreshedUser)
        updateUserInList(refreshedUser)
        setEditEnrollments((prev) => [...prev, {
          formationId: newEnrollment.formationId,
          title: newEnrollment.formation.title,
          startedAt: newEnrollment.startedAt ? newEnrollment.startedAt.split("T")[0] : dateInputValue(),
          expiresAt: newEnrollment.expiresAt ? newEnrollment.expiresAt.split("T")[0] : "",
        }])
        setEditAddOpen(false)
        setEditAddFormationId("")
        setEditAddStarts(dateInputValue())
        setEditAddExpires("")
        if (data.emailSkipped) modalFlash("Formation attribuée — aucun email envoyé (compte inactif)")
        else if (data.emailSent === false) modalFlash("Erreur email : formation attribuée, mais email non envoyé")
        else modalFlash("Formation attribuée")
        router.refresh()
      } else {
        modalFlash("Erreur : " + (data.error || "attribution impossible"))
      }
    } catch { modalFlash("Erreur réseau") }
    finally { setEditAddSaving(false) }
  }

  // ─── REMOVE FORMATION (from edit modal, after inline confirmation) ───
  const handleRemoveFormation = async (formationId: string) => {
    if (!editModal) return
    setRemovingFormation(true)
    try {
      const res = await fetch(`/api/user/${editModal.id}/assign-formation`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formationId }),
      })
      if (res.ok) {
        const refreshedUser: User = { ...editModal, enrollments: editModal.enrollments.filter((e) => e.formationId !== formationId) }
        setEditModal(refreshedUser)
        updateUserInList(refreshedUser)
        setEditEnrollments((prev) => prev.filter((e) => e.formationId !== formationId))
        setRemoveConfirmId(null)
        modalFlash("Formation retirée — la progression reste conservée")
        router.refresh()
      } else {
        const data = await res.json()
        modalFlash("Erreur : " + (data.error || "retrait impossible"))
      }
    } catch { modalFlash("Erreur réseau") }
    finally { setRemovingFormation(false) }
  }

  // ─── CHANGE PASSWORD ───
  const handlePassword = async () => {
    if (!pw || pw.length < 4) { modalFlash("Le mot de passe doit faire au moins 4 caractères"); return }
    if (pw !== pwConfirm) { modalFlash("Les mots de passe ne correspondent pas"); return }
    setPwSaving(true)
    try {
      const res = await fetch(`/api/user/${passwordModal}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pw }),
      })
      if (res.ok) {
        modalFlash("Mot de passe mis à jour")
        closeModalAfterFeedback(() => {
          setPasswordModal(null)
          setPw("")
          setPwConfirm("")
        })
      } else {
        const data = await res.json()
        modalFlash(data.error || "Erreur")
      }
    } catch { modalFlash("Erreur réseau") }
    finally { setPwSaving(false) }
  }

  // ─── ASSIGN FORMATION ───
  const handleAssign = async () => {
    if (!assignFormationId) { modalFlash("Sélectionnez une formation"); return }
    setAssigning(true)
    try {
      const res = await fetch(`/api/user/${assignModal}/assign-formation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formationId: assignFormationId, startedAt: assignStarts || null, expiresAt: assignExpires || null }),
      })
      if (res.ok) {
        const data = await res.json()
        modalFlash(data.emailSent === false ? "Erreur email : formation attribuée, mais email non envoyé" : "Formation attribuée")
        closeModalAfterFeedback(() => {
          setAssignModal(null)
          setAssignFormationId("")
          setAssignStarts(dateInputValue())
          setAssignExpires("")
          router.refresh()
        })
      } else {
        const data = await res.json()
        modalFlash(data.error || "Erreur")
      }
    } catch { modalFlash("Erreur réseau") }
    finally { setAssigning(false) }
  }

  // ─── QUICK STATUS TOGGLE ───
  // Les deux sens passent par une confirmation : désactiver (rouge) ET
  // réactiver (vert). Un simple tap sur le badge ne change plus le statut
  // sans validation — évite les activations accidentelles (ex. comptes RiseUp).
  const handleStatusClick = (u: User) => {
    if (u.role === "SUPER_ADMIN") return
    if (u.isActive) {
      setDeactivateModal(u)
    } else {
      setReactivateModal(u)
    }
  }

  const confirmReactivate = async () => {
    if (!reactivateModal) return
    try {
      const res = await fetch(`/api/users/${reactivateModal.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      })
      if (res.ok) {
        updateUserInList({ ...reactivateModal, isActive: true })
        flash(`${reactivateModal.firstName} ${reactivateModal.lastName} réactivé`)
      } else {
        const data = await res.json().catch(() => ({}))
        flash(data.error || "Erreur lors de la réactivation")
      }
    } catch { flash("Erreur réseau") }
    finally { setReactivateModal(null) }
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
  const canViewSpace = (u: User) => {
    if (isArchived(u)) return false
    if (isPartnerAdmin) return u.role === "LEARNER"
    return u.role === "LEARNER" || u.role === "PARTNER_ADMIN"
  }
  const canSendLoginLink = (u: User) => u.isActive && !u.archivedAt && !neverLoggedIn(u)

  return (
    <>
      {message && <div className="mb-4"><FeedbackBanner message={message} /></div>}

      {/* ═══ STATUS FILTERS ═══ */}
      <div className="space-y-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
            {(["all", "active", "inactive", ...(isPartnerAdmin ? [] : ["archived"])] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
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
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    orgFilter === f ? "bg-white shadow-sm text-black" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {f === "all" ? "Tous" : f === "internal" ? "Internes" : "Partenaires"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setSearch("") }}
              className="w-full min-w-0 pl-3 pr-20 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
              style={{ fontSize: 16 }}
            />
            {search && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 rounded border border-border bg-gray-50 text-[10px] font-medium text-gray-400 leading-none">Échap</kbd>
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Effacer la recherche"
                  title="Effacer (Échap)"
                  className="flex items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => { setModalMessage(""); setCreateOpen(true) }}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
            style={{ minHeight: 44 }}
          >
            + Nouvel utilisateur
          </button>
        </div>
      </div>

      {/* ═══ MOBILE CARDS ═══ */}
      <div className="lg:hidden space-y-3">
        {filtered.map((u, i) => {
          const showGroup = i === 0 || filtered[i - 1].role !== u.role
          return (
          <Fragment key={u.id}>
            {showGroup && (
              <div className={`flex items-baseline gap-1.5 px-1 ${i === 0 ? "" : "pt-3"}`}>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ROLE_GROUP_LABEL[u.role] ?? u.role}</span>
                <span className="text-[11px] text-gray-300">· {roleGroupCounts[u.role]}</span>
              </div>
            )}
          <div className={`bg-white rounded-xl border border-border p-4 space-y-2 ${isArchived(u) ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{u.firstName} {u.lastName}</span>
                  {u.role === "PARTNER_ADMIN" && <Badge variant="blue">Admin</Badge>}
                  {u.role === "SUPER_ADMIN" && <Badge variant="error">Super Admin</Badge>}
                  {!isPartnerAdmin && u.partner && <Badge variant="purple">{u.partner.name}</Badge>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{u.email}</p>
              </div>
              {isArchived(u) ? (
                <Badge variant="default">Archivé</Badge>
              ) : (
                <button
                  onClick={() => handleStatusClick(u)}
                  disabled={u.role === "SUPER_ADMIN"}
                >
                  <Badge variant={u.isActive ? "success" : "warning"}>
                    {u.isActive ? "Actif" : "Invité"}
                  </Badge>
                </button>
              )}
            </div>
            <div className="flex items-start gap-3 text-xs text-gray-500">
              {u.enrollments.length === 0 ? (
                <span>Aucune formation</span>
              ) : (
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-gray-700">{u.enrollments.length} formation{u.enrollments.length > 1 ? "s" : ""}</span>
                    <button type="button" onClick={() => setFormationsModal(u)} className="text-primary hover:underline shrink-0">Voir plus</button>
                  </div>
                  {u.enrollments.length === 1 && (
                    <div className="truncate">{u.enrollments[0].formation.title}</div>
                  )}
                </div>
              )}
              {u.reference && (
                <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md font-medium shrink-0">{u.reference}</span>
              )}
            </div>
            <div className="pt-2 border-t border-gray-50">
              {isArchived(u) ? (
                <div className="flex gap-2">
                  <button onClick={() => handleRestore(u)} className="flex-1 py-2 text-xs bg-gray-100 hover:bg-green-50 hover:text-green-600 rounded-lg transition-colors" style={{ minHeight: 44 }}>
                    Restaurer
                  </button>
                  {!isPartnerAdmin && (
                    <button onClick={() => setDeleteModal(u)} className="flex-1 py-2 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors" style={{ minHeight: 44 }}>
                      Supprimer
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative flex justify-end" ref={openMenuId === u.id ? mobileMenuRef : undefined}>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                    className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800"
                    aria-label="Actions"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.8"/>
                      <circle cx="12" cy="12" r="1.8"/>
                      <circle cx="12" cy="19" r="1.8"/>
                    </svg>
                  </button>
                  {openMenuId === u.id && (
                    <div className="max-h-[80dvh] overflow-y-auto" style={{ position: "fixed", left: 16, right: 16, bottom: 16, background: "white", border: "0.5px solid #E5E5E5", borderRadius: 12, boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", zIndex: 50 }}>
                      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-sm font-medium">{u.firstName} {u.lastName}</span>
                        <button onClick={() => setOpenMenuId(null)} aria-label="Fermer" className="w-11 h-11 -mr-2 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                      </div>
                      {canViewSpace(u) && (
                        <button onClick={() => { setOpenMenuId(null); handleImpersonate(u.id) }} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm text-primary font-medium hover:bg-gray-50 transition-colors"><span className="w-4 h-4 flex items-center justify-center shrink-0"><span className="w-2 h-2 rounded-full bg-primary" /></span>Voir l&apos;espace</button>
                      )}
                      <button onClick={() => { setOpenMenuId(null); openEdit(u) }} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors">{IconEdit}Modifier</button>
                      <button onClick={() => { setOpenMenuId(null); setModalMessage(""); setPasswordModal(u.id); setPw(""); setPwConfirm("") }} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors">{IconKey}Changer mot de passe</button>
                      {u.isActive && !u.archivedAt && !neverLoggedIn(u) && (
                        <button onClick={() => { setOpenMenuId(null); openResetModal(u) }} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors">{IconReset}Envoyer réinitialisation</button>
                      )}
                      {canSendLoginLink(u) && (
                        <button onClick={() => { setOpenMenuId(null); openLoginLinkModal(u) }} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors">{IconSend}Envoyer lien de connexion</button>
                      )}
                      <button onClick={() => { setOpenMenuId(null); openProgress(u.id) }} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors">{IconChart}Suivi</button>
                      <button onClick={() => { setOpenMenuId(null); setModalMessage(""); setAssignModal(u.id); setAssignFormationId(""); setAssignStarts(dateInputValue()); setAssignExpires("") }} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors">{IconAssign}Attribuer formation</button>
                      {neverLoggedIn(u) && !u.archivedAt && u.role !== "SUPER_ADMIN" && (
                        <button onClick={() => { setOpenMenuId(null); handleResendActivation(u) }} disabled={resending === u.id} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">{IconSend}{resending === u.id ? "Envoi..." : "Renvoyer activation"}</button>
                      )}
                      {u.role !== "SUPER_ADMIN" && (
                        <>
                          <div className="border-t border-gray-100 my-1" />
                          <button onClick={() => { setOpenMenuId(null); setArchiveModal(u) }} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors">{IconArchive}Archiver</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          </Fragment>
          )
        })}
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-border px-4 py-8 text-center text-sm text-gray-400">
            Aucun utilisateur
          </div>
        )}
      </div>

      {/* ═══ DESKTOP TABLE ═══ */}
      <div className="hidden lg:block bg-white rounded-xl border border-border" style={{ overflow: "visible" }}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Nom</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Rôle</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Référence</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Email</th>
              {!isPartnerAdmin && <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Appartenance</th>}
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Formation</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Statut</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => {
              const showGroup = i === 0 || filtered[i - 1].role !== u.role
              return (
              <Fragment key={u.id}>
                {showGroup && (
                  <tr className="bg-gray-100 border-b border-border">
                    <td colSpan={colCount} className="px-4 pt-3.5 pb-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        {ROLE_GROUP_LABEL[u.role] ?? u.role}
                        <span className="ml-1.5 font-normal text-gray-300">· {roleGroupCounts[u.role]}</span>
                      </span>
                    </td>
                  </tr>
                )}
              <tr className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isArchived(u) ? "opacity-60" : ""}`}>
                <td className="px-4 py-3">
                  <span className="text-sm font-medium">{u.firstName} {u.lastName}</span>
                </td>
                <td className="px-4 py-3">
                  {u.role === "SUPER_ADMIN" ? (
                    <Badge variant="error">Super admin</Badge>
                  ) : u.role === "PARTNER_ADMIN" ? (
                    <Badge variant="blue">Admin</Badge>
                  ) : (
                    <Badge variant="default">Apprenant</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.reference ? (
                    <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md font-medium">{u.reference}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500"><span className="block truncate max-w-[220px]" title={u.email}>{u.email}</span></td>
                {!isPartnerAdmin && (
                  <td className="px-4 py-3">
                    {u.partner ? (
                      <Badge variant="purple">{u.partner.name}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Interne</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-gray-500">
                  {u.enrollments.length === 0 ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">{u.enrollments.length} formation{u.enrollments.length > 1 ? "s" : ""}</span>
                        <button type="button" onClick={() => setFormationsModal(u)} className="text-primary text-xs hover:underline">Voir plus</button>
                      </div>
                      {u.enrollments.length === 1 && (
                        <div className="text-gray-500 truncate max-w-[240px]">{u.enrollments[0].formation.title}</div>
                      )}
                    </div>
                  )}
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
                <td className="px-4 py-3" style={{ position: "relative", overflow: "visible" }}>
                  {isArchived(u) ? (
                    <div className="flex gap-1.5">
                      <button onClick={() => handleRestore(u)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-green-50 hover:text-green-600 rounded transition-colors">
                        Restaurer
                      </button>
                      {!isPartnerAdmin && (
                        <button onClick={() => setDeleteModal(u)} className="px-2 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors">
                          Supprimer
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="relative flex justify-end" ref={openMenuId === u.id ? desktopMenuRef : undefined}>
                      <button
                        onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800"
                        aria-label="Actions"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="5" r="1.8"/>
                          <circle cx="12" cy="12" r="1.8"/>
                          <circle cx="12" cy="19" r="1.8"/>
                        </svg>
                      </button>
                      {openMenuId === u.id && (
                        <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "white", border: "0.5px solid #E5E5E5", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 50, minWidth: 220, overflow: "hidden" }}>
                          {canViewSpace(u) && (
                            <button onClick={() => { setOpenMenuId(null); handleImpersonate(u.id) }} className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm text-primary font-medium hover:bg-gray-50 transition-colors"><span className="w-4 h-4 flex items-center justify-center shrink-0"><span className="w-2 h-2 rounded-full bg-primary" /></span>Voir l&apos;espace</button>
                          )}
                          <button onClick={() => { setOpenMenuId(null); openEdit(u) }} className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors">{IconEdit}Modifier</button>
                          <button onClick={() => { setOpenMenuId(null); setModalMessage(""); setPasswordModal(u.id); setPw(""); setPwConfirm("") }} className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors">{IconKey}Changer mot de passe</button>
                          {u.isActive && !u.archivedAt && !neverLoggedIn(u) && (
                            <button onClick={() => { setOpenMenuId(null); openResetModal(u) }} className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors">{IconReset}Envoyer réinitialisation</button>
                          )}
                          {canSendLoginLink(u) && (
                            <button onClick={() => { setOpenMenuId(null); openLoginLinkModal(u) }} className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors">{IconSend}Envoyer lien de connexion</button>
                          )}
                          <button onClick={() => { setOpenMenuId(null); openProgress(u.id) }} className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors">{IconChart}Suivi</button>
                          <button onClick={() => { setOpenMenuId(null); setModalMessage(""); setAssignModal(u.id); setAssignFormationId(""); setAssignStarts(dateInputValue()); setAssignExpires("") }} className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors">{IconAssign}Attribuer formation</button>
                          {neverLoggedIn(u) && !u.archivedAt && u.role !== "SUPER_ADMIN" && (
                            <button onClick={() => { setOpenMenuId(null); handleResendActivation(u) }} disabled={resending === u.id} className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">{IconSend}{resending === u.id ? "Envoi..." : "Renvoyer activation"}</button>
                          )}
                          {u.role !== "SUPER_ADMIN" && (
                            <>
                              <div className="border-t border-gray-100 my-1" />
                              <button onClick={() => { setOpenMenuId(null); setArchiveModal(u) }} className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">{IconArchive}Archiver</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
              </Fragment>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-gray-400">
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

      {/* ═══ REACTIVATE CONFIRMATION MODAL ═══ */}
      <Modal open={!!reactivateModal} onClose={() => setReactivateModal(null)} title="Réactiver cet utilisateur ?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            <strong>{reactivateModal?.firstName} {reactivateModal?.lastName}</strong> repassera en statut « Actif » et sera de nouveau compté parmi les utilisateurs actifs.
          </p>
          <p className="text-sm text-gray-500">
            Aucun email ne lui est envoyé. S&apos;il n&apos;a pas encore défini son mot de passe (compte importé, jamais activé), utilisez « Renvoyer activation » pour lui ouvrir réellement l&apos;accès.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setReactivateModal(null)} className="flex-1 py-2.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors">
              Annuler
            </button>
            <button onClick={confirmReactivate} className="flex-1 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors">
              Réactiver
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══ PASSWORD RESET EMAIL MODAL ═══ */}
      <Modal open={!!resetModal} onClose={() => { if (!resetSending) { setResetModal(null); setModalMessage("") } }} title="Envoyer un mail de réinitialisation ?">
        <div className="space-y-4">
          <FeedbackBanner message={modalMessage} />
          <p className="text-sm text-gray-600">
            Un email de réinitialisation du mot de passe sera envoyé à{" "}
            <strong>{resetModal?.firstName} {resetModal?.lastName}</strong>.
          </p>
          <p className="text-sm text-gray-500 break-all">
            {resetModal?.email}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setResetModal(null); setModalMessage("") }}
              disabled={resetSending}
              className="flex-1 py-2.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSendPasswordReset}
              disabled={resetSending}
              className="flex-1 py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {resetSending ? "Envoi..." : "OK, envoyer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══ LOGIN LINK EMAIL MODAL ═══ */}
      <Modal open={!!loginLinkModal} onClose={() => { if (!loginLinkSending) { setLoginLinkModal(null); setModalMessage("") } }} title="Envoyer le lien de connexion ?">
        <div className="space-y-4">
          <FeedbackBanner message={modalMessage} />
          <p className="text-sm text-gray-600">
            Un email avec le lien de connexion sera envoyé à{" "}
            <strong>{loginLinkModal?.firstName} {loginLinkModal?.lastName}</strong>.
          </p>
          <p className="text-sm text-gray-500 break-all">
            {loginLinkModal?.email}
          </p>
          <p className="text-xs text-gray-500">
            Ce mail ne modifie pas son mot de passe. Il rappelle aussi le lien « Mot de passe oublié ».
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setLoginLinkModal(null); setModalMessage("") }}
              disabled={loginLinkSending}
              className="flex-1 py-2.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSendLoginLink}
              disabled={loginLinkSending}
              className="flex-1 py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loginLinkSending ? "Envoi..." : "OK, envoyer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══ EDIT USER MODAL ═══ */}
      <Modal open={!!editModal} onClose={() => { setEditModal(null); setModalMessage("") }} title="Modifier l'utilisateur">
        {editModal && (
          <div className="space-y-5">
            <FeedbackBanner message={modalMessage} />

            {/* Personal info */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Informations personnelles</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Prénom</label>
                  <input
                    type="text"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nom</label>
                  <input
                    type="text"
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
                  type="text"
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
                  aria-label="Statut du compte"
                  className="flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0 -mr-2"
                >
                  <span className={`relative block w-10 h-5 rounded-full transition-colors ${editIsActive ? "bg-green-500" : "bg-gray-300"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${editIsActive ? "translate-x-5" : "translate-x-0.5"}`} />
                  </span>
                </button>
              </div>
            </div>

            {/* Formations attribuées (multi) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">
                Formations attribuées {editEnrollments.length > 0 && `(${editEnrollments.length})`}
              </h3>
              {editEnrollments.length === 0 && (
                <p className="text-sm text-gray-400 mb-3">Aucune formation attribuée.</p>
              )}
              <div className="space-y-3">
                {editEnrollments.map((en) => (
                  <div key={en.formationId} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{en.title}</p>
                      {removeConfirmId !== en.formationId && (
                        <button
                          onClick={() => setRemoveConfirmId(en.formationId)}
                          className="shrink-0 text-xs text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors"
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                    {removeConfirmId === en.formationId ? (
                      <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-2">
                        <p className="text-xs text-red-700">
                          Retirer <strong>{en.title}</strong> ? L&apos;apprenant perdra l&apos;accès à cette formation.
                          Sa progression est conservée s&apos;il est réinscrit plus tard.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRemoveConfirmId(null)}
                            className="flex-1 py-2 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={() => handleRemoveFormation(en.formationId)}
                            disabled={removingFormation}
                            className="flex-1 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {removingFormation ? "Retrait..." : "Oui, retirer"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Date de début</label>
                          <input
                            type="date"
                            value={en.startedAt}
                            onChange={(e) => setEditEnrollments((prev) => prev.map((x) => x.formationId === en.formationId ? { ...x, startedAt: e.target.value } : x))}
                            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Date de fin d&apos;accès</label>
                          <input
                            type="date"
                            value={en.expiresAt}
                            onChange={(e) => setEditEnrollments((prev) => prev.map((x) => x.formationId === en.formationId ? { ...x, expiresAt: e.target.value } : x))}
                            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
                          />
                          {!en.expiresAt && (
                            <p className="text-xs text-red-600 font-semibold mt-1">⚠ Sans date de fin : accès illimité</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {editAddOpen ? (
                <div className="mt-3 border border-dashed border-gray-300 rounded-lg p-3 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Formation à attribuer</label>
                    <select
                      value={editAddFormationId}
                      onChange={(e) => setEditAddFormationId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white"
                    >
                      <option value="">Sélectionner une formation</option>
                      {formations?.map((f) => {
                        const already = editEnrollments.some((en) => en.formationId === f.id)
                        return (
                          <option key={f.id} value={f.id} disabled={already}>
                            {f.title}{already ? " — déjà attribuée" : ""}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Date de début</label>
                      <input type="date" value={editAddStarts} onChange={(e) => setEditAddStarts(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Date d&apos;expiration (optionnel)</label>
                      <input type="date" value={editAddExpires} onChange={(e) => setEditAddExpires(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
                      {!editAddExpires && (
                        <p className="text-xs text-red-600 font-semibold mt-1">⚠ Sans date d&apos;expiration : accès illimité</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditAddOpen(false); setEditAddFormationId("") }}
                      className="flex-1 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleAddFormation}
                      disabled={editAddSaving}
                      className="flex-1 py-2 text-sm bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      {editAddSaving ? "Attribution..." : "Attribuer"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setEditAddOpen(true); setRemoveConfirmId(null) }}
                  className="mt-3 w-full py-2.5 text-sm border border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-gray-400 hover:text-gray-800 transition-colors"
                >
                  + Attribuer une autre formation
                </button>
              )}
            </div>

            {/* Super admin only: partner + role */}
            {!isPartnerAdmin && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 mb-3">Appartenance et rôle</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                className="flex-1 py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
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
            <button onClick={handleArchive} className="flex-1 py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90">
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

      {/* ═══ FORMATIONS DETAIL MODAL ═══ */}
      <Modal open={!!formationsModal} onClose={() => setFormationsModal(null)} title={`Formations — ${formationsModal?.firstName ?? ""} ${formationsModal?.lastName ?? ""}`.trim()}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {formationsModal?.enrollments.length ?? 0} formation{(formationsModal?.enrollments.length ?? 0) > 1 ? "s" : ""} attribuée{(formationsModal?.enrollments.length ?? 0) > 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {formationsModal?.enrollments.map((e) => {
              const expired = !!e.expiresAt && new Date(e.expiresAt) < new Date()
              const start = e.startedAt ? new Date(e.startedAt).toLocaleDateString("fr-FR") : null
              const end = e.expiresAt ? new Date(e.expiresAt).toLocaleDateString("fr-FR") : null
              return (
                <div key={e.id} className="rounded-lg border border-border p-3">
                  <div className="text-sm font-medium text-gray-800">{e.formation.title}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {start ? `Accès à partir du ${start}` : "Accès immédiat"}
                    {end ? ` · jusqu'au ${end}` : " · sans date de fin"}
                    {expired && <span className="ml-1.5 text-rose-600 font-medium">Expiré</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <button onClick={() => setFormationsModal(null)} className="w-full py-2.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors">
            Fermer
          </button>
        </div>
      </Modal>

      {/* ═══ CREATE USER MODAL ═══ */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setModalMessage("") }} title="Nouvel utilisateur">
        <div className="space-y-4">
          <FeedbackBanner message={modalMessage} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Prénom</label>
              <input type="text" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nom</label>
              <input type="text" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Référence interne (optionnel)</label>
            <input
              type="text"
              value={newReference}
              onChange={(e) => setNewReference(e.target.value)}
              placeholder="Ex: 2024-001, MAT-123, DOSSIER-456..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black"
            />
            <p className="text-xs text-gray-400 mt-1">Permet de retrouver cet utilisateur via la recherche</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rôle</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white">
              <option value="LEARNER">Apprenant</option>
              <option value="PARTNER_ADMIN">{isPartnerAdmin ? "Administrateur" : "Admin partenaire"}</option>
            </select>
            {isPartnerAdmin && newRole === "PARTNER_ADMIN" && (
              <p className="text-xs text-gray-400 mt-1">
                Cet administrateur sera rattaché à votre plateforme et pourra gérer ses apprenants.
              </p>
            )}
          </div>
          {!isPartnerAdmin && (
            <div>
              <label className="block text-sm font-medium mb-1">Appartenance</label>
              <select value={newPartnerId} onChange={(e) => setNewPartnerId(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white">
                <option value="">Interne (aucun partenaire)</option>
                {partners?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          {/* Optional formation assignment */}
          <div>
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
              <div>
                <p className="text-sm font-medium">Attribuer une formation</p>
                <p className="text-xs text-gray-400 mt-0.5">Optionnel — attribuer une formation dès la création</p>
              </div>
              <button
                onClick={() => setNewAssignFormation(!newAssignFormation)}
                aria-label="Attribuer une formation"
                className="flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0 -mr-2"
              >
                <span className={`relative block w-10 h-5 rounded-full transition-colors ${newAssignFormation ? "bg-green-500" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${newAssignFormation ? "translate-x-5" : "translate-x-0.5"}`} />
                </span>
              </button>
            </div>
            {newAssignFormation && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Formation</label>
                  <select value={newFormationId} onChange={(e) => setNewFormationId(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black bg-white">
                    <option value="">Sélectionner une formation</option>
                    {formations?.map((f) => (
                      <option key={f.id} value={f.id}>{f.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date de début</label>
                  <input type="date" value={newStartsAt} onChange={(e) => setNewStartsAt(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date d&apos;expiration (optionnel)</label>
                  <input type="date" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
                  {!newExpiresAt && (
                    <p className="text-xs text-red-600 font-semibold mt-1">⚠ Sans date d&apos;expiration, l&apos;accès sera illimité. Modifiable à tout moment via « Modifier ».</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
            <p className="text-sm text-blue-700">Un email d&apos;activation sera envoyé automatiquement à l&apos;utilisateur pour qu&apos;il crée son mot de passe.</p>
          </div>
          <button onClick={handleCreate} disabled={creating} className="w-full py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
            {creating ? "Création..." : "Créer et envoyer invitation"}
          </button>
        </div>
      </Modal>

      {/* ═══ PASSWORD MODAL ═══ */}
      <Modal open={!!passwordModal} onClose={() => { setPasswordModal(null); setModalMessage("") }} title="Modifier le mot de passe">
        <div className="space-y-4">
          <FeedbackBanner message={modalMessage} />
          <PasswordModalContent
            pw={pw} setPw={setPw}
            pwConfirm={pwConfirm} setPwConfirm={setPwConfirm}
            pwSaving={pwSaving}
            onSave={handlePassword}
          />
        </div>
      </Modal>

      {/* ═══ ASSIGN FORMATION MODAL ═══ */}
      <Modal open={!!assignModal} onClose={() => { setAssignModal(null); setModalMessage("") }} title="Attribuer une formation">
        <div className="space-y-4">
          <FeedbackBanner message={modalMessage} />

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
            <label className="block text-sm font-medium mb-1">Date de début</label>
            <input type="date" value={assignStarts} onChange={(e) => setAssignStarts(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date d&apos;expiration (optionnel)</label>
            <input type="date" value={assignExpires} onChange={(e) => setAssignExpires(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-black" />
            {!assignExpires && (
              <p className="text-xs text-red-600 font-semibold mt-1">⚠ Sans date d&apos;expiration, l&apos;accès sera illimité. Modifiable à tout moment via « Modifier ».</p>
            )}
          </div>
          <button onClick={handleAssign} disabled={assigning} className="w-full py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
            {assigning ? "Attribution..." : "Attribuer"}
          </button>
        </div>
      </Modal>

      {/* ═══ PROGRESS MODAL ═══ */}
      <Modal
        open={!!progressModal}
        onClose={() => { setProgressModal(null); setProgressData(null) }}
        title="Fiche de suivi détaillée"
        wide
        headerAction={progressData ? (
          <a
            href={`/api/export/user-progress?userId=${progressModal}`}
            className="inline-block px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:opacity-90 whitespace-nowrap"
          >
            Export CSV
          </a>
        ) : null}
      >
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(() => {
                const totalCh = (progressData.formations || []).reduce((s: number, f: any) => s + (f.totalChapters || 0), 0)
                const doneCh = (progressData.formations || []).reduce((s: number, f: any) => s + (f.completedChapters || 0), 0)
                const globalPercent = totalCh > 0 ? Math.round((doneCh / totalCh) * 100) : 0
                return (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Progression totale</p>
                    <p className="text-sm font-semibold">{globalPercent}% <span className="text-gray-400 font-normal">· {doneCh}/{totalCh} chap.</span></p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${globalPercent}%` }} />
                    </div>
                  </div>
                )
              })()}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Temps total</p>
                <p className="text-sm font-semibold">
                  {formatSeconds(progressData.totalTime || 0)}
                  {progressData.totalExpected > 0 && (
                    <span className="text-gray-400 font-normal"> / {formatSeconds(progressData.totalExpected)} prévues</span>
                  )}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Dernière connexion</p>
                <p className="text-sm font-semibold">
                  {progressData.lastLogin
                    ? new Date(progressData.lastLogin).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Connexions</p>
                <p className="text-sm font-semibold">{progressData.connectionCount ?? progressData.loginHistory?.length ?? 0}</p>
              </div>
            </div>
            {progressData.loginHistory?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Historique connexions ({progressData.loginHistory.length})</h3>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {progressData.loginHistory.map((l: any, i: number) => {
                    const entry = typeof l === "string" ? { date: l, source: "lms" } : l
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs text-gray-500 py-1 border-b border-gray-50">
                        <span>
                          {new Date(entry.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {entry.durationSeconds ? <span className="text-gray-400">{formatSeconds(entry.durationSeconds)}</span> : null}
                          {entry.source === "riseup" && (
                            <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-medium">Rise Up{entry.device ? ` · ${entry.device}` : ""}</span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {progressData.formations?.map((f: any) => (
              <div key={f.id}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold leading-snug">{f.title}</h3>
                  <span className="text-sm font-semibold shrink-0">{f.percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-1.5">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${f.percent}%` }} />
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {f.completedChapters}/{f.totalChapters} chapitres · {formatSeconds(f.timeSpent)}
                  {f.expectedDuration > 0 && ` / ${formatSeconds(f.expectedDuration)} prévues`}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs text-gray-500 py-2">Chapitre</th>
                        <th className="text-left text-xs text-gray-500 py-2">Statut</th>
                        <th className="text-left text-xs text-gray-500 py-2">Temps</th>
                        <th className="text-left text-xs text-gray-500 py-2">Prévu</th>
                        <th className="text-left text-xs text-gray-500 py-2">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.chapters.map((ch: any) => (
                        <tr key={ch.id} className="border-b border-gray-50">
                          <td className="py-2 pr-2">{ch.title}</td>
                          <td className="py-2 pr-2">
                            <Badge variant={ch.status === "done" ? "success" : ch.status === "in_progress" ? "warning" : "default"}>
                              {ch.status === "done" ? "Terminé" : ch.status === "in_progress" ? "En cours" : "Non commencé"}
                            </Badge>
                          </td>
                          <td className="py-2 pr-2 text-gray-500 whitespace-nowrap">{ch.timeSpent > 0 ? formatSeconds(ch.timeSpent) : "—"}</td>
                          <td className="py-2 pr-2 text-gray-400 whitespace-nowrap">{ch.expectedDuration > 0 ? formatSeconds(ch.expectedDuration) : "—"}</td>
                          <td className="py-2 text-gray-500">{ch.sessionCount || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
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
          </div>
        ) : (
          <p className="text-sm text-gray-400">Aucune donnée de progression</p>
        )}
      </Modal>
    </>
  )
}

/**
 * Modal "Modifier le mot de passe" — version améliorée avec toggle visibilité
 * et bouton "Générer un mot de passe fort".
 */
function PasswordModalContent({
  pw, setPw, pwConfirm, setPwConfirm, pwSaving, onSave,
}: {
  pw: string
  setPw: (v: string) => void
  pwConfirm: string
  setPwConfirm: (v: string) => void
  pwSaving: boolean
  onSave: () => void
}) {
  const [showPw, setShowPw] = useState(false)

  const generateStrong = () => {
    const lower = "abcdefghijkmnpqrstuvwxyz"
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    const digits = "23456789"
    const symbols = "!@#$%&*"
    const all = lower + upper + digits + symbols
    let p = ""
    p += lower[Math.floor(Math.random() * lower.length)]
    p += upper[Math.floor(Math.random() * upper.length)]
    p += digits[Math.floor(Math.random() * digits.length)]
    p += symbols[Math.floor(Math.random() * symbols.length)]
    for (let i = 0; i < 8; i++) p += all[Math.floor(Math.random() * all.length)]
    p = p.split("").sort(() => Math.random() - 0.5).join("")
    setPw(p)
    setPwConfirm(p)
    setShowPw(true)
  }

  const copyPw = async () => {
    if (!pw) return
    try { await navigator.clipboard.writeText(pw) } catch {}
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-50">
        L&apos;administrateur peut voir le mot de passe pour le transmettre à l&apos;utilisateur.
      </p>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-ink-70">Nouveau mot de passe</label>
          <button type="button" onClick={generateStrong} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            Générer un mot de passe fort
          </button>
        </div>
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="input-field pr-24 font-mono"
            minLength={4}
            placeholder="4 caractères min."
            autoComplete="new-password"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="p-1.5 text-ink-50 hover:text-brand-600 rounded-md hover:bg-ink-10/50"
              title={showPw ? "Masquer" : "Afficher"}
            >
              {showPw ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={copyPw}
              disabled={!pw}
              className="p-1.5 text-ink-50 hover:text-brand-600 rounded-md hover:bg-ink-10/50 disabled:opacity-30"
              title="Copier"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-ink-70">Confirmer</label>
        <input
          type={showPw ? "text" : "password"}
          value={pwConfirm}
          onChange={(e) => setPwConfirm(e.target.value)}
          className="input-field font-mono"
          placeholder="Re-tape le mot de passe"
          autoComplete="new-password"
        />
        {pw && pwConfirm && pw !== pwConfirm && (
          <p className="text-xs text-red-600 mt-1">Les mots de passe ne correspondent pas</p>
        )}
      </div>

      <button
        onClick={onSave}
        disabled={pwSaving || !pw || pw !== pwConfirm}
        className="btn-primary w-full"
      >
        {pwSaving ? "Mise à jour…" : "Mettre à jour le mot de passe"}
      </button>
    </div>
  )
}
