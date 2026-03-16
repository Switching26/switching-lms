import { prisma } from "@/lib/prisma"

export async function getLicenses(partnerId?: string) {
  return prisma.license.findMany({
    where: partnerId ? { partnerId } : {},
    include: { formation: true, partner: true },
    orderBy: { partner: { name: "asc" } },
  })
}

export async function getTotalLicensesSold() {
  const result = await prisma.license.aggregate({
    _sum: { usedSeats: true },
  })
  return result._sum.usedSeats || 0
}

export async function getPartnerLicenseStats(partnerId: string) {
  const licenses = await prisma.license.findMany({
    where: { partnerId },
    include: { formation: true },
  })
  const totalSeats = licenses.reduce((sum, l) => sum + l.totalSeats, 0)
  const usedSeats = licenses.reduce((sum, l) => sum + l.usedSeats, 0)
  return { licenses, totalSeats, usedSeats }
}
