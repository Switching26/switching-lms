import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import type { TokenType } from "@prisma/client"

export const ACTIVATION_NO_EXPIRY = new Date("2099-12-31T23:59:59Z")

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export async function generateToken(userId: string, type: TokenType): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex")
  const hashedToken = hashToken(rawToken)

  // Lien d'activation : il n'expire plus (décision Samuel du 29/09/2026). Il reste
  // valable tant que le compte n'est pas activé — l'activation, elle, invalide tous
  // les liens restants (markAllActivationTokensUsed). La date lointaine n'est qu'un
  // repère en base : verifyToken n'applique aucune échéance à ce type.
  // Réinitialisation : 1 h, inchangé.
  const expiresAt = type === "ACTIVATION"
    ? ACTIVATION_NO_EXPIRY
    : new Date(Date.now() + 60 * 60 * 1000)

  // Réinitialisation : seul le dernier lien compte. Activation : tous les liens déjà
  // reçus restent valables — un apprenant qui ouvre un ancien mail ne doit pas tomber
  // sur « lien déjà utilisé » alors qu'il ne l'a jamais utilisé.
  if (type !== "ACTIVATION") {
    await prisma.passwordResetToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    })
  }

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
  if (type === "ACTIVATION") {
    // Un compte déjà activé (ou archivé) ne se réactive jamais par un vieux lien :
    // c'est ce qui rend sûre l'absence d'échéance.
    if (record.user.archivedAt) return { valid: false, error: "Ce compte n'est plus actif. Contactez votre administrateur." } as const
    if (record.user.isActive) return { valid: false, error: "Votre compte est déjà activé : connectez-vous avec votre mot de passe." } as const
    if (record.usedAt) return { valid: false, error: "Ce lien a déjà été utilisé" } as const
    return { valid: true, record } as const
  }
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

/** À l'activation : plus aucun autre lien d'activation de ce compte ne doit servir. */
export async function markAllActivationTokensUsed(userId: string) {
  await prisma.passwordResetToken.updateMany({
    where: { userId, type: "ACTIVATION", usedAt: null },
    data: { usedAt: new Date() },
  })
}

export async function cleanExpiredTokens() {
  await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: new Date() }, type: { not: "ACTIVATION" } },
  })
}
