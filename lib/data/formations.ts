import { prisma } from "@/lib/prisma"

export async function getFormations(includeDeleted = false) {
  return prisma.formation.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    include: {
      chapters: { orderBy: { order: "asc" } },
      enrollments: true,
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getFormationById(id: string) {
  return prisma.formation.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { order: "asc" } },
      chapters: {
        orderBy: { order: "asc" },
        include: { attachments: true },
      },
      attachments: true,
      enrollments: { include: { user: true } },
    },
  })
}

export async function getFormationsCount() {
  return prisma.formation.count({ where: { deletedAt: null } })
}

export async function getLearnerEnrollments(userId: string) {
  return prisma.enrollment.findMany({
    where: { userId, formation: { deletedAt: null } },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          chapters: { orderBy: { order: "asc" }, select: { id: true, title: true } },
        },
      },
    },
    orderBy: { startedAt: "asc" },
  })
}

export async function getLearnerFormation(userId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, formation: { deletedAt: null } },
    include: {
      formation: {
        include: {
          sections: { orderBy: { order: "asc" } },
          chapters: {
            orderBy: { order: "asc" },
            include: {
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
  return enrollment
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
    if (found) return found
  }
  return getLearnerFormation(userId)
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
