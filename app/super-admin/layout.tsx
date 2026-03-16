import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import SuperAdminShell from "./shell"

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

  return (
    <SuperAdminShell userEmail={session.user?.email || ""}>
      {children}
    </SuperAdminShell>
  )
}
