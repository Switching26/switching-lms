import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || !["SUPER_ADMIN", "PARTNER_ADMIN"].includes((session.user as any).role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { fileName, fileSize } = await req.json()

  if (!fileName || !fileSize) {
    return NextResponse.json({ error: "fileName et fileSize requis" }, { status: 400 })
  }

  const maxSize = 2 * 1024 * 1024 * 1024 // 2 GB
  if (fileSize > maxSize) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 2 Go)" }, { status: 400 })
  }

  const [accountRow, tokenRow] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "cloudflare_account_id" } }),
    prisma.systemConfig.findUnique({ where: { key: "cloudflare_stream_token" } }),
  ])

  if (!accountRow?.value || !tokenRow?.value) {
    return NextResponse.json({
      error: "Cloudflare Stream non configuré. Allez dans Paramètres pour configurer.",
    }, { status: 400 })
  }

  const accountId = accountRow.value
  const token = decrypt(tokenRow.value)

  try {
    // Create a tus upload via Cloudflare Stream API
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?direct_user=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(fileSize),
          "Upload-Metadata": `name ${Buffer.from(fileName).toString("base64")},requiresignedurls ${Buffer.from("true").toString("base64")}`,
        },
      }
    )

    if (!res.ok) {
      const text = await res.text()
      console.error("[CF STREAM CREATE]", text)
      return NextResponse.json({ error: "Erreur Cloudflare lors de la création de l'upload" }, { status: 500 })
    }

    // Cloudflare returns the upload URL in the Location header
    const uploadUrl = res.headers.get("Location") || res.headers.get("location")
    const streamMediaId = res.headers.get("stream-media-id")

    if (!uploadUrl) {
      return NextResponse.json({ error: "URL d'upload non reçue de Cloudflare" }, { status: 500 })
    }

    return NextResponse.json({
      uploadUrl,
      streamId: streamMediaId,
    })
  } catch (err) {
    console.error("[CF STREAM ERROR]", err)
    return NextResponse.json({ error: "Erreur lors de la création de l'upload" }, { status: 500 })
  }
}
