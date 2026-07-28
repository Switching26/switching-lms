import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sortChaptersByLearningOrder } from "@/lib/data/chapter-order"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const formation = await prisma.formation.findUnique({
    where: { id: params.id },
    include: {
      sections: { orderBy: { order: "asc" } },
      chapters: {
        orderBy: { order: "asc" },
        include: {
          section: true,
          attachments: true,
          exercises: {
            orderBy: { order: "asc" },
            include: {
              questions: {
                orderBy: { order: "asc" },
                include: { choices: true },
              },
            },
          },
          // Métadonnées de simulation seulement, comme côté apprenant : sans
          // elles l'aperçu affichait un chapitre vide pour un atelier Excel,
          // et le super-admin ne pouvait pas relire son propre contenu avant
          // publication. Jamais le scénario complet ici — 78 scénarios dans la
          // réponse feraient un payload inutilement énorme.
          simulation: { select: { id: true, app: true, mode: true, stepCount: true } },
        },
      },
      attachments: true,
    },
  })

  if (!formation) return NextResponse.json({ error: "Formation introuvable" }, { status: 404 })

  return NextResponse.json({
    ...formation,
    chapters: sortChaptersByLearningOrder(formation.chapters, formation.sections),
  })
}
