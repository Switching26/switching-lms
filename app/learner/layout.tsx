import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import LearnerShell from "./shell"

export async function generateMetadata() {
  const session = await auth()
  const user = session?.user as any
  const partner = user?.partnerId
    ? await prisma.partner.findFirst({
        where: { id: user.partnerId },
        select: { name: true, logoUrl: true, faviconUrl: true },
      })
    : null
  const faviconIcon = partner?.faviconUrl || partner?.logoUrl || "/favicon.svg"
  return {
    title: `${user?.firstName || "Apprenant"} · ${partner?.name || "LMS"}`,
    icons: {
      icon: faviconIcon,
      apple: faviconIcon,
    },
  }
}

export default async function LearnerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const user = session.user as any

  // Fetch partner fresh from DB — JWT may contain stale logoUrl
  const partner = user.partnerId
    ? await prisma.partner.findUnique({
        where: { id: user.partnerId },
        select: { name: true, logoUrl: true, primaryColor: true, secondaryColor: true },
      })
    : null

  const primaryColor = partner?.primaryColor || "#111111"
  const secondaryColor = partner?.secondaryColor || "#FFFFFF"

  console.log("[TopNav learner] partner logo data:", {
    partnerId: user.partnerId,
    logoUrl: partner?.logoUrl,
    name: partner?.name,
  })

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
