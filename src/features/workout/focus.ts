// Focus Mode cursor (docs/PRD_FOCUS_MODE.md §8.2): where the one-movement-at-a-time screen is, derived from
// the logged sets and never stored. Pure.
// Circuits (docs/PRD_TRAINING_PROGRAMS.md §5.3): consecutive entries sharing a `circuit` key run round-robin;
// `sets` is the number of rounds. Every other entry is a group of one and behaves exactly as before.
import type { ExerciseSet, PlannedExercise } from '../../domain/types'

type SetsFor = Map<string, ExerciseSet[]>

const count = (setsFor: SetsFor, e: PlannedExercise) => setsFor.get(e.exerciseId)?.length ?? 0
const hasLeft = (e: PlannedExercise, setsFor: SetsFor, stopped: string[]) => !stopped.includes(e.exerciseId) && count(setsFor, e) < e.sets

/** [start, end) of the group holding index `i`: the run of entries sharing its circuit key, or just `i`. */
function groupAt(exercises: PlannedExercise[], i: number): [number, number] {
  const key = exercises[i].circuit
  if (!key) return [i, i + 1]
  let start = i
  while (start > 0 && exercises[start - 1].circuit === key) start--
  let end = i + 1
  while (end < exercises.length && exercises[end].circuit === key) end++
  return [start, end]
}

/** The station to do next inside group [start, end): the first one with sets left at the lowest logged count. */
function groupCursor(exercises: PlannedExercise[], setsFor: SetsFor, stopped: string[], start: number, end: number): number | null {
  let best: number | null = null
  for (let i = start; i < end; i++) {
    const e = exercises[i]
    if (!hasLeft(e, setsFor, stopped)) continue
    if (best == null || count(setsFor, e) < count(setsFor, exercises[best])) best = i
  }
  return best
}

/** The cursor from index `from` onwards, walking group by group. */
function cursorFrom(exercises: PlannedExercise[], setsFor: SetsFor, stopped: string[], from: number): number | null {
  for (let i = from; i < exercises.length;) {
    const [start, end] = groupAt(exercises, i)
    const at = groupCursor(exercises, setsFor, stopped, start, end)
    if (at != null) return at
    i = end
  }
  return null
}

/** Index of the exercise to do now (a circuit walks its stations round-robin), or null when the session is done. */
export function focusIndex(exercises: PlannedExercise[], setsFor: SetsFor, stopped: string[]): number | null {
  return cursorFrom(exercises, setsFor, stopped, 0)
}

/**
 * What comes after `from` (for "Up next"), or null. Outside a circuit: the next exercise with sets to log.
 * Inside a circuit: the next station with rounds left, wrapping to the first; past the circuit once `from` is the last one.
 */
export function nextFocusIndex(exercises: PlannedExercise[], setsFor: SetsFor, stopped: string[], from: number): number | null {
  const [start, end] = groupAt(exercises, from)
  if (end - start > 1) {
    for (let k = 1; k < end - start; k++) {
      const i = start + ((from - start + k) % (end - start))
      if (hasLeft(exercises[i], setsFor, stopped)) return i
    }
  }
  return cursorFrom(exercises, setsFor, stopped, end)
}

/**
 * Rest after logging one set of the circuit station at `index` (`setsFor` as it was before that set):
 * `roundRestSec` (or `restSec` when unset) once every station still running has done this round, otherwise `restSec`.
 * Null for an entry that is not in a circuit.
 */
export function circuitRestAfter(exercises: PlannedExercise[], setsFor: SetsFor, stopped: string[], index: number): number | null {
  const planned = exercises[index]
  if (!planned?.circuit) return null
  const [start, end] = groupAt(exercises, index)
  const round = count(setsFor, planned) + 1
  let roundDone = true
  for (let i = start; i < end; i++) {
    if (i === index || stopped.includes(exercises[i].exerciseId)) continue
    if (count(setsFor, exercises[i]) < round) { roundDone = false; break }
  }
  return roundDone ? planned.roundRestSec ?? planned.restSec : planned.restSec
}

/** Only the sets not yet logged (stopped exercises drop out), for the "time left" estimate. */
export function remainingPlan(exercises: PlannedExercise[], setsFor: SetsFor, stopped: string[]): PlannedExercise[] {
  return exercises
    .filter((e) => !stopped.includes(e.exerciseId))
    .map((e) => ({ ...e, sets: Math.max(0, e.sets - (setsFor.get(e.exerciseId)?.length ?? 0)) }))
    .filter((e) => e.sets > 0)
}
