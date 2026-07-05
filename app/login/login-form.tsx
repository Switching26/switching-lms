"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface PartnerInfo {
  name: string
  primaryColor: string
  secondaryColor: string
  logoUrl: string | null
}

export default function LoginForm({
  partner,
  partnerSlug,
}: {
  // Résolu côté serveur (server component parent) → pas de flash white-label.
  partner: PartnerInfo | null
  partnerSlug: string | null
}) {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

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

  const accentColor = partner ? brandColor : "#4F46E5"

  return (
    <div className="min-h-screen flex items-stretch bg-surface-subtle">
      {/* Côté gauche — visuel marque */}
      <div
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 60%, ${accentColor}99 100%)`,
        }}
      >
        <div className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.3) 0%, transparent 40%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 40%)",
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div>
            {partner?.logoUrl ? (
              <img src={partner.logoUrl} alt={brandName} className="max-h-[48px] max-w-[180px] object-contain brightness-0 invert" />
            ) : (
              <div className="font-display text-2xl font-semibold">{brandName}</div>
            )}
          </div>
          <div>
            <h2 className="font-display text-4xl xl:text-5xl font-semibold leading-tight mb-4">
              Apprenez à votre rythme.
            </h2>
            <p className="text-white/80 text-lg max-w-md">
              Accédez à vos formations vidéo, exercices et documents en un seul endroit, partout, sur tous vos appareils.
            </p>
          </div>
          <p className="text-white/50 text-sm">© {new Date().getFullYear()} {brandName}</p>
        </div>
      </div>

      {/* Côté droit — formulaire */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-10 lg:hidden">
            {partner?.logoUrl ? (
              <img src={partner.logoUrl} alt={brandName} className="max-h-[56px] max-w-[200px] mx-auto mb-3 object-contain" />
            ) : (
              <h1 className="font-display text-2xl font-semibold" style={{ color: accentColor }}>{brandName}</h1>
            )}
          </div>

          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold text-ink mb-2">Bon retour 👋</h1>
            <p className="text-ink-50">Connectez-vous à votre espace de formation.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5 text-ink-70">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-field"
                placeholder="votre@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-ink-70">Mot de passe</label>
                <Link
                  href={`/login/mot-de-passe-oublie${partnerSlug ? `?partner=${partnerSlug}` : ""}`}
                  className="inline-flex min-h-[44px] items-center text-xs font-medium hover:opacity-80 transition-opacity"
                  style={{ color: accentColor }}
                >
                  Oublié&nbsp;?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-field"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 hover:shadow-lg"
              style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`, boxShadow: `0 4px 16px ${accentColor}33` }}
            >
              {loading ? "Connexion…" : "Se connecter →"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-ink-10 text-center">
            <Link
              href={`/login/activer${partnerSlug ? `?partner=${partnerSlug}` : ""}`}
              className="inline-flex min-h-[44px] items-center justify-center text-sm text-ink-50 hover:opacity-80 transition-opacity"
            >
              Première connexion&nbsp;?{" "}
              <span className="font-medium ml-1" style={{ color: accentColor }}>Créez votre mot de passe</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
