// Rolling weekly planner: Minimum / Target / Stretch tiers, reflow, shortened sessions, gate substitution.
// Pure functions; exercise IDs are the canonical strings from docs/CONTRACTS.md.
import type { Exercise, PlannedExercise, SessionType, WorkoutSession } from '../domain/types'
import { addDays, dayName, startOfWeek } from '../lib/util'
import { findSubstitute, isExerciseAllowed, type GateResult } from './symptomGate'

export type Tier = 'minimum' | 'target' | 'stretch'

export interface SessionTemplate {
  key: string
  name: string
  type: SessionType
  tier: Tier
  estMin: number
  exercises: PlannedExercise[]
}

const ex = (exerciseId: string, sets: number, repMin: number, repMax: number, restSec: number, loadKg: number | null = null): PlannedExercise =>
  ({ exerciseId, sets, repMin, repMax, loadKg, restSec })

/** Exercises where repMin/repMax are seconds, not reps. */
export const TIMED_IDS = new Set<string>(['plank', 'side_plank', 'farmers_carry', 'stationary_bike', 'incline_walk', 'swim_freestyle', 'swim_easy'])

/** Multi-joint movements kept when a session is shortened. */
export const COMPOUND_IDS = new Set<string>([
  'db_bench_press', 'incline_db_press', 'machine_chest_press', 'lat_pulldown', 'seated_cable_row', 'chest_supported_db_row',
  'one_arm_db_row', 'db_shoulder_press', 'machine_shoulder_press', 'leg_press', 'hack_squat', 'goblet_squat', 'db_split_squat',
  'hip_thrust', 'glute_bridge', 'db_rdl', 'cable_pull_through', 'farmers_carry',
])

export const SESSION_TEMPLATES: Record<string, SessionTemplate> = {
  upper_a: {
    key: 'upper_a', name: 'Upper Body Strength', type: 'strength', tier: 'minimum', estMin: 42,
    exercises: [
      ex('db_bench_press', 3, 8, 12, 90),
      ex('lat_pulldown', 3, 8, 12, 90),
      ex('db_shoulder_press', 3, 8, 12, 90),
      ex('seated_cable_row', 3, 10, 12, 75),
      ex('lateral_raise', 2, 12, 15, 60),
      ex('triceps_pushdown', 2, 10, 15, 60),
    ],
  },
  lower_a: {
    key: 'lower_a', name: 'Lower Body Strength (knee-friendly)', type: 'strength', tier: 'minimum', estMin: 40,
    exercises: [
      ex('leg_press', 3, 10, 12, 120),      // moderate range of motion, stop above the pain-free depth
      ex('hip_thrust', 3, 8, 12, 90),
      ex('lying_leg_curl', 3, 10, 12, 75),
      ex('leg_extension', 2, 12, 15, 60),   // light, controlled
      ex('standing_calf_raise', 3, 12, 15, 60),
      ex('dead_bug', 2, 8, 10, 45),
    ],
  },
  full_b: {
    key: 'full_b', name: 'Full Body Strength', type: 'strength', tier: 'minimum', estMin: 45,
    exercises: [
      ex('machine_chest_press', 3, 8, 12, 90),
      ex('chest_supported_db_row', 3, 8, 12, 90),
      ex('db_rdl', 3, 8, 10, 120),
      ex('cable_pull_through', 2, 12, 15, 60),
      ex('db_curl', 2, 10, 12, 60),
      ex('overhead_cable_triceps', 2, 10, 15, 60),
      ex('plank', 2, 30, 45, 45),
    ],
  },
  conditioning_bike: {
    key: 'conditioning_bike', name: 'Bike Conditioning (low impact)', type: 'conditioning', tier: 'target', estMin: 30,
    exercises: [
      ex('stationary_bike', 8, 30, 45, 75),   // 8 × 30–45 s hard, 75 s easy
      ex('incline_walk', 1, 600, 900, 0),     // 10–15 min cooldown walk
    ],
  },
  swim: {
    key: 'swim', name: 'Swim', type: 'swim', tier: 'stretch', estMin: 30,
    exercises: [
      ex('swim_freestyle', 8, 50, 75, 45),    // 8 × 50–75 s efforts
      ex('swim_easy', 1, 600, 900, 0),        // 10–15 min easy
    ],
  },
  mobility_hips: {
    key: 'mobility_hips', name: 'Hips & Hamstrings Mobility', type: 'mobility', tier: 'stretch', estMin: 15,
    exercises: [
      ex('glute_bridge', 2, 12, 15, 30),
      ex('bird_dog', 2, 8, 10, 30),
      ex('dead_bug', 2, 8, 10, 30),
      ex('hip_abduction_machine', 2, 12, 15, 30),
      ex('side_plank', 2, 20, 30, 30),
    ],
  },
  mobility_upper: {
    key: 'mobility_upper', name: 'Shoulders & Back Mobility', type: 'mobility', tier: 'stretch', estMin: 15,
    exercises: [
      ex('face_pull', 2, 12, 15, 30),
      ex('pallof_press', 2, 10, 12, 30),
      ex('bird_dog', 2, 8, 10, 30),
      ex('plank', 2, 30, 45, 30),
    ],
  },
}

export const STRENGTH_MINIMUM = 3

/** Day-of-week offsets from Monday for each template per tier. */
const WEEK_LAYOUT: Record<Tier, { key: string; offset: number }[]> = {
  minimum: [
    { key: 'upper_a', offset: 0 },
    { key: 'lower_a', offset: 2 },
    { key: 'full_b', offset: 4 },
  ],
  target: [
    { key: 'upper_a', offset: 0 },
    { key: 'lower_a', offset: 2 },
    { key: 'full_b', offset: 4 },
    { key: 'conditioning_bike', offset: 5 },
  ],
  stretch: [
    { key: 'upper_a', offset: 0 },
    { key: 'swim', offset: 1 },
    { key: 'lower_a', offset: 2 },
    { key: 'full_b', offset: 4 },
    { key: 'conditioning_bike', offset: 5 },
    { key: 'mobility_hips', offset: 6 },
  ],
}

export function cloneExercises(list: PlannedExercise[]): PlannedExercise[] {
  return list.map((e) => ({ ...e }))
}

export function sessionFromTemplate(key: string, scheduledDate: string): Omit<WorkoutSession, 'id'> {
  const t = SESSION_TEMPLATES[key]
  if (!t) throw new Error(`Unknown session template: ${key}`)
  return {
    templateKey: t.key,
    name: t.name,
    type: t.type,
    tier: t.tier,
    scheduledDate,
    status: 'planned',
    startedAt: null,
    completedAt: null,
    durationMin: null,
    readiness: null,
    sessionRpe: null,
    notes: '',
    exercises: cloneExercises(t.exercises),
  }
}

/** minimum = 3 strength; target = + bike conditioning; stretch = + swim + a mobility block. */
export function buildWeek(weekStart: string, tier: Tier): Omit<WorkoutSession, 'id'>[] {
  const start = startOfWeek(weekStart)
  return WEEK_LAYOUT[tier].map(({ key, offset }) => sessionFromTemplate(key, addDays(start, offset)))
}

export interface ReflowMove {
  id: number
  scheduledDate: string
  note: string
  /** Set when the session could not be fitted into the week and should be dropped/skipped rather than moved. */
  drop?: boolean
}

function priority(s: WorkoutSession): number {
  if (s.type === 'strength') return 0
  if (s.tier === 'target') return 1
  return 2
}

/**
 * Move missed planned sessions (date < today) forward into free days of the current week,
 * one session per day. Strength sessions are placed first and may displace a planned
 * stretch/target session when that is the only way to keep 3 strength sessions in the week.
 * Completed, skipped and in-progress sessions are never moved.
 */
export function reflowWeek(sessions: WorkoutSession[], today: string): ReflowMove[] {
  const weekStart = startOfWeek(today)
  const weekEnd = addDays(weekStart, 6)
  const inWeek = sessions.filter((s) => s.scheduledDate >= weekStart && s.scheduledDate <= weekEnd)
  const missed = inWeek.filter((s) => s.status === 'planned' && s.scheduledDate < today)
  if (!missed.length) return []

  const fixed = inWeek.filter((s) => !missed.includes(s))
  const occupied = new Set(fixed.filter((s) => s.scheduledDate >= today && s.status !== 'skipped').map((s) => s.scheduledDate))
  const freeDays: string[] = []
  for (let d = today; d <= weekEnd; d = addDays(d, 1)) if (!occupied.has(d)) freeDays.push(d)

  let strengthCommitted = fixed.filter((s) =>
    s.type === 'strength' && (s.status === 'completed' || s.status === 'in_progress' || (s.status === 'planned' && s.scheduledDate >= today)),
  ).length

  missed.sort((a, b) => priority(a) - priority(b) || a.scheduledDate.localeCompare(b.scheduledDate))
  const missedStrength = missed.filter((s) => s.type === 'strength').length
  const strengthWithoutSlot = Math.max(0, missedStrength - freeDays.length)
  const strengthStillNeeded = Math.max(0, STRENGTH_MINIMUM - (strengthCommitted + Math.min(missedStrength, freeDays.length)))
  const victimsNeeded = Math.min(strengthWithoutSlot, strengthStillNeeded)

  const displaceable = fixed
    .filter((s) => s.status === 'planned' && s.scheduledDate >= today && s.type !== 'strength')
    .sort((a, b) => priority(b) - priority(a) || b.scheduledDate.localeCompare(a.scheduledDate))
  const victims = displaceable.slice(0, victimsNeeded)
  const slots = [...freeDays, ...victims.map((v) => v.scheduledDate)].sort()

  const moves: ReflowMove[] = []
  for (const s of missed) {
    const day = slots.shift()
    if (day) {
      const protectNote = s.type === 'strength' && victims.some((v) => v.scheduledDate === day) ? ' to protect the 3-session minimum' : ''
      moves.push({ id: s.id, scheduledDate: day, note: `Moved ${s.name} from ${dayName(s.scheduledDate)} to ${day === today ? 'today' : dayName(day)}${protectNote}` })
      if (s.type === 'strength') strengthCommitted++
    } else {
      moves.push({ id: s.id, scheduledDate: s.scheduledDate, note: `No days left this week — ${s.name} dropped; it returns next week`, drop: true })
    }
  }
  for (const v of victims) {
    moves.push({ id: v.id, scheduledDate: v.scheduledDate, note: `Dropped ${v.name} on ${dayName(v.scheduledDate)} to make room for a strength session`, drop: true })
  }
  return moves
}

/** Rough duration: 5 min warm-up + per-set work and rest. */
export function estimateSessionMinutes(exercises: PlannedExercise[]): number {
  let sec = 5 * 60
  for (const e of exercises) {
    const work = TIMED_IDS.has(e.exerciseId) ? (e.repMin + e.repMax) / 2 : 45
    sec += e.sets * (work + e.restSec)
  }
  return Math.round(sec / 60)
}

/** 25–35 minute version: first 4 compounds (or first 4 exercises), 2 sets each, rest capped at 90 s. */
export function shortenedVersion(exercises: PlannedExercise[]): PlannedExercise[] {
  const compounds = exercises.filter((e) => COMPOUND_IDS.has(e.exerciseId) || COMPOUND_IDS.has(e.substitutedFrom ?? ''))
  const chosen = (compounds.length >= 2 ? compounds : exercises).slice(0, 4)
  if (chosen.length < 4) {
    for (const e of exercises) { if (chosen.length >= 4) break; if (!chosen.includes(e)) chosen.push(e) }
  }
  return chosen.map((e) => ({ ...e, sets: Math.min(e.sets, 2), restSec: Math.min(e.restSec, 90) }))
}

export const MERGED_SETS_CAP = 4

/**
 * Replace any exercise the gate disallows with a safer substitute; drop it if none exists.
 * A substitute not yet in the session is preferred; when the only safe option is already
 * programmed, its sets are merged into that entry (capped) instead of duplicating the exercise.
 */
export function applyGateToSession(
  exercises: PlannedExercise[],
  gate: GateResult,
  library: Exercise[],
): { exercises: PlannedExercise[]; changes: string[] } {
  const byId = new Map(library.map((e) => [e.id, e]))
  const work = cloneExercises(exercises) // mutable copies; the input (and templates) stay untouched
  const out: PlannedExercise[] = []
  const changes: string[] = []
  const used = new Set(work.map((e) => e.exerciseId))
  for (let i = 0; i < work.length; i++) {
    const pe = work[i]
    const exo = byId.get(pe.exerciseId)
    if (!exo) { out.push(pe); continue }
    const check = isExerciseAllowed(exo, gate)
    if (check.allowed) { out.push(pe); continue }
    const why = check.reasons.join('; ')
    const fresh = findSubstitute(exo, gate, library.filter((e) => !used.has(e.id)))
    const sub = fresh ?? findSubstitute(exo, gate, library)
    if (!sub) {
      changes.push(`Removed ${exo.name} — no safe substitute today (${why})`)
      continue
    }
    if (fresh) {
      used.add(sub.id)
      out.push({ ...pe, exerciseId: sub.id, loadKg: null, substitutedFrom: pe.exerciseId, substitutionReason: why })
      changes.push(`Swapped ${exo.name} → ${sub.name} (${why})`)
      continue
    }
    // Only safe option is already programmed (earlier in `out`, or later in `work`): merge sets into it.
    const target = out.find((e) => e.exerciseId === sub.id) ?? work.slice(i + 1).find((e) => e.exerciseId === sub.id)
    if (target) {
      target.sets = Math.min(MERGED_SETS_CAP, target.sets + pe.sets)
      changes.push(`Swapped ${exo.name} → ${sub.name} (${why}); merged into the existing ${sub.name} (${target.sets} sets)`)
    }
  }
  return { exercises: out, changes }
}
