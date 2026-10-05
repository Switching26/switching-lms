export const VIDEO_LINK_SECONDS = 3 * 60 * 60
export const VIDEO_PART_BYTES = 32 * 1024 * 1024
export const VIDEO_MAX_BYTES = 5 * 1024 ** 3

export function hasVideo(ch: { videoUrl?: string | null; videoR2Key?: string | null } | null | undefined) {
  return Boolean(ch?.videoR2Key || ch?.videoUrl)
}

export function validMasterKey(key: unknown): key is string {
  return typeof key === "string" && /^videos\/[a-zA-Z0-9_/-]+\/master\.m3u8$/.test(key)
    && !key.split("/").some(p => !p || p === "." || p === "..")
}

/** Resolve only local, relative HLS references within this immutable package. */
export function resolveHlsReference(master: string, current: string, uri: string): string {
  if (!validMasterKey(master)) throw new Error("Clé HLS invalide")
  const prefix = master.slice(0, master.lastIndexOf("/") + 1)
  if (!current.startsWith(prefix) || /[\\%?#:\s]/.test(uri) || uri.startsWith("/") || !uri) {
    throw new Error("Référence HLS externe ou invalide")
  }
  const parts = current.slice(0, current.lastIndexOf("/")).split("/")
  for (const part of uri.split("/")) {
    if (part === "..") parts.pop()
    else if (part && part !== ".") parts.push(part)
  }
  const key = parts.join("/")
  if (!key.startsWith(prefix) || !/\.(m3u8|ts|m4s|mp4|aac|key)$/i.test(key)) {
    throw new Error("Référence hors du paquet HLS")
  }
  return key
}

export function hlsReferences(text: string): string[] {
  if (!text.startsWith("#EXTM3U") || text.length > 1024 * 1024) throw new Error("Playlist HLS invalide")
  // Variable substitution can otherwise bypass local reference validation.
  if (text.includes("#EXT-X-DEFINE") || text.includes("{$")) throw new Error("Variables HLS interdites")
  const refs: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() && !line.startsWith("#")) refs.push(line.trim())
    for (const match of Array.from(line.matchAll(/\bURI="([^"]*)"/g))) refs.push(match[1])
    if (line.startsWith("#") && /\bURI=/.test(line) && !/\bURI="[^"]*"/.test(line)) throw new Error("URI HLS non citée")
  }
  return refs
}

export async function rewriteHls(text: string, rewrite: (uri: string) => Promise<string>) {
  const refs = Array.from(new Set(hlsReferences(text)))
  const mapped = new Map(await Promise.all(refs.map(async uri => [uri, await rewrite(uri)] as const)))
  return text.split(/\r?\n/).map(line => {
    if (line.trim() && !line.startsWith("#")) return mapped.get(line.trim())!
    return line.replace(/\bURI="([^"]*)"/g, (_, uri) => `URI="${mapped.get(uri)}"`)
  }).join("\n")
}
