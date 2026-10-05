import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { VIDEO_LINK_SECONDS, validMasterKey, hlsReferences, resolveHlsReference } from "./hls"

export const R2_KEYS = ["r2_endpoint", "r2_bucket", "r2_access_key", "r2_secret_key", "video_worker_token"]
export interface R2Config { endpoint: string; bucket: string; accessKey: string; secretKey: string }

export function validateR2Config(config: R2Config) {
  const url = new URL(config.endpoint)
  const local = ["localhost", "127.0.0.1", "127.0.0.2", "[::1]"].includes(url.hostname)
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Endpoint S3 : HTTPS requis (HTTP autorisé uniquement en local), sans chemin")
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)) throw new Error("Nom du bucket invalide")
  if (!config.accessKey || !config.secretKey) throw new Error("Identifiants R2 manquants")
}

export async function getR2Config(): Promise<R2Config> {
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: R2_KEYS } } })
  const values = Object.fromEntries(rows.map(row => [row.key, decrypt(row.value)]))
  const config = { endpoint: values.r2_endpoint, bucket: values.r2_bucket, accessKey: values.r2_access_key, secretKey: values.r2_secret_key }
  if (Object.values(config).some(v => !v)) throw new Error("Stockage vidéo R2 non configuré")
  validateR2Config(config)
  return config
}

export function r2Client(config: R2Config) {
  return new S3Client({ endpoint: config.endpoint, region: "auto", forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" })
}

export async function loadPlaylist(client: S3Client, bucket: string, key: string) {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!object.Body || (object.ContentLength ?? 0) > 1024 * 1024) throw new Error("Playlist trop volumineuse")
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error("Playlist trop volumineuse")
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

export function signVideoObject(client: S3Client, bucket: string, key: string, expiresIn = VIDEO_LINK_SECONDS) {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn })
}

// Check all referenced objects, not just the master, before activation.
export async function validateRemotePackage(client: S3Client, bucket: string, master: string) {
  if (!validMasterKey(master)) throw new Error("Clé HLS invalide")
  const seen = new Set<string>()
  async function visit(key: string) {
    if (seen.has(key)) return
    seen.add(key)
    if (seen.size > 100000) throw new Error("Paquet HLS trop volumineux")
    if (key.endsWith(".m3u8")) {
      const text = await loadPlaylist(client, bucket, key)
      const refs = hlsReferences(text)
      if (!refs.length) throw new Error("Playlist vide")
      // Sequential playlist walk; segment HEADs in bounded groups.
      for (let i = 0; i < refs.length; i += 16) {
        await Promise.all(refs.slice(i, i + 16).map(uri => visit(resolveHlsReference(master, key, uri))))
      }
    } else await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  }
  await visit(master)
}
