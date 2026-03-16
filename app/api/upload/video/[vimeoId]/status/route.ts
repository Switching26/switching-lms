import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: { vimeoId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const tokenRow = await prisma.systemConfig.findUnique({
    where: { key: "vimeo_token" },
  })

  if (!tokenRow?.value) {
    return NextResponse.json({ error: "Vimeo non configuré" }, { status: 400 })
  }

  const token = decrypt(tokenRow.value)

  try {
    const res = await fetch(`https://api.vimeo.com/videos/${params.vimeoId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
    })

    if (!res.ok) {
      return NextResponse.json({ status: "error", error: "Vidéo introuvable" })
    }

    const data = await res.json()
    const transcode = data.transcode?.status // "complete", "in_progress", "error"
    const uploadStatus = data.upload?.status // "complete", "in_progress"

    // Upload not yet complete
    if (uploadStatus === "in_progress") {
      return NextResponse.json({ status: "uploading" })
    }

    // Transcode complete → video available
    if (transcode === "complete") {
      return NextResponse.json({
        status: "available",
        duration: Math.round(data.duration || 0),
      })
    }

    // Transcode error
    if (transcode === "error") {
      return NextResponse.json({
        status: "error",
        error: "Erreur de traitement vidéo",
      })
    }

    // Still transcoding
    return NextResponse.json({
      status: data.status || "transcoding",
    })
  } catch {
    return NextResponse.json({ status: "error", error: "Erreur de connexion à Vimeo" })
  }
}
