import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { title, description, coverImageUrl, isPublished } = await req.json()

  if (!title?.trim()) {
    return NextResponse.json({ error: "Le titre est requis" }, { status: 400 })
  }

  const formation = await prisma.formation.create({
    data: {
      title: title.trim(),
      description: description || null,
      coverImageUrl: coverImageUrl || null,
      isPublished: isPublished || false,
    },
  })

  return NextResponse.json(formation, { status: 201 })
}
