import { BookOpen, ChartNoAxesColumn, Mail, UsersRound } from "lucide-react"
import { Fragment } from "react"
import { emailTypeLabel } from "@/lib/email-type-labels"

type Activity = { id: string; type: string; sentAt: Date; user: { firstName: string; lastName: string } }
const day = (date: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" }).format(date)
export default function ActivityFeed({ activities }: { activities: Activity[] }) {
  return activities.length ? <div className="lms-activity-feed">{activities.map((log, i) => {
    const Icon = log.type.startsWith("ASSESSMENT") ? ChartNoAxesColumn : log.type.includes("FORMATION") || log.type.includes("CHAPTER") ? BookOpen : log.type.includes("ACCOUNT") ? UsersRound : Mail
    return <Fragment key={log.id}>
      {(i === 0 || day(log.sentAt) !== day(activities[i - 1].sentAt)) && <h3 className="lms-activity-day">{day(log.sentAt)}</h3>}
      <div className="lms-activity-row"><span className="lms-activity-icon"><Icon size={19} strokeWidth={1.5} /></span><span className="grow min-w-0"><strong>{emailTypeLabel(log.type)}</strong><small>{log.user.firstName} {log.user.lastName}</small></span><time dateTime={log.sentAt.toISOString()}>{new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(log.sentAt)}</time></div>
    </Fragment>
  })}</div> : <p className="text-sm text-ink-50 py-6">Aucune activité récente.</p>
}
