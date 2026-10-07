"use client"

import TopNav from "@/components/layout/TopNav"
import ImpersonationBanner from "@/components/layout/ImpersonationBanner"
import { useEffect, useState } from "react"

const items = [
  { label: "Mes formations", href: "/learner/accueil" },
  { label: "Mes résultats", href: "/learner/resultats" },
  { label: "Messages", href: "/learner/messages" },
  { label: "Mes notes", href: "/learner/notes" },
  { label: "Documents", href: "/learner/documents" },
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
  const [hasTrainer, setHasTrainer] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setHasTrainer(false)
    fetch("/api/learner/sessions", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setHasTrainer(data?.hasTrainer === true) })
      .catch(() => { if (!controller.signal.aborted) setHasTrainer(false) })
    return () => controller.abort()
  }, [userEmail])
  const navigationItems = hasTrainer
    ? [...items.slice(0, 2), { label: "Planning", href: "/learner/planning" }, ...items.slice(2)]
    : items

  const shellStyle = impersonating
    ? ({ paddingTop: "40px", "--app-impersonation-offset": "40px" } as React.CSSProperties)
    : undefined

  return (
    <div className="min-h-screen bg-surface-subtle">
      {impersonating && (
        <ImpersonationBanner name={impersonating.name} email={impersonating.email} />
      )}
      <div style={shellStyle}>
        <TopNav plaquette brand={brand} items={navigationItems} brandColor={brandColor || "#4F46E5"} brandLogo={brandLogo} userEmail={userEmail} />
        <main className="lms-main relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-8 sm:pt-6 sm:pb-12">{children}</main>
      </div>
    </div>
  )
}
