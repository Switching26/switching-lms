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

/**
 * Catalogue visible par un ORGANISME PARTENAIRE : uniquement les formations
 * pour lesquelles le super-admin lui a ouvert une licence.
 *
 * La licence porte deux sens : le quota de sièges (`hasAvailableSeat`) ET le
 * droit de distribution. Sans licence, la formation n'apparaît pas dans le
 * sélecteur d'attribution du partenaire — c'est ce qui cloisonne le catalogue
 * entre organismes : une formation créée pour les apprenants Switching n'est
 * pas distribuable par un partenaire tant que la licence n'est pas ouverte.
 */
export async function getFormationsForPartner(partnerId: string, includeDeleted = false) {
  // L'organisme interne (Switching) distribue tout le catalogue sans licence.
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { isInternal: true },
  })
  if (partner?.isInternal) return getFormations(includeDeleted)

  const formations = await prisma.formation.findMany({
    where: {
      ...(includeDeleted ? {} : { deletedAt: null }),
      licenses: { some: { partnerId } },
    },
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

// Côté apprenant : seules les formations et chapitres PUBLIÉS sont visibles.
const learnerFormationWhere = { deletedAt: null, isPublished: true }
const learnerChapterWhere = { isPublished: true }

export async function getLearnerEnrollments(userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, formation: learnerFormationWhere },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          chapters: {
            where: learnerChapterWhere,
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
    where: { userId, formation: learnerFormationWhere },
    orderBy: { startedAt: "asc" },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          chapters: {
            where: learnerChapterWhere,
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
      where: { userId, formationId, formation: learnerFormationWhere },
      include: {
        formation: {
          include: {
            sections: { orderBy: { order: "asc" } },
            chapters: {
              where: learnerChapterWhere,
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
    where: { userId, formation: learnerFormationWhere },
    orderBy: { startedAt: "asc" },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          attachments: true,
          chapters: {
            where: learnerChapterWhere,
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
