// Weight chart series (raw daily dots + 7-day rolling average) and the interpreted headline above it. Pure.
import type { BodyMetric } from '../../domain/types'
import { FLAT_RATE_KG } from '../../engine/nutrition'
import { dailySeries } from '../../engine/trends'
import { dateOf, daysBetween, parseDate } from '../../lib/util'
import type { WeightStats } from './weight'

/** Days of weigh-ins before a weekly rate and a goal date are shown. */
export const CALIBRATION_DAYS = 14
const AVG_WINDOW = 7
/** Below this the change reads as level rather than up / down. */
const LEVEL_KG = 0.05

export interface WeightChart {
  days: number
  /** One entry per calendar day, ascending, ending today. */
  dates: string[]
  /** Mean of that day's weigh-ins, or null. */
  raw: (number | null)[]
  /** 7-day rolling average ending that day; null until the window holds two readings. */
  average: (number | null)[]
  daysWithData: number
  /** Last minus first rolling-average value inside the range, and the days between them. */
  avgChange: { delta: number; spanDays: number } | null
}

export interface Calibration {
  /** 0 with no weigh-ins, otherwise days since the first weigh-in (1-based), capped at `of`. */
  day: number
  of: number
  done: boolean
}

function fix(n: number, digits: number): number {
  return Number(n.toFixed(digits))
}

export function buildWeightChart(weights: BodyMetric[], days: number, today: string): WeightChart {
  const span = Math.max(1, Math.floor(days))
  // Pull six extra days so the rolling average is defined on the first day of the range.
  const padded = dailySeries(weights.map((w) => ({ ts: w.ts, value: w.value })), span + AVG_WINDOW - 1, today)
  const dates: string[] = []
  const raw: (number | null)[] = []
  const average: (number | null)[] = []
  for (let i = AVG_WINDOW - 1; i < padded.length; i++) {
    const win: number[] = []
    for (let j = i - (AVG_WINDOW - 1); j <= i; j++) {
      const v = padded[j].value
      if (v != null) win.push(v)
    }
    dates.push(padded[i].date)
    raw.push(padded[i].value != null ? fix(padded[i].value as number, 2) : null)
    average.push(win.length >= 2 ? fix(win.reduce((a, b) => a + b, 0) / win.length, 2) : null)
  }

  let first = -1, last = -1
  average.forEach((v, i) => {
    if (v == null) return
    if (first < 0) first = i
    last = i
  })
  const avgChange = first >= 0 && last > first
    ? { delta: fix((average[last] as number) - (average[first] as number), 1), spanDays: last - first }
    : null

  return { days: span, dates, raw, average, daysWithData: raw.filter((v) => v != null).length, avgChange }
}

export function weightCalibration(weights: BodyMetric[], today: string): Calibration {
  if (!weights.length) return { day: 0, of: CALIBRATION_DAYS, done: false }
  const firstDate = weights.reduce((min, w) => (dateOf(w.ts) < min ? dateOf(w.ts) : min), dateOf(weights[0].ts))
  const day = Math.min(CALIBRATION_DAYS, Math.max(1, daysBetween(firstDate, today) + 1))
  return { day, of: CALIBRATION_DAYS, done: day >= CALIBRATION_DAYS }
}

function goalDate(date: string, today: string): string {
  const d = parseDate(date)
  const sameYear = d.getFullYear() === parseDate(today).getFullYear()
  return d.toLocaleDateString('en-SG', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The sentence above the weight chart: what happened, then what it means. Never a judgement. */
export function weightHeadline(input: { chart: WeightChart; stats: WeightStats; calibration: Calibration; today: string }): string {
  const { chart, stats, calibration, today } = input
  if (stats.latest == null) return 'No weigh-ins yet. Log a morning weight to start the trend.'
  if (!calibration.done) {
    return `Day ${calibration.day} of ${calibration.of} — calibrating. A weekly rate and a goal date appear after two weeks of weigh-ins.`
  }
  if (stats.rateKg == null || !chart.avgChange) {
    return 'The trend needs more recent weigh-ins. A few mornings this week bring the 7-day average back.'
  }

  const { delta, spanDays } = chart.avgChange
  const lead = Math.abs(delta) < LEVEL_KG
    ? `Level over ${spanDays} days`
    : `${delta < 0 ? 'Down' : 'Up'} ${Math.abs(delta).toFixed(1)} kg in ${spanDays} days`

  if (stats.goal == null) return `${lead} on the 7-day average.`
  if (stats.toGoal != null && stats.toGoal <= 0) return `${lead} — at or below the ${stats.goal} kg goal.`
  const rate = stats.rateKg
  if (rate <= -FLAT_RATE_KG) {
    return stats.projected
      ? `${lead} — on pace for ${stats.goal} kg around ${goalDate(stats.projected, today)}.`
      : `${lead} — moving, but too slowly to project a goal date yet.`
  }
  if (Math.abs(rate) < FLAT_RATE_KG) return `${lead} — holding steady this fortnight. One weigh-in never changes the plan.`
  return `${lead} — the 7-day average is rising. Check that meals are logged before changing anything.`
}

/**
 * v3 headline (DESIGN §10.1): at most 12 words above the chart. States the change only; the projection and the
 * longer reading stay in `weightHeadline` (used for the chart's aria-label).
 */
export function weightHeadlineShort(input: { chart: WeightChart; stats: WeightStats; calibration: Calibration }): string {
  const { chart, stats, calibration } = input
  if (stats.latest == null) return 'No weigh-ins yet.'
  if (!calibration.done) return `Day ${calibration.day} of ${calibration.of}, calibrating the trend.`
  if (stats.rateKg == null || !chart.avgChange) return 'The trend needs a few more weigh-ins.'
  const { delta, spanDays } = chart.avgChange
  if (Math.abs(delta) < LEVEL_KG) return `Level over ${spanDays} days on the 7-day average.`
  return `${delta < 0 ? 'Down' : 'Up'} ${Math.abs(delta).toFixed(1)} kg in ${spanDays} days on the 7-day average.`
}
