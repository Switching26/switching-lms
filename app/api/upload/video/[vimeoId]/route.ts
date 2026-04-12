import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function DELETE(req: NextRequest, { params }: { params: { vimeoId: string } }) {
  const session = await auth()
  if (!session || !["SUPER_ADMIN", "PARTNER_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { vimeoId } = params
  if (!vimeoId || !/^\d+$/.test(vimeoId)) {
    return NextResponse.json({ error: "Vimeo ID invalide" }, { status: 400 })
  }

  const tokenRow = await prisma.systemConfig.findUnique({
    where: { key: "vimeo_token" },
  })

  if (!tokenRow?.value) {
    return NextResponse.json({ error: "Vimeo non configuré" }, { status: 400 })
  }

  const token = decrypt(tokenRow.value)

  try {
    const res = await fetch(`https://api.vimeo.com/videos/${vimeoId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
    })

    // Vimeo returns 204 No Content on success
    if (res.status === 204 || res.ok) {
      return NextResponse.json({ success: true })
    }

    // 404 = already deleted, still ok
    if (res.status === 404) {
      return NextResponse.json({ success: true, alreadyDeleted: true })
    }

    const errData = await res.json().catch(() => ({}))
    return NextResponse.json({
      error: errData.developer_message || errData.error || "Erreur lors de la suppression Vimeo",
    }, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Erreur de connexion à Vimeo" }, { status: 500 })
  }
}
