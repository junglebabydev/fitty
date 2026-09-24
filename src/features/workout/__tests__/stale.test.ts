import { describe, expect, it } from 'vitest'
import { STALE_AFTER_MS, isStaleSession, staleWrapUp } from '../stale'

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi)
const running = (started: Date) => ({ status: 'in_progress' as const, startedAt: started.toISOString() })

describe('isStaleSession', () => {
  it('is fresh within three hours on the same day', () => {
    expect(isStaleSession(running(at(2026, 9, 24, 9)), at(2026, 9, 24, 11, 59))).toBe(false)
  })

  it('is stale after three hours, or once the day has changed', () => {
    const start = at(2026, 9, 24, 9)
    expect(isStaleSession(running(start), new Date(start.getTime() + STALE_AFTER_MS + 1000))).toBe(true)
    expect(isStaleSession(running(at(2026, 9, 23, 23, 30)), at(2026, 9, 24, 0, 10))).toBe(true)
  })

  it('only applies to in-progress sessions with a start time', () => {
    const now = at(2026, 9, 25, 12)
    expect(isStaleSession({ status: 'completed', startedAt: at(2026, 9, 20, 9).toISOString() }, now)).toBe(false)
    expect(isStaleSession({ status: 'in_progress', startedAt: null }, now)).toBe(false)
  })
})

describe('staleWrapUp', () => {
  it('ends at the last logged set, not now', () => {
    const start = at(2026, 9, 24, 9)
    const sets = [{ loggedAt: at(2026, 9, 24, 9, 20).toISOString() }, { loggedAt: at(2026, 9, 24, 9, 42).toISOString() }]
    expect(staleWrapUp({ startedAt: start.toISOString() }, sets)).toEqual({ completedAt: at(2026, 9, 24, 9, 42).toISOString(), durationMin: 42 })
  })

  it('offers nothing to keep when no set was logged', () => {
    expect(staleWrapUp({ startedAt: at(2026, 9, 24, 9).toISOString() }, [])).toBeNull()
  })
})
