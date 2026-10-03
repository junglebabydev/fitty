import { describe, expect, it } from 'vitest'
import type { Enrollment, Program, ProgramSession, ScreenQuestion } from '../../domain/programs'
import type { ExerciseSet, PlannedExercise, WorkoutSession } from '../../domain/types'
import {
  closeWindow, defaultOffsets, effectivePaths, expandSessions, kneeGuard, nextRungs, programAvoidTags, programLibrary, programWeekSessions,
  reflowProgramWeek, screenResult, isScreenCurrent, sessionOnPath, sessionsForWeek, toPlannedExercises, windowDates, windowIndex,
} from '../programs'
import { EXERCISES } from '../../data/exercises'

const WARMUP = { shape: 'steady', exerciseId: 'brisk_walk', minutes: 5, effort: 'easy', role: 'warmup' } as const
const COOLDOWN = { shape: 'steady', exerciseId: 'brisk_walk', minutes: 5, effort: 'easy', role: 'cooldown' } as const

function runSession(key: string, week: number): ProgramSession {
  return {
    key, week, name: `Week ${week}, run ${key.slice(-1)}`, type: 'conditioning', minutes: 30,
    blocks: [
      WARMUP,
      { shape: 'intervals', rounds: 8, work: { exerciseId: 'easy_run', seconds: 60 }, rest: { exerciseId: 'brisk_walk', seconds: 90 } },
      { shape: 'steady', exerciseId: 'easy_run', minutes: 5, effort: 'easy' },
      COOLDOWN,
    ],
  }
}

const q = (id: string, onYes: ScreenQuestion['onYes'], extra: Partial<ScreenQuestion> = {}): ScreenQuestion => ({ id, text: id, onYes, yesCopy: `${id} copy`, ...extra })

function makeProgram(over: Partial<Program> = {}): Program {
  return {
    id: 'start-running', status: 'ready', title: 'Test Run', promise: '', description: '', weeks: 3, sessionsPerWeek: 3,
    minutes: [20, 30], equipment: ['bodyweight', 'bike'], needs: '', timePerWeek: '',
    why: [{ text: '', source: 1 }, { text: '', source: 1 }, { text: '', source: 1 }], sources: [],
    screen: [
      q('pregnant', 'wait', { shared: 'pregnant' }),
      q('baby', 'suggest:postpartum', { shared: 'recent_birth' }),
      q('walk_pain', 'path:bike-first'),
      q('knee', 'path:knee-checked', { fromFlags: ['knee_left', 'knee_right', 'hip'] }),
      q('heart', 'note'),
    ],
    stopSigns: [],
    sessions: [runSession('w1d1', 1), runSession('w1d2', 1), runSession('w1d3', 1), runSession('w3d1', 3), runSession('w3d2', 3), runSession('w3d3', 3)],
    repeats: [{ week: 2, copyOf: 1 }],
    paths: {
      standard: { label: 'Standard' },
      'knee-checked': { label: 'Knee-checked' },
      'walk-first': { label: 'Walk-first', swaps: { easy_run: 'brisk_walk' } },
      'bike-first': { label: 'Bike-first', swaps: { easy_run: 'stationary_bike', brisk_walk: 'stationary_bike' } },
    },
    flagPaths: { knee: 'knee-checked', hip: 'knee-checked' },
    advance: { minCompleted: 'all', maxPainToAdvance: 3, dropBackPainAtLeast: 6, repeatIfFeltHard: true, longGapDays: 14 },
    standalone: [],
    cues: { easy_run: 'Run now. Slow and relaxed.', brisk_walk: 'Walk now.' },
    ...over,
  }
}

/** A home-dumbbell style series: sets blocks, ladders and a knee path that swaps a laddered exercise. */
function homeProgram(): Program {
  const s = (key: string, blocks: ProgramSession['blocks']): ProgramSession => ({ key, week: 1, name: key, type: 'strength', minutes: 30, blocks })
  return makeProgram({
    id: 'home-dumbbells', weeks: 2, equipment: ['dumbbell'], repeats: [{ week: 2, copyOf: 1 }],
    sessions: [
      s('w1d1', [
        { shape: 'sets', exerciseId: 'goblet_squat', sets: 2, reps: [8, 12], restSec: 90, slot: 'squat' },
        { shape: 'sets', exerciseId: 'wall_sit', sets: 2, seconds: [30, 45], restSec: 60 },
        { shape: 'sets', exerciseId: 'side_plank', sets: 2, seconds: [20, 30], restSec: 30, perSide: true, slot: 'side_plank' },
      ]),
      s('w1d2', [
        { shape: 'sets', exerciseId: 'push_up', sets: 3, reps: [5, 10], restSec: 75, slot: 'push_up' },
        { shape: 'circuit', rounds: 3, restBetweenStationsSec: 15, restBetweenRoundsSec: 60, stations: [
          { exerciseId: 'jumping_jack', seconds: 30 }, { exerciseId: 'dead_bug', reps: [6, 8], perSide: true },
        ] },
      ]),
      s('w1d3', [{ shape: 'sets', exerciseId: 'db_rdl', sets: 3, reps: [8, 12], restSec: 90 }]),
    ],
    paths: {
      standard: { label: 'Standard' },
      'low-impact': { label: 'Low impact', swaps: { goblet_squat: 'wall_sit', jumping_jack: 'step_jack' } },
      'no-core': { label: 'Drop', swaps: { dead_bug: null, db_rdl: null } },
    },
    flagPaths: { knee: 'low-impact', hip: 'low-impact' },
    flagAvoid: { back: ['spinal_flexion', 'spinal_load'] },
    ladders: [
      { slot: 'squat', rungs: ['goblet_squat', 'bulgarian_split_squat'], advanceWhen: '' },
      { slot: 'push_up', rungs: ['push_up', 'decline_push_up', 'archer_push_up'], advanceWhen: '' },
      { slot: 'side_plank', rungs: ['side_plank', 'side_plank_reach'], advanceWhen: '' },
    ],
  })
}

const START = '2026-10-05'

function enrol(over: Partial<Enrollment> = {}): Enrollment {
  return { programId: 'start-running', path: 'standard', startDate: START, week: 1, closedWindow: -1, status: 'active', feel: [], history: [], ...over }
}

let nextId = 1
function row(over: Partial<WorkoutSession>): WorkoutSession {
  return {
    id: nextId++, templateKey: 'prog:start-running:w1d1', name: 'x', type: 'conditioning', tier: 'minimum', scheduledDate: START,
    status: 'planned', startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [],
    ...over,
  }
}

const ids = (s: ProgramSession) => s.blocks.map((b) => (b.shape === 'intervals' ? `${b.work.exerciseId}/${b.rest.exerciseId}` : b.shape === 'circuit' ? b.stations.map((x) => x.exerciseId).join('+') : b.exerciseId))

describe('expandSessions', () => {
  it('resolves repeats into concrete sessions with rewritten keys and leaves altOnly out', () => {
    const p = makeProgram({ sessions: [...makeProgram().sessions, { ...runSession('w1d2-li', 1), altOnly: true }] })
    const all = expandSessions(p)
    expect(all.map((s) => s.key)).toEqual(['w1d1', 'w1d2', 'w1d3', 'w2d1', 'w2d2', 'w2d3', 'w3d1', 'w3d2', 'w3d3'])
    expect(all.filter((s) => s.week === 2).every((s) => s.week === 2)).toBe(true)
    expect(all[3].blocks).toEqual(all[0].blocks)
  })

  it('rewrites non-d keys by their week prefix', () => {
    const p = makeProgram({ weeks: 2, sessions: [{ ...runSession('w1u1', 1), key: 'w1u1' }], repeats: [{ week: 2, copyOf: 1 }] })
    expect(expandSessions(p).map((s) => s.key)).toEqual(['w1u1', 'w2u1'])
  })
})

describe('sessionsForWeek and path swaps', () => {
  it('walk-first: the work id may equal the warm-up and rest id without walking the chain', () => {
    const [s] = sessionsForWeek(makeProgram(), 1, 'walk-first')
    expect(ids(s)).toEqual(['brisk_walk', 'brisk_walk/brisk_walk', 'brisk_walk', 'brisk_walk'])
  })

  it('bike-first swaps rest ids and role blocks too, and a repeated source maps to one target', () => {
    const [s] = sessionsForWeek(makeProgram(), 2, 'bike-first')
    expect(s.key).toBe('w2d1')
    expect(ids(s)).toEqual(['stationary_bike', 'stationary_bike/stationary_bike', 'stationary_bike', 'stationary_bike'])
  })

  it('the order of the swap keys does not matter', () => {
    const p = makeProgram()
    p.paths['bike-first'] = { label: 'Bike-first', swaps: { brisk_walk: 'stationary_bike', easy_run: 'stationary_bike' } }
    expect(ids(sessionsForWeek(p, 1, 'bike-first')[0])).toEqual(['stationary_bike', 'stationary_bike/stationary_bike', 'stationary_bike', 'stationary_bike'])
  })

  it('a swap target already in the session walks its chain within equipment and tags', () => {
    const [s] = sessionsForWeek(homeProgram(), 1, 'low-impact')
    // wall_sit is already programmed; its chain is leg_press (machine: not this series), then glute_bridge.
    expect(ids(s)).toEqual(['glute_bridge', 'wall_sit', 'side_plank'])
  })

  it('walks further when the next link is taken too, and drops the block when the chain runs out', () => {
    const p = homeProgram()
    p.sessions[0].blocks.push({ shape: 'sets', exerciseId: 'glute_bridge', sets: 2, reps: [10, 15], restSec: 60 })
    expect(ids(sessionsForWeek(p, 1, 'low-impact')[0])).toEqual(['plank', 'wall_sit', 'side_plank', 'glute_bridge'])
    p.sessions[0].blocks.push({ shape: 'sets', exerciseId: 'plank', sets: 2, seconds: [20, 30], restSec: 60 })
    expect(ids(sessionsForWeek(p, 1, 'low-impact')[0])[0]).toBe('single_leg_glute_bridge')
    const small = EXERCISES.filter((e) => ['goblet_squat', 'wall_sit', 'glute_bridge', 'plank', 'side_plank', 'leg_press'].includes(e.id))
    expect(ids(sessionsForWeek(p, 1, 'low-impact', small)[0])).toEqual(['wall_sit', 'side_plank', 'glute_bridge', 'plank'])
  })

  it('null drops the block, or the circuit station', () => {
    const week = sessionsForWeek(homeProgram(), 1, 'no-core')
    expect(ids(week[1])).toEqual(['push_up', 'jumping_jack'])
    expect(week[2].blocks).toEqual([])
  })

  it('replaceSessions swaps in an altOnly session', () => {
    const alt: ProgramSession = { ...runSession('w1d2-li', 1), altOnly: true, blocks: [WARMUP] }
    const p = makeProgram({ sessions: [...makeProgram().sessions, alt], paths: { standard: { label: 's' }, 'low-impact': { label: 'li', replaceSessions: { w1d2: 'w1d2-li' } } } })
    expect(sessionsForWeek(p, 1, 'low-impact').map((s) => s.key)).toEqual(['w1d1', 'w1d2-li', 'w1d3'])
    expect(sessionsForWeek(p, 1, 'standard').map((s) => s.key)).toEqual(['w1d1', 'w1d2', 'w1d3'])
  })

  it('an unknown path behaves as standard', () => {
    expect(sessionsForWeek(makeProgram(), 1, 'nope')).toEqual(sessionsForWeek(makeProgram(), 1, 'standard'))
  })
})

describe('toPlannedExercises', () => {
  it('maps steady, intervals and sets blocks (§5.3) and marks every entry program: true', () => {
    const out = toPlannedExercises(makeProgram(), runSession('w1d1', 1))
    expect(out).toEqual([
      { exerciseId: 'brisk_walk', sets: 1, repMin: 300, repMax: 300, loadKg: null, restSec: 0, program: true, role: 'warmup', cue: 'Walk now.' },
      { exerciseId: 'easy_run', sets: 8, repMin: 60, repMax: 60, loadKg: null, restSec: 90, program: true, restExerciseId: 'brisk_walk', cue: 'Run now. Slow and relaxed.' },
      { exerciseId: 'easy_run', sets: 1, repMin: 300, repMax: 300, loadKg: null, restSec: 0, program: true, cue: 'Run now. Slow and relaxed.' },
      { exerciseId: 'brisk_walk', sets: 1, repMin: 300, repMax: 300, loadKg: null, restSec: 0, program: true, role: 'cooldown', cue: 'Walk now.' },
    ])
  })

  it('maps circuits per station and sets blocks with reps or seconds', () => {
    const p = homeProgram()
    const d1 = toPlannedExercises(p, p.sessions[0])
    expect(d1[1]).toEqual({ exerciseId: 'wall_sit', sets: 2, repMin: 30, repMax: 45, loadKg: null, restSec: 60, program: true })
    expect(d1[2]).toMatchObject({ exerciseId: 'side_plank', perSide: true, slot: 'side_plank', repMin: 20, repMax: 30 })
    const d2 = toPlannedExercises(p, p.sessions[1])
    expect(d2.slice(1)).toEqual([
      { exerciseId: 'jumping_jack', sets: 3, repMin: 30, repMax: 30, loadKg: null, restSec: 15, program: true, circuit: 'c1', roundRestSec: 60 },
      { exerciseId: 'dead_bug', sets: 3, repMin: 6, repMax: 8, loadKg: null, restSec: 15, program: true, circuit: 'c1', roundRestSec: 60, perSide: true },
    ])
    expect([...d1, ...d2].every((e: PlannedExercise) => e.program === true)).toBe(true)
  })

  it('a slot entry takes its ladder rung (resolved by sessionOnPath before any swap)', () => {
    const p = homeProgram()
    const first = (s: ProgramSession, path: string | string[], rungs: Record<string, number>) => toPlannedExercises(p, sessionOnPath(p, s, path, EXERCISES, rungs))[0].exerciseId
    expect(first(p.sessions[1], 'standard', { push_up: 2 })).toBe('archer_push_up')
    expect(first(p.sessions[1], 'standard', { push_up: 9 })).toBe('archer_push_up')
    expect(first(p.sessions[0], 'standard', { squat: 1 })).toBe('bulgarian_split_squat')
    // toPlannedExercises no longer resolves rungs: a resolved-and-swapped session is never re-laddered.
    expect(toPlannedExercises(p, p.sessions[1], { rungs: { push_up: 2 } })[0].exerciseId).toBe('push_up')
  })

  it('review #2: the rung is resolved first, so a path swap catches a rung the path removes', () => {
    const p = homeProgram()
    p.paths.capped = { label: 'Push capped', swaps: { decline_push_up: 'push_up', archer_push_up: 'push_up' } }
    for (const push_up of [1, 2]) {
      const [s] = sessionsForWeek(p, 1, 'capped', EXERCISES, { push_up }).filter((x) => x.key === 'w1d2')
      // Passing rungs again to toPlannedExercises must not re-ladder the swapped entry.
      expect(toPlannedExercises(p, s, { rungs: { push_up } })[0].exerciseId).toBe('push_up')
    }
    // A swap target already in the session still walks the chain (wall_sit is in w1d1).
    p.paths['low-impact'].swaps!.bulgarian_split_squat = 'wall_sit'
    expect(toPlannedExercises(p, sessionsForWeek(p, 1, 'low-impact', EXERCISES, { squat: 1 })[0])[0].exerciseId).toBe('glute_bridge')
  })

  it('review #4: several paths apply in turn (rung first, then each path\'s swaps)', () => {
    const p = homeProgram()
    p.paths.capped = { label: 'Push capped', swaps: { decline_push_up: 'push_up' } }
    const week = sessionsForWeek(p, 1, ['low-impact', 'capped'], EXERCISES, { push_up: 1 })
    expect(ids(week[0])[0]).toBe('glute_bridge') // goblet_squat → wall_sit (taken) → chain
    expect(ids(week[1])).toEqual(['push_up', 'step_jack+dead_bug'])
    expect(effectivePaths(p, 'standard', ['knee_left', 'shoulder', 'hip'], true)).toEqual(['standard', 'low-impact'])
    const bw = makeProgram({ paths: { ...p.paths, 'push-capped': { label: 'c' } }, flagPaths: { knee: 'low-impact', shoulder: 'push-capped' } })
    expect(effectivePaths(bw, 'standard', ['knee_left', 'shoulder'], false)).toEqual(['standard', 'low-impact', 'push-capped'])
    expect(effectivePaths(bw, 'push-capped', ['shoulder', 'back_lower'], false)).toEqual(['push-capped'])
  })

  it('review #5: a rung with rungSpecs brings its own range and per-side flag to sets blocks (sets, rest as written)', () => {
    const p = homeProgram()
    p.ladders![2].rungSpecs = { side_plank_reach: { reps: [6, 10] } }
    p.ladders![0].rungSpecs = { bulgarian_split_squat: { perSide: true } }
    const [s] = sessionsForWeek(p, 1, 'standard', EXERCISES, { side_plank: 1, squat: 1 })
    const out = toPlannedExercises(p, s)
    expect(out[2]).toMatchObject({ exerciseId: 'side_plank_reach', sets: 2, repMin: 6, repMax: 10, restSec: 30, perSide: true })
    expect(out[2].unit).toBeUndefined()
    expect(out[0]).toMatchObject({ exerciseId: 'bulgarian_split_squat', repMin: 8, repMax: 12, perSide: true })
  })

  it('review #6: a SwapTarget carries its prescription onto the sets block it lands on', () => {
    const p = homeProgram()
    p.sessions[0] = { ...p.sessions[0], blocks: [p.sessions[0].blocks[0], p.sessions[0].blocks[2]] } // no wall_sit already
    p.paths['low-impact'].swaps!.goblet_squat = { id: 'wall_sit', sets: 3, seconds: [30, 60] }
    const [s] = sessionsForWeek(p, 1, 'low-impact')
    expect(toPlannedExercises(p, s)[0]).toEqual({ exerciseId: 'wall_sit', sets: 3, repMin: 30, repMax: 60, loadKg: null, restSec: 90, program: true, slot: 'squat' })
  })

  it('review #7: seconds on an exercise that is not timed carry unit "sec" (sets blocks and circuit stations)', () => {
    const p = homeProgram()
    const s: ProgramSession = { key: 'w1d9', week: 1, name: 'x', type: 'strength', minutes: 20, blocks: [
      { shape: 'sets', exerciseId: 'push_up', sets: 2, seconds: [20, 30], restSec: 30 },
      { shape: 'circuit', rounds: 2, restBetweenStationsSec: 20, restBetweenRoundsSec: 60, stations: [
        { exerciseId: 'incline_push_up', seconds: 30 }, { exerciseId: 'mountain_climber', seconds: 30 }, { exerciseId: 'dead_bug', reps: [6, 8] },
      ] },
    ] }
    const out = toPlannedExercises(p, s)
    expect(out.map((e) => e.unit)).toEqual(['sec', 'sec', undefined, undefined])
    expect(out[1]).toMatchObject({ exerciseId: 'incline_push_up', repMin: 30, repMax: 30 })
  })
})

describe('windows', () => {
  it('indexes 7-day blocks from the start', () => {
    expect(windowIndex(START, START)).toBe(0)
    expect(windowIndex(START, '2026-10-11')).toBe(0)
    expect(windowIndex(START, '2026-10-12')).toBe(1)
    expect(windowIndex(START, '2026-10-04')).toBe(-1)
    expect(windowDates(START, 1)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
  })

  it('spreads default days with rest between', () => {
    expect(defaultOffsets(2)).toEqual([0, 3])
    expect(defaultOffsets(3)).toEqual([0, 2, 4])
    expect(defaultOffsets(4)).toEqual([0, 1, 3, 4])
    expect(defaultOffsets(1)).toEqual([0])
    expect(defaultOffsets(5)).toEqual([0, 2, 3, 5, 6])
    expect(new Set(defaultOffsets(7)).size).toBe(7)
  })
})

describe('programWeekSessions', () => {
  it('materialises a full 3-day week on default days', () => {
    const rows = programWeekSessions(makeProgram(), enrol(), START, [])
    expect(rows.map((r) => [r.templateKey, r.scheduledDate, r.name])).toEqual([
      ['prog:start-running:w1d1', '2026-10-05', 'Week 1, run 1'],
      ['prog:start-running:w1d2', '2026-10-07', 'Week 1, run 2'],
      ['prog:start-running:w1d3', '2026-10-09', 'Week 1, run 3'],
    ])
    for (const r of rows) {
      expect(r).toMatchObject({ type: 'conditioning', tier: 'minimum', status: 'planned' })
      expect(r.exercises.length).toBe(4)
      expect(r.exercises.every((e) => e.program)).toBe(true)
    }
  })

  it('uses the enrolment week, path and window', () => {
    const rows = programWeekSessions(makeProgram(), enrol({ week: 2, path: 'walk-first' }), '2026-10-12', [])
    expect(rows.map((r) => r.scheduledDate)).toEqual(['2026-10-12', '2026-10-14', '2026-10-16'])
    expect(rows[0].templateKey).toBe('prog:start-running:w2d1')
    expect(rows[0].exercises.map((e) => e.exerciseId)).toEqual(['brisk_walk', 'brisk_walk', 'brisk_walk', 'brisk_walk'])
  })

  it('moves past or taken days to the next free day, keeps order, and drops what no longer fits', () => {
    const existing = [row({ templateKey: 'upper_a', scheduledDate: '2026-10-11' }), row({ templateKey: 'x', scheduledDate: '2026-10-09', status: 'skipped' })]
    const rows = programWeekSessions(makeProgram(), enrol(), '2026-10-09', existing)
    expect(rows.map((r) => [r.templateKey, r.scheduledDate])).toEqual([
      ['prog:start-running:w1d1', '2026-10-09'],
      ['prog:start-running:w1d2', '2026-10-10'],
    ])
  })

  it('skips sessions already in the window', () => {
    const existing = [row({ templateKey: 'prog:start-running:w1d1', scheduledDate: '2026-10-05', status: 'completed' })]
    const rows = programWeekSessions(makeProgram(), enrol(), '2026-10-06', existing)
    expect(rows.map((r) => [r.templateKey, r.scheduledDate])).toEqual([
      ['prog:start-running:w1d2', '2026-10-07'],
      ['prog:start-running:w1d3', '2026-10-09'],
    ])
  })
})

describe('closeWindow', () => {
  const done = (n: number, keys = ['w1d1', 'w1d2', 'w1d3']) =>
    keys.map((k, i) => row({ templateKey: `prog:start-running:${k}`, status: i < n ? 'completed' : 'planned' }))
  const p = makeProgram()

  it('advances on all sessions with pain at the ceiling', () => {
    const r = closeWindow(p, enrol(), done(3), [0, 3], START)
    expect(r).toMatchObject({ decision: 'advance', nextWeek: 2, status: 'active' })
    expect(r.reason).toMatch(/week 2 starts/)
  })

  it('repeats with pain between the two thresholds', () => {
    expect(closeWindow(p, enrol(), done(3), [4], START)).toMatchObject({ decision: 'repeat', nextWeek: 1 })
    expect(closeWindow(p, enrol(), done(3), [5], START).decision).toBe('repeat')
  })

  it('drops back at the drop-back threshold, never below week 1', () => {
    expect(closeWindow(p, enrol({ week: 3 }), done(3, ['w3d1', 'w3d2', 'w3d3']), [6], START)).toMatchObject({ decision: 'drop_back', nextWeek: 2 })
    expect(closeWindow(p, enrol(), done(3), [7], START)).toMatchObject({ decision: 'drop_back', nextWeek: 1 })
  })

  it('3/4 thresholds leave no repeat band', () => {
    const hiit = makeProgram({ advance: { minCompleted: 2, maxPainToAdvance: 3, dropBackPainAtLeast: 4, repeatIfFeltHard: true, longGapDays: 10 } })
    expect(closeWindow(hiit, enrol({ week: 2 }), done(2), [3], START).decision).toBe('advance')
    expect(closeWindow(hiit, enrol({ week: 2 }), done(2), [4], START).decision).toBe('drop_back')
  })

  it('repeats on too few sessions, on zero sessions, and on a too-hard feel', () => {
    expect(closeWindow(p, enrol(), done(2), [], START)).toMatchObject({ decision: 'repeat', reason: 'You did 2 of 3 sessions, so week 1 runs again.' })
    expect(closeWindow(p, enrol(), done(0), [], START).decision).toBe('repeat')
    expect(closeWindow(p, enrol(), done(0), [8], START).decision).toBe('repeat')
    const hard = enrol({ feel: [{ sessionKey: 'w1d2', week: 1, value: 'hard' }] })
    expect(closeWindow(p, hard, done(3), [], START)).toMatchObject({ decision: 'repeat', reason: 'A session felt too hard, so week 1 runs again.' })
    // A "hard" on another week, or on a series that ignores feel, does not count.
    expect(closeWindow(p, enrol({ feel: [{ sessionKey: 'w1d2', week: 2, value: 'hard' }] }), done(3), [], START).decision).toBe('advance')
    const lenient = makeProgram({ advance: { ...p.advance, repeatIfFeltHard: false } })
    expect(closeWindow(lenient, hard, done(3), [], START).decision).toBe('advance')
  })

  it('counts numeric minimums', () => {
    const two = makeProgram({ advance: { ...p.advance, minCompleted: 2 } })
    expect(closeWindow(two, enrol(), done(2), [], START).decision).toBe('advance')
  })

  it('review #9: rows dated before the enrolment start never count', () => {
    const early = done(3).map((r) => ({ ...r, scheduledDate: '2026-10-04' }))
    expect(closeWindow(p, enrol(), early, [], START)).toMatchObject({ decision: 'repeat', reason: 'No sessions were done, so week 1 runs again.' })
  })

  it('finishing the last week sets done', () => {
    expect(closeWindow(p, enrol({ week: 3 }), done(3, ['w3d1', 'w3d2', 'w3d3']), [], START)).toMatchObject({ decision: 'advance', nextWeek: 3, status: 'done' })
  })
})

describe('nextRungs', () => {
  const p = homeProgram()
  const pe = (exerciseId: string, slot: string, repMax = 10, sets = 3): PlannedExercise => ({ exerciseId, sets, repMin: 5, repMax, loadKg: null, restSec: 60, slot, program: true })
  const set = (exerciseId: string, reps: number | null, extra: Partial<ExerciseSet> = {}): ExerciseSet =>
    ({ id: 0, sessionId: 1, exerciseId, setIndex: 1, reps, loadKg: null, rir: null, rpe: null, durationSec: null, painFlag: false, loggedAt: '', ...extra })
  const done = (exercises: PlannedExercise[], sets: ExerciseSet[]) => [{ session: row({ status: 'completed', exercises }), sets }]

  it('moves up when every planned set hit the top of the range', () => {
    const r = nextRungs(p, enrol(), done([pe('push_up', 'push_up')], [set('push_up', 10), set('push_up', 11), set('push_up', 10)]))
    expect(r).toEqual({ push_up: 1 })
  })

  it('holds when a set fell short or a set is missing', () => {
    expect(nextRungs(p, enrol(), done([pe('push_up', 'push_up')], [set('push_up', 10), set('push_up', 9), set('push_up', 10)]))).toEqual({})
    expect(nextRungs(p, enrol(), done([pe('push_up', 'push_up')], [set('push_up', 10), set('push_up', 10)]))).toEqual({})
  })

  it('moves down one on a pain flag, never below 0', () => {
    const e = enrol({ rungs: { push_up: 2 } })
    expect(nextRungs(p, e, done([pe('archer_push_up', 'push_up')], [set('archer_push_up', 10, { painFlag: true })]))).toEqual({ push_up: 1 })
    expect(nextRungs(p, enrol(), done([pe('push_up', 'push_up')], [set('push_up', 10, { painFlag: true })]))).toEqual({ push_up: 0 })
  })

  it('reads seconds for timed sets and stops at the top rung', () => {
    const r = nextRungs(p, enrol(), done([pe('side_plank', 'side_plank', 30, 2)], [set('side_plank', null, { durationSec: 30 }), set('side_plank', null, { durationSec: 32 })]))
    expect(r).toEqual({ side_plank: 1 })
    const top = enrol({ rungs: { side_plank: 1 } })
    expect(nextRungs(p, top, done([pe('side_plank_reach', 'side_plank', 10, 1)], [set('side_plank_reach', 10)]))).toEqual({ side_plank: 1 })
  })

  it('a loaded set holds the rung (double progression owns loaded moves); pain still drops it', () => {
    const loaded = (n: number) => Array.from({ length: n }, () => set('push_up', 10, { loadKg: 10 }))
    expect(nextRungs(p, enrol(), done([pe('push_up', 'push_up')], loaded(3)))).toEqual({})
    const e = enrol({ rungs: { push_up: 1 } })
    expect(nextRungs(p, e, done([pe('decline_push_up', 'push_up')], [set('decline_push_up', 10, { loadKg: 10, painFlag: true })]))).toEqual({ push_up: 0 })
  })

  it('ignores entries a path moved off the ladder', () => {
    expect(nextRungs(p, enrol(), done([pe('glute_bridge', 'squat', 10, 1)], [set('glute_bridge', 12)]))).toEqual({})
  })

  it('review #7: circuit entries never move a rung', () => {
    const station = { ...pe('push_up', 'push_up', 30, 3), circuit: 'c1' }
    expect(nextRungs(p, enrol(), done([station], [set('push_up', 30), set('push_up', 30), set('push_up', 30)]))).toEqual({})
  })

  it('review #8: a rung on loadable equipment never auto-advances, even when sets are logged with no weight', () => {
    const top = [set('goblet_squat', 12), set('goblet_squat', 12), set('goblet_squat', 12)]
    expect(nextRungs(p, enrol(), done([pe('goblet_squat', 'squat', 12)], top))).toEqual({})
    // Pain still drops a loaded rung.
    const e = enrol({ rungs: { squat: 1 } })
    expect(nextRungs(p, e, done([pe('bulgarian_split_squat', 'squat')], [set('bulgarian_split_squat', 8, { painFlag: true })]))).toEqual({ squat: 0 })
  })

  it('review #2: never climbs to a rung that a swap on the active paths removes', () => {
    const capped = homeProgram()
    capped.paths.capped = { label: 'c', swaps: { archer_push_up: { id: 'push_up', reps: [6, 12] } } }
    const e = enrol({ path: 'capped', rungs: { push_up: 1 } })
    const top = done([pe('decline_push_up', 'push_up')], [set('decline_push_up', 10), set('decline_push_up', 10), set('decline_push_up', 10)])
    expect(nextRungs(capped, e, top)).toEqual({ push_up: 1 })
    expect(nextRungs(capped, enrol({ rungs: { push_up: 1 } }), top, { paths: ['standard', 'capped'] })).toEqual({ push_up: 1 })
    expect(nextRungs(capped, enrol({ rungs: { push_up: 1 } }), top)).toEqual({ push_up: 2 })
  })
})

describe('screenResult', () => {
  const p = makeProgram()

  it('starts on standard with nothing to report, listing unanswered questions', () => {
    expect(screenResult(p, { pregnant: false }, [], false)).toEqual({ kind: 'start', path: 'standard', notes: [], unanswered: ['baby', 'walk_pain', 'knee', 'heart'] })
  })

  it('wait beats suggest beats path', () => {
    const all = { pregnant: true, baby: true, walk_pain: true, knee: false, heart: false }
    expect(screenResult(p, all, [], false)).toMatchObject({ kind: 'wait', waitCopy: 'pregnant copy', path: 'bike-first' })
    expect(screenResult(p, { ...all, pregnant: false }, [], false)).toMatchObject({ kind: 'suggest', suggest: 'postpartum' })
    expect(screenResult(p, { ...all, pregnant: false, baby: false }, [], false)).toMatchObject({ kind: 'start', path: 'bike-first' })
  })

  it('fromFlags pre-answers yes and the flag path applies', () => {
    const r = screenResult(p, {}, ['knee_left'], false)
    expect(r.path).toBe('knee-checked')
    expect(r.unanswered).not.toContain('knee')
  })

  it('falls back to flagPaths when no question carries the flag', () => {
    const noKneeQ = makeProgram({ screen: [q('pregnant', 'wait')] })
    expect(screenResult(noKneeQ, { pregnant: false }, ['hip'], false).path).toBe('knee-checked')
    expect(screenResult(noKneeQ, { pregnant: false }, ['back_lower'], false).path).toBe('standard')
  })

  it('no-impact beats a flag path but not an explicit screen answer', () => {
    expect(screenResult(p, {}, ['knee_left'], true).path).toBe('walk-first')
    expect(screenResult(p, { knee: true }, ['knee_left'], true).path).toBe('walk-first')
    expect(screenResult(p, { walk_pain: true }, [], true).path).toBe('bike-first')
    expect(screenResult(makeProgram({ paths: { standard: { label: 's' } } }), {}, [], true).path).toBe('standard')
    expect(screenResult(homeProgram(), {}, [], true).path).toBe('low-impact')
  })

  it('collects note copy', () => {
    expect(screenResult(p, { heart: true }, [], false).notes).toEqual(['heart copy'])
  })
})

describe('isScreenCurrent', () => {
  const p = makeProgram()
  it('needs saved answers for this series younger than the re-ask age', () => {
    expect(isScreenCurrent(p, undefined, START)).toBe(false)
    expect(isScreenCurrent(p, { programId: 'start-running', answers: {}, answeredAt: '2026-07-08' }, START)).toBe(true)
    expect(isScreenCurrent(p, { programId: 'start-running', answers: {}, answeredAt: '2026-07-07' }, START)).toBe(false)
    expect(isScreenCurrent(p, { programId: 'hiit', answers: {}, answeredAt: START }, START)).toBe(false)
    const pp = makeProgram({ screenMaxAgeDays: 28 })
    expect(isScreenCurrent(pp, { programId: 'start-running', answers: {}, answeredAt: '2026-09-07' }, START)).toBe(false)
    expect(isScreenCurrent(pp, { programId: 'start-running', answers: {}, answeredAt: '2026-09-08T10:00:00' }, START)).toBe(true)
  })
})

describe('programAvoidTags and programLibrary', () => {
  it('a knee flag keeps deep_knee_flexion but not impact; no-impact adds it back; flagAvoid adds series tags', () => {
    const p = homeProgram()
    expect(programAvoidTags(p, ['knee_left'], false)).toEqual(['deep_knee_flexion'])
    expect(programAvoidTags(p, ['knee_left'], true).sort()).toEqual(['deep_knee_flexion', 'impact'])
    expect(programAvoidTags(p, [], false)).toEqual([])
    expect(programAvoidTags(p, ['back_lower'], false).sort()).toEqual(['axial_load', 'spinal_flexion', 'spinal_load'])
  })

  it('keeps the series equipment plus bodyweight', () => {
    const lib = programLibrary(homeProgram(), EXERCISES)
    expect(lib.length).toBeGreaterThan(0)
    expect(lib.every((e) => e.equipment === 'dumbbell' || e.equipment === 'bodyweight')).toBe(true)
    expect(lib.some((e) => e.id === 'leg_press')).toBe(false)
  })
})

describe('kneeGuard', () => {
  const s = (date: string, pain: number, region: 'knee_left' | 'hip' | 'back_lower' = 'knee_left') => ({ date, region, pain })
  it('holds while the latest flagged knee or hip score is 4 or more', () => {
    expect(kneeGuard([s('2026-10-06', 4)], ['knee_left'], START)).toBe(true)
    expect(kneeGuard([s('2026-10-06', 4), s('2026-10-08', 3)], ['knee_left'], START)).toBe(false)
    expect(kneeGuard([s('2026-10-08', 3), s('2026-10-06', 5)], ['knee_left'], START)).toBe(false)
    expect(kneeGuard([s('2026-10-06', 2), s('2026-10-08', 6, 'hip')], ['knee_left', 'hip'], START)).toBe(true)
  })
  it('review #3: keeps the latest score per region; one region settling never clears another', () => {
    expect(kneeGuard([s('2026-10-06', 5), s('2026-10-07', 1, 'hip')], ['knee_left', 'hip'], START)).toBe(true)
    expect(kneeGuard([s('2026-10-07', 1, 'hip'), s('2026-10-06', 5)], ['knee_left', 'hip'], START)).toBe(true)
    expect(kneeGuard([s('2026-10-06', 5), s('2026-10-07', 1, 'hip'), s('2026-10-08', 2)], ['knee_left', 'hip'], START)).toBe(false)
    // Same day: ts then id decide.
    const t = (ts: string, pain: number, id: number) => ({ date: '2026-10-06', region: 'knee_left' as const, pain, ts, id })
    expect(kneeGuard([t('2026-10-06T09:00:00Z', 2, 2), t('2026-10-06T07:00:00Z', 6, 1)], ['knee_left'], START)).toBe(false)
    expect(kneeGuard([t('2026-10-06T07:00:00Z', 2, 1), t('2026-10-06T07:00:00Z', 6, 2)], ['knee_left'], START)).toBe(true)
  })

  it('ignores unflagged regions, other groups and old scores', () => {
    expect(kneeGuard([s('2026-10-06', 7)], ['knee_right'], START)).toBe(false)
    expect(kneeGuard([s('2026-10-06', 7, 'back_lower')], ['back_lower'], START)).toBe(false)
    expect(kneeGuard([s('2026-10-01', 7)], ['knee_left'], START)).toBe(false)
    expect(kneeGuard([], ['knee_left'], START)).toBe(false)
  })
})

describe('reflowProgramWeek', () => {
  const end = '2026-10-11'
  it('moves missed programme sessions to the next free days, one a day', () => {
    const a = row({ scheduledDate: '2026-10-05' })
    const b = row({ templateKey: 'prog:start-running:w1d2', scheduledDate: '2026-10-07' })
    const busy = row({ templateKey: 'upper_a', scheduledDate: '2026-10-08' })
    const later = row({ templateKey: 'prog:start-running:w1d3', scheduledDate: '2026-10-09' })
    expect(reflowProgramWeek([a, b, busy, later], '2026-10-08', end)).toEqual([
      { id: a.id, scheduledDate: '2026-10-10' },
      { id: b.id, scheduledDate: '2026-10-11' },
    ])
  })

  it('never drops: leftovers stay put', () => {
    const a = row({ scheduledDate: '2026-10-08' })
    const b = row({ scheduledDate: '2026-10-09' })
    const c = row({ templateKey: 'x', scheduledDate: '2026-10-11', status: 'completed' })
    expect(reflowProgramWeek([a, b, c], '2026-10-10', end)).toEqual([{ id: a.id, scheduledDate: '2026-10-10' }])
  })

  it('leaves non-programme, done and other-window rows alone', () => {
    const tier = row({ templateKey: 'upper_a', scheduledDate: '2026-10-06' })
    const doneRow = row({ scheduledDate: '2026-10-06', status: 'completed' })
    const old = row({ scheduledDate: '2026-10-01' })
    expect(reflowProgramWeek([tier, doneRow, old], '2026-10-08', end)).toEqual([])
  })
})
