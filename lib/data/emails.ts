import { prisma } from "@/lib/prisma"

export async function getEmailLogs(partnerId?: string) {
  return prisma.emailLog.findMany({
    where: partnerId
      ? { user: { partnerId } }
      : {},
    include: { user: true },
    orderBy: { sentAt: "desc" },
    take: 100,
  })
}

export async function getRecentActivity(partnerId?: string, limit = 10) {
  return prisma.emailLog.findMany({
    where: partnerId ? { user: { partnerId } } : {},
    include: { user: true },
    orderBy: { sentAt: "desc" },
    take: limit,
  })
}
