import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getLearnerFormation } from "@/lib/data/formations"

export default async function DocumentsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const userId = (session.user as any).id
  const enrollment = await getLearnerFormation(userId)

  if (!enrollment) {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-semibold">Aucune formation</h1>
      </div>
    )
  }

  const chaptersWithDocs = enrollment.formation.chapters.filter(
    (ch) => ch.attachments && ch.attachments.length > 0
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Documents</h1>

      {chaptersWithDocs.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-gray-400">Aucun document disponible pour le moment.</p>
        </div>
      ) : (
        chaptersWithDocs.map((chapter) => (
          <div key={chapter.id} className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-base font-semibold mb-3">{chapter.title}</h2>
            <div className="space-y-2">
              {chapter.attachments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📄</span>
                    <div>
                      <p className="text-sm font-medium">{doc.name}</p>
                      {doc.fileSize > 0 && (
                        <p className="text-xs text-gray-400">
                          {(doc.fileSize / 1024 / 1024).toFixed(1)} Mo
                        </p>
                      )}
                    </div>
                  </div>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Télécharger
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
