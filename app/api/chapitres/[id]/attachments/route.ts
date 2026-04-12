import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { name, fileUrl, fileSize } = await req.json()

  if (!name?.trim() || !fileUrl?.trim()) {
    return NextResponse.json({ error: "Nom et URL requis" }, { status: 400 })
  }

  const attachment = await prisma.attachment.create({
    data: {
      chapterId: params.id,
      name: name.trim(),
      fileUrl: fileUrl.trim(),
      fileSize: fileSize || 0,
    },
  })

  return NextResponse.json(attachment, { status: 201 })
}
