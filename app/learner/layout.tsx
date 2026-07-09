import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { pwaManifestHref, pwaAppleIconHref } from "@/lib/pwa"
import LearnerShell from "./shell"

export async function generateMetadata() {
  const session = await auth()
  const user = session?.user
  const partner = user?.partnerId
    ? await prisma.partner.findFirst({
        where: { id: user.partnerId },
        select: { name: true, logoUrl: true, faviconUrl: true, slug: true },
      })
    : null
  const baseUrl = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "")
  const rawFavicon = partner?.faviconUrl || partner?.logoUrl || "/favicon.svg"
  const faviconIcon = rawFavicon.startsWith("http") ? rawFavicon : `${baseUrl}${rawFavicon}`
  return {
    title: `${user?.firstName || "Apprenant"} · ${partner?.name || "LMS"}`,
    // PWA brandée partenaire : installer depuis l'espace apprenant crée une
    // app au nom/logo du partenaire de l'utilisateur.
    manifest: pwaManifestHref(partner?.slug),
    appleWebApp: {
      capable: true,
      title: partner?.name || "Formation",
      statusBarStyle: "default" as const,
    },
    icons: {
      icon: faviconIcon,
      apple: pwaAppleIconHref(partner?.slug),
    },
  }
}

export default async function LearnerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const user = session.user

  // Fetch partner fresh from DB — JWT may contain stale logoUrl
  const partner = user.partnerId
    ? await prisma.partner.findUnique({
        where: { id: user.partnerId },
        select: { name: true, logoUrl: true, primaryColor: true, secondaryColor: true },
      })
    : null

  const primaryColor = partner?.primaryColor || "#111111"
  const secondaryColor = partner?.secondaryColor || "#FFFFFF"

  return (
    <div
      style={{
        // @ts-expect-error CSS custom properties
        "--partner-primary": primaryColor,
        "--partner-secondary": secondaryColor,
      }}
    >
      <LearnerShell
        brand={partner?.name || "Switching Formation"}
        brandColor={primaryColor}
        brandLogo={partner?.logoUrl || null}
        userEmail={session.user?.email || ""}
        impersonating={user.impersonating || null}
      >
        {children}
      </LearnerShell>
    </div>
  )
}
