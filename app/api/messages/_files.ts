import { randomUUID } from "crypto"
import { mkdir, writeFile, unlink } from "fs/promises"
import path from "path"
import { TrainerAccessError } from "@/lib/trainer/access"

// Same persistent private volume as LMS documents, never public/uploads.
export const messageFilesDir = () => path.join(process.env.UPLOAD_DIR || "/mnt/uploads", "messages")
export async function storeSubmission(file: File) {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new TrainerAccessError("Fichier requis, 20 Mo maximum", 400)
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (!extension || !["pdf", "doc", "docx", "xls", "xlsx", "zip"].includes(extension)) {
    throw new TrainerAccessError("Formats acceptés : PDF, Word, Excel ou ZIP", 400)
  }
  const name = file.name.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 180)
  const key = `${randomUUID()}.${extension}`
  await mkdir(messageFilesDir(), { recursive: true, mode: 0o700 })
  await writeFile(path.join(messageFilesDir(), key), Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 })
  return { name, key, size: file.size }
}
export async function removeSubmission(key: string) {
  await unlink(path.join(messageFilesDir(), key)).catch(() => {})
}
