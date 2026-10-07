import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import Badge from "@/components/ui/Badge"
import { trainerAssignmentScope } from "@/lib/trainer/partners"

export const dynamic = "force-dynamic"
const date = (value: Date | null) => value?.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) || "À convenir"
const time = (value: Date) => `${date(value)}, ${value.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", " h ")}`
const contactNames: Record<string, string> = { CONTACT: "Premier contact", RELANCE: "Relance", REPONSE: "Réponse", PLANNING_VALIDE: "Planning validé", PAS_DE_RETOUR: "Pas de retour", ACCES_SILAE_ENVOYE: "Accès SILAE envoyé", NOTE: "Note" }

export default async function SuiviFormateursPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "SUPER_ADMIN") redirect("/")
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER", archivedAt: null, trainerPartners: { some: { partner: { isActive: true } } } },
    include: { trainerPartners: { where: { partner: { isActive: true } }, include: { partner: { select: { id: true, name: true } } } } },
    orderBy: { lastName: "asc" },
  })
  const rows = await Promise.all(trainers.map(async (trainer) => ({ ...trainer,
    trainerAssignments: await prisma.trainerAssignment.findMany({ where: { ...trainerAssignmentScope(trainer.id), archivedAt: null },
      orderBy: [{ adminStartAt: "desc" }, { lastName: "asc" }],
      include: { contactEvents: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }] } } }),
  })))
  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between items-center gap-3"><h1 className="text-xl font-semibold">Suivi formateurs</h1>
      <Link className="text-sm text-primary py-3 hover:underline" href="/super-admin/utilisateurs">Utilisateurs</Link></div>
    <p className="text-sm text-gray-500">Le premier contact et le planning se préparent dès l&apos;attribution. L&apos;accès SILAE est envoyé au démarrage administratif.</p>
    {trainers.length === 0 && <p className="text-sm text-gray-500">Aucun formateur rattaché à un organisme.</p>}
    {rows.map((trainer) => {
      const assignments = trainer.trainerAssignments
      return <section key={trainer.id} className="bg-white rounded-xl border border-border p-4 sm:p-6 space-y-4">
        <div><h2 className="font-semibold">{trainer.firstName} {trainer.lastName}</h2><p className="text-sm text-gray-500 break-all">{trainer.email}</p>
          <p className="text-xs text-gray-500 mt-1">{trainer.trainerPartners.map((p) => p.partner.name).join(" · ")}</p></div>
        {assignments.length === 0 && <p className="text-sm text-gray-500">Aucun élève en cours.</p>}
        <ul className="divide-y divide-gray-100">{assignments.map((assignment) => {
          const last = assignment.contactEvents[0]
          return <li key={assignment.id} className="py-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-sm">{assignment.firstName} {assignment.lastName}</h3><Badge variant="default">{assignment.hasElearning ? "Visio + bonus" : "Visio seule"}</Badge></div>
            <p className="text-xs text-gray-500">{assignment.formationLabel}</p>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs"><div><dt className="text-gray-500">Démarrage administratif</dt><dd className="mt-1 font-medium">{date(assignment.adminStartAt)}</dd></div>
              <div><dt className="text-gray-500">Visios à partir du</dt><dd className="mt-1 font-medium">{date(assignment.visioStartAt)}</dd></div><div><dt className="text-gray-500">Fin administrative</dt><dd className="mt-1 font-medium">{date(assignment.adminEndAt)}</dd></div></dl>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 space-y-2"><p className="font-medium">1. Premier contact et planning</p><p className="text-xs text-gray-500">Dès l&apos;attribution, avant le démarrage.</p>
                <div className="flex flex-wrap gap-2"><Badge variant={assignment.contactDoneAt ? "success" : "default"}>{assignment.contactDoneAt ? "Premier contact fait" : "Premier contact à préparer"}</Badge>
                <Badge variant={assignment.planningAgreedAt ? "success" : assignment.noAnswerAt ? "warning" : "default"}>{assignment.planningAgreedAt ? "Planning validé" : assignment.noAnswerAt ? "Pas de retour" : "Planning à convenir"}</Badge></div></div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2"><p className="font-medium">2. Accès SILAE au démarrage</p><p className="text-xs text-gray-500">Le {date(assignment.adminStartAt)}.</p>
                <Badge variant={assignment.silaeAccessSentAt ? "success" : "default"}>{assignment.silaeAccessSentAt ? "Accès SILAE envoyé" : "Accès SILAE à envoyer au démarrage"}</Badge></div>
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3"><p className="font-medium text-gray-700">Dernier événement</p>
              {last ? <><p className="mt-1">{contactNames[last.kind]} · {time(last.occurredAt)}</p>{last.note && <p className="mt-1 whitespace-pre-wrap break-words">{last.note}</p>}</> : <p className="mt-1">Aucun contact enregistré.</p>}</div>
            <details className="text-xs bg-gray-50 rounded-lg px-3">
              <summary className="min-h-[44px] py-3 cursor-pointer font-medium text-gray-700">Historique complet des contacts ({assignment.contactEvents.length})</summary>
              {assignment.contactEvents.length ? <ol className="divide-y divide-gray-200 pb-2">{assignment.contactEvents.map((event) => <li key={event.id} className="py-3 space-y-1">
                <p className="font-medium text-gray-700">{contactNames[event.kind]}</p><p className="text-gray-500">{time(event.occurredAt)}</p>
                {event.note && <p className="text-gray-600 whitespace-pre-wrap break-words">{event.note}</p>}
              </li>)}</ol> : <p className="pb-3 text-gray-500">Aucun contact enregistré.</p>}
            </details>
          </li>
        })}</ul>
      </section>
    })}
  </div>
}
