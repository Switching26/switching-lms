import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const lastSection = await prisma.section.findFirst({
    where: { formationId: params.id },
    orderBy: { order: "desc" },
  })

  const section = await prisma.section.create({
    data: {
      formationId: params.id,
      title: "Nouvelle section",
      order: (lastSection?.order ?? 0) + 1,
    },
    include: { chapters: { include: { attachments: true }, orderBy: { order: "asc" } } },
  })

  return NextResponse.json(section, { status: 201 })
}
