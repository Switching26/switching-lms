import { prisma } from "@/lib/prisma"

export async function getPartners() {
  return prisma.partner.findMany({
    include: {
      users: { where: { role: "LEARNER" } },
      licenses: { include: { formation: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getPartnerById(id: string) {
  return prisma.partner.findUnique({
    where: { id },
    include: {
      users: true,
      licenses: { include: { formation: true } },
    },
  })
}

export async function getPartnerBySlug(slug: string) {
  return prisma.partner.findUnique({
    where: { slug },
    select: { name: true, primaryColor: true, logoUrl: true },
  })
}

export async function getPartnersCount() {
  return prisma.partner.count({ where: { isActive: true } })
}

export async function updatePartner(id: string, data: {
  name?: string
  primaryColor?: string
  secondaryColor?: string
  logoUrl?: string | null
}) {
  return prisma.partner.update({ where: { id }, data })
}
