"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { useState, useEffect, useRef } from "react"

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
  const [unreadCount, setUnreadCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Poll unread messages count
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/messages/unread-count")
        const data = await res.json()
        setUnreadCount(data.count || 0)
      } catch {}
    }
    fetchCount()
    const interval = setInterval(fetchCount, 3000)
    return () => clearInterval(interval)
  }, [])

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [menuOpen])

  // Lock body scroll when menu is open
  useEffect(() => {
    if (menuOpen) document.body.style.overflow = "hidden"
    else document.body.style.overflow = ""
    return () => { document.body.style.overflow = "" }
  }, [menuOpen])

  const dashboardHref = pathname.startsWith("/partner-admin")
    ? "/partner-admin/dashboard"
    : pathname.startsWith("/learner")
      ? "/learner/accueil"
      : "/"

  return (
    <>
      <nav
        className="bg-white border-b sticky top-0 z-40"
        style={{ borderBottomColor: `${color}20` }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-4 lg:gap-6">
            <Link href={dashboardHref} className="flex items-center gap-2">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {brandLogo ? (
                  <img
                    src={brandLogo}
                    alt={brand || ''}
                    style={{ height: '32px', width: 'auto', objectFit: 'contain', maxWidth: '150px' }}
                  />
                ) : (
                  <span style={{ fontWeight: 500, fontSize: '15px', color }}>
                    {brand}
                  </span>
                )}
              </div>
            </Link>
            {badge && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium hidden sm:inline-block"
                style={{ backgroundColor: `${color}10`, color }}
              >
                {badge}
              </span>
            )}
            {/* Desktop nav links */}
            <div className="hidden lg:flex items-center gap-1 ml-2">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                const isMessages = item.label === "Messages"
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors relative ${
                      active
                        ? "font-medium"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                    style={active ? { backgroundColor: `${color}10`, color } : undefined}
                  >
                    {item.label}
                    {isMessages && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {userEmail && (
              <span className="text-xs text-gray-400 hidden md:block">{userEmail}</span>
            )}
            {/* Desktop logout */}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="hidden lg:block text-sm text-gray-500 hover:text-primary transition-colors"
            >
              Déconnexion
            </button>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-50 transition-colors"
              aria-label="Menu"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile overlay + slide menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
          {/* Panel */}
          <div
            ref={menuRef}
            className="fixed right-0 top-0 bottom-0 w-full max-w-xs bg-white shadow-xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
              <span className="text-sm font-medium" style={{ color }}>
                {brand}
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-50"
                aria-label="Fermer"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Nav links */}
            <div className="flex-1 overflow-y-auto py-2">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                const isMessages = item.label === "Messages"
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 text-sm transition-colors ${
                      active
                        ? "font-medium bg-gray-50"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                    style={active ? { color } : undefined}
                  >
                    <span>{item.label}</span>
                    {isMessages && unreadCount > 0 && (
                      <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1.5">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
            {/* Footer */}
            <div className="border-t border-gray-100 p-4 space-y-3">
              {userEmail && (
                <p className="text-xs text-gray-400 truncate">{userEmail}</p>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full py-2.5 text-sm text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
