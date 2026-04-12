import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"

export const dynamic = "force-dynamic"

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/mnt/uploads"

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

export async function GET(
  request: Request,
  { params }: { params: { filename: string } }
) {
  const { filename } = params

  // Prevent path traversal
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return new NextResponse("Invalid filename", { status: 400 })
  }

  const filePath = join(UPLOAD_DIR, filename)

  try {
    if (!existsSync(filePath)) {
      return new NextResponse("File not found", { status: 404 })
    }

    const file = await readFile(filePath)
    const ext = filename.split(".").pop()?.toLowerCase() || ""
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream"

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (error) {
    return new NextResponse("Server error", { status: 500 })
  }
}
