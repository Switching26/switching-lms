import { prisma } from "@/lib/prisma"

type Actor = { role?: string; partnerId?: string | null } | undefined

/** Shared server-side authorisation and eligibility for sending AND copying. */
export async function getAdminLoginLinkUser(actor: Actor, userId: string) {
  if (!actor || (actor.role !== "SUPER_ADMIN" && actor.role !== "PARTNER_ADMIN")) {
    return { error: "Accès refusé", status: 403 } as const
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, firstName: true, lastName: true, email: true,
      partnerId: true, archivedAt: true, isActive: true,
      partner: true,
      _count: { select: { loginLogs: { where: { OR: [
        { userAgent: null },
        { NOT: { userAgent: { startsWith: "riseup-import" } } },
      ] } } } },
    },
  })
  if (!user) return { error: "Utilisateur introuvable", status: 404 } as const
  if (actor.role === "PARTNER_ADMIN" && (!actor.partnerId || user.partnerId !== actor.partnerId)) {
    return { error: "Accès refusé", status: 403 } as const
  }
  if (user.archivedAt) return { error: "Utilisateur archivé — restaurez-le d'abord", status: 400 } as const
  if (!user.isActive) return { error: "Compte inactif — utilisez « Renvoyer activation »", status: 400 } as const
  if (user._count.loginLogs === 0) return { error: "Compte jamais activé — utilisez « Renvoyer activation »", status: 400 } as const
  return { user } as const
}
