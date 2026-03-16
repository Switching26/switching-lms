"use client"

import TopNav from "@/components/layout/TopNav"

const items = [
  { label: "Dashboard", href: "/super-admin/dashboard" },
  { label: "Formations", href: "/super-admin/formations" },
  { label: "Utilisateurs", href: "/super-admin/utilisateurs" },
  { label: "Partenaires", href: "/super-admin/partenaires" },
  { label: "Emails", href: "/super-admin/emails" },
  { label: "Paramètres", href: "/super-admin/parametres" },
]

export default function SuperAdminShell({ children, userEmail }: { children: React.ReactNode; userEmail: string }) {
  return (
    <div className="min-h-screen bg-muted">
      <TopNav brand="LMS Admin" badge="Super Admin" items={items} userEmail={userEmail} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
