import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const row = await prisma.systemConfig.findUnique({ where: { key: "vimeo_token" } })
  if (!row?.value) {
    return NextResponse.json({ error: "Token Vimeo non configuré" }, { status: 400 })
  }

  const vimeoToken = decrypt(row.value)
  const contentType = req.headers.get("content-type") || ""

  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/octet-stream")) {
    return NextResponse.json({ error: "Format invalide" }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })
  }

  const maxSize = 5 * 1024 * 1024 * 1024 // 5 GB
  if (file.size > maxSize) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 5 GB)" }, { status: 400 })
  }

  try {
    // Step 1: Create the video on Vimeo (tus approach)
    const createRes = await fetch("https://api.vimeo.com/me/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vimeoToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
      body: JSON.stringify({
        upload: {
          approach: "tus",
          size: file.size,
        },
        privacy: {
          view: "disable",
          embed: "whitelist",
        },
        embed_domains: ["switching-lms-production.up.railway.app"],
      }),
    })

    if (!createRes.ok) {
      const err = await createRes.text()
      console.error("[VIMEO CREATE]", err)
      return NextResponse.json({ error: "Erreur Vimeo lors de la création" }, { status: 500 })
    }

    const createData = await createRes.json()
    const uploadLink = createData.upload.upload_link
    const vimeoUri = createData.uri // e.g. /videos/123456789
    const vimeoId = vimeoUri.split("/").pop()

    // Step 2: Upload the file via tus
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const uploadRes = await fetch(uploadLink, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
        "Content-Type": "application/offset+octet-stream",
      },
      body: fileBuffer,
    })

    if (!uploadRes.ok) {
      console.error("[VIMEO UPLOAD]", await uploadRes.text())
      return NextResponse.json({ error: "Erreur lors de l'upload vers Vimeo" }, { status: 500 })
    }

    return NextResponse.json({ vimeoId, uri: vimeoUri })
  } catch (err) {
    console.error("[VIMEO UPLOAD ERROR]", err)
    return NextResponse.json({ error: "Erreur lors de l'upload" }, { status: 500 })
  }
}
