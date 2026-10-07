import { readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { readInventory } from "./common"

async function main() {
  const [source, inventoryPath, proofPath, startArg = "0", limitArg = "40", flag] = process.argv.slice(2)
  if (flag !== "--apply-after-go" || process.env.INTRO_PHASE2_GO !== "BUREAUTIQUE_207") throw new Error("GO PHASE 2 exigé")
  const start = Number(startArg), limit = Number(limitArg)
  if (!source || !inventoryPath || !proofPath || !Number.isInteger(start) || start < 0 || !Number.isInteger(limit) || limit < 1 || limit > 40) throw new Error("Paramètres invalides")
  const inventory = await readInventory(inventoryPath)
  if (!inventory.finalizedAt || !Number.isFinite(Date.parse(inventory.finalizedAt))) throw new Error("Inventaire final réel exigé, fixtures interdites")
  const objects = inventory.entries.flatMap(entry => entry.objects)
  if (start >= objects.length) throw new Error("Lot hors inventaire")
  const keychain = (service: string) => execFileSync("security", ["find-generic-password", "-a", "switching-lms-videos", "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  const client = new S3Client({ endpoint: keychain("R2 LMS endpoint"), region: "auto", forcePathStyle: true,
    credentials: { accessKeyId: keychain("R2 LMS access key id"), secretAccessKey: keychain("R2 LMS secret access key") },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", maxAttempts: 2 })
  const bucket = "switching-lms-videos", deadline = Date.now() + 270000
  const proofs = []
  try {
    for (const object of objects.slice(start, start + limit)) {
      if (Date.now() > deadline - 45000) throw new Error("Reprendre dans une nouvelle commande bornée")
      const body = await readFile(resolve(source, basename(object.key)))
      if (body.length !== object.size || createHash("sha256").update(body).digest("hex") !== object.sha256) throw new Error("Source modifiée")
      const signal = AbortSignal.timeout(Math.min(40000, deadline - Date.now()))
      let existing
      try { existing = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: object.key }), { abortSignal: signal }) }
      catch (error: any) { if (error.$metadata?.httpStatusCode !== 404) throw error }
      if (existing && (existing.ContentLength !== object.size || existing.Metadata?.sha256 !== object.sha256)) throw new Error("Objet distant différent")
      if (!existing) await client.send(new PutObjectCommand({ Bucket: bucket, Key: object.key, Body: body,
        ContentType: object.key.endsWith("mp4") ? "video/mp4" : "image/jpeg", CacheControl: "private, max-age=300",
        Metadata: { sha256: object.sha256 }, IfNoneMatch: "*" }), { abortSignal: signal })
      const remote = await client.send(new GetObjectCommand({ Bucket: bucket, Key: object.key }), { abortSignal: signal })
      const hash = createHash("sha256"); let size = 0
      for await (const chunk of remote.Body as AsyncIterable<Uint8Array>) { size += chunk.length; hash.update(chunk) }
      if (size !== object.size || hash.digest("hex") !== object.sha256) throw new Error("Contrôle distant refusé")
      proofs.push({ ...object, verifiedAt: new Date().toISOString(), operation: existing ? "identical-skip" : "created" })
      await writeFile(proofPath, JSON.stringify(proofs, null, 2) + "\n")
      console.log(`${inventory.application} : ${start + proofs.length}/${objects.length} vérifié`)
    }
  } finally { client.destroy() }
}
main().catch(() => { console.error("Envoi refusé/interrompu ; reprendre depuis les reçus, aucun écrasement"); process.exitCode = 1 })
