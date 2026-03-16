import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { licenses } = await req.json() as {
    licenses: { formationId: string; totalSeats: number }[]
  }

  if (!Array.isArray(licenses)) {
    return NextResponse.json({ error: "Format invalide" }, { status: 400 })
  }

  const results = []

  for (const lic of licenses) {
    if (lic.totalSeats < 0) continue

    const existing = await prisma.license.findUnique({
      where: { partnerId_formationId: { partnerId: params.id, formationId: lic.formationId } },
    })

    if (existing) {
      if (lic.totalSeats === 0) {
        if (existing.usedSeats === 0) {
          await prisma.license.delete({ where: { id: existing.id } })
        }
        continue
      }
      // Cannot set below used seats
      const finalTotal = Math.max(lic.totalSeats, existing.usedSeats)
      const updated = await prisma.license.update({
        where: { id: existing.id },
        data: { totalSeats: finalTotal },
      })
      results.push(updated)
    } else if (lic.totalSeats > 0) {
      const created = await prisma.license.create({
        data: {
          partnerId: params.id,
          formationId: lic.formationId,
          totalSeats: lic.totalSeats,
        },
      })
      results.push(created)
    }
  }

  return NextResponse.json({ success: true, licenses: results })
}
