import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// TEMPORARY ROUTE — delete after use
export async function GET() {
  const result = await prisma.user.updateMany({
    where: { role: "SUPER_ADMIN" },
    data: { email: "contact@switchingformation.com" },
  })

  return NextResponse.json({ success: true, updated: result.count })
}
