import { readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"

/** Bounded, create-only upload. A conflicting object is never overwritten. */
async function main() {
  const [source, inventoryPath, proofPath, startArg = "0", limitArg = "40"] = process.argv.slice(2)
  const start = Number(startArg), limit = Number(limitArg)
  if (!source || !inventoryPath || !proofPath || !Number.isInteger(start) || !Number.isInteger(limit) || limit < 1 || limit > 60) throw new Error("Paramètres invalides")
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"))
  if (inventory.prefix !== "introductions/excel/2026-10-v1/" || inventory.entries.length !== 150) throw new Error("Inventaire inattendu")
  const keychain = (service: string) => execFileSync("security", ["find-generic-password", "-a", "switching-lms-videos", "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  const client = new S3Client({ endpoint: keychain("R2 LMS endpoint"), region: "auto", forcePathStyle: true,
    credentials: { accessKeyId: keychain("R2 LMS access key id"), secretAccessKey: keychain("R2 LMS secret access key") },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", maxAttempts: 3 })
  const bucket = "switching-lms-videos"
  const objects = inventory.entries.flatMap((entry: any) => entry.objects)
  const proofs = []
  for (const object of objects.slice(start, start + limit)) {
    if (!/^introductions\/excel\/2026-10-v1\/m(?:0[1-9]|1[0-9]|2[0-7])-(?:intro|l[0-9]{3})\.(mp4|jpg)$/.test(object.key)) throw new Error("Préfixe interdit")
    const body = await readFile(resolve(source, basename(object.key)))
    if (body.length !== object.size || createHash("sha256").update(body).digest("hex") !== object.sha256) throw new Error("Source modifiée")
    let existing
    try { existing = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: object.key })) }
    catch (error: any) { if (error.$metadata?.httpStatusCode !== 404) throw error }
    if (existing && (existing.ContentLength !== object.size || existing.Metadata?.sha256 !== object.sha256)) throw new Error("Objet distant différent : aucune réécriture autorisée")
    if (!existing) await client.send(new PutObjectCommand({ Bucket: bucket, Key: object.key, Body: body,
      ContentType: object.key.endsWith("mp4") ? "video/mp4" : "image/jpeg", CacheControl: "private, max-age=300",
      Metadata: { sha256: object.sha256 }, IfNoneMatch: "*" }))
    const remote = await client.send(new GetObjectCommand({ Bucket: bucket, Key: object.key }))
    const hash = createHash("sha256"); let size = 0
    for await (const chunk of remote.Body as AsyncIterable<Uint8Array>) { size += chunk.length; hash.update(chunk) }
    if (size !== object.size || hash.digest("hex") !== object.sha256) throw new Error("Contrôle distant refusé")
    proofs.push({ ...object, verifiedAt: new Date().toISOString(), operation: existing ? "identical-skip" : "created" })
    console.log(`Vérifié ${start + proofs.length}/300 : ${basename(object.key)}`)
  }
  await writeFile(proofPath, JSON.stringify(proofs, null, 2) + "\n")
  client.destroy()
}
main().catch(() => { console.error("Envoi interrompu : contrôler les paramètres/accès R2 ou un conflit, sans réécriture"); process.exitCode = 1 })
