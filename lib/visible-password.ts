import { decrypt, encrypt } from "@/lib/crypto"

export function encryptVisiblePassword(password: string): string {
  return encrypt(password)
}

export function decryptVisiblePassword(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return decrypt(value) || null
  } catch {
    return null
  }
}
