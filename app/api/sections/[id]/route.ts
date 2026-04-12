import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { title, description, order } = await req.json()

  const section = await prisma.section.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description || null }),
      ...(order !== undefined && { order }),
    },
  })

  return NextResponse.json(section)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Detach chapters from section before deleting
  await prisma.chapter.updateMany({
    where: { sectionId: params.id },
    data: { sectionId: null },
  })

  await prisma.section.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
