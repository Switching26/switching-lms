"use client"

import TopNav from "@/components/layout/TopNav"
import ImpersonationBanner from "@/components/layout/ImpersonationBanner"

const items = [
  { label: "Dashboard", href: "/partner-admin/dashboard" },
  { label: "Utilisateurs", href: "/partner-admin/utilisateurs" },
  { label: "Messages", href: "/partner-admin/messages" },
  { label: "Licences", href: "/partner-admin/licences" },
  { label: "Emails", href: "/partner-admin/emails" },
  { label: "Apparence", href: "/partner-admin/apparence" },
]

export default function PartnerAdminShell({
  children,
  partnerName,
  partnerColor,
  partnerLogo,
  userEmail,
  impersonating,
}: {
  children: React.ReactNode
  partnerName: string
  partnerColor: string
  partnerLogo?: string | null
  userEmail: string
  impersonating?: { name: string; email: string } | null
}) {
  return (
    <div className="min-h-screen bg-surface-subtle">
      {impersonating && (
        <ImpersonationBanner name={impersonating.name} email={impersonating.email} />
      )}
      <div style={impersonating ? { paddingTop: "40px" } : undefined}>
        <TopNav
          brand={partnerName}
          badge="Admin partenaire"
          items={items}
          brandColor={partnerColor || "#4F46E5"}
          brandLogo={partnerLogo}
          userEmail={userEmail}
        />
        <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">{children}</main>
      </div>
    </div>
  )
}
