// Weight and waist summaries for the Progress screen. Pure — wraps engine/trends.
import type { BodyMetric } from '../../domain/types'
import { inWindow, projectDate, rollingAverage, weeklyRate, type TrendPoint } from '../../engine/trends'
import { addDays, dateOf } from '../../lib/util'

/** Rounds without binary noise (0.6000000000000001 -> 0.6). */
function fix(n: number, digits: number): number {
  return Number(n.toFixed(digits))
}

export interface MetricChange { delta: number; sinceDate: string }

export interface WeightStats {
  latest: number | null
  latestTs: string | null
  avg7: number | null
  prevAvg7: number | null
  /** 7-day average minus the previous 7-day average (kg/week); null with under two weeks of data. */
  rateKg: number | null
  /** Latest minus the earliest entry inside the window (default 30 days). */
  change: MetricChange | null
  /** Values inside the window, ascending by time — feed straight into a Sparkline. */
  series: number[]
  goal: number | null
  /** Kilograms still to lose (positive) or already below the goal (negative). */
  toGoal: number | null
  /** Date the goal is reached at the current rate, or null when not projectable. */
  projected: string | null
  windowDays: number
}

export interface WaistStats {
  latest: number | null
  latestTs: string | null
  change: MetricChange | null
  series: number[]
  goal: number | null
  toGoal: number | null
  windowDays: number
}

function sorted(metrics: BodyMetric[]): BodyMetric[] {
  return [...metrics].sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id)
}

function windowed(metrics: BodyMetric[], days: number, today: string): BodyMetric[] {
  return metrics.filter((m) => inWindow(dateOf(m.ts), days, today))
}

function changeOver(win: BodyMetric[]): MetricChange | null {
  if (win.length < 2) return null
  const first = win[0], last = win[win.length - 1]
  if (dateOf(first.ts) === dateOf(last.ts)) return null
  return { delta: fix(last.value - first.value, 1), sinceDate: dateOf(first.ts) }
}

export function computeWeightStats(weights: BodyMetric[], goal: number | null, today: string, windowDays = 30): WeightStats {
  const all = sorted(weights)
  const latestEntry = all.length ? all[all.length - 1] : null
  const pts: TrendPoint[] = all.map((w) => ({ ts: w.ts, value: w.value }))
  const avg7 = rollingAverage(pts, 7, today)
  const prevAvg7 = rollingAverage(pts, 7, addDays(today, -7))
  const rateKg = weeklyRate(pts, today)
  const win = windowed(all, windowDays, today)
  const latest = latestEntry?.value ?? null
  const anchor = avg7 ?? latest
  const projected = goal != null && anchor != null && rateKg != null ? projectDate(anchor, goal, rateKg, today) : null
  return {
    latest,
    latestTs: latestEntry?.ts ?? null,
    avg7: avg7 != null ? fix(avg7, 2) : null,
    prevAvg7: prevAvg7 != null ? fix(prevAvg7, 2) : null,
    rateKg: rateKg != null ? fix(rateKg, 2) : null,
    change: changeOver(win),
    series: win.map((w) => w.value),
    goal,
    toGoal: goal != null && latest != null ? fix(latest - goal, 1) : null,
    projected,
    windowDays,
  }
}

export function computeWaistStats(waists: BodyMetric[], goal: number | null, today: string, windowDays = 90): WaistStats {
  const all = sorted(waists)
  const latestEntry = all.length ? all[all.length - 1] : null
  const win = windowed(all, windowDays, today)
  const latest = latestEntry?.value ?? null
  return {
    latest,
    latestTs: latestEntry?.ts ?? null,
    change: changeOver(win),
    series: win.map((w) => w.value),
    goal,
    toGoal: goal != null && latest != null ? fix(latest - goal, 1) : null,
    windowDays,
  }
}

/** Signed one-decimal string: "+0.4", "−0.6", "0.0". */
export function signed(n: number, digits = 1): string {
  const r = Number(n.toFixed(digits))
  if (r > 0) return `+${r.toFixed(digits)}`
  if (r < 0) return `−${Math.abs(r).toFixed(digits)}`
  return (0).toFixed(digits)
}
