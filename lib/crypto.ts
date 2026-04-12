import crypto from "crypto"

const ALGORITHM = "aes-256-cbc"

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required. Cannot start without a secure encryption key.")
  }
  return crypto.createHash("sha256").update(secret).digest()
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  return iv.toString("hex") + ":" + encrypted
}

export function decrypt(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(":")
  if (!ivHex || !encHex) return ""
  const iv = Buffer.from(ivHex, "hex")
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  let decrypted = decipher.update(encHex, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}
