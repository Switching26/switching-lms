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
  brandLogo,
  userEmail,
}: {
  brand: string
  badge?: string
  items: NavItem[]
  brandColor?: string
  brandLogo?: string | null
  userEmail?: string
}) {
  const pathname = usePathname()
  const color = brandColor || "#111"

  return (
    <nav
      className="bg-white border-b sticky top-0 z-40"
      style={{ borderBottomColor: `${color}20` }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            {brandLogo ? (
              <img
                src={brandLogo}
                alt={brand}
                className="max-h-8 max-w-[160px] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none"
                  const next = (e.target as HTMLImageElement).nextElementSibling as HTMLElement
                  if (next) next.style.display = "inline"
                }}
              />
            ) : null}
            <span
              className="font-semibold text-base"
              style={{
                color,
                display: brandLogo ? "none" : "inline",
              }}
            >
              {brand}
            </span>
          </Link>
          {badge && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${color}10`, color }}
            >
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
                      ? "font-medium"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                  style={active ? { backgroundColor: `${color}10`, color } : undefined}
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
