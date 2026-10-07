export type LearnerSession = {
  id: string
  startsAt: string
  endsAt: string
  dateLabel: string
  endLabel: string
  durationMinutes: number
  status: "PLANNED" | "DONE" | "CANCELLED"
  visioUrl: string | null
  formationLabel: string
  trainer: { firstName: string; lastName: string }
}

export type LearnerPlanningData = {
  hasTrainer: boolean
  timeZone: "Europe/Paris"
  serverTime: string
  sessions: LearnerSession[]
}
