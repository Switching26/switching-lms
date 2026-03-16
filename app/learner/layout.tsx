import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import LearnerShell from "./shell"

export default async function LearnerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const user = session.user as any

  return (
    <LearnerShell
      brand={user.partnerName || "Switching Formation"}
      brandColor={user.partnerColor || "#111"}
      userEmail={session.user?.email || ""}
    >
      {children}
    </LearnerShell>
  )
}
