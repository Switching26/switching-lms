"use client"

import { useEffect, useRef } from "react"
import { dayKey, parisInput, parisInputToIso, timeLabel } from "./data"

export type CalendarItem = { id: string; startsAt: string; endsAt: string; label: string; kind: "session" | "unavailable" }

export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return dayKey(date)
}
export function weekDays(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  const monday = shiftDay(day, -(weekday + 6) % 7)
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i))
}
const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "Europe/Paris" }).format(new Date(`${day}T12:00:00Z`))

export default function CalendarGrid({ days, items, onSlot, onItem, onDay, month = false, selectedDay }: {
  days: string[]; items: CalendarItem[]; onSlot: (localDate: string) => void; onItem: (item: CalendarItem) => void
  onDay: (day: string) => void; month?: boolean; selectedDay: string
}) {
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scroll.current) return
    if (!month) scroll.current.scrollTop = 8 * 64 - 40
    scroll.current.scrollLeft = innerWidth <= 760 && !month ? Math.max(0, days.indexOf(selectedDay)) * 130 : 0
  }, [month, days.join(","), selectedDay])
  if (month) return <div className="trainer-calendar-scroll trainer-month-scroll">
    <div className="trainer-month-grid" role="group" aria-label="Calendrier du mois">
      {weekDays(selectedDay).map(day => <span className="trainer-month-weekday" key={day}>{dayLabel(day, { weekday: "short" })}</span>)}
      {days.map(day => {
        const from = parisInputToIso(`${day}T00:00`), to = parisInputToIso(`${shiftDay(day, 1)}T00:00`)
        const rows = items.filter(item => item.startsAt < to && item.endsAt > from)
        return <section key={day} className={`trainer-month-cell ${day.slice(0, 7) !== selectedDay.slice(0, 7) ? "is-outside" : ""} ${day === dayKey(new Date()) ? "is-today" : ""}`}>
          <button className="trainer-month-day" aria-label={`Voir le ${dayLabel(day, { weekday: "long", day: "numeric", month: "long" })}`} onClick={() => onDay(day)}>{Number(day.slice(-2))}</button>
          {rows.map(item => <button key={item.id} className={`trainer-month-event is-${item.kind}`} onClick={() => onItem(item)}><strong>{dayKey(item.startsAt) < day ? "Suite" : timeLabel(item.startsAt)}</strong><span>{item.label}</span></button>)}
          {!rows.length && <button className="trainer-month-free" onClick={() => onSlot(`${day}T09:00`)} aria-label={`Ajouter une séance le ${dayLabel(day, { day: "numeric", month: "long" })}`}>Libre</button>}
        </section>
      })}
    </div>
  </div>
  return <div ref={scroll} className="trainer-calendar-scroll trainer-time-scroll" role="group" aria-label="Grille horaire de l’agenda">
    <div className="trainer-time-grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(${days.length > 1 ? 130 : 220}px, 1fr))` }}>
      <div className="trainer-time-corner">Paris</div>
      {days.map(day => <button key={day} className={`trainer-time-heading ${day === dayKey(new Date()) ? "is-today" : ""}`} onClick={() => onDay(day)}>{dayLabel(day, { weekday: "short", day: "numeric", month: "short" })}</button>)}
      <div className="trainer-hour-axis">{Array.from({ length: 24 }, (_, hour) => <span key={hour}>{hour} h</span>)}</div>
      {days.map(day => {
        const from = parisInputToIso(`${day}T00:00`), to = parisInputToIso(`${shiftDay(day, 1)}T00:00`)
        const rows = items.filter(item => item.startsAt < to && item.endsAt > from).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        const minute = (value: string) => { const input = parisInput(value); return Number(input.slice(11, 13)) * 60 + Number(input.slice(14, 16)) }
        return <div key={day} className="trainer-time-column">
          {Array.from({ length: 48 }, (_, slot) => {
            const local = `${day}T${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`
            // Spring clock changes can remove a local slot. Keep it unavailable.
            let instant: string | null = null
            try { instant = parisInputToIso(local) } catch { /* nonexistent Paris time */ }
            const occupied = !instant || rows.some(item => item.startsAt <= instant! && item.endsAt > instant!)
            return <button key={slot} className="trainer-time-slot" disabled={occupied} aria-label={`${dayLabel(day, { weekday: "long", day: "numeric", month: "long" })}, ${Math.floor(slot / 2)} h ${slot % 2 ? "30" : "00"} · ${occupied ? "occupé" : "créer une séance"}`} onClick={() => onSlot(local)} />
          })}
          {rows.map(item => {
            const start = item.startsAt <= from ? 0 : minute(item.startsAt)
            const end = item.endsAt >= to ? 1440 : minute(item.endsAt)
            const overlaps = rows.filter(other => other.startsAt < item.endsAt && other.endsAt > item.startsAt)
            const lane = overlaps.findIndex(other => other.id === item.id)
            return <button key={item.id} className={`trainer-calendar-event is-${item.kind}`} style={{ top: start / 60 * 64, height: Math.max(30, (end - start) / 60 * 64), left: `calc(${lane / overlaps.length * 100}% + 3px)`, width: `calc(${100 / overlaps.length}% - 6px)` }} onClick={() => onItem(item)} aria-label={`${item.label}, ${timeLabel(item.startsAt)} à ${timeLabel(item.endsAt)}`}>
              <strong>{timeLabel(item.startsAt)}–{timeLabel(item.endsAt)}</strong><span>{item.label}</span>
            </button>
          })}
        </div>
      })}
    </div>
  </div>
}
