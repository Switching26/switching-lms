import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { assessmentScopeWhere } from "@/lib/assessments"
import AssessmentsList from "./list"

export const dynamic = "force-dynamic"

export default async function EvaluationsPage() {
  const session = await auth()
  if (!session) redirect("/login")
  const role = session.user.role
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") redirect("/login")

  const [assessments, partners] = await Promise.all([
    prisma.assessment.findMany({
      where: await assessmentScopeWhere(role, session.user.partnerId),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        isPublished: true,
        createdAt: true,
        partner: { select: { name: true } },
        _count: { select: { questions: true, invitations: true } },
        invitations: { where: { submittedAt: { not: null } }, select: { id: true } },
      },
    }),
    role === "SUPER_ADMIN"
      ? prisma.partner.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ])

  return (
    <AssessmentsList
      assessments={assessments.map(({ invitations, createdAt, ...a }) => ({
        ...a,
        createdAt: createdAt.toISOString(),
        submittedCount: invitations.length,
      }))}
      partners={partners}
    />
  )
}
