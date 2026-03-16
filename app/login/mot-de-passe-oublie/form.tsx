"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

interface PartnerInfo {
  name: string
  primaryColor: string
  logoUrl: string | null
}

export default function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const partnerSlug = searchParams.get("partner")

  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [partner, setPartner] = useState<PartnerInfo | null>(null)

  useEffect(() => {
    if (partnerSlug) {
      fetch(`/api/partner?slug=${partnerSlug}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setPartner(data) })
    }
  }, [partnerSlug])

  const brandName = partner ? partner.name : "Switching Formation"
  const brandColor = partner ? partner.primaryColor : "#111111"
  const partnerParam = partnerSlug ? `?partner=${partnerSlug}` : ""

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="w-full max-w-[380px] bg-white rounded-2xl p-8 border border-border">
        <div className="text-center mb-8">
          {partner?.logoUrl && (
            <img src={partner.logoUrl} alt={brandName} className="h-10 mx-auto mb-3" />
          )}
          <h1 className="text-xl font-semibold" style={{ color: brandColor }}>
            Mot de passe oublié
          </h1>
          <p className="text-sm mt-2 text-gray-400">
            Entrez votre email pour recevoir un lien de réinitialisation
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">
              Si cet email existe dans notre système, vous recevrez un lien de réinitialisation.
            </div>
            <Link
              href={`/login${partnerParam}`}
              className="block w-full py-2.5 rounded-lg text-sm font-medium text-white text-center transition-opacity"
              style={{ backgroundColor: brandColor }}
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5 text-primary">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg text-sm border border-border bg-[#FAFAFA] outline-none focus:border-primary transition-colors"
                placeholder="votre@email.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: brandColor }}
            >
              {loading ? "Envoi..." : "Recevoir le lien de réinitialisation"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href={`/login${partnerParam}`} className="text-sm text-gray-400 hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  )
}
