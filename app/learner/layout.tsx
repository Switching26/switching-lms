import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import LearnerShell from "./shell"

export async function generateMetadata() {
  const session = await auth()
  const firstName = (session?.user as any)?.firstName || "Apprenant"
  return { title: `${firstName} · LMS` }
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
