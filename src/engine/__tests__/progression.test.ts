import { describe, expect, it } from 'vitest'
import { estimate1RM, evaluateProgression, loadIncrement } from '../progression'
import { byId, set } from './fixtures'

const planned = { exerciseId: 'db_bench_press', sets: 3, repMin: 8, repMax: 12, loadKg: 26, restSec: 90 }
const bench = byId('db_bench_press')

describe('evaluateProgression (double progression)', () => {
  it('start when there is no history', () => {
    const r = evaluateProgression(planned, bench, [], [])
    expect(r.action).toBe('start')
    expect(r.nextLoadKg).toBe(26)
    expect(r.stalled).toBe(false)
  })

  it('increase dumbbells by 2 kg when every set hits repMax with RIR ≥ 1', () => {
    const last = [set('db_bench_press', 1, 12, 26, 2), set('db_bench_press', 2, 12, 26, 1), set('db_bench_press', 3, 12, 26, 1)]
    const r = evaluateProgression(planned, bench, last, [])
    expect(r.action).toBe('increase')
    expect(r.nextLoadKg).toBe(28)
    expect(r.reason).toMatch(/28 kg per hand/)
    expect(loadIncrement('dumbbell')).toBe(2)
  })

  it('does not increase when a set is at failure (RIR 0)', () => {
    const last = [set('db_bench_press', 1, 12, 26, 2), set('db_bench_press', 2, 12, 26, 0), set('db_bench_press', 3, 12, 26, 1)]
    expect(evaluateProgression(planned, bench, last, []).action).toBe('hold')
  })

  it('machine / cable increase by 5% rounded to 2.5 kg', () => {
    const pd = { ...planned, exerciseId: 'lat_pulldown', loadKg: 55 }
    const last = [set('lat_pulldown', 1, 12, 55), set('lat_pulldown', 2, 12, 55), set('lat_pulldown', 3, 12, 55)]
    const r = evaluateProgression(pd, byId('lat_pulldown'), last, [])
    expect(r.action).toBe('increase')
    expect(r.nextLoadKg).toBe(57.5)
    const heavy = [set('leg_press', 1, 12, 160), set('leg_press', 2, 12, 160), set('leg_press', 3, 12, 160)]
    expect(evaluateProgression({ ...pd, exerciseId: 'leg_press' }, byId('leg_press'), heavy, []).nextLoadKg).toBe(167.5)
  })

  it('bodyweight → add reps instead of load', () => {
    const pd = { exerciseId: 'dead_bug', sets: 2, repMin: 8, repMax: 10, loadKg: null, restSec: 45 }
    const last = [set('dead_bug', 1, 10, null), set('dead_bug', 2, 10, null)]
    const r = evaluateProgression(pd, byId('dead_bug'), last, [])
    expect(r.action).toBe('increase')
    expect(r.nextLoadKg).toBeNull()
    expect(r.repMin).toBe(10)
    expect(r.repMax).toBe(12)
  })

  it('hold when a set is below repMax but above repMin (seed 10,10,9)', () => {
    const last = [set('db_bench_press', 1, 10, 26, 2), set('db_bench_press', 2, 10, 26, 2), set('db_bench_press', 3, 9, 26, 2)]
    const r = evaluateProgression(planned, bench, last, [])
    expect(r.action).toBe('hold')
    expect(r.nextLoadKg).toBe(26)
    expect(r.stalled).toBe(false)
  })

  it('hold on any pain flag even when reps were hit', () => {
    const last = [set('db_bench_press', 1, 12, 26, 2), set('db_bench_press', 2, 12, 26, 2, true), set('db_bench_press', 3, 12, 26, 2)]
    const r = evaluateProgression(planned, bench, last, [])
    expect(r.action).toBe('hold')
    expect(r.reason).toMatch(/Pain flagged/)
    expect(r.nextLoadKg).toBe(26)
  })

  it('hold (not stalled) the first time a set drops below repMin', () => {
    const last = [set('db_bench_press', 1, 8, 26), set('db_bench_press', 2, 7, 26), set('db_bench_press', 3, 6, 26)]
    const prev = [set('db_bench_press', 1, 10, 26), set('db_bench_press', 2, 10, 26), set('db_bench_press', 3, 9, 26)]
    const r = evaluateProgression(planned, bench, last, prev)
    expect(r.action).toBe('hold')
    expect(r.stalled).toBe(false)
    expect(r.reason).toMatch(/8 reps minimum/)
  })

  it('deload 10% after two sessions below repMin (stalled)', () => {
    const last = [set('db_bench_press', 1, 8, 26), set('db_bench_press', 2, 7, 26), set('db_bench_press', 3, 6, 26)]
    const prev = [set('db_bench_press', 1, 8, 26), set('db_bench_press', 2, 7, 26), set('db_bench_press', 3, 7, 26)]
    const r = evaluateProgression(planned, bench, last, prev)
    expect(r.action).toBe('deload')
    expect(r.stalled).toBe(true)
    expect(r.nextLoadKg).toBe(22) // 26 × 0.9 = 23.4 → floored to the 2 kg dumbbell step
    expect(r.nextLoadKg!).toBeLessThan(26)
  })

  it('timed exercises progress by adding seconds', () => {
    const pd = { exerciseId: 'plank', sets: 2, repMin: 30, repMax: 45, loadKg: null, restSec: 45 }
    const last = [set('plank', 1, null, null, null, false, 45), set('plank', 2, null, null, null, false, 50)]
    const r = evaluateProgression(pd, byId('plank'), last, [])
    expect(r.action).toBe('increase')
    expect(r.repMax).toBe(55)
  })
})

describe('estimate1RM (Epley)', () => {
  it('returns the load for a single and scales with reps', () => {
    expect(estimate1RM(100, 1)).toBe(100)
    expect(estimate1RM(70, 8)).toBeCloseTo(88.7, 1)
    expect(estimate1RM(0, 5)).toBe(0)
  })
})
