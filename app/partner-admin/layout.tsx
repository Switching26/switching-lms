import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import PartnerAdminShell from "./shell"

export async function generateMetadata() {
  const session = await auth()
  const partner = await prisma.partner.findFirst({
    where: { id: (session?.user as any)?.partnerId ?? undefined },
    select: { name: true, logoUrl: true },
  })
  return {
    title: `${partner?.name || "LMS"} · Admin`,
    icons: {
      icon: partner?.logoUrl || "/favicon.svg",
      apple: partner?.logoUrl || "/favicon.svg",
    },
  }
}

export default async function PartnerAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const user = session.user as any
  const primaryColor = user.partnerColor || "#111111"
  const secondaryColor = user.partnerSecondaryColor || "#FFFFFF"

  return (
    <div
      style={{
        // @ts-expect-error CSS custom properties
        "--partner-primary": primaryColor,
        "--partner-secondary": secondaryColor,
      }}
    >
      <PartnerAdminShell
        partnerName={user.partnerName || "Partenaire"}
        partnerColor={primaryColor}
        partnerLogo={user.partnerLogo || null}
        userEmail={session.user?.email || ""}
        impersonating={user.impersonating || null}
      >
        {children}
      </PartnerAdminShell>
    </div>
  )
}
