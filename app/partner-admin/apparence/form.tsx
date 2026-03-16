"use client"

import { useState, useRef } from "react"

interface Partner {
  id: string
  name: string
  slug: string
  primaryColor: string
  secondaryColor: string
  logoUrl: string | null
  faviconUrl: string | null
}

function isValidHex(v: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(v)
}

export default function AppearanceForm({ partner }: { partner: Partner }) {
  const [name, setName] = useState(partner.name)
  const [primaryColor, setPrimaryColor] = useState(partner.primaryColor)
  const [secondaryColor, setSecondaryColor] = useState(partner.secondaryColor)
  const [logoUrl, setLogoUrl] = useState(partner.logoUrl || "")
  const [faviconUrl, setFaviconUrl] = useState(partner.faviconUrl || "")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [faviconUploading, setFaviconUploading] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  const faviconRef = useRef<HTMLInputElement>(null)

  const handleLogoUpload = async (file: File) => {
    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/upload/file", { method: "POST", body: formData })
      if (!res.ok) { setMessage("Erreur : Upload du logo échoué"); return }
      const data = await res.json()
      setLogoUrl(`/api/files/${data.filename}`)
      setMessage("Logo uploadé")
    } catch {
      setMessage("Erreur réseau")
    } finally {
      setUploading(false)
    }
  }

  const handleFaviconUpload = async (file: File) => {
    setFaviconUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/upload/file", { method: "POST", body: formData })
      if (!res.ok) { setMessage("Erreur : Upload du favicon échoué"); return }
      const data = await res.json()
      setFaviconUrl(`/api/files/${data.filename}`)
      setMessage("Favicon uploadé")
    } catch {
      setMessage("Erreur réseau")
    } finally {
      setFaviconUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidHex(primaryColor) || !isValidHex(secondaryColor)) {
      setMessage("Erreur : Couleurs invalides (format #RRGGBB)")
      return
    }
    setLoading(true)
    setMessage("")
    try {
      const res = await fetch("/api/partner/appearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, primaryColor, secondaryColor, logoUrl: logoUrl || null, faviconUrl: faviconUrl || null }),
      })
      if (res.ok) setMessage("Apparence mise à jour avec succès")
      else setMessage("Erreur lors de la mise à jour")
    } finally {
      setLoading(false)
    }
  }

  const safeColor = isValidHex(primaryColor) ? primaryColor : "#111111"
  const safeBg = isValidHex(secondaryColor) ? secondaryColor : "#FFFFFF"

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border p-6 space-y-4">
        {message && (
          <div className={`text-sm rounded-lg px-4 py-3 ${message.includes("Erreur") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
            {message}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Nom affiché</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
        </div>

        {/* Logo upload */}
        <div>
          <label className="block text-sm font-medium mb-1">Logo</label>
          {logoUrl && (
            <div className="mb-2 relative inline-block">
              <img src={logoUrl} alt="Logo" className="h-12 max-w-[200px] object-contain border border-border rounded p-1" />
              <button
                type="button"
                onClick={() => setLogoUrl("")}
                className="absolute -top-1 -right-1 bg-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] text-red-500 shadow border border-border"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {uploading ? "Upload..." : "Choisir un logo"}
            </button>
            <input
              ref={logoRef}
              type="file"
              accept=".jpg,.jpeg,.png,.svg,.webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleLogoUpload(file)
                e.target.value = ""
              }}
            />
            <span className="text-xs text-gray-400">JPG, PNG, SVG, WebP — max 200x60px recommandé</span>
          </div>
        </div>

        {/* Favicon upload */}
        <div>
          <label className="block text-sm font-medium mb-1">Favicon (optionnel)</label>
          <p className="text-xs text-gray-400 mb-2">Format .ico, .png ou .svg — recommandé 32x32px</p>
          {faviconUrl && (
            <div className="mb-2 relative inline-block">
              <img src={faviconUrl} alt="Favicon" className="w-8 h-8 object-contain border border-border rounded p-0.5" />
              <button
                type="button"
                onClick={() => setFaviconUrl("")}
                className="absolute -top-1 -right-1 bg-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] text-red-500 shadow border border-border"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => faviconRef.current?.click()}
              disabled={faviconUploading}
              className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {faviconUploading ? "Upload..." : "Choisir un favicon"}
            </button>
            <input
              ref={faviconRef}
              type="file"
              accept=".ico,.png,.svg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFaviconUpload(file)
                e.target.value = ""
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Couleur principale</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={safeColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded border border-border cursor-pointer"
              />
              <input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none font-mono"
              />
            </div>
            {primaryColor && !isValidHex(primaryColor) && (
              <p className="text-xs text-red-400 mt-1">Format invalide</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Couleur secondaire</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={safeBg}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-10 rounded border border-border cursor-pointer"
              />
              <input
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none font-mono"
              />
            </div>
            {secondaryColor && !isValidHex(secondaryColor) && (
              <p className="text-xs text-red-400 mt-1">Format invalide</p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : "Enregistrer"}
          </button>
          <a
            href={`/login?partner=${partner.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors inline-flex items-center gap-1.5"
          >
            Voir ma page de connexion
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        </div>
      </form>

      {/* Aperçu live */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h3 className="text-sm font-semibold mb-4">Aperçu en temps réel</h3>
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          {/* Simulated browser chrome */}
          <div className="bg-gray-100 border-b border-border px-3 py-2 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 bg-white rounded px-3 py-0.5 text-[10px] text-gray-400 ml-2">
              /login?partner={partner.slug}
            </div>
          </div>
          {/* Fake nav */}
          <div className="h-12 bg-white border-b flex items-center px-4 gap-3" style={{ borderBottomColor: `${safeColor}20` }}>
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-6 max-w-[80px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
            ) : null}
            <span className="font-semibold text-sm" style={{ color: safeColor }}>{name}</span>
            <div className="ml-auto flex gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: `${safeColor}10`, color: safeColor }}>Accueil</span>
              <span className="text-[10px] text-gray-400 px-2 py-0.5">Formation</span>
            </div>
          </div>
          {/* Fake login page */}
          <div className="p-10 flex justify-center" style={{ backgroundColor: safeBg }}>
            <div className="w-full max-w-[260px] bg-white rounded-xl p-6 border border-border shadow-sm" style={{ backgroundColor: `${safeColor}03` }}>
              {logoUrl && (
                <div className="flex justify-center mb-3">
                  <img src={logoUrl} alt="" className="h-8 max-w-[120px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                </div>
              )}
              <p className="text-center text-sm font-semibold mb-4" style={{ color: safeColor }}>{name}</p>
              <div className="space-y-2.5">
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Email</div>
                  <div className="h-8 bg-gray-50 rounded-lg border border-gray-100" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Mot de passe</div>
                  <div className="h-8 bg-gray-50 rounded-lg border border-gray-100" />
                </div>
                <div
                  className="h-9 rounded-lg text-white text-xs flex items-center justify-center font-medium mt-3"
                  style={{ backgroundColor: safeColor }}
                >
                  Se connecter
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">
          Les changements sont visibles en temps réel ci-dessus
        </p>
      </div>
    </div>
  )
}
