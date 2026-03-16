import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const attachments = await prisma.formationAttachment.findMany({
    where: { formationId: params.id },
  })

  return NextResponse.json(attachments)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { name, fileUrl, fileSize } = await req.json()

  const attachment = await prisma.formationAttachment.create({
    data: {
      formationId: params.id,
      name,
      fileUrl,
      fileSize: fileSize || 0,
    },
  })

  return NextResponse.json(attachment, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const attachmentId = searchParams.get("attachmentId")
  if (!attachmentId) return NextResponse.json({ error: "attachmentId requis" }, { status: 400 })

  await prisma.formationAttachment.delete({ where: { id: attachmentId } })
  return NextResponse.json({ success: true })
}
