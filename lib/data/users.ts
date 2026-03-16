import { prisma } from "@/lib/prisma"

export async function getAllUsers() {
  return prisma.user.findMany({
    include: { partner: true, enrollments: { include: { formation: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function getUsers(filter?: "all" | "internal" | "partner") {
  const base: any = { archivedAt: null }
  if (filter === "internal") base.partnerId = null
  else if (filter === "partner") base.NOT = { partnerId: null }

  return prisma.user.findMany({
    where: base,
    include: { partner: true, enrollments: { include: { formation: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function getArchivedUsers() {
  return prisma.user.findMany({
    where: { archivedAt: { not: null } },
    include: { partner: true, enrollments: { include: { formation: true } } },
    orderBy: { archivedAt: "desc" },
  })
}

export async function getAllUsersByPartner(partnerId: string) {
  return prisma.user.findMany({
    where: { partnerId },
    include: { partner: true, enrollments: { include: { formation: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function getUsersByPartner(partnerId: string) {
  return prisma.user.findMany({
    where: { partnerId },
    include: { partner: true, enrollments: { include: { formation: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      partner: true,
      enrollments: { include: { formation: { include: { chapters: true } } } },
      progress: { include: { chapter: true } },
      loginLogs: { orderBy: { loginAt: "desc" }, take: 20 },
      notes: true,
    },
  })
}

export async function getUserProgress(userId: string) {
  return prisma.progress.findMany({
    where: { userId },
    include: { chapter: { include: { formation: true } } },
    orderBy: { chapter: { order: "asc" } },
  })
}

export async function updateUser(id: string, data: {
  firstName?: string
  lastName?: string
  email?: string
  isActive?: boolean
}) {
  return prisma.user.update({ where: { id }, data })
}

export async function updatePassword(id: string, hashedPassword: string) {
  return prisma.user.update({
    where: { id },
    data: { password: hashedPassword },
  })
}

export async function getActiveUsersCount(partnerId?: string) {
  return prisma.user.count({
    where: { isActive: true, archivedAt: null, role: "LEARNER", ...(partnerId ? { partnerId } : {}) },
  })
}
