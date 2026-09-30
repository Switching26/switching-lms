import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import SuperAdminShell from "./shell"
import { brandTheme } from "@/lib/brand-theme"
import BrandTheme from "@/components/layout/BrandTheme"
import { getPartnerBySlug } from "@/lib/data/partners"

export const metadata = {
  title: "Admin · LMS",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
}

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const platformBrand = await getPartnerBySlug("switching")
  return (
    <div className="lms-plaquette" style={brandTheme("#10ABAF", "#0F172A")}>
    <BrandTheme theme={brandTheme("#10ABAF", "#0F172A")} />
    <SuperAdminShell brandLogo={platformBrand?.logoUrl} userEmail={session.user?.email || ""}>
      {children}
    </SuperAdminShell>
    </div>
  )
}
