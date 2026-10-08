import { redirect, notFound } from "next/navigation"
import { requireTrainer, TrainerAccessError } from "@/lib/trainer/access"
import { brandTheme } from "@/lib/brand-theme"
import BrandTheme from "@/components/layout/BrandTheme"
import TrainerShell from "./shell"
import "./trainer.css"

export const metadata = { title: "Espace formatrice · Switching Formation" }

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const trainer = await requireTrainer().catch(error => {
    if (error instanceof TrainerAccessError) {
      if (error.status === 401) redirect("/login")
      notFound()
    }
    throw error
  })
  const theme = brandTheme("#10ABAF", "#0F172A")
  return <div className="lms-plaquette trainer-space" style={theme}>
    <BrandTheme theme={theme} />
    <TrainerShell name={`${trainer.firstName} ${trainer.lastName}`} email={trainer.email} impersonating={trainer.impersonating}>{children}</TrainerShell>
  </div>
}
