// Pure parts of the coach apply module, plus syncProposals / applyDecision(volume) against mocked repositories.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoachDecision, NutritionTarget, PlannedExercise, WorkoutSession } from '../../../domain/types'

const repo = vi.hoisted(() => ({
  decisions: [] as CoachDecision[],
  added: [] as Omit<CoachDecision, 'id'>[],
  sessions: new Map<number, WorkoutSession>(),
  updates: [] as { id: number; patch: Partial<WorkoutSession> }[],
  statuses: [] as { id: number; status: string; note?: string }[],
}))

vi.mock('../../../db/database', () => ({
  db: { transaction: <T,>(fn: () => T): T => fn() },
}))

vi.mock('../../../db/repositories', () => ({
  activeSession: () => null,
  addDecision: (d: Omit<CoachDecision, 'id'>) => { repo.added.push(d); return repo.added.length },
  getDecisions: () => repo.decisions,
  getExercises: () => [],
  getNutritionTarget: () => null,
  getNutritionTargets: () => [],
  getSession: (id: number) => repo.sessions.get(id) ?? null,
  getSessions: () => [],
  getSessionsForDate: () => [],
  lastSetsForExercise: () => [],
  setDecisionStatus: (id: number, status: string, note?: string) => { repo.statuses.push({ id, status, note }) },
  setNutritionTarget: () => 1,
  updateSession: (id: number, patch: Partial<WorkoutSession>) => { repo.updates.push({ id, patch }) },
}))

const facts = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('../facts', () => ({ buildCoachFacts: () => facts.value }))

import {
  acceptDecision, adjustSets, applyDecision, decisionKindLabel, deloadExercises, extractProposalLine, isRecentDuplicate,
  isReversible, numberOr, previousTargetFor, roundDownToStep, swapExercise, syncProposals,
} from '../apply'

const ex = (exerciseId: string, sets = 3, loadKg: number | null = null): PlannedExercise =>
  ({ exerciseId, sets, repMin: 8, repMax: 12, loadKg, restSec: 90 })

const decision = (over: Partial<CoachDecision> = {}): CoachDecision => ({
  id: 1,
  ts: '2026-09-10T08:00:00.000Z',
  kind: 'volume',
  title: 'Trim today',
  rationale: 'AMBER',
  evidence: [],
  action: { kind: 'volume', payload: { sessionId: 7, setsDelta: -1 }, summary: 'One set fewer' },
  status: 'proposed',
  resultNotes: '',
  decidedAt: null,
  ...over,
})

const target = (over: Partial<NutritionTarget> = {}): NutritionTarget => ({
  id: 1, startDate: '2026-08-01', endDate: null, kcal: 2050, proteinG: 150, carbsG: 190, fatG: 65, rationale: '', ...over,
})

beforeEach(() => {
  repo.decisions = []
  repo.added = []
  repo.sessions = new Map()
  repo.updates = []
  repo.statuses = []
  facts.value = null
})

describe('numberOr / roundDownToStep', () => {
  it('coerces numbers and numeric strings, falls back otherwise', () => {
    expect(numberOr(5, 1)).toBe(5)
    expect(numberOr('7.5', 1)).toBe(7.5)
    expect(numberOr('', 1)).toBe(1)
    expect(numberOr(undefined, 2)).toBe(2)
    expect(numberOr(NaN, 3)).toBe(3)
  })

  it('rounds down to the equipment step', () => {
    expect(roundDownToStep(23.4, 2)).toBe(22)
    expect(roundDownToStep(49.5, 2.5)).toBe(47.5)
    expect(roundDownToStep(50, 2.5)).toBe(50)
    expect(roundDownToStep(9.87, 0)).toBe(9.8)
  })
})

describe('deloadExercises', () => {
  it('scales the planned load by the percentage, rounded down to the step (26 kg dumbbell -> 22 kg)', () => {
    const r = deloadExercises([ex('db_bench_press', 3, 26), ex('lat_pulldown', 3, 55)], 'db_bench_press', 10, null, 2)
    expect(r.changed).toBe(1)
    expect(r.fromKg).toBe(26)
    expect(r.toKg).toBe(22)
    expect(r.exercises[0].loadKg).toBe(22)
    expect(r.exercises[1].loadKg).toBe(55)
  })

  it('uses the last logged load when the plan has none, and always drops at least one step', () => {
    const r = deloadExercises([ex('lat_pulldown', 3, null)], 'lat_pulldown', 10, 55, 2.5)
    expect(r.toKg).toBe(47.5)
    const tiny = deloadExercises([ex('cable_curl', 3, 5)], 'cable_curl', 5, null, 2.5)
    expect(tiny.toKg).toBe(2.5)
  })

  it('leaves entries without any load untouched and never mutates the input', () => {
    const input = [ex('glute_bridge', 3, null)]
    const r = deloadExercises(input, 'glute_bridge', 10, null, 0)
    expect(r.changed).toBe(0)
    expect(r.exercises[0]).toBe(input[0])
  })
})

describe('adjustSets / swapExercise', () => {
  it('adds a delta with a floor of one set', () => {
    const r = adjustSets([ex('a', 3), ex('b', 1), ex('c', 2)], -1)
    expect(r.exercises.map((e) => e.sets)).toEqual([2, 1, 1])
    expect(r.changed).toBe(2)
    expect(adjustSets([ex('a', 1)], -1).changed).toBe(0)
  })

  it('swaps an exercise and records where it came from', () => {
    const r = swapExercise([ex('hack_squat', 3, 40), ex('leg_curl')], 'hack_squat', 'leg_press', 'knee AMBER')
    expect(r.changed).toBe(1)
    expect(r.exercises[0]).toMatchObject({ exerciseId: 'leg_press', sets: 3, loadKg: 40, substitutedFrom: 'hack_squat', substitutionReason: 'knee AMBER' })
    expect(swapExercise([ex('a')], 'zzz', 'b', '').changed).toBe(0)
  })
})

describe('previousTargetFor', () => {
  it('finds the target closed the day before the new start, newest first', () => {
    const targets = [
      target({ id: 3, startDate: '2026-09-10', endDate: null, kcal: 1900 }),
      target({ id: 2, startDate: '2026-08-20', endDate: '2026-09-09', kcal: 2050 }),
      target({ id: 1, startDate: '2026-08-01', endDate: '2026-08-19', kcal: 2200 }),
    ]
    expect(previousTargetFor(targets, '2026-09-10')?.kcal).toBe(2050)
    expect(previousTargetFor(targets, '2026-08-20')?.kcal).toBe(2200)
    expect(previousTargetFor(targets, '2026-08-01')).toBeNull()
  })
})

describe('isRecentDuplicate', () => {
  const since = '2026-09-03T00:00:00.000Z'
  it('blocks pending proposals of the same kind+title regardless of age, and recent accept/reject', () => {
    const old = decision({ id: 1, ts: '2026-08-01T00:00:00.000Z', status: 'proposed' })
    expect(isRecentDuplicate([old], { kind: 'volume', title: 'Trim today' }, since)).toBe(true)
    const recent = decision({ id: 2, ts: '2026-09-08T00:00:00.000Z', status: 'rejected' })
    expect(isRecentDuplicate([recent], { kind: 'volume', title: 'Trim today' }, since)).toBe(true)
  })

  it('lets old decided and any reverted decisions be re-proposed', () => {
    const oldAccepted = decision({ ts: '2026-08-20T00:00:00.000Z', status: 'accepted' })
    expect(isRecentDuplicate([oldAccepted], { kind: 'volume', title: 'Trim today' }, since)).toBe(false)
    const reverted = decision({ ts: '2026-09-09T00:00:00.000Z', status: 'reverted' })
    expect(isRecentDuplicate([reverted], { kind: 'volume', title: 'Trim today' }, since)).toBe(false)
    expect(isRecentDuplicate([decision({ status: 'proposed' })], { kind: 'volume', title: 'Other' }, since)).toBe(false)
  })
})

describe('extractProposalLine / decisionKindLabel', () => {
  it('pulls the PROPOSAL line out of a reply, tolerating markdown emphasis', () => {
    expect(extractProposalLine('Do the session.\nPROPOSAL: Lower calories by 150 kcal.')).toBe('Lower calories by 150 kcal.')
    expect(extractProposalLine('**Proposal:** add a bike session on Saturday')).toBe('add a bike session on Saturday')
    expect(extractProposalLine('Nothing to change today.')).toBeNull()
    expect(extractProposalLine('PROPOSAL:   ')).toBeNull()
  })

  it('labels action kinds', () => {
    expect(decisionKindLabel('nutrition_target')).toBe('Nutrition')
    expect(decisionKindLabel('reflow_week')).toBe('Plan')
    expect(decisionKindLabel('something_else')).toBe('Coach')
  })
})

describe('isReversible', () => {
  it('only accepted nutrition targets that are still the active target, and planned-session volume changes', () => {
    const nt = decision({ status: 'accepted', kind: 'nutrition_target', title: 'Lower calories by 150 kcal', action: { kind: 'nutrition_target', payload: {}, summary: '' } })
    expect(isReversible(nt)).toBe(true)
    expect(isReversible(nt, { currentTarget: target({ rationale: 'Coach: Lower calories by 150 kcal. flat' }) })).toBe(true)
    expect(isReversible(nt, { currentTarget: target({ rationale: 'manual edit' }) })).toBe(false)
    expect(isReversible(nt, { currentTarget: null })).toBe(false)
    expect(isReversible({ ...nt, status: 'proposed' })).toBe(false)

    const vol = decision({ status: 'accepted' })
    expect(isReversible(vol, { session: { status: 'planned' } as WorkoutSession })).toBe(true)
    expect(isReversible(vol, { session: { status: 'completed' } as WorkoutSession })).toBe(false)
    expect(isReversible(decision({ status: 'accepted', action: { kind: 'reflow_week', payload: {}, summary: '' } }))).toBe(false)
  })
})

describe('applyDecision / acceptDecision (volume, mocked repositories)', () => {
  const session = (status: WorkoutSession['status']): WorkoutSession => ({
    id: 7, templateKey: 'upper_a', name: 'Upper Body Strength', type: 'strength', tier: 'minimum', scheduledDate: '2026-09-10',
    status, startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '',
    exercises: [ex('db_bench_press', 3, 26), ex('lateral_raise', 2)],
  })

  it('removes one set per exercise from the planned session and records the note on accept', () => {
    repo.sessions.set(7, session('planned'))
    const note = acceptDecision(decision())
    expect(note).toBe('-1 set per exercise in Upper Body Strength (2 exercises)')
    expect(repo.updates).toHaveLength(1)
    expect(repo.updates[0].patch.exercises?.map((e) => e.sets)).toEqual([2, 1])
    expect(repo.statuses).toEqual([{ id: 1, status: 'accepted', note }])
  })

  it('does not touch a completed session', () => {
    repo.sessions.set(7, session('completed'))
    expect(applyDecision(decision())).toMatch(/already completed/)
    expect(repo.updates).toHaveLength(0)
  })

  it('throws (leaving the proposal pending) when the session is gone', () => {
    expect(() => applyDecision(decision())).toThrow(/No session/)
    expect(repo.statuses).toHaveLength(0)
  })

  it('treats note actions as informational', () => {
    expect(applyDecision(decision({ action: { kind: 'note', payload: {}, summary: 'Add a walk' } }))).toBe('Noted: Add a walk')
  })
})

describe('syncProposals (mocked facts + repositories)', () => {
  const missedSession: WorkoutSession = {
    id: 3, templateKey: 'lower_a', name: 'Lower Body Strength', type: 'strength', tier: 'minimum', scheduledDate: '2026-09-08',
    status: 'planned', startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [],
  }
  const factsWithMissedSession = () => ({
    today: '2026-09-10',
    hourNow: 12,
    readiness: { state: 'GREEN', reasons: [], modifiers: { reduceVolume: false, lowImpactOnly: false, avoidRegions: [], suggestRest: false } },
    gate: { regions: [], avoidTags: [], overall: 'OK', advice: [] },
    plannedToday: null,
    sessionsThisWeek: [missedSession],
    weekTier: 'target',
    intakeToday: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    target: target(),
    proteinPaceExpected: 0,
    savedMealNames: [],
    recentHighProteinFoods: [],
    weight: { latest: null, avg7: null, prevAvg7: null, goal: null },
    sleepLastNightMin: null,
    sleepAvg7Min: null,
    missedThisWeek: 1,
    nutritionTrend: null,
    stalls: [],
    loggedMealDaysLast7: 0,
  })

  it('inserts a fresh reflow proposal as proposed', () => {
    facts.value = factsWithMissedSession()
    syncProposals()
    expect(repo.added).toHaveLength(1)
    expect(repo.added[0]).toMatchObject({ kind: 'reflow_week', status: 'proposed', resultNotes: '', decidedAt: null })
    expect(repo.added[0].action.kind).toBe('reflow_week')
  })

  it('skips proposals already pending or decided within 7 days', () => {
    facts.value = factsWithMissedSession()
    repo.decisions = [decision({ kind: 'reflow_week', title: 'Reflow 1 missed session', ts: '2026-09-09T10:00:00.000Z', status: 'rejected' })]
    syncProposals()
    expect(repo.added).toHaveLength(0)
  })
})
