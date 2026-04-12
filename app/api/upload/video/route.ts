import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || !["SUPER_ADMIN", "PARTNER_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { fileName, fileSize } = await req.json()

  if (!fileName || !fileSize) {
    return NextResponse.json({ error: "fileName et fileSize requis" }, { status: 400 })
  }

  const maxSize = 5 * 1024 * 1024 * 1024 // 5 GB
  if (fileSize > maxSize) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 5 Go)" }, { status: 400 })
  }

  const tokenRow = await prisma.systemConfig.findUnique({
    where: { key: "vimeo_token" },
  })

  if (!tokenRow?.value) {
    return NextResponse.json({
      error: "Vimeo non configuré. Allez dans Paramètres pour configurer.",
    }, { status: 400 })
  }

  const token = decrypt(tokenRow.value)

  try {
    // Step 1: Create a tus upload via Vimeo API
    const createRes = await fetch("https://api.vimeo.com/me/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
      body: JSON.stringify({
        upload: { approach: "tus", size: fileSize },
        name: fileName,
        privacy: { view: "disable" },
      }),
    })

    if (!createRes.ok) {
      const errData = await createRes.json()
      return NextResponse.json({
        error: errData.developer_message || errData.error || "Erreur Vimeo lors de la création de l'upload",
      }, { status: 500 })
    }

    const videoData = await createRes.json()
    const uploadLink = videoData.upload?.upload_link
    const vimeoUri = videoData.uri // e.g. "/videos/123456789"
    const vimeoId = vimeoUri?.split("/").pop() // "123456789"

    if (!uploadLink || !vimeoId) {
      return NextResponse.json({ error: "Réponse Vimeo incomplète" }, { status: 500 })
    }

    // Step 2: Configure embed settings (hide Vimeo branding)
    const patchRes = await fetch(`https://api.vimeo.com/videos/${vimeoId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
      body: JSON.stringify({
        embed: {
          buttons: { like: false, watchlater: false, share: false },
          logos: { vimeo: false },
          title: { owner: "hide", portrait: "hide", name: "hide" },
        },
      }),
    }).catch(() => null)

    const embedConfigured = patchRes?.ok ?? false

    return NextResponse.json({
      uploadUrl: uploadLink,
      vimeoId,
      embedConfigured,
    })
  } catch (err) {
    return NextResponse.json({ error: "Erreur lors de la création de l'upload" }, { status: 500 })
  }
}
