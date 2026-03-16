"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#F5F5F7" }}>
      <div style={{ width: "100%", maxWidth: 380, backgroundColor: "#fff", borderRadius: 16, padding: 32, border: "0.5px solid #E5E5E5" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111" }}>Switching Formation</h1>
          <p style={{ fontSize: 14, marginTop: 8, color: "#888" }}>Connectez-vous à votre espace</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ fontSize: 14, color: "#dc2626", backgroundColor: "#fef2f2", borderRadius: 8, padding: "10px 16px", marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="email" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#111" }}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="votre@email.com"
              style={{ width: "100%", padding: "10px 16px", borderRadius: 8, fontSize: 14, border: "1px solid #E5E5E5", backgroundColor: "#FAFAFA", outline: "none" }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="password" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#111" }}>Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: "100%", padding: "10px 16px", borderRadius: 8, fontSize: 14, border: "1px solid #E5E5E5", backgroundColor: "#FAFAFA", outline: "none" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "10px 0", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "#fff", backgroundColor: "#111", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  )
}
