import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"
import { encrypt } from "../../lib/crypto"
import { writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { encode } from "next-auth/jwt"

async function main() {
  const url = new URL(process.env.DATABASE_URL || "")
  if (url.hostname !== "localhost" || url.pathname !== "/lms_intros_test_20261007" || !process.env.INTRO_BACKUP_VERIFIED) throw new Error("Uniquement le clone local après sauvegarde")
  const prisma = new PrismaClient()
  try {
    const cnfdi = await prisma.partner.findFirst({ where: { name: { contains: "CNFDI", mode: "insensitive" } } })
    if (!cnfdi) throw new Error("Partenaire CNFDI absent du clone")
    const fid = "cms42cojt0001hyoy6c4w1xxb"
    const licensedPartner = await prisma.partner.upsert({ where: { id: "excel-intro-qa-partner" }, update: {},
      create: { id: "excel-intro-qa-partner", name: "Partenaire de recette locale", slug: "excel-intro-qa-partner" } })
    await prisma.license.upsert({ where: { partnerId_formationId: { partnerId: licensedPartner.id, formationId: fid } }, update: {},
      create: { partnerId: licensedPartner.id, formationId: fid, totalSeats: 1 } })
    const password = await hash(randomBytes(32).toString("hex"), 10)
    const cases = [
      ["learner", "LEARNER", null], ["cnfdi", "LEARNER", cnfdi.id],
      ["partner", "PARTNER_ADMIN", cnfdi.id], ["admin", "SUPER_ADMIN", null],
      ["licensed-partner", "PARTNER_ADMIN", licensedPartner.id],
      ["outsider", "LEARNER", null], ["expired", "LEARNER", null], ["future", "LEARNER", null],
      ["inactive", "LEARNER", null], ["archived", "LEARNER", null],
    ] as const
    const cookies: Record<string, string> = {}
    for (const [name, role, partnerId] of cases) {
      const id = `excel-intro-qa-${name}`
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@test.invalid`, password,
        firstName: "Camille", lastName: "Recette locale", role, partnerId,
        isActive: name !== "inactive", archivedAt: name === "archived" ? new Date() : null } })
      if (["learner", "cnfdi", "expired", "future", "inactive", "archived"].includes(name)) {
        await prisma.enrollment.upsert({ where: { userId_formationId: { userId: id, formationId: fid } }, update: {}, create: {
          userId: id, formationId: fid,
          startedAt: new Date(Date.now() + (name === "future" ? 86400000 : -86400000)),
          expiresAt: name === "expired" ? new Date(Date.now() - 1000) : null } })
      }
      cookies[name] = await encode({ token: { sub: id, role, partnerId, firstName: "Camille", partnerName: partnerId === cnfdi.id ? cnfdi.name : partnerId ? licensedPartner.name : null,
        partnerSlug: partnerId === cnfdi.id ? cnfdi.slug : partnerId ? licensedPartner.slug : null, email: `${id}@test.invalid` }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token" })
    }
    const keychain = (service: string) => execFileSync("security", ["find-generic-password", "-a", "switching-lms-videos", "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
    const config = { r2_endpoint: keychain("R2 LMS endpoint"), r2_bucket: "switching-lms-videos",
      r2_access_key: keychain("R2 LMS access key id"), r2_secret_key: keychain("R2 LMS secret access key"),
      video_worker_token: randomBytes(32).toString("hex") }
    for (const [key, value] of Object.entries(config)) await prisma.systemConfig.update({ where: { key }, data: { value: encrypt(value) } })
    await writeFile("/Users/switchingformation/lms-intros-mission/prive/cookies.json", JSON.stringify(cookies), { mode: 0o600 })
    console.log("10 comptes locaux isolés ; apprenant CNFDI inscrit et administrateur partenaire licencié préparés")
  } finally { await prisma.$disconnect() }
}
main().catch(() => { console.error("Décor QA refusé : contrôler le clone et sa licence CNFDI"); process.exitCode = 1 })
