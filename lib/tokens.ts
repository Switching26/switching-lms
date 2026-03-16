import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import type { TokenType } from "@prisma/client"

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export async function generateToken(userId: string, type: TokenType): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex")
  const hashedToken = hashToken(rawToken)

  const expiresAt = type === "ACTIVATION"
    ? new Date(Date.now() + 72 * 60 * 60 * 1000)  // 72h
    : new Date(Date.now() + 60 * 60 * 1000)         // 1h

  // Invalidate previous tokens of same type for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  })

  await prisma.passwordResetToken.create({
    data: { userId, token: hashedToken, type, expiresAt },
  })

  return rawToken
}

export async function verifyToken(rawToken: string, type: TokenType) {
  const hashedToken = hashToken(rawToken)

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: hashedToken },
    include: { user: { include: { partner: true } } },
  })

  if (!record) return { valid: false, error: "Token invalide" } as const
  if (record.type !== type) return { valid: false, error: "Token invalide" } as const
  if (record.usedAt) return { valid: false, error: "Ce lien a déjà été utilisé" } as const
  if (record.expiresAt < new Date()) return { valid: false, error: "Ce lien a expiré" } as const

  return { valid: true, record } as const
}

export async function markTokenUsed(rawToken: string) {
  const hashedToken = hashToken(rawToken)
  await prisma.passwordResetToken.update({
    where: { token: hashedToken },
    data: { usedAt: new Date() },
  })
}

export async function cleanExpiredTokens() {
  await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
}
