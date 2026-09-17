import { describe, expect, it } from 'vitest'
import { EXERCISES } from '../../data/exercises'
import { PLAN_FOCUSES, PLAN_MINUTES, fallbackPlan, planMinutes, planToSession, validateAIPlan } from '../aiPlan'
import { evaluateSymptomGate, isExerciseAllowed } from '../symptomGate'
import { LIBRARY, sym } from './fixtures'

const OK = evaluateSymptomGate([])
const KNEE_RED = evaluateSymptomGate([sym('knee_left', 7)])
const BACK_NECK_RED = evaluateSymptomGate([sym('back_lower', 7), sym('neck', 6, { radiating: true })])

const row = (exerciseId: string, sets = 3, repMin = 8, repMax = 12, restSec = 90) => ({ exerciseId, sets, repMin, repMax, restSec })
const ids = (p: { exercises: { exerciseId: string }[] }) => p.exercises.map((e) => e.exerciseId)

describe('validateAIPlan', () => {
  it('drops ids that are not in the library and keeps the rest in order', () => {
    const raw = { name: 'Push Pull', focus: 'upper', rationale: 'Because.', exercises: [row('db_bench_press'), row('barbell_back_squat'), row('lat_pulldown'), row('made_up'), row('seated_cable_row')] }
    const r = validateAIPlan(raw, LIBRARY, OK, 45)
    expect(ids(r.plan)).toEqual(['db_bench_press', 'lat_pulldown', 'seated_cable_row'])
    expect(r.dropped).toEqual(['barbell_back_squat', 'made_up'])
    expect(r.plan.name).toBe('Push Pull')
  })

  it('knee RED removes or swaps every knee-loading exercise', () => {
    const raw = { focus: 'lower', exercises: [row('leg_press'), row('goblet_squat'), row('db_split_squat'), row('lying_leg_curl'), row('hip_thrust')] }
    const r = validateAIPlan(raw, LIBRARY, KNEE_RED, 45)
    for (const e of r.plan.exercises) {
      const ex = LIBRARY.find((x) => x.id === e.exerciseId)!
      expect(isExerciseAllowed(ex, KNEE_RED).allowed, e.exerciseId).toBe(true)
      expect(ex.safetyTags).not.toContain('knee_load')
    }
    expect(r.substituted.length + r.dropped.length).toBeGreaterThanOrEqual(3)
    expect(r.substituted[0]).toMatch(/^Leg Press → /)
    expect(r.plan.exercises.find((e) => e.substitutedFrom === 'leg_press')?.substitutionReason).toMatch(/knee/i)
    expect(r.plan.exercises.length).toBeGreaterThanOrEqual(3)
  })

  it('clamps sets, reps and rest, and tolerates junk values', () => {
    const raw = { focus: 'upper', exercises: [row('db_bench_press', 12, 1, 80, 600), { exerciseId: 'lat_pulldown', sets: 'x', repMin: null, repMax: -4, restSec: 5 }, row('db_curl', 0, 20, 10, 10)] }
    const r = validateAIPlan(raw, LIBRARY, OK, 120)
    const [a, b, c] = r.plan.exercises
    expect([a.sets, a.repMin, a.repMax, a.restSec]).toEqual([5, 3, 30, 180])
    expect(b.sets).toBe(3)
    expect(b.repMax).toBeGreaterThanOrEqual(b.repMin)
    expect(b.restSec).toBe(30)
    expect(c.sets).toBe(1)
    expect(c.repMax).toBeGreaterThanOrEqual(c.repMin)
  })

  it('removes duplicates', () => {
    const raw = { focus: 'upper', exercises: [row('db_bench_press'), row('db_bench_press'), row('lat_pulldown'), row('lat_pulldown'), row('db_curl')] }
    const r = validateAIPlan(raw, LIBRARY, OK, 60)
    expect(new Set(ids(r.plan)).size).toBe(r.plan.exercises.length)
    expect(r.plan.exercises).toHaveLength(3)
  })

  it('trims to the time budget but never below three exercises', () => {
    const many = ['db_bench_press', 'lat_pulldown', 'seated_cable_row', 'db_shoulder_press', 'lateral_raise', 'db_curl', 'triceps_pushdown', 'face_pull']
    const raw = { focus: 'upper', exercises: many.map((id) => row(id, 5, 8, 12, 180)) }
    for (const minutes of PLAN_MINUTES) {
      const r = validateAIPlan(raw, LIBRARY, OK, minutes)
      expect(planMinutes(r.plan.exercises, LIBRARY), `${minutes} min`).toBeLessThanOrEqual(minutes)
      expect(r.plan.minutes).toBeLessThanOrEqual(minutes)
      expect(r.plan.exercises.length).toBeGreaterThanOrEqual(3)
    }
    expect(validateAIPlan(raw, LIBRARY, OK, 20).plan.exercises.length).toBeLessThan(validateAIPlan(raw, LIBRARY, OK, 60).plan.exercises.length)
  })

  it('tops an empty or garbage reply up to three gate-safe exercises from the matching template', () => {
    for (const raw of [null, 'nope', {}, { focus: 'lower', exercises: [row('nope')] }]) {
      const r = validateAIPlan(raw, LIBRARY, KNEE_RED, 30)
      expect(r.plan.exercises.length).toBeGreaterThanOrEqual(3)
      for (const e of r.plan.exercises) expect(isExerciseAllowed(LIBRARY.find((x) => x.id === e.exerciseId)!, KNEE_RED).allowed).toBe(true)
    }
  })
})

describe('fallbackPlan', () => {
  it('is never empty, never duplicated, gate-safe and within budget for every focus × duration × gate', () => {
    for (const library of [LIBRARY, EXERCISES]) {
      for (const gate of [OK, KNEE_RED, BACK_NECK_RED]) {
        for (const focus of PLAN_FOCUSES) {
          for (const minutes of PLAN_MINUTES) {
            const r = fallbackPlan(focus, minutes, library, gate)
            const label = `${focus} ${minutes} ${gate.overall}`
            expect(r.plan.exercises.length, label).toBeGreaterThanOrEqual(3)
            expect(new Set(ids(r.plan)).size, label).toBe(r.plan.exercises.length)
            expect(planMinutes(r.plan.exercises, library), label).toBeLessThanOrEqual(minutes)
            expect(r.plan.rationale.length).toBeGreaterThan(10)
            for (const e of r.plan.exercises) {
              const ex = library.find((x) => x.id === e.exerciseId)
              expect(ex, `${label} ${e.exerciseId}`).toBeTruthy()
              expect(isExerciseAllowed(ex!, gate).allowed, `${label} ${e.exerciseId}`).toBe(true)
            }
          }
        }
      }
    }
  })

  it('shortens for 30 minutes and extends for 60', () => {
    const short = fallbackPlan('upper', 30, LIBRARY, OK).plan
    const long = fallbackPlan('upper', 60, LIBRARY, OK).plan
    const totalSets = (p: typeof short) => p.exercises.reduce((n, e) => n + e.sets, 0)
    expect(short.exercises.every((e) => e.sets <= 2)).toBe(true)
    expect(totalSets(long)).toBeGreaterThan(totalSets(short))
    expect(long.minutes).toBeGreaterThan(short.minutes)
  })

  it('reports gate swaps on a knee RED lower day', () => {
    const r = fallbackPlan('lower', 45, LIBRARY, KNEE_RED)
    expect(ids(r.plan)).not.toContain('leg_press')
    expect(r.substituted.length + r.dropped.length).toBeGreaterThan(0)
  })
})

describe('planToSession', () => {
  it('creates a planned ai_plan session that keeps the gate substitution trail', () => {
    const { plan } = validateAIPlan({ name: 'Legs', focus: 'lower', exercises: [row('leg_press'), row('lying_leg_curl'), row('seated_calf_raise')] }, LIBRARY, KNEE_RED, 45)
    const s = planToSession(plan, '2026-09-10')
    expect(s.templateKey).toBe('ai_plan')
    expect(s.status).toBe('planned')
    expect(s.type).toBe('strength')
    expect(s.exercises.every((e) => e.loadKg === null)).toBe(true)
    expect(s.exercises.some((e) => e.substitutedFrom === 'leg_press')).toBe(true)
  })
})
