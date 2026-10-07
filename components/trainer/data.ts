export interface TrainerSession {
  id: string
  assignmentId: string
  startsAt: string
  durationMinutes: number
  status: "PLANNED" | "DONE" | "CANCELLED"
  note: string | null
}

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

/** All business requests stay on the trainer API; no account or email side effects. */
export async function trainerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/trainer/${path}`, {
    ...init, cache: "no-store",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || (response.status === 401 ? "Votre session a expiré. Reconnectez-vous." : "Les données n’ont pas pu être enregistrées ou chargées."))
  return data as T
}

export function updateSteps(id: string, input: AssignmentSteps) {
  return trainerRequest<TrainerAssignment>(`assignments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) })
}

export const studentName = (student: Pick<TrainerAssignment, "firstName" | "lastName">) => `${student.firstName} ${student.lastName}`
export function dateLabel(value?: string | null, short = false) {
  return value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", ...(!short ? { year: "numeric" } as const : {}), timeZone: "Europe/Paris" }).format(new Date(value)) : "À convenir"
}
export function timeLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(value))
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
