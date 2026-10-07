"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { BookOpen, CalendarDays, ChevronRight, FileCheck2, MessagesSquare, UsersRound } from "lucide-react"

const items = [
  { label: "Mes élèves", href: "/trainer/eleves", icon: UsersRound },
  { label: "Agenda", href: "/trainer/agenda", icon: CalendarDays },
  { label: "Messages", href: "/trainer/messages", icon: MessagesSquare },
  { label: "Corrections", href: "/trainer/corrections", icon: FileCheck2 },
]

export default function TrainerShell({ children, name, email }: {
  children: React.ReactNode; name: string; email: string
}) {
  const pathname = usePathname()
  const [counts, setCounts] = useState<{ messages: number; corrections?: number }>({ messages: 0 })
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/")
  const initials = name.split(/\s+/).map(part => part[0]).slice(0, 2).join("")
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return
      pending = true
      try {
        // Integration INT-01: messaging owns this shared count endpoint.
        const response = await fetch("/api/messages/unread-count", { signal: controller.signal, cache: "no-store" })
        if (!response.ok || controller.signal.aborted) return
        const data = await response.json()
        const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
        setCounts({ messages: count(data.count), ...(typeof data.correctionsPending === "number" ? { corrections: count(data.correctionsPending) } : {}) })
      } catch { /* Keep the last known counts during a transient network failure. */ }
      finally { pending = false }
    }
    void refresh()
    const timer = setInterval(refresh, 15000)
    document.addEventListener("visibilitychange", refresh)
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh) }
  }, [pathname])
  useEffect(() => {
    const root = document.documentElement
    const keys = ["--app-nav-height", "--app-sidebar-offset", "--app-bottom-offset"]
    const previous = keys.map(key => [key, root.style.getPropertyValue(key)])
    const sync = () => {
      const desktop = innerWidth >= 761
      const sidebar = innerWidth <= 1100 ? 230 : 268
      root.style.setProperty(keys[0], desktop ? "84px" : "72px")
      root.style.setProperty(keys[1], desktop ? `${sidebar}px` : "0px")
      root.style.setProperty(keys[2], desktop ? "0px" : "calc(98px + env(safe-area-inset-bottom))")
    }
    sync(); window.addEventListener("resize", sync)
    return () => { window.removeEventListener("resize", sync); previous.forEach(([key, value]) => value ? root.style.setProperty(key, value) : root.style.removeProperty(key)) }
  }, [])
  const brand = <Link href="/trainer/eleves" className="lms-brand-lock" aria-label="Switching Formation, mes élèves">
    <span className="lms-brand-mark"><BookOpen size={22} aria-hidden /></span>
    <span><strong>Switching Formation</strong><small title={name}>Espace formatrice · {name.split(" ")[0]}</small></span>
  </Link>
  const links = items.map(({ label, href, icon: Icon }) => {
    const count = label === "Messages" ? counts.messages : label === "Corrections" ? counts.corrections : 0
    return <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}>
      <Icon size={20} strokeWidth={1.65} aria-hidden /><span>{label}</span>
      {!!count && <b className="trainer-nav-badge" aria-label={`${count} ${label === "Messages" ? "messages non lus" : "corrections en attente"}`}>{count}</b>}
    </Link>
  })
  return <div className="min-h-screen">
    <a className="trainer-skip" href="#trainer-main">Aller au contenu</a>
    <aside className="lms-side">{brand}<span className="lms-side-label">MON ESPACE</span>
      <nav className="lms-side-links" aria-label="Navigation formatrice ordinateur">{links}</nav>
      <div className="lms-side-account trainer-identity"><span className="lms-avatar">{initials}</span><span className="lms-account-name"><strong>{name}</strong><small title={email}>{email}</small></span></div>
    </aside>
    <header className="lms-top-nav"><div className="lms-mobile-brand">{brand}</div>
      <div className="lms-crumb">Switching Formation<ChevronRight size={14} aria-hidden /><span>{items.find(item => active(item.href))?.label || "Espace formatrice"}</span></div>
      <span className="trainer-top-name">{name}</span>
    </header>
    <main id="trainer-main" className="lms-main" tabIndex={-1}>{children}</main>
    <nav className="lms-bottom-nav" aria-label="Navigation formatrice mobile"><div className="trainer-dock">{links}</div></nav>
  </div>
}
