// Session finish logic: completion, post-workout symptom changes, cardio summary,
// optional Apple Health write, and PR detection for the completed summary.
import type { Exercise, ExerciseSet, Region, WorkoutSession } from '../../domain/types'
import { db } from '../../db/database'
import { addCardio, addSymptomCheck, exerciseHistory, getSetting, updateSession } from '../../db/repositories'
import { getHealthBridge } from '../../native'
import { estimate1RM } from '../../engine'
import { clamp, nowIso } from '../../lib/util'
import { bestEffort, elapsedMinutes, setsByExercise } from './helpers'

export type SymptomChangeKind = 'better' | 'same' | 'worse'

export interface SymptomChange {
  region: Region
  prePain: number
  change: SymptomChangeKind
  /** Pain now (defaults are derived from prePain; editable when 'worse'). */
  postPain: number
}

export interface FinishInput {
  session: WorkoutSession
  sets: ExerciseSet[]
  rpe: number | null
  durationMin: number
  notes: string
  symptomChanges: SymptomChange[]
  writeToHealth: boolean
}

export interface FinishResult {
  /** null = not attempted, false = attempted but unavailable/failed. */
  healthWritten: boolean | null
  healthMessage: string | null
}

export function defaultPostPain(prePain: number, change: SymptomChangeKind): number {
  if (change === 'better') return clamp(prePain - 2, 0, 10)
  if (change === 'worse') return clamp(prePain + 2, 0, 10)
  return prePain
}

export function computeDurationMin(session: WorkoutSession, now: Date = new Date()): number {
  const m = elapsedMinutes(session.startedAt, now)
  return clamp(m || 1, 1, 300)
}

function cardioModality(session: WorkoutSession): string {
  if (session.type === 'swim') return 'swim'
  if (session.templateKey.includes('bike')) return 'bike'
  return session.type
}

/** Marks the session completed and records symptom changes / cardio summary; then writes to Health if asked. */
export async function finishSession(input: FinishInput): Promise<FinishResult> {
  const { session } = input
  const completedAt = nowIso()
  const durationMin = clamp(Math.round(input.durationMin), 1, 600)

  db.transaction(() => {
    updateSession(session.id, {
      status: 'completed',
      completedAt,
      durationMin,
      sessionRpe: input.rpe,
      notes: input.notes.trim(),
    })
    for (const c of input.symptomChanges) {
      if (c.change === 'same' && c.prePain === c.postPain && c.prePain === 0) continue
      addSymptomCheck({
        ts: completedAt,
        region: c.region,
        painScore: clamp(Math.round(c.postPain), 0, 10),
        redFlags: {},
        notes: `Post-workout: ${c.change} (was ${c.prePain}/10)`,
        context: 'post_workout',
        sessionId: session.id,
      })
    }
    if (session.type === 'conditioning' || session.type === 'swim') {
      addCardio({
        sessionId: session.id,
        modality: cardioModality(session),
        durationMin,
        distanceKm: null,
        avgHr: null,
        ts: completedAt,
        source: 'app',
      })
    }
  })

  if (!input.writeToHealth) return { healthWritten: null, healthMessage: null }
  if (!getSetting<boolean>('health.writeWorkouts', false)) {
    return { healthWritten: null, healthMessage: 'Apple Health writing is off in Settings → Health.' }
  }
  try {
    const bridge = getHealthBridge()
    const avail = await bridge.isAvailable()
    if (!avail.available) return { healthWritten: false, healthMessage: avail.reason ?? 'Apple Health is not available here.' }
    const startTs = session.startedAt ?? new Date(new Date(completedAt).getTime() - durationMin * 60_000).toISOString()
    const ok = await bridge.writeWorkout({
      name: session.name,
      type: session.type,
      startTs,
      endTs: completedAt,
      durationMin,
    })
    return { healthWritten: ok, healthMessage: ok ? 'Workout summary written to Apple Health.' : 'Apple Health did not accept the workout.' }
  } catch (e) {
    return { healthWritten: false, healthMessage: e instanceof Error ? e.message : 'Apple Health write failed.' }
  }
}

/** Mark a session skipped (never deletes logged sets). */
export function skipSession(session: WorkoutSession, reason: string): void {
  const note = reason ? `Skipped: ${reason}` : 'Skipped'
  updateSession(session.id, {
    status: 'skipped',
    notes: session.notes ? `${session.notes}\n${note}` : note,
    completedAt: null,
  })
}

// --- PRs ------------------------------------------------------------------------

export interface PRHighlight {
  exerciseId: string
  exerciseName: string
  timed: boolean
  /** Best set this session. */
  loadKg: number | null
  reps: number | null
  durationSec: number | null
  /** e1RM (kg) for loaded lifts, otherwise reps / seconds. */
  value: number
  previousBest: number | null
}

/** Exercises where this session's best effort beats every earlier session. */
export function sessionPRs(session: WorkoutSession, sets: ExerciseSet[], library: Exercise[]): PRHighlight[] {
  const byId = new Map(library.map((e) => [e.id, e]))
  const out: PRHighlight[] = []
  for (const [exerciseId, list] of setsByExercise(sets)) {
    const ex = byId.get(exerciseId)
    if (!ex) continue
    const timed = ex.timed
    const value = bestEffort(list, timed)
    if (value == null || value <= 0) continue
    const history = exerciseHistory(exerciseId, 50).filter((h) => h.sessionId !== session.id && h.date <= session.scheduledDate)
    let previousBest: number | null = null
    for (const h of history) {
      const v = bestEffort(h.sets, timed)
      if (v != null && (previousBest == null || v > previousBest)) previousBest = v
    }
    if (previousBest != null && value <= previousBest) continue
    if (previousBest == null && history.length === 0 && !timed && list.every((s) => s.loadKg == null)) continue
    const best = list.reduce((a, b) => {
      const sa = timed ? (a.durationSec ?? a.reps ?? 0) : a.loadKg != null && a.reps != null ? estimate1RM(a.loadKg, a.reps) : (a.reps ?? 0) / 1000
      const sb = timed ? (b.durationSec ?? b.reps ?? 0) : b.loadKg != null && b.reps != null ? estimate1RM(b.loadKg, b.reps) : (b.reps ?? 0) / 1000
      return sb > sa ? b : a
    })
    out.push({
      exerciseId,
      exerciseName: ex.name,
      timed,
      loadKg: best.loadKg,
      reps: best.reps,
      durationSec: best.durationSec,
      value,
      previousBest,
    })
  }
  return out
}
