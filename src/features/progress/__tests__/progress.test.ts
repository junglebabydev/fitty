import { describe, expect, it } from 'vitest'
import type { BodyMetric, Exercise, ExerciseSet, SleepRecord, WorkoutSession } from '../../../domain/types'
import { addDays, isoAt } from '../../../lib/util'
import { adherencePct, adherenceTotals, computeAdherence, weekLabel } from '../adherence'
import { bestE1RM, computeStrengthTrends } from '../strength'
import { trajectoryText } from '../trajectory'
import { computeWaistStats, computeWeightStats, signed } from '../weight'

const TODAY = '2026-09-10' // Thursday
const WEEK_START = '2026-09-07'

let id = 1
const weight = (date: string, value: number): BodyMetric => ({ id: id++, ts: isoAt(date, 7), type: 'weight', value, unit: 'kg', source: 'seed' })
const waist = (date: string, value: number): BodyMetric => ({ id: id++, ts: isoAt(date, 7), type: 'waist', value, unit: 'cm', source: 'manual' })
const session = (date: string, status: WorkoutSession['status'], sid = id++): WorkoutSession => ({
  id: sid, templateKey: 'upper_a', name: 'Upper', type: 'strength', tier: 'minimum', scheduledDate: date, status,
  startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [],
})
const sleep = (endDate: string, durationMin: number): SleepRecord => ({ id: id++, startTs: isoAt(addDays(endDate, -1), 23), endTs: isoAt(endDate, 6), durationMin, source: 'seed', quality: null })
const set = (sessionId: number, exerciseId: string, reps: number | null, loadKg: number | null): ExerciseSet => ({
  id: id++, sessionId, exerciseId, setIndex: 1, reps, loadKg, rir: 2, rpe: null, durationSec: null, painFlag: false, loggedAt: isoAt(TODAY, 8),
})
const exercise = (eid: string, name: string, timed = false): Exercise => ({
  id: eid, name, equipment: 'dumbbell', primaryMuscles: [], secondaryMuscles: [], pattern: 'push', safetyTags: [], substitutions: [], instructions: '', timed,
})

describe('computeAdherence', () => {
  it('returns newest week first with labels and per-pillar counts', () => {
    const sessions = [
      session(WEEK_START, 'completed'), session(addDays(WEEK_START, 2), 'planned'), session(addDays(WEEK_START, 4), 'planned'),
      session(addDays(WEEK_START, -7), 'completed'), session(addDays(WEEK_START, -5), 'skipped'), session(addDays(WEEK_START, -3), 'completed'),
    ]
    const intake = [
      { date: WEEK_START, logged: true }, { date: addDays(WEEK_START, 1), logged: true }, { date: addDays(WEEK_START, 2), logged: false },
      { date: addDays(WEEK_START, -7), logged: true },
    ]
    const nights = [sleep(addDays(WEEK_START, 1), 430), sleep(addDays(WEEK_START, 2), 370), sleep(addDays(WEEK_START, 3), 460), sleep(addDays(WEEK_START, -6), 500), sleep(addDays(WEEK_START, -6), 480)]
    const weeks = computeAdherence({ today: TODAY, weeks: 4, sessions, intake, sleep: nights })
    expect(weeks).toHaveLength(4)
    expect(weeks[0]).toMatchObject({ weekStart: WEEK_START, weekEnd: '2026-09-13', label: 'This week', current: true, training: { done: 1, planned: 3 }, nutrition: { logged: 2, days: 7 }, sleep: { nights: 2, days: 7 } })
    expect(weeks[1]).toMatchObject({ weekStart: '2026-08-31', label: 'Last week', current: false, training: { done: 2, planned: 3 }, nutrition: { logged: 1, days: 7 }, sleep: { nights: 1, days: 7 } })
    expect(weeks[2].training).toEqual({ done: 0, planned: 0 })
    expect(weekLabel('2026-08-24', TODAY)).toMatch(/Aug/)
  })

  it('adherencePct caps at 100 and handles zero denominators; totals sum across weeks', () => {
    expect(adherencePct(3, 4)).toBe(75)
    expect(adherencePct(5, 4)).toBe(100)
    expect(adherencePct(0, 0)).toBe(0)
    const weeks = computeAdherence({ today: TODAY, weeks: 2, sessions: [session(WEEK_START, 'completed'), session(addDays(WEEK_START, -2), 'planned')], intake: [], sleep: [] })
    expect(adherenceTotals(weeks)).toEqual({ weeks: 2, sessionsDone: 1, sessionsPlanned: 2, loggedDays: 0, goodNights: 0, days: 14 })
  })
})

describe('strength trends', () => {
  it('bestE1RM picks the highest Epley estimate and ignores unloaded sets', () => {
    const best = bestE1RM([set(1, 'a', 10, 26), set(1, 'a', 9, 26), set(1, 'a', null, 26), set(1, 'a', 12, null)])
    expect(best).toEqual({ e1rm: 34.7, loadKg: 26, reps: 10 })
    expect(bestE1RM([set(1, 'a', 12, null)])).toBeNull()
  })

  it('ranks by number of sessions, skips timed exercises, and reports change since the first session', () => {
    const s1 = session('2026-09-01', 'completed', 11)
    const s2 = session('2026-09-04', 'completed', 12)
    const s3 = session('2026-09-08', 'completed', 13)
    const sets = [
      set(11, 'db_bench_press', 10, 24), set(11, 'db_bench_press', 9, 24),
      set(12, 'db_bench_press', 10, 26), set(12, 'lat_pulldown', 10, 55),
      set(13, 'db_bench_press', 10, 26), set(13, 'lat_pulldown', 10, 57.5), set(13, 'plank', null, null), set(13, 'plank', 1, 60),
      set(12, 'db_curl', 12, 12),
    ]
    const exercises = [exercise('db_bench_press', 'Dumbbell Bench Press'), exercise('lat_pulldown', 'Lat Pulldown'), exercise('plank', 'Plank', true), exercise('db_curl', 'Dumbbell Curl')]
    const trends = computeStrengthTrends({ sessions: [s1, s2, s3], sets, exercises, top: 2 })
    expect(trends.map((t) => t.exerciseId)).toEqual(['db_bench_press', 'lat_pulldown'])
    const bench = trends[0]
    expect(bench.sessions).toBe(3)
    expect(bench.points.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-04', '2026-09-08'])
    expect(bench.best.e1rm).toBe(34.7)
    expect(bench.latest).toMatchObject({ loadKg: 26, reps: 10 })
    expect(bench.changeKg).toBe(2.7)
    expect(trends[1].changeKg).toBe(3.4)
    const all = computeStrengthTrends({ sessions: [s1, s2, s3], sets, exercises })
    expect(all.map((t) => t.exerciseId)).toEqual(['db_bench_press', 'lat_pulldown', 'db_curl'])
    expect(all[2].changeKg).toBeNull()
  })

  it('falls back to the set timestamp and a humanised name for unknown sessions/exercises', () => {
    const t = computeStrengthTrends({ sessions: [], sets: [set(99, 'goblet_squat', 8, 20)], exercises: [] })
    expect(t[0]).toMatchObject({ name: 'Goblet Squat', sessions: 1, points: [{ date: TODAY, loadKg: 20, reps: 8 }] })
  })
})

describe('weight and waist stats', () => {
  const seed = [84.6, 84.4, 84.3, 84.1, 84.2, 83.9, 84.0].map((v, i) => weight(addDays(TODAY, i - 6), v))

  it('seed week: latest 84.0, 7-day avg 84.2, no rate yet, change since the first entry', () => {
    const s = computeWeightStats(seed, 74, TODAY)
    expect(s.latest).toBe(84)
    expect(s.avg7).toBe(84.21)
    expect(s.prevAvg7).toBeNull()
    expect(s.rateKg).toBeNull()
    expect(s.projected).toBeNull()
    expect(s.change).toEqual({ delta: -0.6, sinceDate: addDays(TODAY, -6) })
    expect(s.series).toHaveLength(7)
    expect(s.toGoal).toBe(10)
  })

  it('two weeks of data give a weekly rate and a projected date', () => {
    const prev = [85.4, 85.2, 85.1, 84.9, 84.8, 84.7, 84.7].map((v, i) => weight(addDays(TODAY, i - 13), v))
    const s = computeWeightStats([...prev, ...seed], 74, TODAY)
    expect(s.prevAvg7).toBe(84.97)
    expect(s.rateKg).toBeCloseTo(-0.76, 2)
    expect(s.projected).not.toBeNull()
    expect(s.projected! > TODAY).toBe(true)
  })

  it('handles no data and waist changes', () => {
    const empty = computeWeightStats([], 74, TODAY)
    expect(empty).toMatchObject({ latest: null, avg7: null, rateKg: null, change: null, series: [], toGoal: null, projected: null })
    const w = computeWaistStats([waist(addDays(TODAY, -40), 86), waist(TODAY, 84)], 81, TODAY)
    expect(w.latest).toBe(84)
    expect(w.change).toEqual({ delta: -2, sinceDate: addDays(TODAY, -40) })
    expect(w.toGoal).toBe(3)
    expect(signed(0.4)).toBe('+0.4')
    expect(signed(-0.62)).toBe('−0.6')
    expect(signed(0)).toBe('0.0')
  })
})

describe('trajectoryText', () => {
  const adherence = computeAdherence({ today: TODAY, weeks: 1, sessions: [session(WEEK_START, 'completed'), session(TODAY, 'planned')], intake: [{ date: TODAY, logged: true }], sleep: [] })

  it('asks for data when there is no weight', () => {
    const lines = trajectoryText({ weight: computeWeightStats([], 74, TODAY), waist: computeWaistStats([], null, TODAY), adherence, today: TODAY })
    expect(lines[0]).toMatch(/No weight logged yet/)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/1\/2 sessions done, meals logged 1\/7 days/)
  })

  it('projects the goal date when the rate is down, and flags rapid loss', () => {
    const prev = [86.4, 86.2, 86.1, 85.9, 85.8, 85.7, 85.7].map((v, i) => weight(addDays(TODAY, i - 13), v))
    const cur = [84.6, 84.4, 84.3, 84.1, 84.2, 83.9, 84.0].map((v, i) => weight(addDays(TODAY, i - 6), v))
    const lines = trajectoryText({ weight: computeWeightStats([...prev, ...cur], 74, TODAY), waist: computeWaistStats([waist(TODAY, 84)], 81, TODAY), adherence: [], today: TODAY })
    expect(lines[0]).toMatch(/^Down 1\.7\d kg\/week/)
    expect(lines[0]).toMatch(/reach 74 kg around/)
    expect(lines[0]).toMatch(/faster than the 1\.2 kg\/week ceiling/)
    expect(lines[1]).toBe('Waist 84.0 cm, 3.0 cm from the 81 cm goal.')
  })

  it('describes a flat trend without projecting', () => {
    const pts = Array.from({ length: 14 }, (_, i) => weight(addDays(TODAY, i - 13), 84 + (i % 2) * 0.1))
    const lines = trajectoryText({ weight: computeWeightStats(pts, 74, TODAY), waist: computeWaistStats([], null, TODAY), adherence: [], today: TODAY })
    expect(lines[0]).toMatch(/^Weight is flat over the last two weeks/)
    expect(lines).toHaveLength(1)
  })
})
