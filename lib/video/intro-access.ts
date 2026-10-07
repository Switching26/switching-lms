import { prisma } from "@/lib/prisma"
import { canPartnerDistributeFormation } from "@/lib/licenses"

/** Each request rechecks publication, enrollment dates, and partner scope. */
export async function canReadIntro(
  user: { id: string; role: string; partnerId?: string | null },
  formation: { id: string; isPublished: boolean; deletedAt: Date | null },
  chapterPublished: boolean,
) {
  if (user.role === "SUPER_ADMIN") return true
  if (!formation.isPublished || formation.deletedAt || !chapterPublished) return false
  if (user.role === "PARTNER_ADMIN") {
    if (!user.partnerId) return false
    const partner = await prisma.partner.findUnique({ where: { id: user.partnerId }, select: { isActive: true } })
    return Boolean(partner?.isActive && await canPartnerDistributeFormation(user.partnerId, formation.id))
  }
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId: user.id, formationId: formation.id } },
  })
  const now = new Date()
  return Boolean(enrollment && enrollment.startedAt <= now && (!enrollment.expiresAt || enrollment.expiresAt > now))
}

export const INTRO_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
export const INTRO_PREFIX = "introductions/excel/2026-10-v1/"
export function validIntroKey(key: string, asset: "video" | "poster") {
  return new RegExp(`^${INTRO_PREFIX}m(?:0[1-9]|1[0-9]|2[0-7])-(?:intro|l[0-9]{3})\\.${asset === "video" ? "mp4" : "jpg"}$`).test(key)
}
