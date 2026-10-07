// Only the server creates these envelopes. Ordinary messages remain plain text.
export const MESSAGE_PREFIX = "[LMS-CORRECTION:1]"
export type CorrectionStatus = "pending" | "corrected" | "revision"
export interface CorrectionContent {
  kind: "submission" | "feedback"
  text: string
  status: CorrectionStatus
  submissionId?: string
  file?: { name: string; key: string; size: number }
}
export function readCorrection(content: string): CorrectionContent | null {
  if (!content.startsWith(MESSAGE_PREFIX)) return null
  try {
    const value = JSON.parse(content.slice(MESSAGE_PREFIX.length))
    if (!["submission", "feedback"].includes(value.kind) || typeof value.text !== "string" ||
      !["pending", "corrected", "revision"].includes(value.status)) return null
    if (value.kind === "submission" && (!value.file || typeof value.file.name !== "string" ||
      typeof value.file.key !== "string" || !/^[a-f0-9-]{36}\.(pdf|docx?|xlsx?|zip)$/i.test(value.file.key))) return null
    return value
  } catch { return null }
}
export function writeCorrection(value: CorrectionContent): string {
  return MESSAGE_PREFIX + JSON.stringify(value)
}
export function messageText(content: string): string {
  const correction = readCorrection(content)
  return correction ? correction.text || correction.file?.name || "Correction" : content
}
export const correctionLabels: Record<CorrectionStatus, string> = {
  pending: "À corriger", corrected: "Corrigé", revision: "À reprendre",
}
