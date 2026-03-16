import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import PartnerAdminShell from "./shell"

export async function generateMetadata() {
  const session = await auth()
  const partnerName = (session?.user as any)?.partnerName || "LMS"
  return { title: `${partnerName} · Admin` }
}

export default async function PartnerAdminLayout({ children }: { children: React.ReactNode }) {
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

  console.log("[TopNav partner-admin] partner logo data:", {
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
      {partner?.logoUrl && (
        <>
          <link rel="icon" href={partner.logoUrl} />
          <link rel="apple-touch-icon" href={partner.logoUrl} />
        </>
      )}
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
