import { describe, expect, it } from 'vitest'
import { computeReadiness } from '../readiness'
import { checkIn, sym } from './fixtures'

const base = { sleepLastNightMin: 450, sleepAvg7Min: 430, symptoms: [], checkIn: checkIn({ soreness: 1, energy: 7 }), sessionsLast7: 2 }

describe('computeReadiness (PRD §9.3 / §11.1)', () => {
  it('is GREEN with good sleep and no symptoms', () => {
    const r = computeReadiness(base)
    expect(r.state).toBe('GREEN')
    expect(r.modifiers).toEqual({ reduceVolume: false, lowImpactOnly: false, avoidRegions: [], suggestRest: false })
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('seed scenario: 6h 10m sleep + left knee 2/10 → AMBER with exactly two reasons (sleep + knee)', () => {
    const r = computeReadiness({ ...base, sleepLastNightMin: 370, sleepAvg7Min: 425, symptoms: [sym('knee_left', 2)], checkIn: checkIn({ soreness: 2 }) })
    expect(r.state).toBe('AMBER')
    expect(r.reasons).toHaveLength(2)
    expect(r.reasons[0]).toBe('6h 10m sleep, below 7-day average')
    expect(r.reasons[1]).toBe('Mild left knee soreness (2/10)')
    expect(r.modifiers.reduceVolume).toBe(true)
    expect(r.modifiers.lowImpactOnly).toBe(true)
    expect(r.modifiers.suggestRest).toBe(false)
  })

  it('poor sleep alone is never RED: 4h → AMBER, reduce volume, no rest', () => {
    const r = computeReadiness({ ...base, sleepLastNightMin: 240, symptoms: [], checkIn: null })
    expect(r.state).toBe('AMBER')
    expect(r.modifiers.reduceVolume).toBe(true)
    expect(r.modifiers.suggestRest).toBe(false)
    expect(r.reasons[0]).toMatch(/4h 00m sleep/)
  })

  it('sleep < 7h alone is GREEN with a caution reason', () => {
    const r = computeReadiness({ ...base, sleepLastNightMin: 400, sleepAvg7Min: 430, symptoms: [], checkIn: checkIn({ soreness: 1, energy: 7 }) })
    expect(r.state).toBe('GREEN')
    expect(r.reasons.some((x) => /6h 40m sleep/.test(x))).toBe(true)
  })

  it('sleep < 7h combined with soreness ≥ 3 → AMBER', () => {
    const r = computeReadiness({ ...base, sleepLastNightMin: 400, symptoms: [], checkIn: checkIn({ soreness: 4, energy: 7 }) })
    expect(r.state).toBe('AMBER')
  })

  it('sleep < 7h combined with energy ≤ 3 → AMBER', () => {
    const r = computeReadiness({ ...base, sleepLastNightMin: 400, symptoms: [], checkIn: checkIn({ soreness: 1, energy: 3 }) })
    expect(r.state).toBe('AMBER')
  })

  it('pain 3–5 → AMBER and avoids the region; pain > 5 → RED with rest suggested', () => {
    const amber = computeReadiness({ ...base, symptoms: [sym('back_lower', 4)] })
    expect(amber.state).toBe('AMBER')
    expect(amber.modifiers.avoidRegions).toEqual(['back_lower'])
    expect(amber.reasons[0]).toBe('Moderate lower back pain (4/10)')

    const red = computeReadiness({ ...base, symptoms: [sym('knee_right', 6)] })
    expect(red.state).toBe('RED')
    expect(red.modifiers.suggestRest).toBe(true)
    expect(red.modifiers.lowImpactOnly).toBe(true)
    expect(red.modifiers.avoidRegions).toEqual(['knee_right'])
  })

  it('any red flag (locking / giving way / numbness / weakness / radiating) → RED even at pain 1', () => {
    for (const flag of ['locking', 'givingWay', 'numbness', 'weakness', 'radiating'] as const) {
      const r = computeReadiness({ ...base, symptoms: [sym('knee_left', 1, { [flag]: true })] })
      expect(r.state, flag).toBe('RED')
      expect(r.reasons[0]).toMatch(/Left knee:/)
    }
  })

  it('swelling alone is AMBER, not RED', () => {
    const r = computeReadiness({ ...base, symptoms: [sym('knee_left', 1, { swelling: true })] })
    expect(r.state).toBe('AMBER')
  })

  it('resting HR ≥ baseline + 7 → AMBER', () => {
    const r = computeReadiness({ ...base, restingHr: 65, restingHrBaseline: 57 })
    expect(r.state).toBe('AMBER')
    expect(r.reasons.some((x) => /Resting HR 65 bpm, 8 above baseline/.test(x))).toBe(true)
    const ok = computeReadiness({ ...base, restingHr: 62, restingHrBaseline: 57 })
    expect(ok.state).toBe('GREEN')
  })

  it('uses the latest check per region for pain but keeps earlier red flags', () => {
    const r = computeReadiness({ ...base, symptoms: [sym('knee_left', 4, {}, `${'2026-09-10'}T07:00:00`), sym('knee_left', 1, {}, `${'2026-09-10'}T18:00:00`)] })
    expect(r.state).toBe('GREEN')
    const flagged = computeReadiness({ ...base, symptoms: [sym('knee_left', 4, { locking: true }, '2026-09-10T07:00:00'), sym('knee_left', 1, {}, '2026-09-10T18:00:00')] })
    expect(flagged.state).toBe('RED')
  })
})
