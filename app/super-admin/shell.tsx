"use client"

import TopNav from "@/components/layout/TopNav"

const items = [
  { label: "Dashboard", href: "/super-admin/dashboard" },
  { label: "Formations", href: "/super-admin/formations" },
  { label: "Utilisateurs", href: "/super-admin/utilisateurs" },
  { label: "Partenaires", href: "/super-admin/partenaires" },
  { label: "Messages", href: "/super-admin/messages" },
  { label: "Emails", href: "/super-admin/emails" },
  { label: "Paramètres", href: "/super-admin/parametres" },
]

export default function SuperAdminShell({ children, userEmail }: { children: React.ReactNode; userEmail: string }) {
  return (
    <div className="min-h-screen noise-bg" style={{ backgroundColor: "#f8f7f4" }}>
      <TopNav brand="LMS Admin" badge="Super Admin" items={items} brandColor="#1a1a2e" userEmail={userEmail} />
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">{children}</main>
    </div>
  )
}
