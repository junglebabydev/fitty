// Focus Mode cursor (docs/PRD_FOCUS_MODE.md §8.2): where the one-movement-at-a-time screen is, derived from
// the logged sets and never stored. Pure.
import type { ExerciseSet, PlannedExercise } from '../../domain/types'

/** Index of the first exercise with planned sets still to log that isn't stopped, or null when the session is done. */
export function focusIndex(exercises: PlannedExercise[], setsFor: Map<string, ExerciseSet[]>, stopped: string[]): number | null {
  const i = exercises.findIndex((e) => !stopped.includes(e.exerciseId) && (setsFor.get(e.exerciseId)?.length ?? 0) < e.sets)
  return i >= 0 ? i : null
}

/** The next exercise after `from` that still has sets to log (for "Up next"), or null. */
export function nextFocusIndex(exercises: PlannedExercise[], setsFor: Map<string, ExerciseSet[]>, stopped: string[], from: number): number | null {
  for (let i = from + 1; i < exercises.length; i++) {
    const e = exercises[i]
    if (!stopped.includes(e.exerciseId) && (setsFor.get(e.exerciseId)?.length ?? 0) < e.sets) return i
  }
  return null
}

/** Only the sets not yet logged (stopped exercises drop out), for the "time left" estimate. */
export function remainingPlan(exercises: PlannedExercise[], setsFor: Map<string, ExerciseSet[]>, stopped: string[]): PlannedExercise[] {
  return exercises
    .filter((e) => !stopped.includes(e.exerciseId))
    .map((e) => ({ ...e, sets: Math.max(0, e.sets - (setsFor.get(e.exerciseId)?.length ?? 0)) }))
    .filter((e) => e.sets > 0)
}
