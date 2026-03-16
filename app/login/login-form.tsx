"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams, useRouter } from "next/navigation"

interface PartnerInfo {
  name: string
  primaryColor: string
  logoUrl: string | null
}

export default function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const partnerSlug = searchParams.get("partner")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [partner, setPartner] = useState<PartnerInfo | null>(null)

  useEffect(() => {
    if (partnerSlug) {
      fetch(`/api/partner?slug=${partnerSlug}`)
        .then((res) => {
          if (res.ok) return res.json()
          return null
        })
        .then((data) => {
          if (data) setPartner(data)
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
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F7" }}>
      <div
        className="w-full max-w-[380px] bg-white rounded-2xl p-8"
        style={{ border: "0.5px solid #E5E5E5" }}
      >
        <div className="text-center mb-8">
          <h1
            className="text-xl font-semibold"
            style={{ color: brandColor }}
          >
            {brandName}
          </h1>
          <p className="text-sm mt-2" style={{ color: "#888888" }}>
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
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-1.5"
              style={{ color: "#111111" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{
                border: "1px solid #E5E5E5",
                backgroundColor: "#FAFAFA",
              }}
              onFocus={(e) => (e.target.style.borderColor = brandColor)}
              onBlur={(e) => (e.target.style.borderColor = "#E5E5E5")}
              placeholder="votre@email.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1.5"
              style={{ color: "#111111" }}
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{
                border: "1px solid #E5E5E5",
                backgroundColor: "#FAFAFA",
              }}
              onFocus={(e) => (e.target.style.borderColor = brandColor)}
              onBlur={(e) => (e.target.style.borderColor = "#E5E5E5")}
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
          <a
            href="#"
            className="block text-sm transition-colors hover:underline"
            style={{ color: "#888888" }}
          >
            Mot de passe oublié ?
          </a>
          <a
            href="#"
            className="block text-sm transition-colors hover:underline"
            style={{ color: "#888888" }}
          >
            Première connexion ? Créez votre mot de passe
          </a>
        </div>
      </div>
    </div>
  )
}
