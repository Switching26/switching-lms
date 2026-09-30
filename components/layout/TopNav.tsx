"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { BookOpen, Building2, ChartNoAxesColumn, ChevronRight, Download, FileText, Home, KeyRound, LogOut, Mail, MessagesSquare, MoreHorizontal, Palette, RefreshCw, Settings2, ShieldCheck, StickyNote, UsersRound } from "lucide-react"
import Modal from "@/components/ui/Modal"
import SlidingTrack from "@/components/ui/SlidingTrack"
import ProfileForm from "@/components/profile/ProfileForm"

interface NavItem { label: string; href: string }
type AccountUser = { id: string; firstName: string; lastName: string; email: string }
function NavIcon({ label }: { label: string }) {
  const key = label.toLowerCase()
  const Icon = key.includes("ensemble") || key.includes("accueil") || key === "dashboard" ? Home
    : key.includes("utilisateur") ? UsersRound : key.includes("partenaire") ? Building2
    : key.includes("évaluation") || key.includes("résultat") ? ChartNoAxesColumn
    : key.includes("document") ? FileText : key.includes("note") ? StickyNote
    : key.includes("message") ? MessagesSquare : key.includes("email") ? Mail
    : key.includes("migration") ? RefreshCw : key.includes("licence") ? KeyRound
    : key.includes("apparence") ? Palette : BookOpen
  return <Icon size={20} strokeWidth={1.65} aria-hidden="true" />
}
export default function TopNav({ brand, badge, items, brandLogo, userEmail }: {
  brand: string; badge?: string; items: NavItem[]; brandColor?: string; brandLogo?: string | null; userEmail?: string; plaquette?: boolean
}) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [unreadCount, setUnreadCount] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountPage, setAccountPage] = useState<"menu" | "profile" | "password">("menu")
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null)
  const [accountError, setAccountError] = useState("")
  const [installAllowed, setInstallAllowed] = useState(true)
  const roleRoot = pathname.startsWith("/super-admin") ? "/super-admin" : pathname.startsWith("/partner-admin") ? "/partner-admin" : "/learner"
  const superAdmin = roleRoot === "/super-admin", learner = roleRoot === "/learner"
  const roleLabel = superAdmin ? "Super admin" : learner ? "Apprenant" : "Administrateur"
  const email = session?.user?.email || userEmail || "", name = session?.user?.name || email
  const initials = name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase()
  const home = `${roleRoot}/${learner ? "accueil" : "dashboard"}`
  const all = items.filter(i => !i.href.endsWith("/parametres")).map(i => ({ ...i, label: i.label === "Dashboard" ? "Vue d’ensemble" : i.label === "Migration" ? "Migration Rise Up" : i.label }))
  const paths = superAdmin ? ["dashboard", "utilisateurs", "partenaires", "formations"] : learner ? ["accueil", "resultats", "documents", "messages"] : ["dashboard", "utilisateurs", "licences", "messages"]
  const primary = paths.map(path => all.find(i => i.href === `${roleRoot}/${path}`)).filter((i): i is NavItem => !!i)
  const secondary = all.filter(i => !primary.some(p => p.href === i.href))
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/") || learner && href === home && pathname.startsWith("/learner/formation")
  const moreActive = secondary.some(i => isActive(i.href))
  useEffect(() => {
    let active = true
    const count = async () => { try { const r = await fetch("/api/messages/unread-count"); if (r.ok && active) setUnreadCount((await r.json()).count || 0) } catch {} }
    count(); const timer = setInterval(count, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  useEffect(() => {
    setMoreOpen(false); setAccountOpen(false)
    const main = document.querySelector(".lms-main")
    if (main && !matchMedia("(prefers-reduced-motion: reduce)").matches) main.animate([{ opacity: .6 }, { opacity: 1 }], { duration: 180, easing: "ease-out" })
  }, [pathname])
  useEffect(() => {
    setInstallAllowed(!matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & { standalone?: boolean }).standalone)
    const root = document.documentElement
    const sync = () => {
      const desktop = innerWidth >= 761
      root.style.setProperty("--app-nav-height", desktop ? "84px" : "72px")
      const compactWorkspace = root.dataset.lmsWorkspace === "simulation" && innerWidth <= 1100
      root.style.setProperty("--app-sidebar-offset", desktop ? (compactWorkspace ? innerWidth <= 850 ? "0px" : "104px" : innerWidth <= 1100 ? "230px" : "268px") : "0px")
      root.style.setProperty("--app-bottom-offset", desktop ? "0px" : "calc(98px + env(safe-area-inset-bottom))")
    }
    sync(); window.addEventListener("resize", sync); window.addEventListener("lms-workspace-change", sync)
    return () => { window.removeEventListener("resize", sync); window.removeEventListener("lms-workspace-change", sync); ["--app-nav-height", "--app-sidebar-offset", "--app-bottom-offset"].forEach(key => root.style.removeProperty(key)) }
  }, [])
  const openAccount = async () => {
    setAccountPage("menu"); setAccountUser(null); setAccountOpen(true); setAccountError("")
    try { const r = await fetch("/api/user/profile"); if (!r.ok) throw Error("Votre profil n’a pas pu être chargé."); setAccountUser(await r.json()) }
    catch (e) { setAccountError(e instanceof Error ? e.message : "Votre profil n’a pas pu être chargé.") }
  }
  const identity = <span className="lms-avatar">{initials || "?"}</span>
  const brandLock = <Link href={home} className="lms-brand-lock" aria-label={`${brand}, accueil`}>
    {brandLogo ? <span className="lms-real-brand"><img src={brandLogo} alt={brand} /><small>{superAdmin ? badge || "Administration" : learner ? "Espace formation" : "Espace administration"}</small></span> : <><span className="lms-brand-mark"><BookOpen size={22} /></span><span><strong>{brand}</strong><small>{superAdmin ? badge || "Administration" : learner ? "Espace formation" : "Espace administration"}</small></span></>}
  </Link>
  const itemLink = (item: NavItem, mobile = false) => <Link key={item.href} href={item.href} aria-label={item.label} aria-current={isActive(item.href) && !(mobile && moreOpen) ? "page" : undefined}>
    <NavIcon label={item.label} /><span>{mobile ? item.href === home ? "Accueil" : item.label.replace(/^Mes /, "") : item.label}</span>
    {item.label === "Messages" && unreadCount > 0 && <b className="lms-unread">{unreadCount}</b>}
  </Link>
  return <>
    <aside className="lms-side">{brandLock}<span className="lms-side-label">{learner ? "MON ESPACE" : "GESTION"}</span>
      <nav className="lms-side-links" aria-label="Navigation principale ordinateur"><SlidingTrack className="lms-side-track" label="Destinations" activeKey={pathname} gesture={false}>{all.map(i => itemLink(i))}</SlidingTrack></nav>
      <button className="lms-side-account" onClick={openAccount} aria-label="Réglages de mon compte">{identity}<span className="lms-account-name"><strong>{name}</strong><small>{roleLabel}</small></span><Settings2 size={18} /></button>
    </aside>
    <header className="lms-top-nav"><div className="lms-mobile-brand">{brandLock}</div><div className="lms-crumb">{brand}<ChevronRight size={14} /><span>{all.find(i => isActive(i.href))?.label || "Mon compte"}</span></div><button className="lms-top-account" onClick={openAccount} aria-label="Réglages de mon compte">{identity}</button></header>
    <nav className="lms-bottom-nav" aria-label="Navigation mobile"><SlidingTrack className="lms-dock-track" activeKey={pathname + String(moreOpen)} label="Destinations principales">
      {primary.map(i => itemLink(i, true))}<button onClick={() => setMoreOpen(true)} aria-current={moreActive || moreOpen ? "page" : undefined} aria-label="Plus"><MoreHorizontal size={22} /><span>Plus</span></button>
    </SlidingTrack></nav>
    <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Plus"><div className="lms-menu-list">{secondary.map(i => <Link key={i.href} href={i.href} className="lms-menu-row"><NavIcon label={i.label} /><span>{i.label}</span><ChevronRight size={16} /></Link>)}</div></Modal>
    <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title={accountPage === "menu" ? "Mon compte" : accountPage === "profile" ? "Informations personnelles" : "Mot de passe"}>
      <div hidden={accountPage !== "menu"}><div className="lms-account-person">{identity}<span><h2>{name}</h2><p>{roleLabel} · {brand}</p></span></div>
        <button className="lms-menu-row" onClick={() => setAccountPage("profile")}><UsersRound size={20} /><span><strong>Informations personnelles</strong><small>Nom et coordonnées</small></span><ChevronRight size={16} /></button>
        <button className="lms-menu-row" onClick={() => setAccountPage("password")}><ShieldCheck size={20} /><span><strong>Mot de passe</strong><small>Sécurité de votre compte</small></span><ChevronRight size={16} /></button>
        {superAdmin && <Link className="lms-menu-row" href="/super-admin/parametres"><Settings2 size={20} /><span><strong>Paramètres de la plateforme</strong><small>Configuration générale du LMS</small></span><ChevronRight size={16} /></Link>}
        {installAllowed && <button className="lms-menu-row" onClick={() => { setAccountOpen(false); window.dispatchEvent(new Event("lms-open-install")) }}><Download size={20} /><span><strong>Installer l’application</strong><small>Ajouter cet espace à votre appareil</small></span><ChevronRight size={16} /></button>}
        <button className="lms-menu-row lms-danger" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut size={20} /><span>Se déconnecter</span></button>
      </div>
      <div hidden={accountPage === "menu"}><button className="lms-back-button" onClick={() => setAccountPage("menu")}>← Mon compte</button>
        {accountError && <p role="alert">{accountError}</p>}{!accountUser && !accountError && <p role="status">Chargement du profil…</p>}
        {accountUser && <ProfileForm user={accountUser} section={accountPage === "password" ? "password" : "profile"} />}
      </div>
    </Modal>
  </>
}
