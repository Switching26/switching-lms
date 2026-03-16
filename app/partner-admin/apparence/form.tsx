"use client"

import { useState } from "react"

interface Partner {
  id: string
  name: string
  slug: string
  primaryColor: string
  secondaryColor: string
  logoUrl: string | null
}

export default function AppearanceForm({ partner }: { partner: Partner }) {
  const [name, setName] = useState(partner.name)
  const [primaryColor, setPrimaryColor] = useState(partner.primaryColor)
  const [secondaryColor, setSecondaryColor] = useState(partner.secondaryColor)
  const [logoUrl, setLogoUrl] = useState(partner.logoUrl || "")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage("")
    try {
      const res = await fetch("/api/partner/appearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, primaryColor, secondaryColor, logoUrl: logoUrl || null }),
      })
      if (res.ok) setMessage("Apparence mise à jour avec succès")
      else setMessage("Erreur lors de la mise à jour")
    } finally {
      setLoading(false)
    }
  }

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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Couleur principale</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded border border-border cursor-pointer"
              />
              <input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Couleur secondaire</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-10 rounded border border-border cursor-pointer"
              />
              <input
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none font-mono"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">URL du logo</label>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
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
          <div className="h-12 bg-white border-b border-border flex items-center px-4 gap-3">
            {logoUrl && (
              <img src={logoUrl} alt="" className="h-6 max-w-[80px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
            )}
            <span className="font-semibold text-sm" style={{ color: primaryColor }}>{name}</span>
          </div>
          {/* Fake login page */}
          <div className="p-10 flex justify-center" style={{ backgroundColor: secondaryColor }}>
            <div className="w-full max-w-[260px] bg-white rounded-xl p-6 border border-border shadow-sm">
              {logoUrl && (
                <div className="flex justify-center mb-3">
                  <img src={logoUrl} alt="" className="h-8 max-w-[120px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                </div>
              )}
              <p className="text-center text-sm font-semibold mb-4" style={{ color: primaryColor }}>{name}</p>
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
                  style={{ backgroundColor: primaryColor }}
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
