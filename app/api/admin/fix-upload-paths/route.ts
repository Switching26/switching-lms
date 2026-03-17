import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const results = {
    partners: 0,
    formations: 0,
    attachments: 0,
    formationAttachments: 0,
  }

  // Fix Partner logoUrl and faviconUrl
  const partners = await prisma.partner.findMany()
  for (const partner of partners) {
    const updates: Record<string, string> = {}

    if (partner.logoUrl?.includes("/app/uploads/")) {
      const filename = partner.logoUrl.split("/").pop()
      updates.logoUrl = `/api/files/${filename}`
    }
    if (partner.faviconUrl?.includes("/app/uploads/")) {
      const filename = partner.faviconUrl.split("/").pop()
      updates.faviconUrl = `/api/files/${filename}`
    }

    if (Object.keys(updates).length > 0) {
      await prisma.partner.update({
        where: { id: partner.id },
        data: updates,
      })
      results.partners++
      console.log("[FIX-PATHS] Partner updated:", partner.id, updates)
    }
  }

  // Fix Formation coverImageUrl
  const formations = await prisma.formation.findMany()
  for (const formation of formations) {
    if (formation.coverImageUrl?.includes("/app/uploads/")) {
      const filename = formation.coverImageUrl.split("/").pop()
      await prisma.formation.update({
        where: { id: formation.id },
        data: { coverImageUrl: `/api/files/${filename}` },
      })
      results.formations++
      console.log("[FIX-PATHS] Formation updated:", formation.id)
    }
  }

  // Fix Attachment fileUrl
  const attachments = await prisma.attachment.findMany()
  for (const attachment of attachments) {
    if (attachment.fileUrl?.includes("/app/uploads/")) {
      const filename = attachment.fileUrl.split("/").pop()
      await prisma.attachment.update({
        where: { id: attachment.id },
        data: { fileUrl: `/api/files/${filename}` },
      })
      results.attachments++
      console.log("[FIX-PATHS] Attachment updated:", attachment.id)
    }
  }

  // Fix FormationAttachment fileUrl
  const formationAttachments = await prisma.formationAttachment.findMany()
  for (const fa of formationAttachments) {
    if (fa.fileUrl?.includes("/app/uploads/")) {
      const filename = fa.fileUrl.split("/").pop()
      await prisma.formationAttachment.update({
        where: { id: fa.id },
        data: { fileUrl: `/api/files/${filename}` },
      })
      results.formationAttachments++
      console.log("[FIX-PATHS] FormationAttachment updated:", fa.id)
    }
  }

  console.log("[FIX-PATHS] Migration complete:", results)

  return NextResponse.json({
    success: true,
    message: "Chemins corrigés",
    updated: results,
  })
}
