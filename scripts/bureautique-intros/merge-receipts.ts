import { readFile, writeFile } from "node:fs/promises"
import { readInventory } from "./common"

async function main() {
  const [inventoryPath, output, ...paths] = process.argv.slice(2)
  if (!output || !paths.length) throw new Error("Inventaire et lots de reçus exigés")
  const inventory = await readInventory(inventoryPath)
  const byKey = new Map<string, any>()
  for (const path of paths) for (const receipt of JSON.parse(await readFile(path, "utf8"))) {
    const previous = byKey.get(receipt.key)
    if (previous && (previous.size !== receipt.size || previous.sha256 !== receipt.sha256)) throw new Error("Reçus contradictoires")
    byKey.set(receipt.key, receipt)
  }
  const objects = inventory.entries.flatMap(e => e.objects)
  if (byKey.size !== objects.length) throw new Error("Reçus manquants ou supplémentaires")
  const receipts = objects.map(object => {
    const receipt = byKey.get(object.key)
    if (!receipt || receipt.size !== object.size || receipt.sha256 !== object.sha256 || !receipt.verifiedAt || !["created", "identical-skip"].includes(receipt.operation)) throw new Error("Objet non vérifié")
    return receipt
  })
  await writeFile(output, JSON.stringify(receipts, null, 2) + "\n")
  console.log(`${inventory.application} : ${receipts.length} reçus R2 complets`)
}
main().catch(() => { console.error("Assemblage des reçus refusé"); process.exitCode = 1 })
