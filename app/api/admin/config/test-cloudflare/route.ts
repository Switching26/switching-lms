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
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    )

    const data = await res.json()
    console.log("[Cloudflare test] response:", JSON.stringify(data))

    if (!res.ok || !data.success) {
      const errorMsg = data.errors?.[0]?.message || "Identifiants invalides"
      return NextResponse.json({ error: `Cloudflare: ${errorMsg}` }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: `Connexion réussie. ${data.result?.length || 0} vidéo(s) trouvée(s).`,
    })
  } catch (err) {
    console.log("[Cloudflare test] error:", err)
    return NextResponse.json({ error: "Impossible de contacter l'API Cloudflare" }, { status: 500 })
  }
}
