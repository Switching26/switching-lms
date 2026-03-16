import { prisma } from "@/lib/prisma"

export async function getFormations() {
  return prisma.formation.findMany({
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
      chapters: {
        orderBy: { order: "asc" },
        include: { attachments: true },
      },
      enrollments: { include: { user: true } },
    },
  })
}

export async function getFormationsCount() {
  return prisma.formation.count()
}

export async function getLearnerFormation(userId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId },
    include: {
      formation: {
        include: {
          chapters: {
            orderBy: { order: "asc" },
            include: { attachments: true },
          },
        },
      },
    },
  })
  return enrollment
}

export async function getLearnerProgress(userId: string) {
  return prisma.progress.findMany({
    where: { userId },
    include: { chapter: true },
  })
}
