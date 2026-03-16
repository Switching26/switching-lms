import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import PartnerAdminShell from "./shell"

export async function generateMetadata() {
  const session = await auth()
  const partnerName = (session?.user as any)?.partnerName || "Partenaire"
  return { title: `${partnerName} · Admin` }
}

export default async function PartnerAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const user = session.user as any

  return (
    <PartnerAdminShell
      partnerName={user.partnerName || "Partenaire"}
      partnerColor={user.partnerColor || "#111"}
      userEmail={session.user?.email || ""}
      impersonating={user.impersonating || null}
    >
      {children}
    </PartnerAdminShell>
  )
}
