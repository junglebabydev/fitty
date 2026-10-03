// Programme opt-ins on existing rules (docs/PRD_TRAINING_PROGRAMS.md §6.3–§6.6). Every option is off by default,
// and the defaults are checked here against today's behaviour alongside the pinned planner/progression tests.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseSet, PlannedExercise, WorkoutSession } from '../../domain/types'
import { PROGRAM_SETTING, type Enrollment } from '../../domain/programs'
import { addDays } from '../../lib/util'
import { db } from '../../db/database'
import * as repo from '../../db/repositories'
import { ensureWeekPlanned } from '../../features/settings/onboarding'
import { finishSession } from '../../features/workout/finish'
import { applyTier } from '../../features/workout/plan'
import { SESSION_TEMPLATES, applyGateToSession, buildWeek, estimateSessionMinutes, reflowWeek } from '../planner'
import { evaluateProgression } from '../progression'
import { baselineAvoidTags, evaluateSymptomGate } from '../symptomGate'
import { LIBRARY, TODAY, WEEK_START, mk, session, sym } from './fixtures'

const pe = (exerciseId: string, sets: number, repMin: number, repMax: number, restSec = 60, extra: Partial<PlannedExercise> = {}): PlannedExercise =>
  ({ exerciseId, sets, repMin, repMax, loadKg: null, restSec, ...extra })

const OK = evaluateSymptomGate([])

// A small cardio / plyometric library with known tags, substitutions and units.
const LIB = [
  mk('easy_run', 'Easy Run', 'bodyweight', 'cardio', ['impact', 'knee_load'], ['brisk_walk'], true),
  mk('brisk_walk', 'Brisk Walk', 'bodyweight', 'cardio', [], [], true),
  mk('squat_jump', 'Squat Jump', 'bodyweight', 'plyometric', ['impact'], ['wall_sit', 'bodyweight_squat'], false),
  mk('wall_sit', 'Wall Sit', 'bodyweight', 'plyometric', [], [], true),
  mk('bodyweight_squat', 'Bodyweight Squat', 'bodyweight', 'plyometric', [], [], false),
  mk('box_jump', 'Box Jump', 'bodyweight', 'jump', ['impact'], ['wall_hold'], false),
  mk('wall_hold', 'Wall Hold', 'bodyweight', 'jump', [], [], true),
  mk('jump_rope', 'Jump Rope', 'bodyweight', 'rope', ['impact'], ['step_up'], true),
  mk('step_up', 'Step-up', 'bodyweight', 'rope', [], [], false),
]

describe('baselineAvoidTags allowImpact', () => {
  it('default is unchanged: a knee flag avoids impact and deep knee flexion', () => {
    expect(baselineAvoidTags(['knee_left']).sort()).toEqual(['deep_knee_flexion', 'impact'])
    expect(baselineAvoidTags(['knee_left'], {}).sort()).toEqual(['deep_knee_flexion', 'impact'])
  })

  it('allowImpact drops impact but keeps the rest of the standing set', () => {
    expect(baselineAvoidTags(['knee_left', 'hip'], { allowImpact: true })).toEqual(['deep_knee_flexion'])
    expect(baselineAvoidTags(['back_lower', 'neck'], { allowImpact: true }).sort()).toEqual(['axial_load', 'overhead', 'spinal_flexion'])
    expect(baselineAvoidTags([], { allowImpact: true })).toEqual([])
  })
})

describe('applyGateToSession options', () => {
  it('defaults match no options on the pinned scenarios', () => {
    const neck = evaluateSymptomGate([sym('neck', 4)])
    expect(applyGateToSession(SESSION_TEMPLATES.upper_a.exercises, neck, LIBRARY, {}))
      .toEqual(applyGateToSession(SESSION_TEMPLATES.upper_a.exercises, neck, LIBRARY))
    const knee = evaluateSymptomGate([sym('knee_left', 7)])
    expect(applyGateToSession(SESSION_TEMPLATES.lower_a.exercises, knee, LIBRARY, { extraAvoid: [], convertUnits: false }))
      .toEqual(applyGateToSession(SESSION_TEMPLATES.lower_a.exercises, knee, LIBRARY))
    const ok = applyGateToSession(SESSION_TEMPLATES.full_b.exercises, evaluateSymptomGate([sym('knee_left', 2)]), LIBRARY, {})
    expect(ok).toEqual({ exercises: SESSION_TEMPLATES.full_b.exercises, changes: [] })
  })

  it('extraAvoid is treated like a gate avoid tag, even on an OK day', () => {
    const plan = [pe('easy_run', 6, 60, 60, 90)]
    expect(applyGateToSession(plan, OK, LIB).changes).toEqual([])
    const { exercises, changes } = applyGateToSession(plan, OK, LIB, { extraAvoid: ['impact'] })
    expect(exercises).toEqual([{ ...plan[0], exerciseId: 'brisk_walk', substitutedFrom: 'easy_run', substitutionReason: 'Programme path: Impact' }])
    expect(changes).toEqual(['Swapped Easy Run → Brisk Walk (Programme path: Impact)'])
    // The gate passed in is not mutated.
    expect(OK.avoidTags).toEqual([])
  })

  it('role entries do not reserve ids or take merged sets: run intervals become walks in place', () => {
    const plan = [
      pe('brisk_walk', 1, 300, 300, 0, { role: 'warmup', program: true }),
      pe('easy_run', 6, 60, 60, 90, { program: true, restExerciseId: 'brisk_walk' }),
      pe('brisk_walk', 1, 300, 300, 0, { role: 'cooldown', program: true }),
    ]
    const { exercises } = applyGateToSession(plan, OK, LIB, { extraAvoid: ['impact'], convertUnits: true })
    expect(exercises).toHaveLength(3)
    expect(exercises[0]).toEqual(plan[0])
    expect(exercises[1]).toMatchObject({ exerciseId: 'brisk_walk', sets: 6, repMin: 60, repMax: 60, substitutedFrom: 'easy_run', restExerciseId: 'brisk_walk' })
    expect(exercises[2]).toEqual(plan[2])
  })

  it('a blocked role entry is swapped in place even when its substitute is already programmed', () => {
    const plan = [pe('easy_run', 1, 300, 300, 0, { role: 'warmup' }), pe('brisk_walk', 4, 60, 60, 60)]
    const { exercises } = applyGateToSession(plan, OK, LIB, { extraAvoid: ['impact'] })
    expect(exercises.map((e) => [e.exerciseId, e.sets, e.role])).toEqual([['brisk_walk', 1, 'warmup'], ['brisk_walk', 4, undefined]])
  })

  it('convertUnits prefers a same-unit substitute over the first listed one', () => {
    const plan = [pe('squat_jump', 3, 8, 12)]
    expect(applyGateToSession(plan, OK, LIB, { extraAvoid: ['impact'] }).exercises[0])
      .toMatchObject({ exerciseId: 'wall_sit', repMin: 8, repMax: 12 }) // default: first listed, range copied
    expect(applyGateToSession(plan, OK, LIB, { extraAvoid: ['impact'], convertUnits: true }).exercises[0])
      .toMatchObject({ exerciseId: 'bodyweight_squat', repMin: 8, repMax: 12 })
  })

  it('convertUnits converts reps → seconds (3 s a rep, nearest 5 s, min 10 s) and seconds → reps (min 1)', () => {
    const toSec = applyGateToSession([pe('box_jump', 3, 8, 12), pe('box_jump', 1, 2, 3)], OK, LIB, { extraAvoid: ['impact'], convertUnits: true })
    expect(toSec.exercises[0]).toMatchObject({ exerciseId: 'wall_hold', repMin: 25, repMax: 35 })
    const tiny = applyGateToSession([pe('box_jump', 1, 2, 3)], OK, LIB, { extraAvoid: ['impact'], convertUnits: true })
    expect(tiny.exercises[0]).toMatchObject({ exerciseId: 'wall_hold', repMin: 10, repMax: 10 })
    const toReps = applyGateToSession([pe('jump_rope', 4, 30, 45)], OK, LIB, { extraAvoid: ['impact'], convertUnits: true })
    expect(toReps.exercises[0]).toMatchObject({ exerciseId: 'step_up', repMin: 10, repMax: 15 })
    const short = applyGateToSession([pe('jump_rope', 4, 1, 2)], OK, LIB, { extraAvoid: ['impact'], convertUnits: true })
    expect(short.exercises[0]).toMatchObject({ repMin: 1, repMax: 1 })
  })
})

describe('estimateSessionMinutes', () => {
  it('keeps the tier template estimates', () => {
    const got = Object.fromEntries(Object.entries(SESSION_TEMPLATES).map(([k, t]) => [k, estimateSessionMinutes(t.exercises)]))
    expect(got).toEqual({ upper_a: 38, lower_a: 38, full_b: 40, conditioning_bike: 33, swim: 32, mobility_hips: 17, mobility_upper: 15 })
  })

  it('uses seconds for library exercises marked timed (treadmill, jump rope, walks)', () => {
    expect(estimateSessionMinutes([pe('brisk_walk', 1, 600, 600, 0)])).toBe(15)
    expect(estimateSessionMinutes([pe('treadmill_walk', 1, 1200, 1200, 0)])).toBe(25)
    expect(estimateSessionMinutes([pe('jump_rope', 5, 60, 60, 60)])).toBe(15)
  })

  it('counts intervals (rest bout in restSec) and circuits with a round rest', () => {
    expect(estimateSessionMinutes([pe('easy_run', 6, 60, 60, 90, { restExerciseId: 'brisk_walk' })])).toBe(20)
    const station = (id: string, extra: Partial<PlannedExercise> = {}) => pe(id, 3, 40, 40, 20, { circuit: 'a', ...extra })
    // per round: 40+20 + 40+20 + 40+60 = 220 s; 3 rounds + 5 min warm-up = 960 s
    expect(estimateSessionMinutes([station('jumping_jack'), station('high_knees'), station('mountain_climber', { roundRestSec: 60 })])).toBe(16)
    expect(estimateSessionMinutes([station('jumping_jack', { roundRestSec: 60 }), station('high_knees', { roundRestSec: 60 }), station('mountain_climber', { roundRestSec: 60 })])).toBe(16)
    // no round rest: the last station keeps its own rest
    expect(estimateSessionMinutes([station('jumping_jack'), station('high_knees'), station('mountain_climber')])).toBe(14)
  })
})

describe('reflowWeek skips programme rows', () => {
  const prog = (date: string, status: WorkoutSession['status'] = 'planned', type: WorkoutSession['type'] = 'conditioning', key = 'prog:start-running:w1d1') =>
    session('conditioning_bike', date, status, { templateKey: key, name: 'Run', type })

  it('never moves a missed programme or standalone-workout session', () => {
    const a = prog(addDays(WEEK_START, 1))
    const b = prog(addDays(WEEK_START, 2), 'planned', 'strength', 'work:gym-strength:w1d1')
    expect(reflowWeek([a, b], TODAY)).toEqual([])
  })

  it('never displaces a programme row and does not move a session onto its day', () => {
    // Thu (today) is free, Fri–Sun hold programme rows: the missed upper_a goes to today, nothing is dropped.
    const missed = session('upper_a', WEEK_START, 'planned')
    const rows = [1, 2, 3].map((d) => prog(addDays(TODAY, d)))
    const moves = reflowWeek([missed, ...rows], TODAY)
    expect(moves).toEqual([{ id: missed.id, scheduledDate: TODAY, note: expect.stringMatching(/to today$/) }])
    // With today taken too, the missed session has no slot: it is dropped, and no programme row is displaced.
    const busy = [0, 1, 2, 3].map((d) => prog(addDays(TODAY, d)))
    const m2 = reflowWeek([missed, ...busy], TODAY)
    expect(m2).toHaveLength(1)
    expect(m2[0]).toMatchObject({ id: missed.id, drop: true })
  })

  it('programme strength rows do not count toward the 3-strength minimum', () => {
    // Two tier strength sessions missed, one free day; a programme strength row ahead does not satisfy the minimum,
    // so the bike session is displaced exactly as it would be without the programme row.
    const m1 = session('upper_a', WEEK_START, 'planned')
    const m2 = session('lower_a', addDays(WEEK_START, 2), 'planned')
    const bike = session('conditioning_bike', addDays(TODAY, 1), 'planned')
    const p = [2, 3].map((d) => prog(addDays(TODAY, d), 'planned', 'strength', 'prog:gym-strength:w1d1'))
    const base = reflowWeek([m1, m2, bike, ...p], TODAY)
    expect(base.find((m) => m.id === bike.id)).toMatchObject({ drop: true })
    expect(base.some((m) => p.some((r) => r.id === m.id))).toBe(false)
  })
})

describe('evaluateProgression for programme entries', () => {
  const set = (reps: number | null, loadKg: number | null, durationSec: number | null = null): ExerciseSet =>
    ({ id: 1, sessionId: 1, exerciseId: 'x', setIndex: 1, reps, loadKg, rir: 2, rpe: null, durationSec, painFlag: false, loggedAt: '2026-09-08T10:00:00' })
  const pushup = mk('push_up', 'Push-up', 'bodyweight', 'horizontal_push')
  const plank = mk('plank', 'Plank', 'bodyweight', 'core', [], [], true)
  const run = mk('easy_run', 'Easy Run', 'bodyweight', 'cardio', ['impact'], [], true)
  const carry = mk('farmers_carry', 'Farmers Carry', 'dumbbell', 'carry', [], [], true)
  const bench = mk('db_bench_press', 'Dumbbell Bench Press', 'dumbbell', 'horizontal_push')

  it('defaults are unchanged: bodyweight and timed moves still progress outside a programme', () => {
    expect(evaluateProgression(pe('push_up', 3, 8, 12), pushup, [set(12, null), set(12, null)], []).action).toBe('increase')
    expect(evaluateProgression(pe('plank', 3, 30, 45), plank, [set(null, null, 45)], []).repMin).toBe(40)
  })

  it('holds timed and bodyweight programme targets at the plan, from the first session', () => {
    const hold = { action: 'hold', reason: 'Your programme sets this target.', stalled: false }
    expect(evaluateProgression(pe('push_up', 3, 8, 12, 60, { program: true }), pushup, [set(12, null), set(12, null)], []))
      .toEqual({ ...hold, nextLoadKg: null, repMin: 8, repMax: 12 })
    expect(evaluateProgression(pe('plank', 3, 30, 45, 60, { program: true }), plank, [set(null, null, 45)], []))
      .toEqual({ ...hold, nextLoadKg: null, repMin: 30, repMax: 45 })
    expect(evaluateProgression(pe('easy_run', 6, 90, 90, 90, { program: true }), run, [], []))
      .toEqual({ ...hold, nextLoadKg: null, repMin: 90, repMax: 90 })
    expect(evaluateProgression(pe('farmers_carry', 3, 40, 40, 60, { program: true, loadKg: 20 }), carry, [set(null, 20, 40)], []))
      .toEqual({ ...hold, nextLoadKg: 20, repMin: 40, repMax: 40 })
  })

  it('holds an unloaded programme move with other equipment (band) instead of adding reps', () => {
    const band = mk('band_row', 'Band Row', 'band', 'horizontal_pull')
    expect(evaluateProgression(pe('band_row', 3, 12, 15), band, [set(15, null), set(15, null)], []).action).toBe('increase')
    expect(evaluateProgression(pe('band_row', 3, 12, 15, 60, { program: true }), band, [set(15, null), set(15, null)], []))
      .toEqual({ action: 'hold', reason: 'Your programme sets this target.', stalled: false, nextLoadKg: null, repMin: 12, repMax: 15 })
  })

  it('loaded programme exercises keep double progression', () => {
    const r = evaluateProgression(pe('db_bench_press', 3, 8, 12, 90, { program: true }), bench, [set(12, 20), set(12, 20), set(12, 20)], [])
    expect(r).toMatchObject({ action: 'increase', nextLoadKg: 22, repMin: 8, repMax: 12 })
  })
})

// ---- DB-backed: applyTier, ensureWeekPlanned, finish cardio modality ---------------------------------------

describe('feature rules with a programme (sql.js)', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  const enrol = (status: Enrollment['status']) => repo.setSetting(PROGRAM_SETTING, {
    programId: 'start-running', path: 'standard', startDate: WEEK_START, week: 1, closedWindow: -1, status, feel: [], history: [],
  } satisfies Enrollment)
  const progRow = (templateKey: string, date: string, tier: WorkoutSession['tier'] = 'minimum'): Omit<WorkoutSession, 'id'> => ({
    templateKey, name: 'Run 1', type: 'conditioning', tier, scheduledDate: date, status: 'planned', startedAt: null, completedAt: null,
    durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [pe('easy_run', 6, 60, 60, 90, { program: true })],
  })

  beforeAll(async () => { await db.init() })
  beforeEach(() => {
    db.transaction(() => { for (const t of Object.keys(repo.tableCounts())) db.run(`DELETE FROM "${t}"`) })
  })
  afterAll(() => { errorSpy.mockRestore() })

  it('applyTier is a no-op while a programme is active', () => {
    enrol('active')
    repo.setSetting('train.tier', 'minimum')
    for (const r of buildWeek(WEEK_START, 'stretch')) repo.createSession(r)
    const before = repo.getSessions(WEEK_START, addDays(WEEK_START, 6))
    expect(applyTier('minimum', WEEK_START, WEEK_START)).toEqual({ added: [], removed: [] })
    expect(applyTier('stretch', WEEK_START, WEEK_START)).toEqual({ added: [], removed: [] })
    expect(repo.getSessions(WEEK_START, addDays(WEEK_START, 6))).toEqual(before)
  })

  it('applyTier never deletes programme-derived rows', () => {
    enrol('done')
    for (const r of buildWeek(WEEK_START, 'stretch')) repo.createSession(r)
    repo.createSession(progRow('work:hiit:w1d1', addDays(WEEK_START, 3), 'stretch'))
    const change = applyTier('minimum', WEEK_START, WEEK_START)
    expect(change.removed.sort()).toEqual(['Bike Conditioning (low impact)', 'Hips & Hamstrings Mobility', 'Swim'])
    expect(repo.getSessions(WEEK_START, addDays(WEEK_START, 6)).some((s) => s.templateKey === 'work:hiit:w1d1')).toBe(true)
  })

  it('ensureWeekPlanned skips while a programme is active', () => {
    enrol('active')
    expect(ensureWeekPlanned(TODAY, 'minimum')).toBe(0)
    expect(repo.getSessions(WEEK_START, addDays(WEEK_START, 6))).toEqual([])
    enrol('left')
    expect(ensureWeekPlanned(TODAY, 'minimum')).toBe(3)
  })

  it('finish writes run / hiit cardio rows for programme sessions; others unchanged', async () => {
    const finish = async (templateKey: string) => {
      const id = repo.createSession(progRow(templateKey, TODAY))
      const s = repo.getSessions(TODAY, TODAY).find((x) => x.id === id)!
      await finishSession({ session: s, sets: [], rpe: null, durationMin: 30, notes: '', symptomChanges: [], writeToHealth: false })
      return repo.getCardio(1).find((c) => c.sessionId === id)?.modality
    }
    expect(await finish('prog:start-running:w1d1')).toBe('run')
    expect(await finish('work:start-running:w2d1')).toBe('run')
    expect(await finish('prog:hiit:w1d1')).toBe('hiit')
    expect(await finish('conditioning_bike')).toBe('bike')
    expect(await finish('ai_plan')).toBe('conditioning')
  })
})

describe('programme-only swaps are labelled as such (not pain)', () => {
  it('prefixes the reason when only extraAvoid blocked the exercise', async () => {
    const { applyGateToSession } = await import('../planner')
    const { EXERCISES } = await import('../../data/exercises')
    const ok = { overall: 'OK', regions: [], avoidTags: [], advice: [] } as unknown as Parameters<typeof applyGateToSession>[1]
    const out = applyGateToSession([{ exerciseId: 'burpee', sets: 2, repMin: 8, repMax: 10, loadKg: null, restSec: 60, program: true }], ok, EXERCISES, { extraAvoid: ['impact'] })
    expect(out.exercises[0].exerciseId).not.toBe('burpee')
    expect(out.exercises[0].substitutionReason).toMatch(/^Programme path: /)
  })
})
