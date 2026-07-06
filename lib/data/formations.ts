import { prisma } from "@/lib/prisma"
import { sortChaptersByLearningOrder, withSortedFormationChapters } from "@/lib/data/chapter-order"

export async function getFormations(includeDeleted = false) {
  const formations = await prisma.formation.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    include: {
      sections: { orderBy: { order: "asc" } },
      chapters: { orderBy: { order: "asc" }, include: { section: true } },
      enrollments: true,
    },
    orderBy: { createdAt: "desc" },
  })
  return formations.map((formation) => ({
    ...formation,
    chapters: sortChaptersByLearningOrder(formation.chapters, formation.sections),
  }))
}

export async function getFormationById(id: string) {
  const formation = await prisma.formation.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { order: "asc" } },
      chapters: {
        orderBy: { order: "asc" },
        include: { attachments: true, section: true },
      },
      attachments: true,
      enrollments: { include: { user: true } },
    },
  })
  if (!formation) return null
  return {
    ...formation,
    chapters: sortChaptersByLearningOrder(formation.chapters, formation.sections),
  }
}

export async function getFormationsCount() {
  return prisma.formation.count({ where: { deletedAt: null } })
}

export async function getLearnerEnrollments(userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, formation: { deletedAt: null } },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          chapters: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true, sectionId: true, section: true },
          },
        },
      },
    },
    orderBy: { startedAt: "asc" },
  })
  return enrollments.map(withSortedFormationChapters)
}

export async function getLearnerFormation(userId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, formation: { deletedAt: null } },
    orderBy: { startedAt: "asc" },
    include: {
      formation: {
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
            },
          },
          attachments: true,
        },
      },
    },
  })
  return enrollment ? withSortedFormationChapters(enrollment) : null
}

/**
 * Renvoie l'enrollment full pour la formation demandée (formationId) ou
 * le premier enrollment de l'apprenant si aucun id n'est fourni / n'est trouvé.
 */
export async function getLearnerFormationById(userId: string, formationId?: string | null) {
  if (formationId) {
    const found = await prisma.enrollment.findFirst({
      where: { userId, formationId, formation: { deletedAt: null } },
      include: {
        formation: {
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
                    questions: { orderBy: { order: "asc" }, include: { choices: true } },
                  },
                },
              },
            },
            attachments: true,
          },
        },
      },
    })
    if (found) return withSortedFormationChapters(found)
  }
  return getLearnerFormation(userId)
}

/**
 * Toutes les formations de l'apprenant avec leurs documents (pièces jointes de
 * formation + pièces jointes de chapitre), pour la page « Documents » globale.
 */
export async function getLearnerFormationsWithDocuments(userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, formation: { deletedAt: null } },
    orderBy: { startedAt: "asc" },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          attachments: true,
          chapters: {
            orderBy: { order: "asc" },
            include: { section: true, attachments: true },
          },
        },
      },
    },
  })
  return enrollments.map(withSortedFormationChapters)
}

export async function getLearnerProgress(userId: string) {
  return prisma.progress.findMany({
    where: { userId },
    include: { chapter: true },
  })
}

export async function hasDeletedEnrollment(userId: string) {
  const count = await prisma.enrollment.count({
    where: { userId, formation: { deletedAt: { not: null } } },
  })
  return count > 0
}
