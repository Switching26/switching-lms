import { requireTrainer } from "@/lib/trainer/access"
import { redirect } from "next/navigation"
import MessagesPanel from "@/components/messages/MessagesPanel"
export default async function TrainerMessagesPage() {
  try { await requireTrainer() } catch { redirect("/login") }
  return <MessagesPanel trainer />
}
