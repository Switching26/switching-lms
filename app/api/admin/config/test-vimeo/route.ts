import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function POST() {
  const session = await auth()
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const tokenRow = await prisma.systemConfig.findUnique({
    where: { key: "vimeo_token" },
  })

  if (!tokenRow?.value) {
    return NextResponse.json({ error: "Token API Vimeo non configuré" }, { status: 400 })
  }

  const token = decrypt(tokenRow.value)

  try {
    const res = await fetch("https://api.vimeo.com/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
    })

    const data = await res.json()
    if (!res.ok) {
      const errorMsg = data.error || data.developer_message || "Identifiants invalides"
      return NextResponse.json({ error: `Vimeo: ${errorMsg}` }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: `Connexion réussie — Compte : ${data.name || data.uri}`,
    })
  } catch (err) {
    return NextResponse.json({ error: "Impossible de contacter l'API Vimeo" }, { status: 500 })
  }
}
