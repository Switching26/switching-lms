"use client"

import { useState } from "react"

interface Partner {
  id: string
  name: string
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
      if (res.ok) setMessage("Apparence mise à jour")
      else setMessage("Erreur lors de la mise à jour")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border p-6 space-y-4">
        {message && (
          <div className="text-sm bg-gray-100 rounded-lg px-4 py-3">{message}</div>
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
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none"
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
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none"
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

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          Enregistrer
        </button>
      </form>

      {/* Aperçu live */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h3 className="text-sm font-semibold mb-4">Aperçu</h3>
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Fake nav */}
          <div className="h-12 bg-white border-b border-border flex items-center px-4 gap-3">
            {logoUrl && <img src={logoUrl} alt="" className="h-6" />}
            <span className="font-semibold text-sm" style={{ color: primaryColor }}>{name}</span>
          </div>
          {/* Fake login */}
          <div className="p-8 flex justify-center" style={{ backgroundColor: secondaryColor }}>
            <div className="w-full max-w-[240px] bg-white rounded-xl p-6 border border-border">
              <p className="text-center text-sm font-semibold mb-3" style={{ color: primaryColor }}>{name}</p>
              <div className="space-y-2">
                <div className="h-8 bg-gray-100 rounded-lg" />
                <div className="h-8 bg-gray-100 rounded-lg" />
                <div className="h-8 rounded-lg text-white text-xs flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                  Se connecter
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
