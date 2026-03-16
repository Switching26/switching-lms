import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getEmailLogs } from "@/lib/data/emails"
import EmailManager from "./email-manager"

export default async function EmailsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const rawLogs = await getEmailLogs()
  const logs = rawLogs.map((l) => ({
    ...l,
    sentAt: l.sentAt.toISOString(),
  }))

  return <EmailManager logs={logs} />
}
