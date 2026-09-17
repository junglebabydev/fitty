// Weekly adherence across training, nutrition logging, sleep and mind check-ins (PRD §8 Progress). Pure — no db/react imports.
import type { SleepRecord, WorkoutSession } from '../../domain/types'
import { addDays, dateOf, fmtDate, startOfWeek } from '../../lib/util'

/** A night counts as "good" at 7 h or more. */
export const SLEEP_GOOD_MIN = 420
export const DEFAULT_WEEKS = 4

export interface IntakeDayLite { date: string; logged: boolean }

export interface WeekAdherence {
  weekStart: string
  weekEnd: string
  label: string
  /** True for the week containing `today` (partial — future days are still open). */
  current: boolean
  training: { done: number; planned: number }
  nutrition: { logged: number; days: number }
  sleep: { nights: number; days: number }
  /** Distinct days with a mood check-in. */
  mind: { checkedIn: number; days: number }
}

export interface AdherenceInput {
  today: string
  weeks?: number
  sessions: WorkoutSession[]
  intake: IntakeDayLite[]
  sleep: SleepRecord[]
  /** Local dates ('YYYY-MM-DD') with at least one mood check-in. */
  moodDates?: string[]
}

export function weekLabel(weekStart: string, today: string): string {
  const cur = startOfWeek(today)
  if (weekStart === cur) return 'This week'
  if (weekStart === addDays(cur, -7)) return 'Last week'
  return `${fmtDate(weekStart)} – ${fmtDate(addDays(weekStart, 6))}`
}

/** 0–100, capped at 100; 0 when there is nothing to measure against. */
export function adherencePct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round(Math.min(1, Math.max(0, part / whole)) * 100)
}

/**
 * One entry per Monday-start week, newest first. Training = completed / scheduled sessions in the week
 * (all statuses count as scheduled), nutrition = distinct days with a logged meal / 7,
 * sleep = distinct nights ending in the week with ≥ 7 h / 7.
 */
export function computeAdherence(input: AdherenceInput): WeekAdherence[] {
  const weeks = Math.max(1, Math.floor(input.weeks ?? DEFAULT_WEEKS))
  const cur = startOfWeek(input.today)
  const out: WeekAdherence[] = []
  for (let i = 0; i < weeks; i++) {
    const weekStart = addDays(cur, -7 * i)
    const weekEnd = addDays(weekStart, 6)
    const inWeek = (d: string) => d >= weekStart && d <= weekEnd

    const sessions = input.sessions.filter((s) => inWeek(s.scheduledDate))
    const done = sessions.filter((s) => s.status === 'completed').length

    const loggedDates = new Set<string>()
    for (const d of input.intake) if (d.logged && inWeek(d.date)) loggedDates.add(d.date)

    const goodNights = new Set<string>()
    for (const r of input.sleep) {
      if (r.durationMin < SLEEP_GOOD_MIN) continue
      const d = dateOf(r.endTs)
      if (inWeek(d)) goodNights.add(d)
    }

    const moodDays = new Set<string>()
    for (const d of input.moodDates ?? []) if (inWeek(d)) moodDays.add(d)

    out.push({
      weekStart,
      weekEnd,
      label: weekLabel(weekStart, input.today),
      current: i === 0,
      training: { done, planned: sessions.length },
      nutrition: { logged: loggedDates.size, days: 7 },
      sleep: { nights: goodNights.size, days: 7 },
      mind: { checkedIn: moodDays.size, days: 7 },
    })
  }
  return out
}

export interface AdherenceTotals {
  weeks: number
  sessionsDone: number
  sessionsPlanned: number
  loggedDays: number
  goodNights: number
  days: number
}

export function adherenceTotals(weeks: WeekAdherence[]): AdherenceTotals {
  return weeks.reduce<AdherenceTotals>(
    (t, w) => ({
      weeks: t.weeks + 1,
      sessionsDone: t.sessionsDone + w.training.done,
      sessionsPlanned: t.sessionsPlanned + w.training.planned,
      loggedDays: t.loggedDays + w.nutrition.logged,
      goodNights: t.goodNights + w.sleep.nights,
      days: t.days + w.nutrition.days,
    }),
    { weeks: 0, sessionsDone: 0, sessionsPlanned: 0, loggedDays: 0, goodNights: 0, days: 0 },
  )
}
