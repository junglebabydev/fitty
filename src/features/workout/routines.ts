// Routines: the built-in session templates plus anything the user saved from the planner (setting 'train.routines').
import type { Exercise, PlannedExercise, WorkoutSession } from '../../domain/types'
import { createSession, getSetting, setSetting } from '../../db/repositories'
import { AI_PLAN_TEMPLATE_KEY, SESSION_TEMPLATES, cloneExercises, estimateSessionMinutes, planToPlanned, sessionTypeForFocus, type AIPlanDraft, type PlanFocus } from '../../engine'
import { nowIso } from '../../lib/util'

export const TRAIN_ROUTINES_SETTING = 'train.routines'

export interface Routine {
  id: string
  name: string
  focus: PlanFocus
  minutes: number
  exercises: PlannedExercise[]
  createdAt: string
  source: 'builtin' | 'ai' | 'local'
}

const TEMPLATE_FOCUS: Record<string, PlanFocus> = {
  upper_a: 'upper', lower_a: 'lower', full_b: 'full', conditioning_bike: 'conditioning', swim: 'conditioning', mobility_hips: 'mobility', mobility_upper: 'mobility',
}

/** Short gallery names; sessions created from a built-in keep the template's full name. */
const ROUTINE_NAME: Record<string, string> = {
  upper_a: 'Upper Body', lower_a: 'Lower Body', full_b: 'Full Body', conditioning_bike: 'Bike Intervals', swim: 'Swim', mobility_hips: 'Hips & Hamstrings', mobility_upper: 'Shoulders & Back',
}

export const BUILTIN_ROUTINES: Routine[] = Object.values(SESSION_TEMPLATES).map((t) => ({
  id: t.key,
  name: ROUTINE_NAME[t.key] ?? t.name.replace(/\s*\(.*\)$/, ''),
  focus: TEMPLATE_FOCUS[t.key] ?? 'full',
  minutes: estimateSessionMinutes(t.exercises),
  exercises: t.exercises,
  createdAt: '',
  source: 'builtin',
}))

export function userRoutines(): Routine[] {
  const raw = getSetting<unknown>(TRAIN_ROUTINES_SETTING, [])
  return Array.isArray(raw) ? (raw as Routine[]).filter((r) => r && typeof r.id === 'string' && Array.isArray(r.exercises)) : []
}

/** Saved routines first (newest first), then the built-ins. */
export function listRoutines(): Routine[] {
  return [...userRoutines(), ...BUILTIN_ROUTINES]
}

export function saveRoutineFromPlan(plan: AIPlanDraft, source: 'ai' | 'local'): Routine {
  const routine: Routine = {
    id: `r_${Date.now().toString(36)}`,
    name: plan.name,
    focus: plan.focus as PlanFocus,
    minutes: plan.minutes,
    // The routine is the plan as intended; gate swaps are re-decided on the day it is run.
    exercises: planToPlanned(plan.exercises).map((e) => ({ exerciseId: e.substitutedFrom ?? e.exerciseId, sets: e.sets, repMin: e.repMin, repMax: e.repMax, loadKg: null, restSec: e.restSec })),
    createdAt: nowIso(),
    source,
  }
  setSetting(TRAIN_ROUTINES_SETTING, [routine, ...userRoutines()])
  return routine
}

export function deleteRoutine(id: string): void {
  setSetting(TRAIN_ROUTINES_SETTING, userRoutines().filter((r) => r.id !== id))
}

/** A planned session from a routine. Starting it still goes through the symptom gate. */
export function sessionFromRoutine(r: Routine, scheduledDate: string): number {
  const template = r.source === 'builtin' ? SESSION_TEMPLATES[r.id] : undefined
  const row: Omit<WorkoutSession, 'id'> = {
    templateKey: template ? template.key : AI_PLAN_TEMPLATE_KEY,
    name: template ? template.name : r.name,
    type: template ? template.type : sessionTypeForFocus(r.focus),
    tier: template ? template.tier : 'minimum',
    scheduledDate,
    status: 'planned',
    startedAt: null,
    completedAt: null,
    durationMin: null,
    readiness: null,
    sessionRpe: null,
    notes: '',
    exercises: cloneExercises(r.exercises),
  }
  return createSession(row)
}

/** Union of muscles trained by a list of exercises; anything primary somewhere is not repeated as secondary. */
export function musclesOf(exerciseIds: string[], byId: Map<string, Exercise>): { primary: string[]; secondary: string[] } {
  const primary = new Set<string>()
  const secondary = new Set<string>()
  for (const id of exerciseIds) {
    const ex = byId.get(id)
    if (!ex) continue
    ex.primaryMuscles.forEach((m) => primary.add(m))
    ex.secondaryMuscles.forEach((m) => secondary.add(m))
  }
  return { primary: [...primary], secondary: [...secondary].filter((m) => !primary.has(m)) }
}
