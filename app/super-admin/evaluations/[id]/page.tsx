import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import AssessmentEditor from "./editor"

export const dynamic = "force-dynamic"

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) redirect("/login")
  const role = session.user.role
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") redirect("/login")

  const assessment = await prisma.assessment.findFirst({
    where: { id, deletedAt: null },
    include: {
      partner: { select: { id: true, name: true } },
      questions: { orderBy: { order: "asc" }, include: { choices: { orderBy: { order: "asc" } } } },
      invitations: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, candidateEmail: true, candidateFirstName: true, candidateLastName: true,
          token: true, sentAt: true, openedAt: true, submittedAt: true, expiresAt: true,
          score: true, maxScore: true, needsManualReview: true,
        },
      },
    },
  })
  if (!assessment) notFound()
  // Cloisonnement : un admin partenaire ne voit que les siennes.
  if (role === "PARTNER_ADMIN" && assessment.partnerId !== session.user.partnerId) notFound()

  return <AssessmentEditor assessment={JSON.parse(JSON.stringify(assessment))} />
}
