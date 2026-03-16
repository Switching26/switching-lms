"use client"

import TopNav from "@/components/layout/TopNav"

const items = [
  { label: "Accueil", href: "/learner/accueil" },
  { label: "Ma formation", href: "/learner/formation" },
  { label: "Mes notes", href: "/learner/notes" },
  { label: "Documents", href: "/learner/documents" },
  { label: "Paramètres", href: "/learner/parametres" },
]

export default function LearnerShell({
  children,
  brand,
  brandColor,
  userEmail,
}: {
  children: React.ReactNode
  brand: string
  brandColor: string
  userEmail: string
}) {
  return (
    <div className="min-h-screen bg-muted">
      <TopNav brand={brand} items={items} brandColor={brandColor} userEmail={userEmail} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
