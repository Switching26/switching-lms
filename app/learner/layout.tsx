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
        select: { name: true, logoUrl: true },
      })
    : null
  return {
    title: `${user?.firstName || "Apprenant"} · ${partner?.name || "LMS"}`,
    icons: {
      icon: partner?.logoUrl || "/favicon.svg",
      apple: partner?.logoUrl || "/favicon.svg",
    },
  }
}

export default async function LearnerLayout({ children }: { children: React.ReactNode }) {
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
      <LearnerShell
        brand={user.partnerName || "Switching Formation"}
        brandColor={primaryColor}
        brandLogo={user.partnerLogo || null}
        userEmail={session.user?.email || ""}
        impersonating={user.impersonating || null}
      >
        {children}
      </LearnerShell>
    </div>
  )
}
