// Deterministic double progression (PRD §9.2). Pure functions.
import type { Exercise, ExerciseSet, PlannedExercise } from '../domain/types'
import { round } from '../lib/util'

export type ProgressionAction = 'increase' | 'hold' | 'deload' | 'start'

export interface ProgressionResult {
  nextLoadKg: number | null
  repMin: number
  repMax: number
  action: ProgressionAction
  reason: string
  stalled: boolean
}

export type EquipmentKind = 'dumbbell' | 'barbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'other'

export const DELOAD_PCT = 0.10
export const MACHINE_INCREASE_PCT = 0.05
export const BODYWEIGHT_REP_STEP = 2
export const TIMED_STEP_SEC = 10

export function equipmentKind(equipment: string): EquipmentKind {
  const e = equipment.toLowerCase()
  if (e.includes('dumbbell') || e.includes('db')) return 'dumbbell'
  if (e.includes('kettlebell')) return 'kettlebell'
  if (e.includes('barbell')) return 'barbell'
  if (e.includes('cable') || e.includes('pulldown')) return 'cable'
  if (e.includes('machine') || e.includes('leg press') || e.includes('smith')) return 'machine'
  if (e.includes('bodyweight') || e.includes('body weight') || e === 'none' || e.includes('pool') || e.includes('bike') || e.includes('treadmill')) return 'bodyweight'
  return 'other'
}

/** Smallest sensible load step for the equipment (kg; per hand for dumbbells). */
export function loadIncrement(equipment: string): number {
  switch (equipmentKind(equipment)) {
    case 'dumbbell': return 2
    case 'kettlebell': return 4
    case 'barbell': return 2.5
    case 'machine': return 2.5
    case 'cable': return 2.5
    case 'bodyweight': return 0
    default: return 2.5
  }
}

/** Epley estimate. reps === 1 returns the load itself. */
export function estimate1RM(loadKg: number, reps: number): number {
  if (loadKg <= 0 || reps <= 0) return 0
  if (reps === 1) return loadKg
  return round(loadKg * (1 + reps / 30), 0.1)
}

function effort(s: ExerciseSet, timed: boolean): number | null {
  if (timed) return s.durationSec ?? s.reps
  return s.reps ?? (s.durationSec != null ? s.durationSec : null)
}

function workingSets(sets: ExerciseSet[], timed: boolean): ExerciseSet[] {
  return sets.filter((s) => effort(s, timed) != null)
}

function fmtLoad(kg: number, kind: EquipmentKind): string {
  return `${kg} kg${kind === 'dumbbell' ? ' per hand' : ''}`
}

export function evaluateProgression(
  planned: PlannedExercise,
  exercise: Exercise,
  lastSets: ExerciseSet[],
  previousSets: ExerciseSet[],
): ProgressionResult {
  const { repMin, repMax } = planned
  const timed = exercise.timed
  const unit = timed ? 's' : ' reps'
  const kind = equipmentKind(exercise.equipment)
  const last = workingSets(lastSets, timed)

  if (!last.length) {
    return {
      nextLoadKg: planned.loadKg,
      repMin, repMax,
      action: 'start',
      reason: planned.loadKg != null
        ? `No history yet — start at ${fmtLoad(planned.loadKg, kind)} for ${repMin}–${repMax}${unit}.`
        : `No history yet — pick a load you can do for ${repMin}–${repMax}${unit} with 2 in reserve.`,
      stalled: false,
    }
  }

  const loads = last.map((s) => s.loadKg).filter((l): l is number => l != null)
  const lastLoad = loads.length ? Math.max(...loads) : null
  const efforts = last.map((s) => effort(s, timed) as number)
  const hold = (reason: string): ProgressionResult => ({ nextLoadKg: lastLoad ?? planned.loadKg, repMin, repMax, action: 'hold', reason, stalled: false })

  if (last.some((s) => s.painFlag)) {
    return hold(`Pain flagged last session — hold${lastLoad != null ? ` at ${fmtLoad(lastLoad, kind)}` : ''} and keep the range pain-free.`)
  }

  const belowMin = efforts.some((r) => r < repMin)
  if (belowMin) {
    const prev = workingSets(previousSets, timed)
    const prevBelow = prev.length > 0 && !prev.some((s) => s.painFlag) && prev.some((s) => (effort(s, timed) as number) < repMin)
    const worst = Math.min(...efforts)
    if (prevBelow) {
      const step = loadIncrement(exercise.equipment) || 2.5
      let next: number | null = null
      if (lastLoad != null) {
        next = Math.floor((lastLoad * (1 - DELOAD_PCT)) / step) * step
        next = Math.min(next, lastLoad - step)
        if (next <= 0) next = round(lastLoad * (1 - DELOAD_PCT), 0.5)
      }
      return {
        nextLoadKg: next,
        repMin, repMax,
        action: 'deload',
        reason: lastLoad != null
          ? `Below ${repMin}${unit} two sessions running (${worst}${unit} last time) — deload 10% to ${fmtLoad(next as number, kind)} and rebuild.`
          : `Below ${repMin}${unit} two sessions running — cut a set and rebuild from ${repMin}${unit}.`,
        stalled: true,
      }
    }
    return hold(`Missed the ${repMin}${unit} minimum last session (${worst}${unit}) — hold${lastLoad != null ? ` at ${fmtLoad(lastLoad, kind)}` : ''} and try again.`)
  }

  const allTop = efforts.every((r) => r >= repMax)
  const rirOk = last.every((s) => (s.rir == null ? (s.rpe == null || s.rpe < 10) : s.rir >= 1))
  if (allTop && rirOk) {
    if (timed) {
      return {
        nextLoadKg: lastLoad,
        repMin: repMin + TIMED_STEP_SEC,
        repMax: repMax + TIMED_STEP_SEC,
        action: 'increase',
        reason: `Held ${repMax}s on every set — add ${TIMED_STEP_SEC}s: aim for ${repMin + TIMED_STEP_SEC}–${repMax + TIMED_STEP_SEC}s.`,
        stalled: false,
      }
    }
    if (kind === 'bodyweight' || lastLoad == null) {
      return {
        nextLoadKg: lastLoad,
        repMin: repMin + BODYWEIGHT_REP_STEP,
        repMax: repMax + BODYWEIGHT_REP_STEP,
        action: 'increase',
        reason: `Hit ${repMax} reps on every set — add reps: aim for ${repMin + BODYWEIGHT_REP_STEP}–${repMax + BODYWEIGHT_REP_STEP}.`,
        stalled: false,
      }
    }
    let next: number
    if (kind === 'machine' || kind === 'cable') {
      const step = loadIncrement(exercise.equipment)
      next = Math.max(round(lastLoad * (1 + MACHINE_INCREASE_PCT), step), lastLoad + step)
    } else {
      next = lastLoad + loadIncrement(exercise.equipment)
    }
    next = round(next, 0.5)
    return {
      nextLoadKg: next,
      repMin, repMax,
      action: 'increase',
      reason: `Hit ${repMax} reps on all sets with reps in reserve — go up to ${fmtLoad(next, kind)}.`,
      stalled: false,
    }
  }

  if (allTop && !rirOk) return hold(`All sets at ${repMax}${unit} but at failure — repeat${lastLoad != null ? ` ${fmtLoad(lastLoad, kind)}` : ''} with 1–2 in reserve before adding load.`)
  const best = Math.max(...efforts)
  return hold(`Stay${lastLoad != null ? ` at ${fmtLoad(lastLoad, kind)}` : ''} until every set reaches ${repMax}${unit} (best set ${best}${unit}).`)
}
