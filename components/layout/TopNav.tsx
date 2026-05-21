"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { useState, useEffect, useRef } from "react"

interface NavItem {
  label: string
  href: string
}

/* ─── Mapping icônes par label nav ─── */
function NavIcon({ label }: { label: string }) {
  const key = label.toLowerCase()
  const cls = "w-4 h-4"
  const props = { className: cls, fill: "none" as const, stroke: "currentColor", viewBox: "0 0 24 24", strokeWidth: 1.8 }
  if (key.includes("accueil") || key.includes("dashboard"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
  if (key.includes("formation") || key.includes("ma formation"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
  if (key.includes("document"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  if (key.includes("note"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
  if (key.includes("message"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
  if (key.includes("email"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
  if (key.includes("utilisateur"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
  if (key.includes("partenaire"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M7 20H2v-2a3 3 0 015.356-1.857m11.288 0a4.5 4.5 0 10-3.488-8.276M5.356 16.143a4.5 4.5 0 113.488-8.276M16 8a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
  if (key.includes("licence"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
  if (key.includes("apparence"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
  if (key.includes("catalogue"))
    return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
  return <svg {...props}><circle cx="12" cy="12" r="3" /></svg>
}

function getRoleLabel(role?: string): string {
  if (!role) return ""
  if (role === "SUPER_ADMIN") return "Super Administrateur"
  if (role === "PARTNER_ADMIN") return "Administrateur"
  if (role === "LEARNER") return "Apprenant"
  return role
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return "?"
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
  const { data: session } = useSession()
  const color = brandColor || "#1a1a2e"
  const [unreadCount, setUnreadCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const userName = (session?.user?.name as string | undefined) || undefined
  const userRole = (session?.user?.role as string | undefined) || undefined
  const email = userEmail || (session?.user?.email as string | undefined) || ""
  const initials = getInitials(userName, email)
  const roleLabel = getRoleLabel(userRole)

  // Détection du root du rôle pour les liens dynamiques
  const roleRoot = pathname.startsWith("/super-admin")
    ? "/super-admin"
    : pathname.startsWith("/partner-admin")
      ? "/partner-admin"
      : "/learner"
  const settingsHref = `${roleRoot}/parametres`
  const accountHref = `${roleRoot}/mon-compte`

  // Items affichés (Paramètres extrait dans bouton à droite)
  const visibleItems = items.filter((i) => !i.label.toLowerCase().includes("paramètre"))

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

  useEffect(() => { setMenuOpen(false); setProfileOpen(false) }, [pathname])

  useEffect(() => {
    if (!profileOpen) return
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [profileOpen])

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
    : pathname.startsWith("/super-admin")
      ? "/super-admin/dashboard"
      : "/learner/accueil"

  return (
    <>
      <nav className="glass-card sticky top-0 z-40 border-b" style={{ borderBottomColor: `${color}12` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          {/* GAUCHE : Logo + badge + items */}
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
              {visibleItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                const isMessages = item.label.toLowerCase().includes("message")
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                      active
                        ? "text-white shadow-sm"
                        : "text-ink-70 hover:text-ink hover:bg-ink-10/40"
                    }`}
                    style={active ? { backgroundColor: color } : undefined}
                  >
                    <NavIcon label={item.label} />
                    <span>{item.label}</span>
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

          {/* DROITE : Paramètres icône + Avatar dropdown + Burger mobile */}
          <div className="flex items-center gap-2">
            {/* Paramètres icône (desktop) */}
            <Link
              href={settingsHref}
              className="hidden lg:flex items-center justify-center w-10 h-10 rounded-full hover:bg-ink-10/40 transition-colors text-ink-50 hover:text-ink"
              title="Paramètres"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>

            {/* Avatar profil + dropdown (desktop) */}
            <div ref={profileRef} className="hidden lg:block relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 px-1.5 py-1 rounded-full hover:bg-ink-10/40 transition-colors group"
                aria-label="Mon profil"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-[12px] shadow-sm"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>
                <svg className={`w-3.5 h-3.5 text-ink-50 transition-transform ${profileOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-ink-10 overflow-hidden z-50 animate-fade-in">
                  {/* Header dropdown */}
                  <div className="px-4 py-3.5 border-b border-ink-10 flex items-center gap-3" style={{ background: `${color}06` }}>
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-[13px] flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{userName || email}</p>
                      <p className="text-[11px] text-ink-50 truncate">{roleLabel}</p>
                    </div>
                  </div>
                  {/* Items */}
                  <div className="py-1.5">
                    <Link
                      href={accountHref}
                      className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-ink-70 hover:bg-ink-10/30 hover:text-ink transition-colors"
                      onClick={() => setProfileOpen(false)}
                    >
                      <svg className="w-4 h-4 text-ink-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Mon compte
                    </Link>
                    <Link
                      href={settingsHref}
                      className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-ink-70 hover:bg-ink-10/30 hover:text-ink transition-colors"
                      onClick={() => setProfileOpen(false)}
                    >
                      <svg className="w-4 h-4 text-ink-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Paramètres
                    </Link>
                  </div>
                  <div className="border-t border-ink-10 py-1.5">
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                      </svg>
                      Déconnexion
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Burger mobile */}
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

      {/* Drawer mobile */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <div
            ref={menuRef}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[320px] bg-white shadow-2xl flex flex-col"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            {/* Header mobile : avatar + nom */}
            <div className="px-5 py-4 border-b border-ink-10 flex items-center gap-3" style={{ background: `${color}06` }}>
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-[13px] flex-shrink-0"
                style={{ backgroundColor: color }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">{userName || email}</p>
                <p className="text-[11px] text-ink-50 truncate">{roleLabel}</p>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-ink-10/30 flex-shrink-0"
                aria-label="Fermer"
              >
                <svg className="w-5 h-5 text-ink-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Items mobile */}
            <div className="flex-1 overflow-y-auto py-3 px-3">
              {visibleItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                const isMessages = item.label.toLowerCase().includes("message")
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all mb-0.5 ${
                      active
                        ? "font-semibold text-white"
                        : "text-ink-70 hover:bg-ink-10/30"
                    }`}
                    style={active ? { backgroundColor: color } : undefined}
                  >
                    <NavIcon label={item.label} />
                    <span className="flex-1">{item.label}</span>
                    {isMessages && unreadCount > 0 && (
                      <span className="min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold px-1.5">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
              {/* Mon compte + Paramètres mobile */}
              <div className="border-t border-ink-10 mt-3 pt-3">
                <Link
                  href={accountHref}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-ink-70 hover:bg-ink-10/30 mb-0.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Mon compte
                </Link>
                <Link
                  href={settingsHref}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-ink-70 hover:bg-ink-10/30"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Paramètres
                </Link>
              </div>
            </div>
            {/* Déconnexion mobile */}
            <div className="border-t border-ink-10 p-4">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full py-2.5 text-sm font-medium text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
