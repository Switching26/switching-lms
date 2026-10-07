/** Remplace uniquement les 207 fixtures privées sur le clone, jamais en production. */
import { PrismaClient } from "@prisma/client"
import { readFile } from "node:fs/promises"
import { localDatabaseOnly, verifyBackupProof, readInventory } from "./common"
import { encrypt } from "../../lib/crypto"
async function main() {
  localDatabaseOnly()
  await verifyBackupProof(false)
  const [privateFolder, ...paths] = process.argv.slice(2)
  if (paths.length !== 3) throw new Error("Trois inventaires définitifs requis")
  const inventories = await Promise.all(paths.map(readInventory))
  if (inventories.some(i => !i.finalizedAt) || new Set(inventories.map(i => i.application)).size !== 3) throw new Error("Inventaires réels requis")
  const prisma = new PrismaClient()
  try {
    const excelBefore = await prisma.introVideo.findMany({ where: { videoKey: { startsWith: "introductions/excel/" } }, orderBy: { id: "asc" } })
    await prisma.$transaction(async tx => {
      const ids: string[] = []
      for (const inventory of inventories) {
        const old = JSON.parse(await readFile(`${privateFolder}/fixture-${inventory.application}.json`, "utf8"))
        for (const entry of inventory.entries) {
          const fixture = old.entries.find((e: any) => e.introId === entry.introId)
          const row = await tx.introVideo.findUniqueOrThrow({ where: { id: entry.introId } })
          if (!fixture || row.durationSeconds !== 1 || row.chapterId !== (entry.chapterId ?? null) || row.sectionId !== (entry.sectionId ?? null) || row.videoKey !== fixture.objects[0].key || row.posterKey !== fixture.objects[1].key) throw new Error("Fixture locale différente")
          ids.push(entry.introId)
        }
      }
      if (ids.length !== 207 || new Set(ids).size !== 207) throw new Error("207 fixtures exactes requises")
      await tx.introVideo.deleteMany({ where: { id: { in: ids } } })
      await tx.systemConfig.update({ where: { key: "r2_endpoint" }, data: { value: encrypt("http://127.0.0.1:3119/") } })
    }, { timeout: 60000 })
    const excelAfter = await prisma.introVideo.findMany({ where: { videoKey: { startsWith: "introductions/excel/" } }, orderBy: { id: "asc" } })
    if (excelBefore.length !== 150 || JSON.stringify(excelBefore) !== JSON.stringify(excelAfter)) throw new Error("Excel modifié")
    console.log("207 fixtures factices retirées du clone exact ; relais S3 local configuré ; Excel 150 inchangées")
  } finally { await prisma.$disconnect() }
}
main().catch(() => { console.error("Préparation locale refusée"); process.exitCode = 1 })
