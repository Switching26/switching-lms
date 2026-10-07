import { requireTrainer } from "@/lib/trainer/access"
import { redirect } from "next/navigation"
import CorrectionsPanel from "@/components/messages/CorrectionsPanel"
export default async function TrainerCorrectionsPage() {
  try { await requireTrainer() } catch { redirect("/login") }
  return <CorrectionsPanel />
}
