"use client"

import TopNav from "@/components/layout/TopNav"

const items = [
  { label: "Dashboard", href: "/super-admin/dashboard" },
  { label: "Formations", href: "/super-admin/formations" },
  { label: "Utilisateurs", href: "/super-admin/utilisateurs" },
  { label: "Évaluations", href: "/super-admin/evaluations" },
  { label: "Migration", href: "/super-admin/migration-riseup" },
  { label: "Partenaires", href: "/super-admin/partenaires" },
  { label: "Messages", href: "/super-admin/messages" },
  { label: "Emails", href: "/super-admin/emails" },
  { label: "Paramètres", href: "/super-admin/parametres" },
]

export default function SuperAdminShell({ children, userEmail }: { children: React.ReactNode; userEmail: string }) {
  return (
    <div className="min-h-screen bg-surface-subtle">
      <TopNav brand="LMS" badge="Super Admin" items={items} brandColor="#4F46E5" userEmail={userEmail} />
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-8 sm:pt-6 sm:pb-12">{children}</main>
    </div>
  )
}
