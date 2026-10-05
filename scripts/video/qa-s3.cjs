// Local-only test double: S3rver checks SigV4 expiry, but not its signature.
// This front proxy additionally verifies the real SDK query signature.
const S3rver = require("s3rver")
const http = require("node:http")
const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, ch => "%" + ch.charCodeAt(0).toString(16).toUpperCase())
const hash = value => crypto.createHash("sha256").update(value).digest("hex")
const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest()
function valid(req) {
  const url = new URL(req.url, "http://127.0.0.1:4568")
  if (req.method === "OPTIONS") return true
  if (!url.searchParams.has("X-Amz-Signature")) return Boolean(req.headers.authorization) // SDK server calls; local test credentials only.
  const scope = url.searchParams.get("X-Amz-Credential")?.split("/")
  if (!scope || scope[0] !== "S3RVER" || scope.length !== 5) return false
  const stamp = url.searchParams.get("X-Amz-Date") || ""
  const date = Date.parse(stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"))
  const expires = Number(url.searchParams.get("X-Amz-Expires"))
  if (!Number.isFinite(date) || expires < 1 || expires > 604800 || Date.now() > date + expires * 1000 || date > Date.now() + 300000) return false
  const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders")
  if (signedHeaders !== "host") return false
  const entries = Array.from(url.searchParams).filter(([key]) => key !== "X-Amz-Signature").map(([key, value]) => [encode(key), encode(value)]).sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "variant" }) || a[1].localeCompare(b[1]))
  // AWS canonical order uses byte order, not locale order.
  entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
  const query = entries.map(([key, value]) => key + "=" + value).join("&")
  const canonical = [req.method, url.pathname, query, `host:${req.headers.host}\n`, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n")
  const string = ["AWS4-HMAC-SHA256", stamp, scope.slice(1).join("/"), hash(canonical)].join("\n")
  const key = hmac(hmac(hmac(hmac("AWS4S3RVER", scope[1]), scope[2]), scope[3]), scope[4])
  const expected = crypto.createHmac("sha256", key).update(string).digest("hex")
  const received = url.searchParams.get("X-Amz-Signature") || ""
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}
async function main() {
  const directory = path.resolve(".local/s3")
  await fs.mkdir(directory, { recursive: true })
  const cors = '<CORSConfiguration><CORSRule><AllowedOrigin>http://lms-video-r2.localhost:3412</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><ExposeHeader>Content-Length</ExposeHeader></CORSRule></CORSConfiguration>'
  const s3 = new S3rver({ address: "127.0.0.1", port: 4569, directory, silent: true, configureBuckets: [{ name: "video-r2-test", configs: [cors] }] })
  await s3.run()
  const proxy = http.createServer(async (req, res) => {
    if (!valid(req)) { res.writeHead(403, { "Content-Type": "application/xml" }); res.end("<Error><Code>AccessDenied</Code><Message>Signature absente, invalide ou expirée</Message></Error>"); return }
    const url = new URL(req.url, "http://127.0.0.1:4568")
    if (req.method === "GET" && url.searchParams.has("uploadId")) {
      try {
        const uploadId = url.searchParams.get("uploadId")
        if (!/^[a-f0-9]{32}$/.test(uploadId)) throw new Error("Upload invalide")
        const dir = path.join(s3.store.getResourcePath("video-r2-test", undefined, "uploads"), uploadId)
        const names = (await fs.readdir(dir)).filter(name => /^\d+$/.test(name)).sort((a,b) => Number(a) - Number(b))
        const parts = await Promise.all(names.map(async name => `<Part><PartNumber>${name}</PartNumber><ETag>&quot;${await fs.readFile(path.join(dir, name + ".md5"), "utf8")}&quot;</ETag><Size>${(await fs.stat(path.join(dir, name))).size}</Size></Part>`))
        res.writeHead(200, { "Content-Type": "application/xml" })
        res.end(`<ListPartsResult><Bucket>video-r2-test</Bucket><UploadId>${uploadId}</UploadId><IsTruncated>false</IsTruncated>${parts.join("")}</ListPartsResult>`)
      } catch { res.writeHead(404); res.end("<Error><Code>NoSuchUpload</Code></Error>") }
      return
    }
    const request = http.request({ host: "127.0.0.1", port: 4569, method: req.method, path: req.url, headers: req.headers }, response => { res.writeHead(response.statusCode, { ...response.headers, vary: "Origin" }); response.pipe(res) })
    request.on("error", () => { res.writeHead(502); res.end() })
    req.pipe(request)
  })
  proxy.listen(4568, "127.0.0.1", () => console.log("S3 local privé : 127.0.0.1:4568 (expiration + signature SigV4 vérifiées)"))
  async function close() { proxy.close(); await s3.close(); process.exit(0) }
  process.on("SIGTERM", close)
  process.on("SIGINT", close)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
