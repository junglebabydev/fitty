// Programme enrolment and week closing through the real sql.js engine (node loader), like seedBoot.test.ts.
// The programme registry is mocked with small inline series so these tests do not depend on the data files.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Program, ProgramSession } from '../../../domain/programs'
import { PROGRAM_SETTING } from '../../../domain/programs'
import type { WorkoutSession } from '../../../domain/types'
import { EXERCISES } from '../../../data/exercises'
import { db } from '../../../db/database'
import {
  addConditionFlag, addSet, addSymptomCheck, createSession, getSession, getSessions, getSetting, tableCounts, updateSession,
} from '../../../db/repositories'
import { isoAt, todayStr } from '../../../lib/util'
import {
  currentEnrollment, enrollInProgram, ensureProgramWeek, leaveProgram, noImpactChosen, recordFeel, saveScreenAnswers,
  screenAnswersFor, setNoImpact, startStandaloneWorkout,
} from '../program'
import { applyReflow, computeReflow } from '../plan'
import { startSessionWithGate } from '../gate'

const fixtures = vi.hoisted(() => {
  const run = (key: string, week: number): ProgramSession => ({
    key, week, name: `Week ${week}, run ${key.slice(-1)}`, type: 'conditioning', minutes: 30,
    blocks: [
      { shape: 'steady', exerciseId: 'brisk_walk', minutes: 5, effort: 'easy', role: 'warmup' },
      { shape: 'intervals', rounds: 6, work: { exerciseId: 'easy_run', seconds: 60 }, rest: { exerciseId: 'brisk_walk', seconds: 90 } },
    ],
  })
  const base: Pick<Program, 'status' | 'promise' | 'description' | 'minutes' | 'needs' | 'timePerWeek' | 'why' | 'sources' | 'stopSigns' | 'standalone' | 'cues'> = {
    status: 'ready', promise: '', description: '', minutes: [20, 30], needs: '', timePerWeek: '',
    why: [{ text: '', source: 1 }, { text: '', source: 1 }, { text: '', source: 1 }], sources: [], stopSigns: [], standalone: [], cues: {},
  }
  const running: Program = {
    ...base, id: 'start-running', title: 'Test Run', weeks: 2, sessionsPerWeek: 3, equipment: ['bodyweight', 'bike'],
    screen: [
      { id: 'pregnant', text: '', onYes: 'wait', yesCopy: 'Ask your midwife.' },
      { id: 'walk_pain', text: '', onYes: 'path:bike-first', yesCopy: '' },
    ],
    sessions: [run('w1d1', 1), run('w1d2', 1), run('w1d3', 1)],
    repeats: [{ week: 2, copyOf: 1 }],
    paths: {
      standard: { label: 'Standard' },
      'walk-first': { label: 'Walk-first', swaps: { easy_run: 'brisk_walk' } },
      'bike-first': { label: 'Bike-first', swaps: { easy_run: 'stationary_bike', brisk_walk: 'stationary_bike' } },
    },
    flagPaths: {},
    advance: { minCompleted: 'all', maxPainToAdvance: 3, dropBackPainAtLeast: 6, repeatIfFeltHard: true, longGapDays: 14 },
    standalone: [{ sessionKey: 'w1d1', name: 'First run/walk', fact: '6 × 1 min' }],
  }
  const pushups: Program = {
    ...base, id: 'bodyweight', title: 'Test Bodyweight', weeks: 4, sessionsPerWeek: 2, equipment: ['bodyweight'], screen: [],
    sessions: [1, 2].map((d): ProgramSession => ({
      key: `w1d${d}`, week: 1, name: `Day ${d}`, type: 'strength', minutes: 20,
      blocks: [{ shape: 'sets', exerciseId: 'incline_push_up', sets: 2, reps: [6, 12], restSec: 60, slot: 'push' }],
    })),
    repeats: [{ week: 2, copyOf: 1 }, { week: 3, copyOf: 1 }, { week: 4, copyOf: 1 }],
    paths: { standard: { label: 'Standard' } },
    flagPaths: {},
    advance: { minCompleted: 2, maxPainToAdvance: 3, dropBackPainAtLeast: 11, repeatIfFeltHard: true, longGapDays: 14 },
    ladders: [{ slot: 'push', rungs: ['incline_push_up', 'push_up', 'decline_push_up'], advanceWhen: '' }],
  }
  return { 'start-running': running, bodyweight: pushups } as Record<string, Program>
})

vi.mock('../../../data/programs', () => ({
  getProgram: (id: string) => fixtures[id] ?? null,
  PROGRAMS: fixtures,
  PROGRAM_LIST: Object.values(fixtures),
}))

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const START = '2026-10-05'

function clearAll(): void {
  db.transaction(() => {
    for (const t of Object.keys(tableCounts())) db.run(`DELETE FROM "${t}"`)
  })
}

function plain(over: Partial<WorkoutSession>): Omit<WorkoutSession, 'id'> {
  return {
    templateKey: 'upper_a', name: 'Upper A', type: 'strength', tier: 'minimum', scheduledDate: START, status: 'planned',
    startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [], ...over,
  }
}

const programRows = (from: string, to: string) => getSessions(from, to).filter((s) => s.templateKey.startsWith('prog:'))
const complete = (rows: WorkoutSession[]) => rows.forEach((r) => updateSession(r.id, { status: 'completed' }))

beforeAll(async () => {
  await db.init()
})

beforeEach(() => {
  clearAll()
})

afterAll(() => {
  errorSpy.mockRestore()
})

describe('enrolment', () => {
  it('writes the setting and the first window, and is idempotent', () => {
    const e = enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    expect(e).toMatchObject({ programId: 'start-running', path: 'standard', startDate: START, week: 1, closedWindow: -1, status: 'active' })
    expect(programRows(START, '2026-10-11').map((s) => [s.templateKey, s.scheduledDate])).toEqual([
      ['prog:start-running:w1d1', '2026-10-05'],
      ['prog:start-running:w1d2', '2026-10-07'],
      ['prog:start-running:w1d3', '2026-10-09'],
    ])
    expect(ensureProgramWeek(START)).toEqual({ closed: [], created: 0 })
    expect(ensureProgramWeek('2026-10-08').created).toBe(0)
    expect(programRows(START, '2026-10-11').length).toBe(3)
  })

  it('replaceTierWeek removes only untouched planned tier rows from today to the end of the calendar week', () => {
    const today = '2026-10-07' // Wednesday
    const keep = [
      createSession(plain({ scheduledDate: '2026-10-06' })), // before today
      createSession(plain({ scheduledDate: '2026-10-08', status: 'completed' })),
      createSession(plain({ scheduledDate: '2026-10-12' })), // next calendar week
      createSession(plain({ templateKey: 'work:start-running:w1d1', scheduledDate: '2026-10-09' })),
    ]
    const logged = createSession(plain({ scheduledDate: '2026-10-10' }))
    addSet({ sessionId: logged, exerciseId: 'push_up', setIndex: 1, reps: 5, loadKg: null, rir: null, rpe: null, durationSec: null, painFlag: false, loggedAt: isoAt('2026-10-06', 9) })
    const gone = createSession(plain({ scheduledDate: '2026-10-11' }))
    enrollInProgram('start-running', 'standard', today, { replaceTierWeek: true })
    for (const id of [...keep, logged]) expect(getSession(id)).not.toBeNull()
    expect(getSession(gone)).toBeNull()
    // The window starts today (07-13). Default days 07, 09, 11; 09 (work: row), 10 (logged) and 12 are taken.
    expect(programRows(today, '2026-10-13').map((s) => s.scheduledDate)).toEqual(['2026-10-07', '2026-10-11', '2026-10-13'])
  })

  it('without replaceTierWeek, existing sessions keep their days and programme sessions go around them', () => {
    createSession(plain({ scheduledDate: '2026-10-07' }))
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    expect(programRows(START, '2026-10-11').map((s) => s.scheduledDate)).toEqual(['2026-10-05', '2026-10-08', '2026-10-09'])
  })

  it('switching programmes removes the old programme\'s future untouched rows', () => {
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    const first = programRows(START, START)[0]
    updateSession(first.id, { status: 'completed' })
    enrollInProgram('bodyweight', 'standard', '2026-10-06', { replaceTierWeek: false })
    const keys = programRows(START, '2026-10-12').map((s) => s.templateKey)
    expect(keys).toEqual(['prog:start-running:w1d1', 'prog:bodyweight:w1d1', 'prog:bodyweight:w1d2'])
  })
})

describe('week close', () => {
  it('advances after a full pain-free window and writes the next week', () => {
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    complete(programRows(START, '2026-10-11'))
    addSymptomCheck({ ts: isoAt('2026-10-08', 7), region: 'knee_left', painScore: 3, redFlags: {}, notes: '', context: 'morning', sessionId: null })
    const r = ensureProgramWeek('2026-10-12')
    expect(r.closed.map((c) => c.decision)).toEqual(['advance'])
    expect(r.created).toBe(3)
    const e = currentEnrollment()!
    expect(e).toMatchObject({ week: 2, closedWindow: 0, status: 'active' })
    expect(e.history).toEqual([{ week: 1, decision: 'advance', reason: 'Week 1 done, so week 2 starts.', at: '2026-10-12' }])
    expect(programRows('2026-10-12', '2026-10-18').map((s) => s.templateKey)).toEqual([
      'prog:start-running:w2d1', 'prog:start-running:w2d2', 'prog:start-running:w2d3',
    ])
    expect(ensureProgramWeek('2026-10-13')).toEqual({ closed: [], created: 0 })
  })

  it('repeats on pain above the ceiling (any region, gate and morning checks) and ignores other contexts', () => {
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    complete(programRows(START, '2026-10-11'))
    addSymptomCheck({ ts: isoAt('2026-10-06', 9), region: 'back_lower', painScore: 9, redFlags: {}, notes: '', context: 'manual', sessionId: null })
    addSymptomCheck({ ts: isoAt('2026-10-09', 9), region: 'back_lower', painScore: 4, redFlags: {}, notes: '', context: 'pre_workout', sessionId: null })
    expect(ensureProgramWeek('2026-10-12').closed[0]).toMatchObject({ decision: 'repeat', nextWeek: 1 })
    expect(programRows('2026-10-12', '2026-10-18').map((s) => s.templateKey)[0]).toBe('prog:start-running:w1d1')
  })

  it('a "Too hard" repeats the week once; the repeat is judged on its own answers', () => {
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    const w0 = programRows(START, '2026-10-11')
    complete(w0)
    recordFeel(w0[1].id, 'hard')
    expect(currentEnrollment()!.feel).toEqual([{ sessionKey: 'w1d2', week: 1, value: 'hard' }])
    expect(ensureProgramWeek('2026-10-12').closed[0].decision).toBe('repeat')
    complete(programRows('2026-10-12', '2026-10-18')) // no feel answered this time
    expect(ensureProgramWeek('2026-10-19').closed[0].decision).toBe('advance')
    expect(currentEnrollment()!.week).toBe(2)
  })

  it('closes every elapsed window in order after a long absence', () => {
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    const r = ensureProgramWeek('2026-10-27') // window 3
    expect(r.closed.map((c) => c.decision)).toEqual(['repeat', 'repeat', 'repeat'])
    expect(currentEnrollment()).toMatchObject({ week: 1, closedWindow: 2 })
    expect(programRows('2026-10-26', '2026-11-01').length).toBe(3)
  })

  it('finishing the last week marks the programme done and writes nothing more', () => {
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    complete(programRows(START, '2026-10-11'))
    ensureProgramWeek('2026-10-12')
    complete(programRows('2026-10-12', '2026-10-18'))
    const r = ensureProgramWeek('2026-10-19')
    expect(r).toMatchObject({ created: 0 })
    expect(r.closed[0]).toMatchObject({ decision: 'advance', status: 'done' })
    expect(currentEnrollment()!.status).toBe('done')
    expect(programRows('2026-10-19', '2026-10-25')).toEqual([])
  })

  it('moves the ladder up when every set hit the top, and the next week uses the new rung', () => {
    enrollInProgram('bodyweight', 'standard', START, { replaceTierWeek: false })
    const rows = programRows(START, '2026-10-11')
    expect(rows.map((r) => r.exercises[0].exerciseId)).toEqual(['incline_push_up', 'incline_push_up'])
    for (const r of rows) {
      for (let i = 1; i <= 2; i++) {
        addSet({ sessionId: r.id, exerciseId: 'incline_push_up', setIndex: i, reps: 12, loadKg: null, rir: 2, rpe: null, durationSec: null, painFlag: false, loggedAt: isoAt(r.scheduledDate, 9) })
      }
    }
    complete(rows)
    ensureProgramWeek('2026-10-12')
    expect(currentEnrollment()!.rungs).toEqual({ push: 1 })
    expect(programRows('2026-10-12', '2026-10-18').map((r) => r.exercises[0].exerciseId)).toEqual(['push_up', 'push_up'])
  })
})

describe('feel, leaving, screens and the no-impact choice', () => {
  it('recordFeel keeps one answer per session and ignores non-programme rows', () => {
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    const [a] = programRows(START, START)
    recordFeel(a.id, 'hard')
    recordFeel(a.id, 'right')
    recordFeel(createSession(plain({})), 'easy')
    expect(currentEnrollment()!.feel).toEqual([{ sessionKey: 'w1d1', week: 1, value: 'right' }])
  })

  it('leaveProgram keeps history and logged rows, removes future untouched ones', () => {
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    const [a, b, c] = programRows(START, '2026-10-11')
    updateSession(a.id, { status: 'completed' })
    addSet({ sessionId: c.id, exerciseId: 'easy_run', setIndex: 1, reps: null, loadKg: null, rir: null, rpe: null, durationSec: 60, painFlag: false, loggedAt: isoAt('2026-10-06', 9) })
    leaveProgram('2026-10-06')
    expect(currentEnrollment()!.status).toBe('left')
    expect(getSession(a.id)).not.toBeNull()
    expect(getSession(b.id)).toBeNull()
    expect(getSession(c.id)).not.toBeNull()
    expect(ensureProgramWeek('2026-10-12')).toEqual({ closed: [], created: 0 })
  })

  it('stores screen answers per series and the no-impact choice', () => {
    expect(screenAnswersFor('start-running')).toBeUndefined()
    saveScreenAnswers('start-running', { pregnant: false }, '2026-10-01T08:00:00.000Z')
    saveScreenAnswers('bodyweight', { x: true })
    expect(screenAnswersFor('start-running')).toEqual({ programId: 'start-running', answers: { pregnant: false }, answeredAt: '2026-10-01T08:00:00.000Z' })
    expect(screenAnswersFor('bodyweight')?.answers).toEqual({ x: true })
    expect(noImpactChosen()).toBe(false)
    setNoImpact(true)
    expect(noImpactChosen()).toBe(true)
  })
})

describe('startStandaloneWorkout', () => {
  it('creates a work: session for today on the screened path and never touches the enrolment', () => {
    const id = startStandaloneWorkout('start-running', 'w1d1', START)
    const s = getSession(id)!
    expect(s).toMatchObject({ templateKey: 'work:start-running:w1d1', name: 'First run/walk', scheduledDate: START, status: 'planned', type: 'conditioning' })
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(['brisk_walk', 'easy_run'])
    expect(getSetting(PROGRAM_SETTING, null)).toBeNull()

    saveScreenAnswers('start-running', { pregnant: false, walk_pain: true })
    expect(getSession(startStandaloneWorkout('start-running', 'w1d1', START))!.exercises.map((e) => e.exerciseId)).toEqual(['stationary_bike', 'stationary_bike'])
  })

  it('the no-impact choice picks walk-first', () => {
    setNoImpact(true)
    expect(getSession(startStandaloneWorkout('start-running', 'w2d3', START))!.exercises.map((e) => e.exerciseId)).toEqual(['brisk_walk', 'brisk_walk'])
  })
})

describe('reflow with a programme', () => {
  it('moves missed programme rows later in the window and never drops them', () => {
    enrollInProgram('start-running', 'standard', START, { replaceTierWeek: false })
    const today = '2026-10-10'
    const week = getSessions('2026-10-05', '2026-10-11')
    const moves = computeReflow(week, today)
    expect(moves.map((m) => [m.scheduledDate, m.drop ?? false])).toEqual([['2026-10-10', false], ['2026-10-11', false]])
    // A forged drop of a programme row is refused.
    const r = applyReflow(week, [...moves, { id: week[2].id, scheduledDate: week[2].scheduledDate, note: 'x', drop: true }])
    expect(r).toEqual({ moved: 2, dropped: 0 })
    expect(programRows(START, '2026-10-11').map((s) => s.scheduledDate).sort()).toEqual(['2026-10-09', '2026-10-10', '2026-10-11'])
  })
})

describe('the gate on programme sessions', () => {
  const runRow = () => {
    const today = todayStr()
    const id = createSession(plain({
      templateKey: 'prog:start-running:w1d1', type: 'conditioning', scheduledDate: today,
      exercises: [{ exerciseId: 'easy_run', sets: 6, repMin: 60, repMax: 60, loadKg: null, restSec: 90, program: true, restExerciseId: 'brisk_walk' }],
    }))
    return getSession(id)!
  }

  it('a standing knee flag no longer removes running', () => {
    addConditionFlag({ region: 'knee_left', label: 'left knee', baselineNotes: '' })
    const out = startSessionWithGate(runRow(), [], EXERCISES, null)
    expect(out.exercises.map((e) => e.exerciseId)).toEqual(['easy_run'])
  })

  it('the no-impact choice swaps running inside the series equipment', () => {
    setNoImpact(true)
    const out = startSessionWithGate(runRow(), [], EXERCISES, null)
    const id = out.exercises[0].exerciseId
    expect(id).not.toBe('easy_run')
    expect(['bodyweight', 'bike']).toContain(EXERCISES.find((e) => e.id === id)!.equipment)
  })

  it('a flagged knee at 4/10 the next morning walks until a later score is back to 3', () => {
    addConditionFlag({ region: 'knee_left', label: 'left knee', baselineNotes: '' })
    addSymptomCheck({ ts: new Date(Date.now() - 3 * 86_400_000).toISOString(), region: 'knee_left', painScore: 4, redFlags: {}, notes: '', context: 'morning', sessionId: null })
    expect(startSessionWithGate(runRow(), [], EXERCISES, null).exercises[0].exerciseId).not.toBe('easy_run')
    addSymptomCheck({ ts: new Date().toISOString(), region: 'knee_left', painScore: 2, redFlags: {}, notes: '', context: 'morning', sessionId: null })
    expect(startSessionWithGate(runRow(), [], EXERCISES, null).exercises[0].exerciseId).toBe('easy_run')
  })
})
