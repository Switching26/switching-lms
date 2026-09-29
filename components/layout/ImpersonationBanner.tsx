"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function ImpersonationBanner({
  name,
  email,
}: {
  name: string
  email: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // La hauteur du bandeau doit être connue de TOUTE la page, pas seulement du
  // shell qui la déclare : le lecteur de formation et l'atelier sont rendus dans
  // un portail sous <body>, hors du shell. Sans ça, pendant « Voir l'espace », ils
  // remontaient de 40 px et leur barre (Leçons, Notes, Ressources) passait cachée
  // sous le menu du haut (constaté sur téléphone le 29/09/2026).
  useEffect(() => {
    const racine = document.documentElement
    racine.style.setProperty("--app-impersonation-offset", "40px")
    return () => { racine.style.removeProperty("--app-impersonation-offset") }
  }, [])

  const handleQuit = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/impersonate", { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      // Jamais de bouton bloqué sur « … » : si la visualisation est déjà terminée
      // (autre onglet), on recharge l'accueil, qui renvoie vers le bon espace.
      window.location.href = data.ok && data.redirectUrl ? data.redirectUrl : "/"
    } catch {
      // Réseau : la sortie par navigation fait le même travail côté serveur.
      window.location.href = "/api/impersonate"
    }
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6"
      style={{ backgroundColor: "#F97316", height: "40px" }}
    >
      <span className="text-white text-sm font-medium truncate">
        {"👁"} Vous visualisez l&apos;espace de {name} ({email})
      </span>
      <button
        onClick={handleQuit}
        disabled={loading}
        className="ml-4 shrink-0 px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? "..." : "Quitter"}
      </button>
    </div>
  )
}
