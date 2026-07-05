import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import LoginForm from "./login-form"

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const { partner: slug } = await searchParams
  const partner = slug
    ? await prisma.partner.findUnique({
        where: { slug },
        select: { name: true, logoUrl: true, faviconUrl: true },
      })
    : null
  const faviconIcon = partner?.faviconUrl || partner?.logoUrl || "/favicon.svg"
  return {
    title: `Connexion · ${partner?.name || "LMS"}`,
    icons: {
      icon: faviconIcon,
      apple: faviconIcon,
    },
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const { partner: slug } = await searchParams

  // Résolution du branding partenaire CÔTÉ SERVEUR pour éviter le flash
  // white-label (premier paint déjà brandé partenaire, ex. CNFDI bordeaux).
  const partnerRecord = slug
    ? await prisma.partner.findUnique({
        where: { slug, isActive: true },
        select: { name: true, logoUrl: true, primaryColor: true, secondaryColor: true },
      })
    : null

  const partner = partnerRecord
    ? {
        name: partnerRecord.name,
        primaryColor: partnerRecord.primaryColor,
        secondaryColor: partnerRecord.secondaryColor,
        logoUrl: partnerRecord.logoUrl,
      }
    : null

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-surface-subtle px-4">
        <p className="text-sm text-ink-50">Chargement…</p>
      </div>
    }>
      <LoginForm partner={partner} partnerSlug={slug || null} />
    </Suspense>
  )
}
