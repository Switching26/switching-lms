import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getEmailLogs } from "@/lib/data/emails"
import EmailManager from "./email-manager"

export default async function EmailsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const logs = await getEmailLogs()

  return <EmailManager logs={logs} />
}
