"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

interface NavItem {
  label: string
  href: string
}

export default function TopNav({
  brand,
  badge,
  items,
  brandColor,
  userEmail,
}: {
  brand: string
  badge?: string
  items: NavItem[]
  brandColor?: string
  userEmail?: string
}) {
  const pathname = usePathname()

  return (
    <nav className="bg-white border-b border-border sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-base" style={{ color: brandColor || "#111" }}>
            {brand}
          </span>
          {badge && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {badge}
            </span>
          )}
          <div className="hidden sm:flex items-center gap-1 ml-2">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-gray-100 text-primary font-medium"
                      : "text-gray-500 hover:text-primary hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-xs text-gray-400 hidden md:block">{userEmail}</span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-500 hover:text-primary transition-colors"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </nav>
  )
}
