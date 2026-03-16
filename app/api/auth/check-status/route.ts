import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const { email } = await req.json()
  if (!email) {
    return NextResponse.json({ disabled: false })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { isActive: true, archivedAt: true },
  })

  // Don't reveal if account exists — only flag disabled if account exists AND is inactive/archived
  if (user && (!user.isActive || user.archivedAt)) {
    return NextResponse.json({ disabled: true })
  }

  return NextResponse.json({ disabled: false })
}
