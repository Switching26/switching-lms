import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getLearnerFormationsWithDocuments } from "@/lib/data/formations"

// Toujours linker la route authentifiée /api/files (les chemins statiques
// /uploads/* sont par ailleurs redirigés vers elle par le middleware).
function toRelativeFileUrl(url: string): string {
  if (url.startsWith("/api/files/")) return url
  const filename = url.split("/").pop()
  if (filename) return `/api/files/${filename}`
  return url
}

export default async function DocumentsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = session.user.id
  const enrollments = await getLearnerFormationsWithDocuments(userId)

  if (enrollments.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="font-display text-xl font-semibold text-ink">Aucune formation</h1>
      </div>
    )
  }

  // Documents de toutes les formations, groupés par formation (plus de bascule).
  const formationsDocs = enrollments.map((e) => {
    const formation = e.formation as any
    const formationAttachments = formation.attachments || []
    const chaptersWithDocs = (formation.chapters || []).filter(
      (ch: any) => ch.attachments && ch.attachments.length > 0
    )
    return {
      id: formation.id,
      title: formation.title,
      formationAttachments,
      chaptersWithDocs,
      hasAny: formationAttachments.length > 0 || chaptersWithDocs.length > 0,
    }
  })

  const anyDoc = formationsDocs.some((f) => f.hasAny)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink">Documents</h1>
        <p className="text-ink-50 mt-1">Tous les supports de vos formations à télécharger.</p>
      </header>

      {!anyDoc ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-50">Aucun document disponible pour le moment.</p>
        </div>
      ) : (
        formationsDocs
          .filter((f) => f.hasAny)
          .map((f) => (
            <section key={f.id} className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-ink border-b border-ink-10 pb-2">{f.title}</h2>

              {f.formationAttachments.length > 0 && (
                <div className="card p-5 sm:p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-50 mb-3">Documents de la formation</h3>
                  <DocList docs={f.formationAttachments} />
                </div>
              )}

              {f.chaptersWithDocs.map((chapter: any) => (
                <div key={chapter.id} className="card p-5 sm:p-6">
                  <h3 className="font-display text-base font-semibold text-ink mb-3">{chapter.title}</h3>
                  <DocList docs={chapter.attachments} />
                </div>
              ))}
            </section>
          ))
      )}
    </div>
  )
}

function DocList({ docs }: { docs: Array<{ id: string; name: string; fileUrl: string; fileSize: number }> }) {
  return (
    <div className="space-y-1.5">
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-ink-10/30 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{doc.name}</p>
              {doc.fileSize > 0 && (
                <p className="text-xs text-ink-50">{(doc.fileSize / 1024 / 1024).toFixed(1)} Mo</p>
              )}
            </div>
          </div>
          <a
            href={toRelativeFileUrl(doc.fileUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-semibold bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition-colors whitespace-nowrap"
          >
            Télécharger
          </a>
        </div>
      ))}
    </div>
  )
}
