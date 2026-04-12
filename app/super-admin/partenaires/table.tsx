"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Badge from "@/components/ui/Badge"
import Modal from "@/components/ui/Modal"

interface License {
  id: string
  formationId: string
  totalSeats: number
  usedSeats: number
  formation: { id: string; title: string }
}

interface Partner {
  id: string
  name: string
  slug: string
  primaryColor: string
  secondaryColor: string
  logoUrl: string | null
  faviconUrl: string | null
  isActive: boolean
  users: { id: string; email: string; role: string }[]
  licenses: License[]
}

interface FormationOption {
  id: string
  title: string
}

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function generatePassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let pw = ""
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  return pw
}

function isValidHex(v: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(v)
}

export default function PartnersTable({
  partners: initialPartners,
  formations,
}: {
  partners: Partner[]
  formations: FormationOption[]
}) {
  const router = useRouter()
  const [partners, setPartners] = useState(initialPartners)
  const [message, setMessage] = useState("")

  // Modal states
  const [createOpen, setCreateOpen] = useState(false)
  const [editPartner, setEditPartner] = useState<Partner | null>(null)
  const [licensePartner, setLicensePartner] = useState<Partner | null>(null)

  // Create form
  const [cName, setCName] = useState("")
  const [cSlug, setCSlug] = useState("")
  const [cPrimary, setCPrimary] = useState("#111111")
  const [cSecondary, setCSecondary] = useState("#FFFFFF")
  const [cLogo, setCLogo] = useState("")
  const [cFavicon, setCFavicon] = useState("")
  const [cAdminEmail, setCAdminEmail] = useState("")
  const [cAdminPw, setCAdminPw] = useState(generatePassword())
  const [creating, setCreating] = useState(false)
  const [cUploading, setCUploading] = useState(false)
  const [cFaviconUploading, setCFaviconUploading] = useState(false)
  const cLogoRef = useRef<HTMLInputElement>(null)
  const cFaviconRef = useRef<HTMLInputElement>(null)

  // Edit form
  const [eName, setEName] = useState("")
  const [eSlug, setESlug] = useState("")
  const [ePrimary, setEPrimary] = useState("")
  const [eSecondary, setESecondary] = useState("")
  const [eLogo, setELogo] = useState("")
  const [eFavicon, setEFavicon] = useState("")
  const [eActive, setEActive] = useState(true)
  const [editSaving, setEditSaving] = useState(false)
  const [eUploading, setEUploading] = useState(false)
  const [eFaviconUploading, setEFaviconUploading] = useState(false)
  const eLogoRef = useRef<HTMLInputElement>(null)
  const eFaviconRef = useRef<HTMLInputElement>(null)

  // License form
  const [licenseValues, setLicenseValues] = useState<Record<string, number>>({})
  const [licSaving, setLicSaving] = useState(false)

  const flash = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 3000)
  }

  // Logo upload helper
  const uploadLogo = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/upload/file", { method: "POST", body: formData })
      if (!res.ok) return null
      const data = await res.json()
      return `/api/files/${data.filename}`
    } catch {
      return null
    }
  }

  // Impersonate partner admin
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
        flash("Erreur : " + (data.error || "Échec de l'impersonation"))
      }
    } catch {
      flash("Erreur réseau")
    }
  }

  // Create partner
  const handleCreate = async () => {
    if (!cName.trim() || !cSlug.trim() || !cAdminEmail.trim()) {
      flash("Erreur : Tous les champs obligatoires doivent être remplis"); return
    }
    if (!isValidHex(cPrimary) || !isValidHex(cSecondary)) {
      flash("Erreur : Couleurs invalides (format #RRGGBB)"); return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cName, slug: cSlug, primaryColor: cPrimary, secondaryColor: cSecondary,
          logoUrl: cLogo || null, faviconUrl: cFavicon || null, adminEmail: cAdminEmail, adminPassword: cAdminPw,
        }),
      })
      if (!res.ok) { flash("Erreur : " + ((await res.json()).error || "Échec")); return }
      flash("Partenaire créé avec succès")
      setCreateOpen(false)
      setCName(""); setCSlug(""); setCPrimary("#111111"); setCSecondary("#FFFFFF")
      setCLogo(""); setCFavicon(""); setCAdminEmail(""); setCAdminPw(generatePassword())
      router.refresh()
    } catch { flash("Erreur réseau") }
    finally { setCreating(false) }
  }

  // Create logo upload
  const handleCreateLogoUpload = async (file: File) => {
    setCUploading(true)
    const url = await uploadLogo(file)
    if (url) setCLogo(url)
    else flash("Erreur : Upload du logo échoué")
    setCUploading(false)
  }

  // Create favicon upload
  const handleCreateFaviconUpload = async (file: File) => {
    setCFaviconUploading(true)
    const url = await uploadLogo(file)
    if (url) {
      setCFavicon(url)
    } else flash("Erreur : Upload du favicon échoué")
    setCFaviconUploading(false)
  }

  // Open edit
  const openEdit = (p: Partner) => {
    setEditPartner(p)
    setEName(p.name); setESlug(p.slug); setEPrimary(p.primaryColor)
    setESecondary(p.secondaryColor); setELogo(p.logoUrl || ""); setEFavicon(p.faviconUrl || ""); setEActive(p.isActive)
  }

  // Save edit
  const handleEdit = async () => {
    if (!editPartner) return
    if (!isValidHex(ePrimary) || !isValidHex(eSecondary)) {
      flash("Erreur : Couleurs invalides (format #RRGGBB)"); return
    }
    setEditSaving(true)
    try {
      const res = await fetch(`/api/partners/${editPartner.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eName, slug: eSlug, primaryColor: ePrimary,
          secondaryColor: eSecondary, logoUrl: eLogo || null, faviconUrl: eFavicon || null, isActive: eActive,
        }),
      })
      if (!res.ok) { flash("Erreur : " + ((await res.json()).error || "Échec")); return }
      flash("Partenaire mis à jour")
      setEditPartner(null)
      router.refresh()
    } catch { flash("Erreur réseau") }
    finally { setEditSaving(false) }
  }

  // Edit logo upload
  const handleEditLogoUpload = async (file: File) => {
    setEUploading(true)
    const url = await uploadLogo(file)
    if (url) setELogo(url)
    else flash("Erreur : Upload du logo échoué")
    setEUploading(false)
  }

  // Edit favicon upload
  const handleEditFaviconUpload = async (file: File) => {
    setEFaviconUploading(true)
    const url = await uploadLogo(file)
    if (url) {
      setEFavicon(url)
    } else flash("Erreur : Upload du favicon échoué")
    setEFaviconUploading(false)
  }

  // Open licenses
  const openLicenses = (p: Partner) => {
    setLicensePartner(p)
    const vals: Record<string, number> = {}
    for (const f of formations) {
      const existing = p.licenses.find((l) => l.formationId === f.id)
      vals[f.id] = existing?.totalSeats || 0
    }
    setLicenseValues(vals)
  }

  // Save licenses
  const handleLicenses = async () => {
    if (!licensePartner) return
    setLicSaving(true)
    try {
      const licenses = Object.entries(licenseValues).map(([formationId, totalSeats]) => ({
        formationId, totalSeats,
      }))
      const res = await fetch(`/api/partners/${licensePartner.id}/licenses`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenses }),
      })
      if (res.ok) {
        flash("Licences mises à jour")
        setLicensePartner(null)
        router.refresh()
      } else { flash("Erreur : " + ((await res.json()).error || "Échec")) }
    } catch { flash("Erreur réseau") }
    finally { setLicSaving(false) }
  }

  return (
    <>
      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 mb-4 ${message.includes("Erreur") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {message}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
          style={{ minHeight: 44 }}
        >
          + Nouveau partenaire
        </button>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {partners.map((p) => {
          const totalSeats = p.licenses.reduce((s, l) => s + l.totalSeats, 0)
          const usedSeats = p.licenses.reduce((s, l) => s + l.usedSeats, 0)
          const pct = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0
          const admin = p.users.find((u) => u.role === "PARTNER_ADMIN")
          const learnerCount = p.users.filter((u) => u.role === "LEARNER").length
          return (
            <div key={p.id} className="bg-white rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {p.logoUrl ? (
                    <img src={p.logoUrl} alt="" className="h-5 max-w-[60px] object-contain" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-border shrink-0" style={{ backgroundColor: p.primaryColor }} />
                  )}
                  <span className="text-sm font-medium truncate">{p.name}</span>
                </div>
                <Badge variant={p.isActive ? "success" : "error"}>{p.isActive ? "Actif" : "Inactif"}</Badge>
              </div>
              <div className="text-xs text-gray-400 space-y-0.5">
                <p>{admin?.email || "Pas d'admin"}</p>
                <p>{learnerCount} apprenant{learnerCount > 1 ? "s" : ""} · {usedSeats}/{totalSeats} licences</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-gray-500">{pct}%</span>
              </div>
              <div className="flex gap-2 pt-1">
                {admin && (
                  <button onClick={() => handleImpersonate(admin.id)} className="flex-1 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" style={{ minHeight: 44 }}>👁 Espace admin</button>
                )}
                <button onClick={() => openEdit(p)} className="flex-1 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" style={{ minHeight: 44 }}>✏️ Modifier</button>
                <button onClick={() => openLicenses(p)} className="flex-1 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" style={{ minHeight: 44 }}>⚙️ Licences</button>
              </div>
            </div>
          )
        })}
        {partners.length === 0 && (
          <div className="bg-white rounded-xl border border-border px-4 py-8 text-center text-sm text-gray-400">Aucun partenaire</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Nom</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Admin</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Apprenants</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Licences</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Statut</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => {
              const totalSeats = p.licenses.reduce((s, l) => s + l.totalSeats, 0)
              const usedSeats = p.licenses.reduce((s, l) => s + l.usedSeats, 0)
              const pct = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0
              const admin = p.users.find((u) => u.role === "PARTNER_ADMIN")
              const learnerCount = p.users.filter((u) => u.role === "LEARNER").length

              return (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.logoUrl ? (
                        <img src={p.logoUrl} alt="" className="h-5 max-w-[60px] object-contain" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: p.primaryColor }} />
                      )}
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-gray-400">/{p.slug}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {admin?.email || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{learnerCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{usedSeats}/{totalSeats}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.isActive ? "success" : "error"}>
                      {p.isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      {admin && (
                        <button onClick={() => handleImpersonate(admin.id)} className="text-sm text-gray-400 hover:text-orange-500" title="Accéder à l'espace admin">{"👁"}</button>
                      )}
                      <button onClick={() => openEdit(p)} className="text-sm text-gray-400 hover:text-primary" title="Modifier">✏️</button>
                      <button onClick={() => openLicenses(p)} className="text-sm text-gray-400 hover:text-primary" title="Licences">⚙️</button>
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

      {/* ===== CREATE MODAL ===== */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau partenaire">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nom de l&apos;organisme</label>
            <input
              value={cName}
              onChange={(e) => { setCName(e.target.value); setCSlug(slugify(e.target.value)) }}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              value={cSlug}
              onChange={(e) => setCSlug(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">URL : /login?partner={cSlug || "..."}</p>
          </div>

          {/* Logo upload */}
          <div>
            <label className="block text-sm font-medium mb-1">Logo</label>
            {cLogo && (
              <div className="mb-2 relative inline-block">
                <img src={cLogo} alt="Logo" className="h-10 max-w-[160px] object-contain border border-border rounded p-1" />
                <button onClick={() => setCLogo("")} className="absolute -top-1 -right-1 bg-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] text-red-500 shadow border border-border">✕</button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => cLogoRef.current?.click()}
                disabled={cUploading}
                className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                {cUploading ? "Upload..." : "Choisir un logo"}
              </button>
              <input
                ref={cLogoRef}
                type="file"
                accept=".jpg,.jpeg,.png,.svg,.webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleCreateLogoUpload(file)
                  e.target.value = ""
                }}
              />
              <span className="text-xs text-gray-400">JPG, PNG, SVG, WebP</span>
            </div>
          </div>

          {/* Favicon upload */}
          <div>
            <label className="block text-sm font-medium mb-1">Favicon (optionnel)</label>
            <p className="text-xs text-gray-400 mb-2">Format .ico, .png ou .svg — recommandé 32x32px</p>
            {cFavicon && (
              <div className="mb-2 relative inline-block">
                <img src={cFavicon.startsWith("http") ? cFavicon : `${window.location.origin}${cFavicon}`} alt="Favicon" className="w-8 h-8 object-contain border border-border rounded p-0.5" />
                <button onClick={() => setCFavicon("")} className="absolute -top-1 -right-1 bg-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] text-red-500 shadow border border-border">✕</button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => cFaviconRef.current?.click()}
                disabled={cFaviconUploading}
                className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                {cFaviconUploading ? "Upload..." : "Choisir un favicon"}
              </button>
              <input
                ref={cFaviconRef}
                type="file"
                accept=".ico,.png,.svg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleCreateFaviconUpload(file)
                  e.target.value = ""
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Couleur principale" value={cPrimary} onChange={setCPrimary} />
            <ColorField label="Couleur secondaire" value={cSecondary} onChange={setCSecondary} />
          </div>

          {/* Live preview */}
          <BrandingPreview name={cName || "Nom"} primaryColor={cPrimary} secondaryColor={cSecondary} logoUrl={cLogo} slug={cSlug} />

          <hr className="border-border" />
          <p className="text-xs text-gray-500 font-medium">Compte admin partenaire</p>
          <div>
            <label className="block text-sm font-medium mb-1">Email admin</label>
            <input type="email" value={cAdminEmail} onChange={(e) => setCAdminEmail(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mot de passe temporaire</label>
            <div className="flex gap-2">
              <input value={cAdminPw} onChange={(e) => setCAdminPw(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary font-mono" />
              <button onClick={() => setCAdminPw(generatePassword())} className="px-3 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200">Générer</button>
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating} className="w-full py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
            {creating ? "Création..." : "Créer le partenaire"}
          </button>
        </div>
      </Modal>

      {/* ===== EDIT MODAL ===== */}
      <Modal open={!!editPartner} onClose={() => setEditPartner(null)} title="Modifier le partenaire">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nom</label>
            <input value={eName} onChange={(e) => setEName(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input value={eSlug} onChange={(e) => setESlug(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary font-mono" />
          </div>

          {/* Logo upload */}
          <div>
            <label className="block text-sm font-medium mb-1">Logo</label>
            {eLogo && (
              <div className="mb-2 relative inline-block">
                <img src={eLogo} alt="Logo" className="h-10 max-w-[160px] object-contain border border-border rounded p-1" />
                <button onClick={() => setELogo("")} className="absolute -top-1 -right-1 bg-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] text-red-500 shadow border border-border">✕</button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => eLogoRef.current?.click()}
                disabled={eUploading}
                className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                {eUploading ? "Upload..." : "Choisir un logo"}
              </button>
              <input
                ref={eLogoRef}
                type="file"
                accept=".jpg,.jpeg,.png,.svg,.webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleEditLogoUpload(file)
                  e.target.value = ""
                }}
              />
              <span className="text-xs text-gray-400">JPG, PNG, SVG, WebP</span>
            </div>
          </div>

          {/* Favicon upload */}
          <div>
            <label className="block text-sm font-medium mb-1">Favicon (optionnel)</label>
            <p className="text-xs text-gray-400 mb-2">Format .ico, .png ou .svg — recommandé 32x32px</p>
            {eFavicon && (
              <div className="mb-2 relative inline-block">
                <img src={eFavicon.startsWith("http") ? eFavicon : `${window.location.origin}${eFavicon}`} alt="Favicon" className="w-8 h-8 object-contain border border-border rounded p-0.5" />
                <button onClick={() => setEFavicon("")} className="absolute -top-1 -right-1 bg-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] text-red-500 shadow border border-border">✕</button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => eFaviconRef.current?.click()}
                disabled={eFaviconUploading}
                className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                {eFaviconUploading ? "Upload..." : "Choisir un favicon"}
              </button>
              <input
                ref={eFaviconRef}
                type="file"
                accept=".ico,.png,.svg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleEditFaviconUpload(file)
                  e.target.value = ""
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Couleur principale" value={ePrimary} onChange={setEPrimary} />
            <ColorField label="Couleur secondaire" value={eSecondary} onChange={setESecondary} />
          </div>

          {/* Live preview */}
          <BrandingPreview name={eName || "Nom"} primaryColor={ePrimary} secondaryColor={eSecondary} logoUrl={eLogo} slug={eSlug} />

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Statut</span>
            <button
              onClick={() => setEActive(!eActive)}
              className={`relative w-10 h-5 rounded-full transition-colors ${eActive ? "bg-green-500" : "bg-gray-200"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${eActive ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
            <Badge variant={eActive ? "success" : "error"}>
              {eActive ? "Actif" : "Inactif"}
            </Badge>
            {!eActive && <span className="text-xs text-red-400">Les utilisateurs perdront l&apos;accès</span>}
          </div>
          <button onClick={handleEdit} disabled={editSaving} className="w-full py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
            {editSaving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </Modal>

      {/* ===== LICENSES MODAL ===== */}
      <Modal open={!!licensePartner} onClose={() => setLicensePartner(null)} title={`Licences — ${licensePartner?.name || ""}`}>
        <div className="space-y-4">
          {formations.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune formation disponible</p>
          ) : (
            <div className="space-y-3">
              {formations.map((f) => {
                const existing = licensePartner?.licenses.find((l) => l.formationId === f.id)
                return (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{f.title}</p>
                      {existing && existing.usedSeats > 0 && (
                        <p className="text-xs text-gray-400">{existing.usedSeats} utilisée(s)</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Places :</label>
                      <input
                        type="number"
                        min={existing?.usedSeats || 0}
                        value={licenseValues[f.id] || 0}
                        onChange={(e) => setLicenseValues((prev) => ({ ...prev, [f.id]: parseInt(e.target.value) || 0 }))}
                        className="w-20 px-2 py-1.5 text-sm border border-border rounded-lg outline-none focus:border-primary text-center"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button onClick={handleLicenses} disabled={licSaving} className="w-full py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
            {licSaving ? "Mise à jour..." : "Mettre à jour les licences"}
          </button>
        </div>
      </Modal>
    </>
  )
}

/* ═══════════ BRANDING PREVIEW ═══════════ */

function BrandingPreview({ name, primaryColor, secondaryColor, logoUrl, slug }: {
  name: string; primaryColor: string; secondaryColor: string; logoUrl: string; slug: string
}) {
  const safeColor = isValidHex(primaryColor) ? primaryColor : "#111111"
  const safeBg = isValidHex(secondaryColor) ? secondaryColor : "#FFFFFF"

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <p className="text-[10px] text-gray-400 px-2 py-1 bg-gray-50 border-b border-border">Aperçu live</p>
      {/* TopNav preview */}
      <div className="h-10 bg-white border-b flex items-center px-3 gap-2" style={{ borderBottomColor: `${safeColor}20` }}>
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-5 max-w-[60px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
        ) : null}
        <span className="font-semibold text-xs" style={{ color: safeColor }}>{name}</span>
        <div className="ml-auto flex gap-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${safeColor}10`, color: safeColor }}>Accueil</span>
          <span className="text-[9px] text-gray-400 px-1.5 py-0.5">Formation</span>
        </div>
      </div>
      {/* Login preview */}
      <div className="p-6 flex justify-center" style={{ backgroundColor: safeBg }}>
        <div className="w-full max-w-[200px] bg-white rounded-lg p-4 border border-border shadow-sm" style={{ backgroundColor: `${safeColor}03` }}>
          {logoUrl && (
            <div className="flex justify-center mb-2">
              <img src={logoUrl} alt="" className="h-6 max-w-[100px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
            </div>
          )}
          <div className="space-y-1.5">
            <div className="h-5 bg-gray-50 rounded border border-gray-100" />
            <div className="h-5 bg-gray-50 rounded border border-gray-100" />
            <div className="h-6 rounded text-white text-[9px] flex items-center justify-center font-medium" style={{ backgroundColor: safeColor }}>
              Se connecter
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={isValidHex(value) ? value : "#111111"} onChange={(e) => onChange(e.target.value)} className="w-10 h-10 rounded border border-border cursor-pointer" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none font-mono" />
      </div>
      {value && !isValidHex(value) && (
        <p className="text-xs text-red-400 mt-1">Format invalide (ex: #FF0000)</p>
      )}
    </div>
  )
}
