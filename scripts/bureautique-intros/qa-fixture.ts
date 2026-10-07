/** Fixtures réservées au clone jetable : aucun secret R2 ni transport de mail. */
import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"
import { encode } from "next-auth/jwt"
import { encrypt } from "../../lib/crypto"
import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { APPS, localDatabaseOnly, type Target } from "./common"

async function main() {
  localDatabaseOnly()
  if (!process.env.INTRO_BACKUP_VERIFIED || !process.env.AUTH_SECRET) throw new Error("Clone sauvegardé et secret QA requis")
  const [targetsPath, privateFolder] = process.argv.slice(2)
  if (!targetsPath || !privateFolder) throw new Error("qa-fixture.ts cibles.json dossier-prive")
  const targets: Target[] = JSON.parse(await readFile(targetsPath, "utf8"))
  const prisma = new PrismaClient()
  try {
    // Neutralise les paramètres de production copiés, avant le moindre serveur.
    await prisma.systemConfig.deleteMany()
    for (const [key, value] of Object.entries({ r2_endpoint: "http://localhost:4499/", r2_bucket: "switching-lms-videos",
      r2_access_key: "RECETTE_LOCALE", r2_secret_key: "RECETTE_LOCALE_SANS_ACCES_R2", video_worker_token: randomBytes(32).toString("hex") })) {
      await prisma.systemConfig.create({ data: { key, value: encrypt(value) } })
    }
    const cnfdi = await prisma.partner.findFirst({ where: { name: { contains: "CNFDI", mode: "insensitive" } } })
    if (!cnfdi) throw new Error("CNFDI absent")
    const partner = await prisma.partner.upsert({ where: { id: "bureautique-intro-qa-partner" }, update: {},
      create: { id: "bureautique-intro-qa-partner", name: "Partenaire de recette locale", slug: "bureautique-intro-qa-partner" } })
    for (const spec of Object.values(APPS)) await prisma.license.upsert({ where: { partnerId_formationId: { partnerId: partner.id, formationId: spec.formationId } }, update: {},
      create: { partnerId: partner.id, formationId: spec.formationId, totalSeats: 1 } })
    const password = await hash(randomBytes(32).toString("hex"), 10)
    const cases = [ ["learner", "LEARNER", null], ["cnfdi", "LEARNER", cnfdi.id], ["admin", "SUPER_ADMIN", null],
      ["licensed-partner", "PARTNER_ADMIN", partner.id], ["outsider", "LEARNER", null], ["expired", "LEARNER", null],
      ["future", "LEARNER", null], ["inactive", "LEARNER", null], ["archived", "LEARNER", null] ] as const
    const cookies: Record<string, string> = {}
    for (const [name, role, partnerId] of cases) {
      const id = `bureautique-intro-qa-${name}`
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@test.invalid`, password,
        firstName: "Camille", lastName: "Recette locale", role, partnerId, isActive: name !== "inactive", archivedAt: name === "archived" ? new Date() : null } })
      if (["learner", "cnfdi", "expired", "future", "inactive", "archived"].includes(name)) {
        for (const spec of Object.values(APPS)) await prisma.enrollment.upsert({ where: { userId_formationId: { userId: id, formationId: spec.formationId } }, update: {},
          create: { userId: id, formationId: spec.formationId, startedAt: new Date(Date.now() + (name === "future" ? 86400000 : -86400000)),
            expiresAt: name === "expired" ? new Date(Date.now() - 1000) : null } })
      }
      cookies[name] = await encode({ token: { sub: id, role, partnerId, firstName: "Camille", email: `${id}@test.invalid` }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token" })
    }
    await writeFile(`${privateFolder}/cookies.json`, JSON.stringify(cookies), { mode: 0o600 })
    for (const [app, spec] of Object.entries(APPS)) {
      const prefix = `introductions/${app}/2026-10-v1/`
      const inventory = { version: 1, application: app, prefix, entries: targets.filter(t => t.app === spec.app).map(t => ({ ...t, durationSeconds: 1,
        objects: ["mp4", "jpg"].map(ext => ({ key: `${prefix}${t.id}.${ext}`, size: 32, sha256: "a".repeat(64) })) })) }
      await writeFile(`${privateFolder}/fixture-${app}.json`, JSON.stringify(inventory))
    }
    console.log("9 comptes locaux et trois inventaires factices ; R2 et mail production neutralisés")
  } finally { await prisma.$disconnect() }
}
main().catch(() => { console.error("Fixtures refusées ; clone local requis"); process.exitCode = 1 })
