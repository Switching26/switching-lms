"use client"

import TopNav from "@/components/layout/TopNav"
import ImpersonationBanner from "@/components/layout/ImpersonationBanner"

const items = [
  { label: "Accueil", href: "/learner/accueil" },
  { label: "Ma formation", href: "/learner/formation" },
  { label: "Messages", href: "/learner/messages" },
  { label: "Mes notes", href: "/learner/notes" },
  { label: "Documents", href: "/learner/documents" },
  { label: "Paramètres", href: "/learner/parametres" },
]

export default function LearnerShell({
  children,
  brand,
  brandColor,
  brandLogo,
  userEmail,
  impersonating,
}: {
  children: React.ReactNode
  brand: string
  brandColor: string
  brandLogo?: string | null
  userEmail: string
  impersonating?: { name: string; email: string } | null
}) {
  return (
    <div className="min-h-screen bg-muted">
      {impersonating && (
        <ImpersonationBanner name={impersonating.name} email={impersonating.email} />
      )}
      <div style={impersonating ? { paddingTop: "40px" } : undefined}>
        <TopNav brand={brand} items={items} brandColor={brandColor} brandLogo={brandLogo} userEmail={userEmail} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">{children}</main>
      </div>
    </div>
  )
}
