import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import Badge from "@/components/ui/Badge"

export const dynamic = "force-dynamic"
const date = (value: Date | null) => value?.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) || "À convenir"

export default async function SuiviFormateursPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "SUPER_ADMIN") redirect("/")
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER", partner: { slug: "switching", isInternal: true } },
    include: { trainerAssignments: { where: { archivedAt: null }, orderBy: [{ adminStartAt: "desc" }, { lastName: "asc" }] } },
    orderBy: { lastName: "asc" },
  })
  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <h1 className="text-xl font-semibold">Suivi formateurs</h1>
      <Link className="text-sm text-primary py-3 hover:underline" href="/super-admin/utilisateurs">Utilisateurs</Link>
    </div>
    {trainers.length === 0 && <p className="text-sm text-gray-500">Aucun formateur Switching.</p>}
    {trainers.map((trainer) => <section key={trainer.id} className="bg-white rounded-xl border border-border p-4 sm:p-6 space-y-4">
      <div><h2 className="font-semibold">{trainer.firstName} {trainer.lastName}</h2>
        <p className="text-sm text-gray-500 break-all">{trainer.email}</p></div>
      {trainer.trainerAssignments.length === 0 && <p className="text-sm text-gray-500">Aucun élève en cours.</p>}
      <ul className="divide-y divide-gray-100">{trainer.trainerAssignments.map((assignment) => <li key={assignment.id} className="py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-sm">{assignment.firstName} {assignment.lastName}</h3>
          <Badge variant="default">{assignment.hasElearning ? "Visio + bonus" : "Visio seule"}</Badge></div>
        <p className="text-xs text-gray-500">{assignment.formationLabel}</p>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div><dt className="text-gray-500">Démarrage administratif</dt><dd className="mt-1 font-medium">{date(assignment.adminStartAt)}</dd></div>
          <div><dt className="text-gray-500">Visios à partir du</dt><dd className="mt-1 font-medium">{date(assignment.visioStartAt)}</dd></div>
          <div><dt className="text-gray-500">Fin administrative</dt><dd className="mt-1 font-medium">{date(assignment.adminEndAt)}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Badge variant={assignment.contactDoneAt ? "success" : "default"}>{assignment.contactDoneAt ? "Contact fait" : "Contact à faire"}</Badge>
          <Badge variant={assignment.silaeAccessSentAt ? "success" : "default"}>{assignment.silaeAccessSentAt ? "SILAE envoyé" : "SILAE à envoyer"}</Badge>
          <Badge variant={assignment.planningAgreedAt ? "success" : assignment.noAnswerAt ? "warning" : "default"}>
            {assignment.planningAgreedAt ? "Planning convenu" : assignment.noAnswerAt ? "Pas de réponse" : "Planning à fixer"}</Badge>
        </div>
      </li>)}</ul>
    </section>)}
  </div>
}
