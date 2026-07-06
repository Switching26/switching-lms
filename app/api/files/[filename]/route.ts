import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

// Assets de branding (logos, favicons, couvertures) : publics par nature —
// affichés sur la page de connexion non authentifiée et dans les emails.
const PUBLIC_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "ico", "gif", "svg"])
// Documents pédagogiques payants : accès réservé aux inscrits / admins.
const DOCUMENT_EXTS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"])

/** Retrouve les formations auxquelles un fichier document est rattaché. */
async function resolveDocumentFormationIds(filename: string): Promise<string[]> {
  const [formationAtts, chapterAtts] = await Promise.all([
    prisma.formationAttachment.findMany({
      where: { fileUrl: { contains: filename } },
      select: { formationId: true },
    }),
    prisma.attachment.findMany({
      where: { fileUrl: { contains: filename } },
      select: { chapter: { select: { formationId: true } } },
    }),
  ])
  const ids = new Set<string>()
  formationAtts.forEach((a) => ids.add(a.formationId))
  chapterAtts.forEach((a) => a.chapter?.formationId && ids.add(a.chapter.formationId))
  return Array.from(ids)
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

  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream"
  // Les fichiers vivent soit sur le volume (uploads runtime), soit dans
  // public/uploads/* (documents historiques embarqués dans l'image).
  const candidates = [
    join(UPLOAD_DIR, filename),
    join(process.cwd(), "public", "uploads", "pdfs", filename),
    join(process.cwd(), "public", "uploads", filename),
  ]
  const filePath = candidates.find((p) => existsSync(p)) || candidates[0]

  // ── Documents : authentification + accès (inscription active ou admin) ──
  if (DOCUMENT_EXTS.has(ext)) {
    const session = await auth()
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }
    const role = session.user.role
    if (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN") {
      // Apprenant : doit avoir une inscription non expirée à une formation
      // qui contient ce document.
      const formationIds = await resolveDocumentFormationIds(filename)
      if (formationIds.length === 0) {
        return new NextResponse("Accès refusé", { status: 403 })
      }
      const now = new Date()
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId: session.user.id,
          formationId: { in: formationIds },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      })
      if (!enrollment) {
        return new NextResponse("Accès refusé", { status: 403 })
      }
    }
  } else if (!PUBLIC_IMAGE_EXTS.has(ext)) {
    // Type inconnu : ne pas servir en clair sans authentification.
    const session = await auth()
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }
  }

  try {
    if (!existsSync(filePath)) {
      return new NextResponse("File not found", { status: 404 })
    }

    const file = await readFile(filePath)
    const isDocument = DOCUMENT_EXTS.has(ext)
    const isSvg = ext === "svg"

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      // Documents : cache privé (jamais partagé par un proxy public).
      "Cache-Control": isDocument ? "private, max-age=0, no-store" : "public, max-age=31536000",
    }
    // SVG servi en pièce jointe pour empêcher l'exécution de JS inline (XSS stocké).
    if (isSvg) {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`
      headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    }

    return new NextResponse(file, { headers })
  } catch (error) {
    return new NextResponse("Server error", { status: 500 })
  }
}
