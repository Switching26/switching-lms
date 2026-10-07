import { PrismaClient } from "@prisma/client"
import { readFile } from "node:fs/promises"
import { APPS, readInventory, localDatabaseOnly, verifyBackupProof, type Inventory } from "./common"

async function main() {
  const [inventoryPath, receiptsPath, flag = "--dry-run"] = process.argv.slice(2)
  if (!inventoryPath) throw new Error("seed.ts inventaire.json reçus.json [--dry-run|--apply-local|--apply-after-backup]")
  if (!["--dry-run", "--apply-local", "--apply-after-backup"].includes(flag)) throw new Error("Mode inconnu")
  const apply = flag !== "--dry-run"
  if (apply && !process.env.INTRO_BACKUP_VERIFIED) throw new Error("Sauvegarde vérifiée requise")
  if (flag === "--apply-local") localDatabaseOnly()
  if (flag === "--apply-after-backup" && process.env.INTRO_PHASE2_GO !== "BUREAUTIQUE_207") throw new Error("GO PHASE 2 exigé")
  if (apply) await verifyBackupProof(flag === "--apply-after-backup")
  const inventory: Inventory = await readInventory(inventoryPath)
  if (flag === "--apply-after-backup") {
    if (!inventory.finalizedAt || !Number.isFinite(Date.parse(inventory.finalizedAt))) throw new Error("Inventaire final réel exigé, fixtures interdites")
    const receipts = JSON.parse(await readFile(receiptsPath, "utf8"))
    const objects = inventory.entries.flatMap(e => e.objects)
    if (receipts.length !== objects.length || new Set(receipts.map((r: any) => r.key)).size !== objects.length) throw new Error("Reçus R2 incomplets")
    for (const object of objects) {
      const receipt = receipts.find((r: any) => r.key === object.key)
      if (!receipt || receipt.size !== object.size || receipt.sha256 !== object.sha256 || !receipt.verifiedAt || !["created", "identical-skip"].includes(receipt.operation)) throw new Error("Objet R2 non vérifié")
    }
  }
  const prisma = new PrismaClient()
  try {
    const result = await prisma.$transaction(async tx => {
      if (!apply) await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
      const spec = APPS[inventory.application]
      const formation = await tx.formation.findUnique({ where: { id: spec.formationId } })
      if (!formation?.isPublished || formation.deletedAt || inventory.entries.some(e => e.formationTitle !== formation.title)) throw new Error("Formation modifiée")
      const sections = await tx.section.findMany({ where: { formationId: spec.formationId }, include: {
        chapters: { where: { isPublished: true }, orderBy: [{ order: "asc" }, { id: "asc" }], include: { simulation: { select: { app: true, mode: true } } } } } })
      if (sections.length !== spec.modules) throw new Error("Nombre de modules modifié")
      for (const section of sections) {
        const actual = section.chapters.filter(c => c.simulation?.app === spec.app && c.simulation.mode === "LESSON").map(c => c.id).sort()
        const expected = inventory.entries.filter(e => e.chapterId && e.moduleNumber === section.order).map(e => e.chapterId!).sort()
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Parcours publié modifié")
      }
      const pending = []
      for (const e of inventory.entries) {
        const section = sections.find(s => e.sectionId ? s.id === e.sectionId : s.chapters.some(c => c.id === e.chapterId))
        if (!section || section.order !== e.moduleNumber || section.title !== e.sectionTitle) throw new Error("Module modifié")
        const lessons = section.chapters.filter(c => c.simulation?.app === spec.app && c.simulation.mode === "LESSON")
        if (e.sectionId && (e.title !== section.title || lessons[0]?.id !== e.firstChapterId)) throw new Error("Première leçon modifiée")
        const target = e.chapterId ? section.chapters.find(c => c.id === e.chapterId) : null
        if (e.chapterId && (!target || target.title !== e.title || target.order !== e.chapterOrder || target.simulation?.app !== spec.app || target.simulation.mode !== "LESSON" || !target.isPublished)) throw new Error("Leçon modifiée")
        const video = e.objects.find(o => o.key.endsWith(".mp4"))!, poster = e.objects.find(o => o.key.endsWith(".jpg"))!
        const data = { id: e.introId, chapterId: e.chapterId ?? null, sectionId: e.sectionId ?? null,
          videoKey: video.key, posterKey: poster.key, durationSeconds: e.durationSeconds }
        const existing = await tx.introVideo.findFirst({ where: { OR: [{ id: e.introId }, ...(e.chapterId ? [{ chapterId: e.chapterId }] : [{ sectionId: e.sectionId! }])] } })
        if (existing) {
          for (const field of Object.keys(data) as Array<keyof typeof data>) if (existing[field] !== data[field]) throw new Error("Introduction existante différente : aucun écrasement")
        } else pending.push(data)
      }
      if (apply) for (const data of pending) await tx.introVideo.create({ data })
      return { created: pending.length, skipped: inventory.entries.length - pending.length }
    }, { timeout: 60000, isolationLevel: "Serializable" })
    console.log(`${inventory.application} : ${apply ? "enregistré" : "lecture seule"}, ${result.created} à créer, ${result.skipped} identiques`)
  } finally { await prisma.$disconnect() }
}
main().catch(() => { console.error("Correspondances refusées : aucun lot partiel validé"); process.exitCode = 1 })
