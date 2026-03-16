"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"

interface PartnerInfo {
  name: string
  primaryColor: string
  secondaryColor: string
  logoUrl: string | null
}

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const partnerSlug = searchParams.get("partner")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [partner, setPartner] = useState<PartnerInfo | null>(null)

  useEffect(() => {
    if (partnerSlug) {
      fetch(`/api/partner/${partnerSlug}/branding`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data) setPartner(data) })
        .catch(() => {
          // Fallback to old API
          fetch(`/api/partner?slug=${partnerSlug}`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d) setPartner(d) })
        })
    }
  }, [partnerSlug])

  const brandName = partner ? partner.name : "Switching Formation"
  const brandColor = partner ? partner.primaryColor : "#111111"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      // Check account status before attempting sign in
      const check = await fetch("/api/auth/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (check.ok) {
        const status = await check.json()
        if (status.disabled) {
          setError("Votre compte a été désactivé. Contactez votre administrateur.")
          setLoading(false)
          return
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError("Email ou mot de passe incorrect")
      } else {
        router.push("/")
        router.refresh()
      }
    } catch {
      setError("Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      {partner?.logoUrl && (
        <>
          <link rel="icon" href={partner.logoUrl} />
          <link rel="apple-touch-icon" href={partner.logoUrl} />
        </>
      )}
      <div
        className="w-full max-w-[380px] bg-white rounded-2xl p-8 border border-border"
        style={partner ? { backgroundColor: `${brandColor}03` } : undefined}
      >
        <div className="text-center mb-8">
          {partner?.logoUrl ? (
            <img
              src={partner.logoUrl}
              alt={brandName}
              className="max-h-[60px] max-w-[200px] mx-auto mb-4 object-contain"
            />
          ) : (
            <h1 className="text-xl font-semibold" style={{ color: brandColor }}>
              {brandName}
            </h1>
          )}
          <p className="text-sm mt-2 text-gray-400">
            Connectez-vous à votre espace
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

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

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5 text-primary">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg text-sm border border-border bg-[#FAFAFA] outline-none focus:border-primary transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: brandColor }}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center">
          <Link href={`/login/mot-de-passe-oublie${partnerSlug ? `?partner=${partnerSlug}` : ""}`} className="block text-sm text-gray-400 hover:underline">
            Mot de passe oublié ?
          </Link>
          <Link href={`/login/activer${partnerSlug ? `?partner=${partnerSlug}` : ""}`} className="block text-sm text-gray-400 hover:underline">
            Première connexion ? Créez votre mot de passe
          </Link>
        </div>
      </div>
    </div>
  )
}
