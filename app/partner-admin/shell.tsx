"use client"

import TopNav from "@/components/layout/TopNav"

const items = [
  { label: "Dashboard", href: "/partner-admin/dashboard" },
  { label: "Utilisateurs", href: "/partner-admin/utilisateurs" },
  { label: "Licences", href: "/partner-admin/licences" },
  { label: "Emails", href: "/partner-admin/emails" },
  { label: "Apparence", href: "/partner-admin/apparence" },
]

export default function PartnerAdminShell({
  children,
  partnerName,
  partnerColor,
  userEmail,
}: {
  children: React.ReactNode
  partnerName: string
  partnerColor: string
  userEmail: string
}) {
  return (
    <div className="min-h-screen bg-muted">
      <TopNav
        brand={partnerName}
        badge="Admin partenaire"
        items={items}
        brandColor={partnerColor}
        userEmail={userEmail}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
