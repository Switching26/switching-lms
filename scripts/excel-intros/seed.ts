import { PrismaClient } from "@prisma/client"
import { readFile } from "node:fs/promises"

/** Run only after a full verified backup. The CLI refuses writes without the explicit gate. */
async function main() {
  const [inventoryPath, flag] = process.argv.slice(2)
  if (!inventoryPath || flag !== "--apply-after-backup" || !process.env.INTRO_BACKUP_VERIFIED) throw new Error("Sauvegarde vérifiée et autorisation explicite requises")
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"))
  if (inventory.entries.length !== 150 || inventory.prefix !== "introductions/excel/2026-10-v1/" ||
      new Set(inventory.entries.map((e: any) => e.id)).size !== 150 ||
      new Set(inventory.entries.map((e: any) => e.chapterId ? `chapter:${e.chapterId}` : `section:${e.sectionId}`)).size !== 150 ||
      inventory.entries.filter((e: any) => e.chapterId).length !== 123 ||
      inventory.entries.filter((e: any) => e.sectionId).length !== 27) throw new Error("27 modules et 123 leçons uniques attendus")
  const prisma = new PrismaClient()
  try {
    await prisma.$transaction(async tx => {
      for (const e of inventory.entries) {
        const target = e.chapterId ? await tx.chapter.findUnique({ where: { id: e.chapterId }, include: { simulation: true, section: true } }) : null
        const section = e.sectionId ? await tx.section.findUnique({ where: { id: e.sectionId } }) : target?.section
        if (!section || section.formationId !== "cms42cojt0001hyoy6c4w1xxb" || !e.durationSeconds || Boolean(e.chapterId) === Boolean(e.sectionId)) throw new Error("Cible invalide")
        const identity = /^m(\d{2})-(?:intro|l(\d{3}))$/.exec(e.id)
        if (!identity || Number(identity[1]) !== section.order || (target && Number(identity[2]) !== target.order)) throw new Error("Numérotation de la cible modifiée")
        if (e.chapterId && (!target || target.simulation?.app !== "EXCEL" || target.simulation.mode !== "LESSON" || !target.isPublished || target.title !== e.title)) throw new Error("Leçon modifiée ou non publiée")
        if (e.sectionId && (section.order !== e.moduleNumber || section.title !== e.title)) throw new Error("Module modifié")
        const video = e.objects.find((o: any) => o.key.endsWith(".mp4")), poster = e.objects.find((o: any) => o.key.endsWith(".jpg"))
        if (video?.key !== `${inventory.prefix}${e.id}.mp4` || poster?.key !== `${inventory.prefix}${e.id}.jpg`) throw new Error("Clés invalides")
        const data = { id: e.id, chapterId: e.chapterId ?? null, sectionId: e.sectionId ?? null,
          videoKey: video.key, posterKey: poster.key, durationSeconds: e.durationSeconds }
        const existing = await tx.introVideo.findUnique({ where: { id: e.id } })
        if (existing) {
          for (const field of Object.keys(data) as Array<keyof typeof data>) if (existing[field] !== data[field]) throw new Error("Introduction existante différente ; aucune réécriture")
        } else await tx.introVideo.create({ data })
      }
    }, { timeout: 60000 })
    console.log("150 correspondances enregistrées et contrôlées (idempotent)")
  } finally { await prisma.$disconnect() }
}
main().catch(() => { console.error("Correspondances refusées : aucun lot partiel validé"); process.exitCode = 1 })
