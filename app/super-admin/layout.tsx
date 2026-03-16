export const dynamic = "force-dynamic"

import TopNav from "@/components/layout/TopNav"
import Sidebar, { getSuperAdminLinks } from "@/components/layout/Sidebar"

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F7" }}>
      <TopNav />
      <div className="flex">
        <Sidebar links={getSuperAdminLinks()} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
