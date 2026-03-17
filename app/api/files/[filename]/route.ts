import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { readFile, stat, readdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

export const dynamic = "force-dynamic"

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/mnt/uploads"

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  gif: "image/gif",
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "svg", "ico", "gif"])

export async function GET(req: NextRequest, { params }: { params: { filename: string } }) {
  const { filename } = params

  console.log('[FILES] ====== Request for:', filename)
  console.log('[FILES] User-Agent:', req.headers.get('user-agent'))
  console.log('[FILES] UPLOAD_DIR env:', process.env.UPLOAD_DIR)
  console.log('[FILES] UPLOAD_DIR resolved:', UPLOAD_DIR)

  // Prevent path traversal
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    console.log('[FILES] Rejected: path traversal attempt')
    return NextResponse.json({ error: "Nom de fichier invalide" }, { status: 400 })
  }

  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const isImage = IMAGE_EXTENSIONS.has(ext)

  console.log('[FILES] Extension:', ext, '| Is image:', isImage)

  // Images are public (covers, logos, favicons); documents require authentication
  if (!isImage) {
    const session = await auth()
    if (!session) {
      console.log('[FILES] Rejected: not authenticated for non-image file')
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }
  }

  // Get storage path from config, fallback to UPLOAD_DIR
  let storagePath: string
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: "storage_path" } })
    storagePath = row?.value || UPLOAD_DIR
    console.log('[FILES] Storage path from DB:', row?.value, '| Using:', storagePath)
  } catch (e) {
    storagePath = UPLOAD_DIR
    console.log('[FILES] DB error, using fallback:', storagePath, e)
  }

  const filePath = path.join(storagePath, filename)
  console.log('[FILES] Full file path:', filePath)

  // Check directory exists
  const dirExists = existsSync(storagePath)
  console.log('[FILES] Directory exists:', dirExists)

  if (!dirExists) {
    console.log('[FILES] ERROR: Upload directory does not exist:', storagePath)
    return NextResponse.json(
      { error: "Fichier introuvable", debug: { storagePath, dirExists: false } },
      { status: 404 }
    )
  }

  // Check file exists
  const fileExists = existsSync(filePath)
  console.log('[FILES] File exists:', fileExists)

  if (!fileExists) {
    // List directory contents for debugging
    try {
      const files = await readdir(storagePath)
      console.log('[FILES] Directory contents (' + files.length + ' files):', files.slice(0, 20))
    } catch (e) {
      console.log('[FILES] Cannot read directory:', e)
    }
    return NextResponse.json(
      { error: "Fichier introuvable", debug: { filePath, fileExists: false } },
      { status: 404 }
    )
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      console.log('[FILES] Path is not a file')
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 })
    }
    console.log('[FILES] File size:', fileStat.size, 'bytes')
  } catch (e) {
    console.log('[FILES] Stat error:', e)
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 })
  }

  try {
    const buffer = await readFile(filePath)
    const contentType = MIME_TYPES[ext] || "application/octet-stream"

    console.log('[FILES] Serving:', filename, '| Content-Type:', contentType, '| Size:', buffer.length)

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": isImage ? "public, max-age=31536000, immutable" : "private, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (e) {
    console.log('[FILES] Read error:', e)
    return NextResponse.json(
      { error: "Erreur lors de la lecture du fichier" },
      { status: 500 }
    )
  }
}
