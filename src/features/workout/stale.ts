// Stale in-progress sessions: started and never finished. Pure. A session is stale once it began before today
// (local date) or more than STALE_AFTER_MS ago; the app then offers to wrap it up with what was logged, or skip it.
import type { ExerciseSet, WorkoutSession } from '../../domain/types'
import { toDateStr } from '../../lib/util'

export const STALE_AFTER_MS = 3 * 60 * 60 * 1000

export function isStaleSession(session: Pick<WorkoutSession, 'status' | 'startedAt'>, now: Date = new Date()): boolean {
  if (session.status !== 'in_progress' || !session.startedAt) return false
  const started = new Date(session.startedAt)
  if (Number.isNaN(started.getTime())) return false
  return toDateStr(started) < toDateStr(now) || now.getTime() - started.getTime() > STALE_AFTER_MS
}

/**
 * How to close a stale session honestly: it ended at the last logged set, not now. Null when nothing was
 * logged (there is nothing to keep, so only "skip" makes sense).
 */
export function staleWrapUp(session: Pick<WorkoutSession, 'startedAt'>, sets: Pick<ExerciseSet, 'loggedAt'>[]): { completedAt: string; durationMin: number } | null {
  if (!sets.length || !session.startedAt) return null
  const last = Math.max(...sets.map((s) => new Date(s.loggedAt).getTime()).filter((t) => !Number.isNaN(t)))
  if (!Number.isFinite(last)) return null
  const start = new Date(session.startedAt).getTime()
  return { completedAt: new Date(last).toISOString(), durationMin: Math.max(1, Math.round((last - start) / 60_000)) }
}
