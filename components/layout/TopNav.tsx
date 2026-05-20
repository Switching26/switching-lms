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
  const color = brandColor || "#1a1a2e"
  const [unreadCount, setUnreadCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => { setMenuOpen(false) }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [menuOpen])

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
      <nav className="glass-card sticky top-0 z-40 border-b" style={{ borderBottomColor: `${color}12` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-5 lg:gap-8">
            <Link href={dashboardHref} className="flex items-center gap-2 group">
              {brandLogo ? (
                <img
                  src={brandLogo}
                  alt={brand || ""}
                  style={{ height: "34px", width: "auto", objectFit: "contain", maxWidth: "160px" }}
                  className="transition-transform group-hover:scale-[1.02]"
                />
              ) : (
                <span className="font-display text-lg font-semibold tracking-tight" style={{ color }}>
                  {brand}
                </span>
              )}
            </Link>
            {badge && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-md font-semibold tracking-wide uppercase hidden md:inline-block whitespace-nowrap"
                style={{ backgroundColor: `${color}10`, color, border: `1px solid ${color}20` }}
              >
                {badge}
              </span>
            )}
            <div className="hidden lg:flex items-center gap-0.5 ml-1">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                const isMessages = item.label === "Messages"
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                      active
                        ? "text-white shadow-sm"
                        : "text-ink-70 hover:text-ink hover:bg-ink-10/40"
                    }`}
                    style={active ? { backgroundColor: color } : undefined}
                  >
                    {item.label}
                    {isMessages && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold px-1 shadow-sm">
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
              <span className="text-[12px] text-ink-50 hidden md:block font-medium">{userEmail}</span>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="hidden lg:flex items-center gap-1.5 text-[13px] text-ink-50 hover:text-warm-700 transition-colors font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Déconnexion
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl hover:bg-ink-10/40 transition-colors"
              aria-label="Menu"
            >
              <svg className="w-5 h-5 text-ink-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <div
            ref={menuRef}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[300px] bg-white shadow-2xl flex flex-col"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="flex items-center justify-between px-5 h-16 border-b border-ink-10">
              <span className="font-display text-base font-semibold" style={{ color }}>
                {brand}
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-ink-10/30"
                aria-label="Fermer"
              >
                <svg className="w-5 h-5 text-ink-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3 px-3">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                const isMessages = item.label === "Messages"
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-3 rounded-xl text-sm transition-all mb-0.5 ${
                      active
                        ? "font-semibold text-white"
                        : "text-ink-70 hover:bg-ink-10/30"
                    }`}
                    style={active ? { backgroundColor: color } : undefined}
                  >
                    <span>{item.label}</span>
                    {isMessages && unreadCount > 0 && (
                      <span className="min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold px-1.5">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
            <div className="border-t border-ink-10 p-5 space-y-3">
              {userEmail && (
                <p className="text-xs text-ink-50 truncate font-medium">{userEmail}</p>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full py-2.5 text-sm font-medium text-ink-70 bg-ink-10/30 rounded-xl hover:bg-ink-10/40 transition-colors"
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
