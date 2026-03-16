import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getUserById, getUserProgress } from "@/lib/data/users"

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const user = await getUserById(params.userId)
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  // If partner admin, check they own this user
  if (role === "PARTNER_ADMIN") {
    const adminPartnerId = (session.user as any).partnerId
    if (user.partnerId !== adminPartnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
  }

  const progress = await getUserProgress(params.userId)

  const totalTime = progress.reduce((sum, p) => sum + p.timeSpentSeconds, 0)
  const lastLogin = user.loginLogs[0]?.loginAt || null

  const chapters = progress.map((p) => ({
    id: p.chapterId,
    title: p.chapter.title,
    completedAt: p.completedAt,
    timeSpent: p.timeSpentSeconds,
    lastPosition: p.lastPosition,
    sessionCount: p.sessionCount,
  }))

  return NextResponse.json({
    totalTime,
    lastLogin,
    loginHistory: user.loginLogs.map((l) => l.loginAt),
    chapters,
  })
}
