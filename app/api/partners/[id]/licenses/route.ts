import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { licenses } = await req.json() as {
    licenses: { formationId: string; totalSeats: number; isUnlimited?: boolean }[]
  }

  if (!Array.isArray(licenses)) {
    return NextResponse.json({ error: "Format invalide" }, { status: 400 })
  }

  const results = []

  for (const lic of licenses) {
    const totalSeats = Number.isFinite(lic.totalSeats) ? Math.max(0, Math.floor(lic.totalSeats)) : 0
    const isUnlimited = lic.isUnlimited === true
    if (!lic.formationId) continue

    const existing = await prisma.license.findUnique({
      where: { partnerId_formationId: { partnerId: params.id, formationId: lic.formationId } },
    })

    if (existing) {
      if (isUnlimited) {
        const updated = await prisma.license.update({
          where: { id: existing.id },
          data: { totalSeats, isUnlimited: true },
        })
        results.push(updated)
        continue
      }

      if (totalSeats === 0) {
        if (existing.usedSeats === 0) {
          await prisma.license.delete({ where: { id: existing.id } })
        } else {
          const updated = await prisma.license.update({
            where: { id: existing.id },
            data: { totalSeats: existing.usedSeats, isUnlimited: false },
          })
          results.push(updated)
        }
        continue
      }
      // Cannot set below used seats
      const finalTotal = Math.max(totalSeats, existing.usedSeats)
      const updated = await prisma.license.update({
        where: { id: existing.id },
        data: { totalSeats: finalTotal, isUnlimited: false },
      })
      results.push(updated)
    } else if (isUnlimited || totalSeats > 0) {
      const created = await prisma.license.create({
        data: {
          partnerId: params.id,
          formationId: lic.formationId,
          totalSeats,
          isUnlimited,
        },
      })
      results.push(created)
    }
  }

  return NextResponse.json({ success: true, licenses: results })
}
