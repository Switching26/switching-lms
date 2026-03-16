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

  const [accountRow, tokenRow] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "cloudflare_account_id" } }),
    prisma.systemConfig.findUnique({ where: { key: "cloudflare_stream_token" } }),
  ])

  if (!accountRow?.value || !tokenRow?.value) {
    return NextResponse.json({ error: "Account ID ou API Token non configuré" }, { status: 400 })
  }

  const accountId = accountRow.value
  const token = decrypt(tokenRow.value)

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?per_page=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    if (!res.ok) {
      return NextResponse.json({ error: "Identifiants Cloudflare invalides" }, { status: 400 })
    }

    const data = await res.json()
    if (!data.success) {
      return NextResponse.json({ error: data.errors?.[0]?.message || "Erreur Cloudflare" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: `Connexion réussie. ${data.result?.length || 0} vidéo(s) trouvée(s).`,
    })
  } catch {
    return NextResponse.json({ error: "Impossible de contacter l'API Cloudflare" }, { status: 500 })
  }
}
