export interface TrainerSession {
  id: string
  assignmentId: string
  startsAt: string
  durationMinutes: number
  status: "PLANNED" | "DONE" | "CANCELLED"
  note: string | null
  visioUrl: string | null
  reminderSentAt?: string | null
  cancelledAt?: string | null
  notifiedAt?: string | null
}

export type ContactKind = "CONTACT" | "RELANCE" | "REPONSE" | "PLANNING_VALIDE" | "PAS_DE_RETOUR" | "ACCES_SILAE_ENVOYE" | "NOTE"
export const contactKinds: { value: ContactKind; label: string }[] = [
  { value: "CONTACT", label: "Premier contact" }, { value: "RELANCE", label: "Relance" },
  { value: "REPONSE", label: "Réponse" }, { value: "PLANNING_VALIDE", label: "Planning validé" },
  { value: "PAS_DE_RETOUR", label: "Pas de retour" }, { value: "ACCES_SILAE_ENVOYE", label: "Accès SILAE envoyé" },
  { value: "NOTE", label: "Note" },
]
export interface ContactEvent { id: string; kind: ContactKind; occurredAt: string; note: string | null; createdAt: string }
export interface TrainerUnavailability { id: string; startsAt: string; endsAt: string; note: string | null }
export type AgendaSession = TrainerSession & { assignment: Pick<TrainerAssignment, "id" | "firstName" | "lastName"> }
export interface TrainerAgenda { sessions: AgendaSession[]; unavailability: TrainerUnavailability[]; timeZone: string }

export interface TrainerAssignment {
  id: string
  learnerId: string | null
  enrollmentId: string | null
  civility: string | null
  firstName: string
  lastName: string
  email: string
  phone: string | null
  formationLabel: string
  visioHours: number | null
  hasElearning: boolean
  adminStartAt: string
  adminEndAt: string | null
  visioStartAt: string | null
  contactDoneAt: string | null
  silaeAccessSentAt: string | null
  planningAgreedAt: string | null
  noAnswerAt: string | null
  planningNote: string | null
  archivedAt: string | null
  sessions?: TrainerSession[]
}

export interface TrainerProgress {
  hasElearning: boolean
  percent: number
  lastActivity: string | null
  formations: { completedChapters?: number; totalChapters?: number }[]
}

export interface AssignmentSteps {
  contactDone?: boolean
  silaeAccessSent?: boolean
  planningAgreed?: boolean
  noAnswer?: boolean
  planningNote?: string | null
}

/** All business requests stay on the trainer API. Writes follow an explicit UI review. */
export async function trainerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/trainer/${path}`, {
    ...init, cache: "no-store",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(response.status === 409 && data?.conflicts
    ? `${data.error || "Ce créneau est déjà occupé."} Choisissez un autre horaire : une séance ou une indisponibilité chevauche ce créneau.`
    : data?.error || (response.status === 401 ? "Votre session a expiré. Reconnectez-vous." : "Les données n’ont pas pu être enregistrées ou chargées."))
  return data as T
}

export function updateSteps(id: string, input: AssignmentSteps) {
  return trainerRequest<TrainerAssignment>(`assignments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) })
}

export const studentName = (student: Pick<TrainerAssignment, "firstName" | "lastName">) => `${student.firstName} ${student.lastName}`
export function dateLabel(value?: string | null, short = false) {
  return value ? new Intl.DateTimeFormat("fr-FR", { ...(short ? { day: "2-digit", month: "2-digit" } as const : { weekday: "long", day: "numeric", month: "long", year: "numeric" } as const), timeZone: "Europe/Paris" }).format(new Date(value)) : "À convenir"
}
export function timeLabel(value: string) {
  const parts = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" }).formatToParts(new Date(value))
  return `${Number(parts.find(part => part.type === "hour")!.value)} h ${parts.find(part => part.type === "minute")!.value}`
}
export function dateTimeLabel(value: string) {
  return `${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date(value))}, ${timeLabel(value)}`
}
export function planningConfirmed(student: TrainerAssignment) {
  return !!student.planningAgreedAt && (!student.noAnswerAt || student.planningAgreedAt > student.noAnswerAt)
}
export function safeVisioUrl(value?: string | null) {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null } catch { return null }
}
/** Never claim a mail was sent when the route reports a partial success. */
export function notificationWarning(result: unknown): string {
  if (!result || typeof result !== "object") return ""
  const row = result as { warning?: string; emailSent?: boolean; mailSent?: boolean; notification?: { sent?: boolean; error?: string; message?: string; status?: string; reason?: string; skipped?: boolean; unchanged?: boolean } }
  if (row.warning) return row.warning
  if (row.notification?.unchanged || row.notification?.status === "unchanged" || row.notification?.reason === "unchanged") return ""
  if (row.notification?.skipped || row.notification?.status === "skipped") {
    if (row.notification.reason === "busy") return "La séance est enregistrée. Sa notification est déjà en cours de traitement."
    if (row.notification.reason === "obsolete") return "La séance est enregistrée. La notification précédente est devenue inutile après un changement du planning."
    if (row.notification.reason === "unavailable") return "La séance est enregistrée. La notification a été sautée : vérifiez que l’élève est toujours rattaché à votre espace."
    return ""
  }
  if (row.emailSent === false || row.mailSent === false || row.notification?.sent === false) return row.notification?.message || row.notification?.error || "L’action a été enregistrée, mais le mail n’a pas été envoyé."
  return ""
}
export function dayKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Paris" }).formatToParts(new Date(value))
  const part = (key: string) => parts.find(p => p.type === key)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}
export function parisInput(value: string | Date) {
  const date = new Date(value)
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" }).formatToParts(date)
  return `${dayKey(date)}T${parts.find(p => p.type === "hour")!.value}:${parts.find(p => p.type === "minute")!.value}`
}
/** Interpret datetime-local explicitly in Paris, including summer/winter offset. */
export function parisInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Choisissez une date et une heure valides.")
  const target = Date.parse(value + ":00Z")
  let instant = target
  for (let i = 0; i < 3; i++) instant += target - Date.parse(parisInput(new Date(instant)) + ":00Z")
  if (!Number.isFinite(instant) || parisInput(new Date(instant)) !== value) throw new Error("Cette heure n’existe pas à Paris. Choisissez une autre heure.")
  return new Date(instant).toISOString()
}
