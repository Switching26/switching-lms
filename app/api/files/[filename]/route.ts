import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { readFile, stat } from "fs/promises"
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
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "svg"])

export async function GET(req: NextRequest, { params }: { params: { filename: string } }) {
  const { filename } = params
  // Prevent path traversal
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Nom de fichier invalide" }, { status: 400 })
  }

  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const isImage = IMAGE_EXTENSIONS.has(ext)

  // Images are public (covers, logos); documents require authentication
  if (!isImage) {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }
  }

  // Get storage path from config, fallback to UPLOAD_DIR
  let storagePath: string
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: "storage_path" } })
    storagePath = row?.value || UPLOAD_DIR
  } catch {
    storagePath = UPLOAD_DIR
  }

  const filePath = path.join(storagePath, filename)

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 })
  }

  const buffer = await readFile(filePath)
  const contentType = MIME_TYPES[ext] || "application/octet-stream"

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": isImage ? "public, max-age=86400" : "private, max-age=3600",
    },
  })
}
