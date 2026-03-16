"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Building2,
  Mail,
  Home,
  FileText,
  FolderOpen,
  Settings,
  Key,
  Palette,
  StickyNote,
} from "lucide-react"

interface SidebarLink {
  href: string
  label: string
  icon: React.ReactNode
}

interface SidebarProps {
  links: SidebarLink[]
}

export default function Sidebar({ links }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="w-56 min-h-[calc(100vh-56px)] bg-white py-4 flex-shrink-0"
      style={{ borderRight: "1px solid #E5E5E5" }}
    >
      <nav className="space-y-1 px-3">
        {links.map((link) => {
          const isActive = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                backgroundColor: isActive ? "#F5F5F7" : "transparent",
                color: isActive ? "#111111" : "#666666",
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {link.icon}
              {link.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export function getSuperAdminLinks(): SidebarLink[] {
  return [
    { href: "/super-admin/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/super-admin/formations", label: "Formations", icon: <BookOpen size={18} /> },
    { href: "/super-admin/utilisateurs", label: "Utilisateurs", icon: <Users size={18} /> },
    { href: "/super-admin/partenaires", label: "Partenaires", icon: <Building2 size={18} /> },
    { href: "/super-admin/emails", label: "Emails", icon: <Mail size={18} /> },
  ]
}

export function getPartnerAdminLinks(): SidebarLink[] {
  return [
    { href: "/partner-admin/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/partner-admin/utilisateurs", label: "Utilisateurs", icon: <Users size={18} /> },
    { href: "/partner-admin/licences", label: "Licences", icon: <Key size={18} /> },
    { href: "/partner-admin/emails", label: "Emails", icon: <Mail size={18} /> },
    { href: "/partner-admin/apparence", label: "Apparence", icon: <Palette size={18} /> },
  ]
}

export function getLearnerLinks(): SidebarLink[] {
  return [
    { href: "/learner/accueil", label: "Accueil", icon: <Home size={18} /> },
    { href: "/learner/formation", label: "Formations", icon: <BookOpen size={18} /> },
    { href: "/learner/notes", label: "Notes", icon: <StickyNote size={18} /> },
    { href: "/learner/documents", label: "Documents", icon: <FolderOpen size={18} /> },
    { href: "/learner/parametres", label: "Paramètres", icon: <Settings size={18} /> },
  ]
}
