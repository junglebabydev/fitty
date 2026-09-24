import { describe, expect, it } from 'vitest'
import { buildSetRow } from '../useSetLogger'

const base = { sessionId: 7, exerciseId: 'x', setIndex: 2, reps: 10, loadKg: 20, durationSec: 40, rir: 2, painFlag: false, loggedAt: '2026-09-24T10:00:00.000Z' }

describe('buildSetRow', () => {
  it('logs reps, load and RIR for a loaded rep set', () => {
    expect(buildSetRow({ ...base, timed: false, loadable: true })).toEqual({
      sessionId: 7, exerciseId: 'x', setIndex: 2, reps: 10, loadKg: 20, rir: 2, rpe: null, durationSec: null, painFlag: false, loggedAt: base.loggedAt,
    })
  })

  it('drops the load for bodyweight moves', () => {
    expect(buildSetRow({ ...base, timed: false, loadable: false }).loadKg).toBeNull()
  })

  it('logs seconds only for a timed set', () => {
    const row = buildSetRow({ ...base, timed: true, loadable: false })
    expect([row.durationSec, row.reps, row.rir, row.loadKg]).toEqual([40, null, null, null])
  })

  it('carries the pain flag', () => {
    expect(buildSetRow({ ...base, timed: false, loadable: true, painFlag: true }).painFlag).toBe(true)
  })
})
