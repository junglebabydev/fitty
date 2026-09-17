// Pure trend helpers over timestamped points. No db / react imports.
import { addDays, dateOf } from '../lib/util'

export interface TrendPoint { ts: string; value: number }

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** True when `date` falls inside the `days` calendar days ending at `endDate` (inclusive). */
export function inWindow(date: string, days: number, endDate: string): boolean {
  const start = addDays(endDate, -(days - 1))
  return date >= start && date <= endDate
}

/** Mean of all points whose local date is within the `days` days ending at `endDate`. */
export function rollingAverage(points: TrendPoint[], days: number, endDate: string): number | null {
  const vals = points.filter((p) => inWindow(dateOf(p.ts), days, endDate)).map((p) => p.value)
  if (!vals.length) return null
  return mean(vals)
}

/** Average of the last 7 days minus the average of the 7 days before that. */
export function weeklyRate(points: TrendPoint[], endDate: string): number | null {
  const cur = rollingAverage(points, 7, endDate)
  const prev = rollingAverage(points, 7, addDays(endDate, -7))
  if (cur == null || prev == null) return null
  return cur - prev
}

/**
 * Date on which `target` is reached from `current` at `ratePerWeek` (signed, per week).
 * Returns null when the rate is zero, points the wrong way, or the horizon exceeds 3 years.
 */
export function projectDate(current: number, target: number, ratePerWeek: number, fromDate: string): string | null {
  const delta = target - current
  if (Math.abs(delta) < 1e-9) return fromDate
  if (!ratePerWeek || Math.sign(delta) !== Math.sign(ratePerWeek)) return null
  const days = Math.ceil((delta / ratePerWeek) * 7)
  if (days > 365 * 3) return null
  return addDays(fromDate, days)
}

/** One entry per calendar day for the `days` days ending at `endDate`; value is the mean of that day's points or null. */
export function dailySeries(points: TrendPoint[], days: number, endDate: string): { date: string; value: number | null }[] {
  const byDate = new Map<string, number[]>()
  for (const p of points) {
    const d = dateOf(p.ts)
    const list = byDate.get(d)
    if (list) list.push(p.value)
    else byDate.set(d, [p.value])
  }
  const out: { date: string; value: number | null }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i)
    const vals = byDate.get(date)
    out.push({ date, value: vals ? mean(vals) : null })
  }
  return out
}

/** Least-squares slope in value units per week over the given points (null with fewer than 2 distinct days). */
export function slopePerWeek(points: TrendPoint[]): number | null {
  if (points.length < 2) return null
  const xs = points.map((p) => new Date(p.ts).getTime() / 86_400_000)
  const ys = points.map((p) => p.value)
  const mx = mean(xs), my = mean(ys)
  let num = 0, den = 0
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2 }
  if (den === 0) return null
  return (num / den) * 7
}
