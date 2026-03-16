import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function POST() {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const row = await prisma.systemConfig.findUnique({ where: { key: "vimeo_token" } })
  if (!row?.value) {
    return NextResponse.json({ error: "Aucun token Vimeo configuré" }, { status: 400 })
  }

  const token = decrypt(row.value)

  try {
    const res = await fetch("https://api.vimeo.com/me", {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Token Vimeo invalide" }, { status: 400 })
    }

    const data = await res.json()
    return NextResponse.json({
      success: true,
      account: { name: data.name, uri: data.uri },
    })
  } catch {
    return NextResponse.json({ error: "Impossible de contacter l'API Vimeo" }, { status: 500 })
  }
}
