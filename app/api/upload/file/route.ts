import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export const dynamic = "force-dynamic"

const MAX_SIZE = 50 * 1024 * 1024 // 50 MB
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png"]

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/mnt/uploads"

function getStoragePath(config: Record<string, string>): string {
  return config["storage_path"] || UPLOAD_DIR
}

function getBaseUrl(config: Record<string, string>): string {
  return config["storage_base_url"] || (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "") + "/api/files"
}

export async function POST(req: Request) {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
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

  // Get storage config
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: ["storage_path", "storage_base_url"] } },
  })
  const config: Record<string, string> = {}
  for (const r of rows) config[r.key] = r.value

  const storagePath = getStoragePath(config)
  const baseUrl = getBaseUrl(config)

  // Ensure directory exists
  await mkdir(storagePath, { recursive: true })

  const filename = `${randomUUID()}.${ext}`
  const filePath = path.join(storagePath, filename)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const url = `${baseUrl}/${filename}`

  return NextResponse.json({
    url,
    filename,
    originalName: file.name,
    size: file.size,
  })
}
