// Mood and sleep mini-trends for the Progress screen. Pure. Observations only — never a diagnosis.
import type { SleepRecord } from '../../domain/types'
import { addDays, dateOf, fmtDuration } from '../../lib/util'
import { SLEEP_GOOD_MIN } from './adherence'

export interface DayValue { date: string; value: number | null }

function emptyDays(days: number, today: string): DayValue[] {
  const out: DayValue[] = []
  for (let i = days - 1; i >= 0; i--) out.push({ date: addDays(today, -i), value: null })
  return out
}

/** Mean valence (-3..3) per calendar day; null on days without a check-in. */
export function dailyMood(logs: { ts: string; valence: number }[], days: number, today: string): DayValue[] {
  const byDate = new Map<string, number[]>()
  for (const l of logs) {
    const d = dateOf(l.ts)
    const list = byDate.get(d)
    if (list) list.push(l.valence)
    else byDate.set(d, [l.valence])
  }
  return emptyDays(days, today).map((d) => {
    const vals = byDate.get(d.date)
    return vals ? { date: d.date, value: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) } : d
  })
}

/** Hours slept per night, keyed by wake-up date (longest record wins); null on nights without data. */
export function nightlySleep(records: SleepRecord[], days: number, today: string): DayValue[] {
  const byDate = new Map<string, number>()
  for (const r of records) {
    const d = dateOf(r.endTs)
    byDate.set(d, Math.max(byDate.get(d) ?? 0, r.durationMin))
  }
  return emptyDays(days, today).map((d) => {
    const min = byDate.get(d.date)
    return min != null ? { date: d.date, value: Number((min / 60).toFixed(2)) } : d
  })
}

export function sleepHeadline(series: DayValue[]): string {
  const nights = series.filter((d): d is { date: string; value: number } => d.value != null)
  if (!nights.length) return 'No sleep recorded yet.'
  const avgMin = Math.round((nights.reduce((a, d) => a + d.value, 0) / nights.length) * 60)
  const good = nights.filter((d) => d.value * 60 >= SLEEP_GOOD_MIN).length
  return `Averaging ${fmtDuration(avgMin)} over ${nights.length} night${nights.length === 1 ? '' : 's'} — ${good} at 7 h or more.`
}

export interface MoodSummaryLite {
  avg7: number | null
  prevAvg7: number | null
  trend: 'up' | 'down' | 'flat' | null
  daysCheckedIn7: number
}

/** `word` maps a rounded valence to a plain label ("Slightly pleasant"). */
export function moodHeadline(s: MoodSummaryLite, word: (valence: number) => string | undefined): string {
  if (s.avg7 == null) return 'No check-ins this week yet.'
  const label = (word(Math.round(s.avg7)) ?? 'Neutral').toLowerCase()
  const vs = s.trend === 'up' ? ', a little higher than the week before' : s.trend === 'down' ? ', a little lower than the week before' : s.trend === 'flat' ? ', similar to the week before' : ''
  return `Mostly ${label} this week${vs} — checked in on ${s.daysCheckedIn7} of 7 days.`
}
