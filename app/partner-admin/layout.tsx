import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import PartnerAdminShell from "./shell"
import { brandTheme } from "@/lib/brand-theme"
import BrandTheme from "@/components/layout/BrandTheme"

export async function generateMetadata() {
  const session = await auth()
  const user = session?.user
  const partner = user?.partnerId
    ? await prisma.partner.findFirst({
        where: { id: user.partnerId },
        select: { name: true, logoUrl: true, faviconUrl: true },
      })
    : null
  const baseUrl = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "")
  const rawFavicon = partner?.faviconUrl || partner?.logoUrl || "/favicon.svg"
  const faviconIcon = rawFavicon.startsWith("http") ? rawFavicon : `${baseUrl}${rawFavicon}`
  return {
    title: `${partner?.name || "LMS"} · Admin`,
    icons: {
      icon: faviconIcon,
      apple: faviconIcon,
    },
  }
}

export default async function PartnerAdminLayout({ children }: { children: React.ReactNode }) {
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

  const primaryColor = partner?.primaryColor || "#4F46E5"
  const secondaryColor = partner?.secondaryColor || "#FFFFFF"

  return (
    <div className="lms-plaquette" style={brandTheme(primaryColor, secondaryColor)}>
      <BrandTheme theme={brandTheme(primaryColor, secondaryColor)} />
      <PartnerAdminShell
        partnerName={partner?.name || "Partenaire"}
        partnerColor={primaryColor}
        partnerLogo={partner?.logoUrl || null}
        userEmail={session.user?.email || ""}
        impersonating={user.impersonating || null}
      >
        {children}
      </PartnerAdminShell>
    </div>
  )
}
