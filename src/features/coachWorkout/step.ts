// The coach-led workout's cursor (screens/CoachWorkout.tsx): which entry is up, which set, and how to say it. It is
// Focus Mode's cursor (workout/focus.ts) over the same logged sets, so the chat and the player always agree. Pure.
import type { Exercise, ExerciseSet, PlannedExercise } from '../../domain/types'
import { isTimedTarget } from '../../engine'
import { focusIndex } from '../workout/focus'
import { fmtSec, fmtTarget } from '../workout/helpers'

/** reps: count them. hold: a short timed set (a plank, an interval). steady: a long timed block (zone 2, meditation). */
export type StepKind = 'reps' | 'hold' | 'steady'

/** Timed targets this long or longer are blocks you do and report, not holds you count down on screen. */
export const STEADY_FROM_SEC = 300

export interface Step {
  /** Index into session.exercises. */
  index: number
  planned: PlannedExercise
  exercise: Exercise
  kind: StepKind
  /** 1-based set (or round) about to be done. */
  setNo: number
  /** "Warm-up", "Round 2 of 3", "Set 1 of 3", or '' for a single set. */
  label: string
  /** "8–12 reps", "6–8 each side", "45 s", "25 min". */
  target: string
  /** Countdown for a hold or a steady block; null for reps. */
  seconds: number | null
}

export function setsByExerciseId(sets: Pick<ExerciseSet, 'exerciseId'>[]): Map<string, ExerciseSet[]> {
  const out = new Map<string, ExerciseSet[]>()
  for (const s of sets) out.set(s.exerciseId, [...(out.get(s.exerciseId) ?? []), s as ExerciseSet])
  return out
}

export function stepKind(planned: PlannedExercise, exercise: Exercise): StepKind {
  if (!isTimedTarget(planned, exercise)) return 'reps'
  return planned.repMin >= STEADY_FROM_SEC ? 'steady' : 'hold'
}

export function describeStep(index: number, planned: PlannedExercise, exercise: Exercise, done: number): Step {
  const kind = stepKind(planned, exercise)
  const setNo = done + 1
  const rounds = !!planned.circuit || !!planned.restExerciseId
  const label = planned.role === 'warmup' ? 'Warm-up'
    : planned.role === 'cooldown' ? 'Cool-down'
      : planned.sets <= 1 ? ''
        : `${rounds ? 'Round' : 'Set'} ${setNo} of ${planned.sets}`
  const side = planned.perSide ? ' each side' : ''
  const target = kind === 'reps'
    ? `${fmtTarget(planned.repMin, planned.repMax, false)}${side || ' reps'}`
    : kind === 'steady' ? fmtSec(planned.repMin) : `${fmtTarget(planned.repMin, planned.repMax, true)}${side}`
  return { index, planned, exercise, kind, setNo, label, target, seconds: kind === 'reps' ? null : planned.repMin }
}

/** The step to do now, or null when every entry is done or stopped. */
export function currentStep(
  exercises: PlannedExercise[], sets: Pick<ExerciseSet, 'exerciseId'>[], stopped: string[], byId: Map<string, Exercise>,
): Step | null {
  const setsFor = setsByExerciseId(sets)
  const i = focusIndex(exercises, setsFor, stopped)
  if (i == null) return null
  const planned = exercises[i]
  const exercise = byId.get(planned.exerciseId)
  if (!exercise) return null
  return describeStep(i, planned, exercise, setsFor.get(planned.exerciseId)?.length ?? 0)
}

/** Sets logged and sets planned, stopped entries left out (the header's "7 of 16"). */
export function progress(exercises: PlannedExercise[], sets: Pick<ExerciseSet, 'exerciseId'>[], stopped: string[]): { done: number; total: number } {
  const setsFor = setsByExerciseId(sets)
  let done = 0, total = 0
  for (const e of exercises) {
    if (stopped.includes(e.exerciseId)) continue
    total += e.sets
    done += Math.min(e.sets, setsFor.get(e.exerciseId)?.length ?? 0)
  }
  return { done, total }
}

/** What the coach says for a step: "Push-Up · Set 2 of 3 · 8–12 reps". */
export function stepLine(step: Step): string {
  return [step.exercise.name, step.label, step.target].filter(Boolean).join(' · ')
}
