import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  getLearnerFormationById,
  getLearnerProgress,
  hasDeletedEnrollment,
} from "@/lib/data/formations"
import { getUserNotesForFormation } from "@/lib/data/notes"
import FormationPlayer from "./player"

export default async function FormationPage({ searchParams }: { searchParams: Promise<{ id?: string; chapitre?: string }> }) {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const { id: formationId, chapitre: requestedChapterId } = await searchParams

  // Modèle liste → détail : on entre dans une formation en la choisissant depuis
  // « Mes formations ». Sans formation ciblée, on renvoie vers la liste (plus de
  // player « par défaut » ni de barre de bascule d'une formation à l'autre).
  if (!formationId) redirect("/learner/accueil")

  const enrollment = await getLearnerFormationById(userId, formationId)
  const progressList = await getLearnerProgress(userId)

  if (!enrollment) {
    const deletedEnrollment = await hasDeletedEnrollment(userId)
    return (
      <div className="text-center py-20">
        <h1 className="font-display text-xl font-semibold mb-2">
          {deletedEnrollment ? "Cette formation n'est plus disponible" : "Aucune formation"}
        </h1>
        <p className="text-ink-50 text-sm">Contactez votre administrateur pour accéder à une formation.</p>
      </div>
    )
  }

  if (enrollment.expiresAt && new Date(enrollment.expiresAt) < new Date()) {
    return (
      <div className="text-center py-20">
        <div className="inline-block bg-amber-50 border border-amber-200 rounded-xl px-8 py-6">
          <h1 className="font-display text-xl font-semibold text-amber-700 mb-2">Accès expiré</h1>
          <p className="text-sm text-amber-600">
            Votre accès à cette formation a expiré le{" "}
            {new Date(enrollment.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
          </p>
        </div>
      </div>
    )
  }

  const chapters = enrollment.formation.chapters.map((ch: any) => ({
    ...ch,
    // Assainir les exercices avant de les envoyer au client :
    //  - `multiple` = la question a plusieurs bonnes réponses (→ cases à cocher)
    //  - on RETIRE `isCorrect` des choix (sinon les bonnes réponses fuitent dans le payload)
    exercises: (ch.exercises || []).map((ex: any) => ({
      ...ex,
      questions: (ex.questions || []).map((q: any) => ({
        ...q,
        multiple: (q.choices || []).filter((c: any) => c.isCorrect).length > 1,
        choices: (q.choices || []).map((c: any) => ({ id: c.id, text: c.text })),
      })),
    })),
    completed: progressList.some((p) => p.chapterId === ch.id && p.completedAt),
    inProgress: progressList.some((p) => p.chapterId === ch.id && !p.completedAt),
    lastPosition: progressList.find((p) => p.chapterId === ch.id)?.lastPosition || 0,
  }))

  const sections = (enrollment.formation as any).sections || []
  const formationAttachments = (enrollment.formation as any).attachments || []

  // Notes de l'apprenant pour cette formation (bloc « Prise de notes » du player)
  const notes = await getUserNotesForFormation(userId, enrollment.formationId)
  const initialNotes: Record<string, string> = {}
  notes.forEach((n) => { initialNotes[n.chapterId] = n.content })

  return (
    <div>
      <Link
        href="/learner/accueil"
        className="group inline-flex items-center gap-1.5 mb-5 text-sm font-medium text-ink-50 hover:text-primary transition-colors"
      >
        <svg
          className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Mes formations
      </Link>
      <FormationPlayer
        key={enrollment.formationId}
        formationTitle={enrollment.formation.title}
        formationCoverUrl={enrollment.formation.coverImageUrl || null}
        chapters={JSON.parse(JSON.stringify(chapters))}
        sections={JSON.parse(JSON.stringify(sections))}
        formationAttachments={JSON.parse(JSON.stringify(formationAttachments))}
        userId={userId}
        formationId={enrollment.formationId}
        initialChapterId={requestedChapterId}
        initialNotes={initialNotes}
      />
    </div>
  )
}
