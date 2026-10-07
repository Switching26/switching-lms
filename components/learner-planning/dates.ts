import type { LearnerPlanningData, LearnerSession } from "./data"

const parisDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long",
})
const parisTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
})

export function parisTimeLabel(date: Date): string {
  const parts = parisTime.formatToParts(date)
  const hour = parts.find(part => part.type === "hour")!.value
  const minute = parts.find(part => part.type === "minute")!.value
  return `${Number(hour)} h ${minute}`
}

export function parisDateLabel(date: Date): string {
  return `${parisDate.format(date)}, ${parisTimeLabel(date)}`
}

/** Defend against legacy/imported unsafe links as well as validated V2 writes. */
export function safeVisioUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const remainder = minutes % 60
  return `${Math.floor(minutes / 60)} h${remainder ? ` ${String(remainder).padStart(2, "0")}` : ""}`
}

export function splitSessions(data: LearnerPlanningData) {
  const now = new Date(data.serverTime).getTime()
  const upcoming = data.sessions.filter(session => session.status !== "DONE" && new Date(session.endsAt).getTime() > now)
  const past = data.sessions.filter(session => !upcoming.includes(session)).reverse()
  const next = upcoming.find(session => session.status === "PLANNED") || null
  return { now, upcoming, past, next }
}

export function sessionStatusLabel(session: LearnerSession, now: number): string {
  if (session.status === "CANCELLED") return "Annulée"
  if (session.status === "DONE") return "Réalisée"
  if (new Date(session.endsAt).getTime() <= now) return "Passée"
  if (new Date(session.startsAt).getTime() <= now) return "En cours"
  return "Prévue"
}
