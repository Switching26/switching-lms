import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: { streamId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const [accountRow, tokenRow] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "cloudflare_account_id" } }),
    prisma.systemConfig.findUnique({ where: { key: "cloudflare_stream_token" } }),
  ])

  if (!accountRow?.value || !tokenRow?.value) {
    return NextResponse.json({ error: "Cloudflare non configuré" }, { status: 400 })
  }

  const accountId = accountRow.value
  const token = decrypt(tokenRow.value)

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${params.streamId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!res.ok) {
      return NextResponse.json({ status: "error", error: "Vidéo introuvable" })
    }

    const data = await res.json()
    const video = data.result

    if (!video) {
      return NextResponse.json({ status: "error", error: "Données vidéo manquantes" })
    }

    // Cloudflare Stream status states
    if (video.status?.state === "ready" || video.readyToStream) {
      return NextResponse.json({
        status: "ready",
        duration: Math.round(video.duration || 0),
        thumbnail: video.thumbnail,
      })
    }

    if (video.status?.state === "error") {
      return NextResponse.json({
        status: "error",
        error: video.status?.errorReasonText || "Erreur de traitement",
      })
    }

    // Still processing
    return NextResponse.json({
      status: "processing",
      pctComplete: video.status?.pctComplete || null,
    })
  } catch {
    return NextResponse.json({ status: "error", error: "Erreur de connexion à Cloudflare" })
  }
}
