import { prisma } from "@/lib/prisma"

/**
 * Retire les secrets (hash de mot de passe, secret SMTP du partenaire) avant
 * qu'un objet utilisateur ne soit sérialisé vers un composant client / une API.
 * Sans ça, `findMany({ include })` renvoie la colonne `password` dans le payload.
 */
function stripUserSecrets<T extends Record<string, any> | null>(user: T): T {
  if (!user) return user
  const { password, ...rest } = user as Record<string, any>
  if (rest.partner && typeof rest.partner === "object") {
    const { smtpPassword, ...partnerRest } = rest.partner
    rest.partner = partnerRest
  }
  return rest as T
}

function stripUsersSecrets<T extends Record<string, any>>(users: T[]): T[] {
  return users.map((u) => stripUserSecrets(u))
}

export async function getAllUsers() {
  const users = await prisma.user.findMany({
    include: { partner: true, enrollments: { include: { formation: true } }, _count: { select: { loginLogs: true } } },
    orderBy: { createdAt: "desc" },
  })
  return stripUsersSecrets(users)
}

export async function getUsers(filter?: "all" | "internal" | "partner") {
  const base: any = { archivedAt: null }
  if (filter === "internal") base.partnerId = null
  else if (filter === "partner") base.NOT = { partnerId: null }

  const users = await prisma.user.findMany({
    where: base,
    include: { partner: true, enrollments: { include: { formation: true } }, _count: { select: { loginLogs: true } } },
    orderBy: { createdAt: "desc" },
  })
  return stripUsersSecrets(users)
}

export async function getArchivedUsers() {
  const users = await prisma.user.findMany({
    where: { archivedAt: { not: null } },
    include: { partner: true, enrollments: { include: { formation: true } }, _count: { select: { loginLogs: true } } },
    orderBy: { archivedAt: "desc" },
  })
  return stripUsersSecrets(users)
}

export async function getAllUsersByPartner(partnerId: string) {
  // Vue admin partenaire : ne pas exposer les comptes archivés.
  const users = await prisma.user.findMany({
    where: { partnerId, archivedAt: null },
    include: { partner: true, enrollments: { include: { formation: true } }, _count: { select: { loginLogs: true } } },
    orderBy: { createdAt: "desc" },
  })
  return stripUsersSecrets(users)
}

export async function getUsersByPartner(partnerId: string) {
  const users = await prisma.user.findMany({
    where: { partnerId },
    include: { partner: true, enrollments: { include: { formation: true } }, _count: { select: { loginLogs: true } } },
    orderBy: { createdAt: "desc" },
  })
  return stripUsersSecrets(users)
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      partner: true,
      // Dénominateur du suivi/export : chapitres publiés uniquement (cohérent apprenant).
      enrollments: { include: { formation: { include: { chapters: { where: { isPublished: true } } } } } },
      progress: { include: { chapter: true } },
      loginLogs: { orderBy: { loginAt: "desc" }, take: 20 },
      notes: true,
    },
  })
  return stripUserSecrets(user)
}

export async function getUserProgress(userId: string) {
  const progress = await prisma.progress.findMany({
    where: { userId },
    include: {
      chapter: {
        include: {
          section: true,
          formation: { include: { sections: { orderBy: { order: "asc" } } } },
        },
      },
    },
  })
  return progress.slice().sort((a, b) => {
    if (a.chapter.formation.title !== b.chapter.formation.title) {
      return a.chapter.formation.title.localeCompare(b.chapter.formation.title, "fr")
    }
    const sectionA = a.chapter.sectionId ? a.chapter.section?.order ?? Number.MAX_SAFE_INTEGER : -1
    const sectionB = b.chapter.sectionId ? b.chapter.section?.order ?? Number.MAX_SAFE_INTEGER : -1
    if (sectionA !== sectionB) return sectionA - sectionB
    if (a.chapter.order !== b.chapter.order) return a.chapter.order - b.chapter.order
    return a.chapter.title.localeCompare(b.chapter.title, "fr")
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
