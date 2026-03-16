import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getUserById, getUserProgress } from "@/lib/data/users"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const role = (session.user as any).role
  if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const userId = req.nextUrl.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId requis" }, { status: 400 })

  const user = await getUserById(userId)
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  const progress = await getUserProgress(userId)

  const rows = [
    ["Chapitre", "Statut", "Temps (min)", "Sessions", "Dernière position", "Terminé le"],
    ...progress.map((p) => [
      p.chapter.title,
      p.completedAt ? "Terminé" : "En cours",
      String(Math.round(p.timeSpentSeconds / 60)),
      String(p.sessionCount),
      String(p.lastPosition),
      p.completedAt ? new Date(p.completedAt).toLocaleDateString("fr-FR") : "",
    ]),
  ]

  const csv = rows.map((r) => r.join(";")).join("\n")

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suivi-${user.firstName}-${user.lastName}.csv"`,
    },
  })
}
