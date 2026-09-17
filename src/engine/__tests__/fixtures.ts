// Shared fixtures for engine tests. Not a test file.
import type { DailyCheckIn, Exercise, ExerciseSet, RedFlags, Region, SafetyTag, SymptomCheck, WorkoutSession, NutritionTarget } from '../../domain/types'

export const TODAY = '2026-09-10' // Thursday
export const WEEK_START = '2026-09-07' // Monday

export function mk(id: string, name: string, equipment: string, pattern: string, safetyTags: SafetyTag[] = [], substitutions: string[] = [], timed = false, primary: string[] = []): Exercise {
  return { id, name, equipment, primaryMuscles: primary, secondaryMuscles: [], pattern, safetyTags, substitutions, instructions: `${name} instructions.`, timed }
}

export const LIBRARY: Exercise[] = [
  mk('db_bench_press', 'Dumbbell Bench Press', 'dumbbell', 'horizontal_push', [], ['machine_chest_press'], false, ['chest']),
  mk('incline_db_press', 'Incline Dumbbell Press', 'dumbbell', 'horizontal_push', [], ['machine_chest_press'], false, ['chest']),
  mk('machine_chest_press', 'Machine Chest Press', 'machine', 'horizontal_push', [], [], false, ['chest']),
  mk('cable_fly', 'Cable Fly', 'cable', 'horizontal_push', [], [], false, ['chest']),
  mk('lat_pulldown', 'Lat Pulldown', 'cable', 'vertical_pull', [], [], false, ['lats']),
  mk('seated_cable_row', 'Seated Cable Row', 'cable', 'horizontal_pull', [], [], false, ['back']),
  mk('chest_supported_db_row', 'Chest-Supported Dumbbell Row', 'dumbbell', 'horizontal_pull', [], [], false, ['back']),
  mk('one_arm_db_row', 'One-Arm Dumbbell Row', 'dumbbell', 'horizontal_pull', [], [], false, ['back']),
  mk('db_shoulder_press', 'Dumbbell Shoulder Press', 'dumbbell', 'vertical_push', ['overhead', 'neck_load'], ['machine_shoulder_press', 'lateral_raise'], false, ['shoulders']),
  mk('machine_shoulder_press', 'Machine Shoulder Press', 'machine', 'vertical_push', ['overhead'], ['lateral_raise'], false, ['shoulders']),
  mk('lateral_raise', 'Dumbbell Lateral Raise', 'dumbbell', 'shoulder_isolation', [], [], false, ['shoulders']),
  mk('face_pull', 'Face Pull', 'cable', 'horizontal_pull', [], [], false, ['rear delts']),
  mk('db_curl', 'Dumbbell Curl', 'dumbbell', 'elbow_flexion', [], ['cable_curl'], false, ['biceps']),
  mk('cable_curl', 'Cable Curl', 'cable', 'elbow_flexion', [], [], false, ['biceps']),
  mk('triceps_pushdown', 'Triceps Pushdown', 'cable', 'elbow_extension', [], [], false, ['triceps']),
  mk('overhead_cable_triceps', 'Overhead Cable Triceps Extension', 'cable', 'elbow_extension', ['overhead'], ['triceps_pushdown'], false, ['triceps']),
  mk('leg_press', 'Leg Press', 'machine', 'squat', ['knee_load'], ['hip_thrust', 'glute_bridge'], false, ['quads', 'glutes']),
  mk('hack_squat', 'Hack Squat', 'machine', 'squat', ['knee_load', 'deep_knee_flexion'], ['leg_press'], false, ['quads']),
  mk('goblet_squat', 'Goblet Squat', 'dumbbell', 'squat', ['knee_load', 'deep_knee_flexion'], ['leg_press', 'hip_thrust'], false, ['quads', 'glutes']),
  mk('db_split_squat', 'Dumbbell Split Squat', 'dumbbell', 'lunge', ['knee_load', 'deep_knee_flexion'], ['leg_press'], false, ['quads', 'glutes']),
  mk('hip_thrust', 'Hip Thrust', 'barbell', 'hinge', ['spinal_load'], ['glute_bridge'], false, ['glutes']),
  mk('glute_bridge', 'Glute Bridge', 'bodyweight', 'hinge', [], [], false, ['glutes']),
  mk('db_rdl', 'Dumbbell Romanian Deadlift', 'dumbbell', 'hinge', ['spinal_load', 'axial_load'], ['lying_leg_curl', 'cable_pull_through'], false, ['hamstrings']),
  mk('lying_leg_curl', 'Lying Leg Curl', 'machine', 'knee_flexion', [], ['seated_leg_curl'], false, ['hamstrings']),
  mk('seated_leg_curl', 'Seated Leg Curl', 'machine', 'knee_flexion', [], [], false, ['hamstrings']),
  mk('leg_extension', 'Leg Extension', 'machine', 'knee_extension', [], [], false, ['quads']),
  mk('standing_calf_raise', 'Standing Calf Raise', 'machine', 'calf', [], ['seated_calf_raise'], false, ['calves']),
  mk('seated_calf_raise', 'Seated Calf Raise', 'machine', 'calf', [], [], false, ['calves']),
  mk('cable_pull_through', 'Cable Pull-Through', 'cable', 'hinge', [], [], false, ['glutes']),
  mk('hip_abduction_machine', 'Hip Abduction Machine', 'machine', 'hip_abduction', [], [], false, ['glutes']),
  mk('dead_bug', 'Dead Bug', 'bodyweight', 'core', [], [], false, ['core']),
  mk('plank', 'Plank', 'bodyweight', 'core', [], [], true, ['core']),
  mk('side_plank', 'Side Plank', 'bodyweight', 'core', [], [], true, ['core']),
  mk('pallof_press', 'Pallof Press', 'cable', 'core', [], [], false, ['core']),
  mk('cable_crunch', 'Cable Crunch', 'cable', 'core', ['spinal_flexion'], ['dead_bug'], false, ['abs']),
  mk('bird_dog', 'Bird Dog', 'bodyweight', 'core', [], [], false, ['core']),
  mk('farmers_carry', "Farmer's Carry", 'dumbbell', 'carry', ['axial_load'], [], true, ['grip']),
  mk('stationary_bike', 'Stationary Bike', 'bike', 'cardio', [], [], true, ['legs']),
  mk('incline_walk', 'Incline Walk', 'treadmill', 'cardio', [], [], true, ['legs']),
  mk('swim_freestyle', 'Freestyle Swim', 'pool', 'cardio', [], [], true, ['full body']),
  mk('swim_easy', 'Easy Swim', 'pool', 'cardio', [], [], true, ['full body']),
]

export const byId = (id: string): Exercise => {
  const e = LIBRARY.find((x) => x.id === id)
  if (!e) throw new Error(`fixture missing ${id}`)
  return e
}

let symId = 1
export function sym(region: Region, painScore: number, redFlags: RedFlags = {}, ts = `${TODAY}T07:30:00`, context: SymptomCheck['context'] = 'morning'): SymptomCheck {
  return { id: symId++, ts, region, painScore, redFlags, notes: '', context, sessionId: null }
}

export function checkIn(partial: Partial<DailyCheckIn> = {}): DailyCheckIn {
  return { id: 1, date: TODAY, energy: 6, soreness: 2, stress: 3, notes: '', ...partial }
}

let setId = 1
export function set(exerciseId: string, setIndex: number, reps: number | null, loadKg: number | null, rir: number | null = 2, painFlag = false, durationSec: number | null = null, sessionId = 1): ExerciseSet {
  return { id: setId++, sessionId, exerciseId, setIndex, reps, loadKg, rir, rpe: null, durationSec, painFlag, loggedAt: `${TODAY}T08:00:00` }
}

let sessId = 100
export function session(templateKey: string, scheduledDate: string, status: WorkoutSession['status'] = 'planned', extra: Partial<WorkoutSession> = {}): WorkoutSession {
  const map: Record<string, { name: string; type: WorkoutSession['type']; tier: WorkoutSession['tier'] }> = {
    upper_a: { name: 'Upper Body Strength', type: 'strength', tier: 'minimum' },
    lower_a: { name: 'Lower Body Strength (knee-friendly)', type: 'strength', tier: 'minimum' },
    full_b: { name: 'Full Body Strength', type: 'strength', tier: 'minimum' },
    conditioning_bike: { name: 'Bike Conditioning (low impact)', type: 'conditioning', tier: 'target' },
    swim: { name: 'Swim', type: 'swim', tier: 'stretch' },
    mobility_hips: { name: 'Hips & Hamstrings Mobility', type: 'mobility', tier: 'stretch' },
  }
  const m = map[templateKey]
  return {
    id: sessId++, templateKey, name: m.name, type: m.type, tier: m.tier, scheduledDate, status,
    startedAt: null, completedAt: status === 'completed' ? `${scheduledDate}T19:00:00` : null, durationMin: status === 'completed' ? 42 : null,
    readiness: null, sessionRpe: null, notes: '', exercises: [], ...extra,
  }
}

export const TARGET: NutritionTarget = { id: 1, startDate: '2026-08-01', endDate: null, kcal: 2050, proteinG: 150, carbsG: 190, fatG: 65, rationale: 'seed' }
