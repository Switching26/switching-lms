"use client"

import { usePathname } from "next/navigation"
import { LogOut } from "lucide-react"

export default function TopNav() {
  return (
    <header
      className="h-14 flex items-center justify-between px-6 bg-white"
      style={{ borderBottom: "1px solid #E5E5E5" }}
    >
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold" style={{ color: "#111111" }}>
          Switching Formation
        </span>
      </div>

      <div className="flex items-center gap-4">
        <a
          href="/api/auth/signout"
          className="p-2 rounded-lg transition-colors hover:bg-gray-100"
          title="Déconnexion"
        >
          <LogOut size={18} color="#888888" />
        </a>
      </div>
    </header>
  )
}
