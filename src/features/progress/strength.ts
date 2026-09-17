// Per-exercise estimated-1RM trends for the most-trained lifts (PRD §8 Progress). Pure.
import type { Exercise, ExerciseSet, WorkoutSession } from '../../domain/types'
import { estimate1RM } from '../../engine/progression'
import { dateOf } from '../../lib/util'

export const DEFAULT_TOP = 4

export interface StrengthPoint {
  date: string
  /** Epley estimate from the best set of that session. */
  e1rm: number
  loadKg: number
  reps: number
}

export interface StrengthTrend {
  exerciseId: string
  name: string
  equipment: string
  /** Distinct session dates with a loaded set. */
  sessions: number
  /** Ascending by date, one point per session date. */
  points: StrengthPoint[]
  best: StrengthPoint
  latest: StrengthPoint
  /** latest − first e1RM; null with a single point. */
  changeKg: number | null
}

export interface StrengthInput {
  sets: ExerciseSet[]
  sessions: WorkoutSession[]
  exercises: Exercise[]
  top?: number
}

type BestSet = Omit<StrengthPoint, 'date'>

/** Best (highest e1RM) loaded set in the list, ignoring timed / bodyweight-only sets. */
export function bestE1RM(sets: ExerciseSet[]): BestSet | null {
  let best: BestSet | null = null
  for (const s of sets) {
    if (s.loadKg == null || s.loadKg <= 0 || s.reps == null || s.reps <= 0) continue
    const e1rm = estimate1RM(s.loadKg, s.reps)
    if (!best || e1rm > best.e1rm) best = { e1rm, loadKg: s.loadKg, reps: s.reps }
  }
  return best
}

function humanize(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Groups logged sets by exercise and session date, keeps the best set per date, and returns the
 * `top` exercises with the most sessions (ties: most recent first, then name).
 */
export function computeStrengthTrends(input: StrengthInput): StrengthTrend[] {
  const top = Math.max(1, Math.floor(input.top ?? DEFAULT_TOP))
  const sessionDate = new Map<number, string>()
  for (const s of input.sessions) sessionDate.set(s.id, s.scheduledDate)
  const library = new Map<string, Exercise>()
  for (const e of input.exercises) library.set(e.id, e)

  // exerciseId -> date -> sets
  const grouped = new Map<string, Map<string, ExerciseSet[]>>()
  for (const set of input.sets) {
    const ex = library.get(set.exerciseId)
    if (ex?.timed) continue
    const date = sessionDate.get(set.sessionId) ?? dateOf(set.loggedAt)
    let byDate = grouped.get(set.exerciseId)
    if (!byDate) { byDate = new Map(); grouped.set(set.exerciseId, byDate) }
    const list = byDate.get(date)
    if (list) list.push(set)
    else byDate.set(date, [set])
  }

  const trends: StrengthTrend[] = []
  for (const [exerciseId, byDate] of grouped) {
    const points: StrengthPoint[] = []
    for (const [date, sets] of byDate) {
      const best = bestE1RM(sets)
      if (best) points.push({ date, ...best })
    }
    if (!points.length) continue
    points.sort((a, b) => a.date.localeCompare(b.date))
    const latest = points[points.length - 1]
    const best = points.reduce((a, b) => (b.e1rm > a.e1rm ? b : a), points[0])
    const ex = library.get(exerciseId)
    trends.push({
      exerciseId,
      name: ex?.name ?? humanize(exerciseId),
      equipment: ex?.equipment ?? '',
      sessions: points.length,
      points,
      best,
      latest,
      changeKg: points.length >= 2 ? Number((latest.e1rm - points[0].e1rm).toFixed(1)) : null,
    })
  }

  trends.sort((a, b) =>
    b.sessions - a.sessions ||
    b.latest.date.localeCompare(a.latest.date) ||
    a.name.localeCompare(b.name),
  )
  return trends.slice(0, top)
}

/** The sentence above a lift's e1RM chart. Descriptive only. */
export function strengthHeadline(t: StrengthTrend): string {
  const now = `${t.latest.e1rm.toFixed(1)} kg`
  if (t.changeKg == null) return `${t.name}: first session logged at an estimated ${now}. A second session shows a direction.`
  const n = `${t.sessions} sessions`
  if (Math.abs(t.changeKg) < 0.05) return `${t.name} is holding at ${now} over ${n}.`
  return `${t.name} is ${t.changeKg > 0 ? 'up' : 'down'} ${Math.abs(t.changeKg).toFixed(1)} kg over ${n} — now an estimated ${now}.`
}
