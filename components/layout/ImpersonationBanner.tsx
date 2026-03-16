"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export default function ImpersonationBanner({
  name,
  email,
}: {
  name: string
  email: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleQuit = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/impersonate", { method: "DELETE" })
      const data = await res.json()
      if (data.ok) {
        window.location.href = data.redirectUrl
      }
    } catch {
      setLoading(false)
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
