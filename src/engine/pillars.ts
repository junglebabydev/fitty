// Four pillar rings for Today / Coach (docs/DESIGN.md §9). Pure. Values are clamped to 0..1;
// captions are short, factual and adherence-neutral.
import { fmtDuration } from '../lib/util'

export type PillarKey = 'train' | 'eat' | 'rest' | 'mind'
export interface PillarValue { value: number; caption: string }

export interface PillarsInput {
  sessionsDone: number
  sessionsTarget: number
  proteinG: number
  proteinTarget: number
  kcal: number
  kcalTarget: number
  sleepMin: number | null
  /** Default 450 (7h 30m). */
  sleepGoalMin?: number
  moodLoggedToday: boolean
  mindfulMinToday: number
}

export const DEFAULT_SLEEP_GOAL_MIN = 450
/** Mindful minutes in a day that fill the second half of the mind ring. */
export const MINDFUL_MIN_GOAL = 5
/** Calories within ±10% of the target count as in range. */
export const KCAL_BAND = 0.1

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
const ratio = (a: number, b: number) => (b > 0 ? clamp01(a / b) : 0)
/** Non-negative whole number for captions; anything unusable reads as 0. */
const whole = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0)

/** 1 inside the ±10% band, rising towards it from below and falling off above it (0 at 50% over the target). */
export function kcalInRange(kcal: number, target: number): number {
  if (!(target > 0) || !Number.isFinite(kcal)) return 0
  const lo = target * (1 - KCAL_BAND)
  const hi = target * (1 + KCAL_BAND)
  if (kcal < lo) return clamp01(kcal / lo)
  if (kcal <= hi) return 1
  return clamp01(1 - (kcal - hi) / (target * 0.4))
}

export function computePillars(i: PillarsInput): Record<PillarKey, PillarValue> {
  const done = whole(i.sessionsDone)
  const target = whole(i.sessionsTarget)
  const train: PillarValue = target > 0
    ? { value: ratio(done, target), caption: `${done} of ${target} session${target === 1 ? '' : 's'}` }
    : { value: 0, caption: 'No sessions planned' }

  const eat: PillarValue = {
    value: clamp01(0.7 * ratio(i.proteinG, i.proteinTarget) + 0.3 * kcalInRange(i.kcal, i.kcalTarget)),
    caption: `${whole(i.proteinG)} of ${whole(i.proteinTarget)} g protein`,
  }

  const goal = i.sleepGoalMin != null && i.sleepGoalMin > 0 ? i.sleepGoalMin : DEFAULT_SLEEP_GOAL_MIN
  const rest: PillarValue = i.sleepMin != null
    ? { value: ratio(i.sleepMin, goal), caption: `${fmtDuration(whole(i.sleepMin))} of ${fmtDuration(goal)}` }
    : { value: 0, caption: 'No sleep logged' }

  const minutes = whole(i.mindfulMinToday)
  const mindCaption = i.moodLoggedToday
    ? minutes > 0 ? `Checked in · ${minutes} min` : 'Checked in'
    : minutes > 0 ? `${minutes} mindful min` : 'Not checked in'
  const mind: PillarValue = {
    value: clamp01((i.moodLoggedToday ? 0.5 : 0) + 0.5 * ratio(Math.max(0, i.mindfulMinToday), MINDFUL_MIN_GOAL)),
    caption: mindCaption,
  }

  return { train, eat, rest, mind }
}
