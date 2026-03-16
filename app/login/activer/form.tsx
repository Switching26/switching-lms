"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

interface PartnerInfo {
  name: string
  primaryColor: string
  logoUrl: string | null
}

export default function ActivateForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const partnerSlug = searchParams.get("partner")

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

  // If no token → show "resend activation" form
  if (!token) {
    return <ResendForm brandName={brandName} brandColor={brandColor} partnerParam={partnerParam} partner={partner} />
  }

  // If token → show activation form
  return <ActivationForm token={token} brandName={brandName} brandColor={brandColor} partnerParam={partnerParam} partner={partner} />
}

function ResendForm({ brandName, brandColor, partnerParam, partner }: {
  brandName: string; brandColor: string; partnerParam: string; partner: PartnerInfo | null
}) {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch("/api/auth/resend-activation", {
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
            Première connexion
          </h1>
          <p className="text-sm mt-2 text-gray-400">
            Entrez votre email pour recevoir votre lien d'activation
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">
              Si cet email existe, vous recevrez un lien d'activation.
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
              {loading ? "Envoi..." : "Recevoir le lien d'activation"}
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

function ActivationForm({ token, brandName, brandColor, partnerParam, partner }: {
  token: string; brandName: string; brandColor: string; partnerParam: string; partner: PartnerInfo | null
}) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState("")
  const [success, setSuccess] = useState(false)
  const [firstName, setFirstName] = useState("")

  useEffect(() => {
    fetch(`/api/auth/verify-token?token=${token}&type=ACTIVATION`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setTokenValid(true)
          setFirstName(data.firstName || "")
        } else {
          setTokenError(data.error || "Token invalide")
        }
      })
      .catch(() => setTokenError("Erreur de vérification"))
      .finally(() => setVerifying(false))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères")
      return
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(true)
      } else {
        setError(data.error || "Erreur lors de l'activation")
      }
    } catch {
      setError("Erreur réseau")
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
            {verifying ? "Vérification..." : success ? "Compte activé" : tokenValid ? "Créez votre mot de passe" : "Lien invalide"}
          </h1>
        </div>

        {verifying && (
          <p className="text-sm text-gray-400 text-center">Vérification du lien...</p>
        )}

        {!verifying && !tokenValid && (
          <div className="space-y-4">
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
              {tokenError}
            </div>
            <Link
              href={`/login/activer${partnerParam}`}
              className="block w-full py-2.5 rounded-lg text-sm font-medium text-center bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Demander un nouveau lien d'activation
            </Link>
            <Link href={`/login${partnerParam}`} className="block text-sm text-gray-400 hover:underline text-center">
              Retour à la connexion
            </Link>
          </div>
        )}

        {!verifying && tokenValid && !success && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {firstName && (
              <p className="text-sm text-gray-500 text-center mb-2">
                Bienvenue <strong>{firstName}</strong> ! Créez votre mot de passe pour activer votre compte.
              </p>
            )}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1.5 text-primary">Nouveau mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 rounded-lg text-sm border border-border bg-[#FAFAFA] outline-none focus:border-primary transition-colors"
                placeholder="6 caractères minimum"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-primary">Confirmer le mot de passe</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {loading ? "Activation..." : "Activer mon compte"}
            </button>
          </form>
        )}

        {success && (
          <div className="space-y-4">
            <div className="text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">
              Votre compte est activé ! Vous pouvez maintenant vous connecter.
            </div>
            <Link
              href={`/login${partnerParam}`}
              className="block w-full py-2.5 rounded-lg text-sm font-medium text-white text-center transition-opacity"
              style={{ backgroundColor: brandColor }}
            >
              Se connecter
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
