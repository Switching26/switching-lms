import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { randomUUID } from "crypto"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export const dynamic = "force-dynamic"

const MAX_SIZE = 50 * 1024 * 1024 // 50 MB
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "webp", "svg", "ico"]

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/mnt/uploads"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.role || !["SUPER_ADMIN", "PARTNER_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 50 MB)" }, { status: 400 })
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || ""
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: `Format non accepté. Formats : ${ALLOWED_EXTENSIONS.join(", ")}` }, { status: 400 })
  }

  // Always use UPLOAD_DIR - never read path from database
  await mkdir(UPLOAD_DIR, { recursive: true })

  const filename = `${randomUUID()}.${ext}`
  const filePath = path.join(UPLOAD_DIR, filename)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  // Always return relative URL - never absolute path
  const url = `/api/files/${filename}`

  return NextResponse.json({
    url,
    filename,
    originalName: file.name,
    size: file.size,
  })
}
