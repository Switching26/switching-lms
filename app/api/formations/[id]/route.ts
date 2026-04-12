import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function sanitizeString(str: string): string {
  return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").trim()
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://placeholder.com")
    return ["http:", "https:"].includes(parsed.protocol)
  } catch {
    return false
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, coverImageUrl, isPublished } = body

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Le titre est requis" }, { status: 400 })
  }

  if (title.trim().length > 200) {
    return NextResponse.json({ error: "Le titre ne peut pas dépasser 200 caractères" }, { status: 400 })
  }

  if (coverImageUrl && typeof coverImageUrl === "string" && !isValidUrl(coverImageUrl)) {
    return NextResponse.json({ error: "URL de l'image invalide" }, { status: 400 })
  }

  if (typeof isPublished !== "undefined" && typeof isPublished !== "boolean") {
    return NextResponse.json({ error: "isPublished doit être un booléen" }, { status: 400 })
  }

  const formation = await prisma.formation.update({
    where: { id: params.id },
    data: {
      title: sanitizeString(title),
      description: description ? sanitizeString(description) : null,
      coverImageUrl: coverImageUrl || null,
      isPublished,
    },
  })

  return NextResponse.json(formation)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Soft delete
  await prisma.formation.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ success: true })
}
