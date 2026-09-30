"use client"

import TopNav from "@/components/layout/TopNav"

const items = [
  { label: "Dashboard", href: "/super-admin/dashboard" },
  { label: "Utilisateurs", href: "/super-admin/utilisateurs" },
  { label: "Partenaires", href: "/super-admin/partenaires" },
  { label: "Formations", href: "/super-admin/formations" },
  { label: "Évaluations", href: "/super-admin/evaluations" },
  { label: "Messages", href: "/super-admin/messages" },
  { label: "Emails", href: "/super-admin/emails" },
  { label: "Migration", href: "/super-admin/migration-riseup" },
  { label: "Paramètres", href: "/super-admin/parametres" },
]

export default function SuperAdminShell({ children, userEmail, brandLogo }: { children: React.ReactNode; userEmail: string; brandLogo?: string | null }) {
  return (
    <div className="min-h-screen bg-surface-subtle">
      <TopNav brand="Switching" badge="Administration" brandLogo={brandLogo} items={items} brandColor="#10ABAF" userEmail={userEmail} />
      <main className="lms-main relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-8 sm:pt-6 sm:pb-12">{children}</main>
    </div>
  )
}
