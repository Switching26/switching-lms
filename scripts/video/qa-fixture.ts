import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"
import { encrypt } from "../../lib/crypto"
import { writeFile } from "node:fs/promises"
import { encode } from "next-auth/jwt"

async function main() {
  const url = new URL(process.env.DATABASE_URL || "")
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/video_r2_test") throw new Error("Uniquement la base locale vidéo jetable")
  const prisma = new PrismaClient()
  try {
    const password = await hash("video-r2-local-qa-2026", 10)
    for (const [id, role] of [["r2-admin", "SUPER_ADMIN"], ["r2-learner", "LEARNER"], ["r2-outsider", "LEARNER"]] as const) {
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@test.invalid`, password, firstName: id === "r2-admin" ? "Admin" : "Camille", lastName: "Test vidéo", role } })
    }
    await prisma.formation.upsert({ where: { id: "r2-formation" }, update: {}, create: { id: "r2-formation", title: "Vidéo privée · démonstration locale", isPublished: true } })
    await prisma.chapter.upsert({ where: { id: "r2-chapter" }, update: {}, create: { id: "r2-chapter", formationId: "r2-formation", title: "Comprendre le référencement", description: "Test du lecteur intégré et de la reprise de lecture.", videoDuration: 120, isPublished: true, order: 1 } })
    await prisma.enrollment.upsert({ where: { userId_formationId: { userId: "r2-learner", formationId: "r2-formation" } }, update: {}, create: { userId: "r2-learner", formationId: "r2-formation" } })
    const config = { r2_endpoint: "http://127.0.0.1:4568", r2_bucket: "video-r2-test", r2_access_key: "S3RVER", r2_secret_key: "S3RVER", video_worker_token: "video-r2-local-worker-token-2026-only" }
    for (const [key, value] of Object.entries(config)) await prisma.systemConfig.upsert({ where: { key }, update: { value: encrypt(value) }, create: { key, value: encrypt(value) } })
    const cookies: Record<string, string> = {}
    for (const [name, sub, role] of [["admin", "r2-admin", "SUPER_ADMIN"], ["learner", "r2-learner", "LEARNER"], ["outsider", "r2-outsider", "LEARNER"]]) {
      cookies[name] = await encode({ token: { sub, role, firstName: "Camille", email: `${sub}@test.invalid` }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token" })
    }
    await writeFile(".local/qa-cookies.json", JSON.stringify(cookies), { mode: 0o600 })
    console.log("Décor QA local prêt, comptes et session isolés")
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
