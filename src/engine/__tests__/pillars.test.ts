import { describe, expect, it } from 'vitest'
import { computePillars, kcalInRange, type PillarsInput } from '../pillars'

const BASE: PillarsInput = {
  sessionsDone: 1, sessionsTarget: 4,
  proteinG: 0, proteinTarget: 150, kcal: 5, kcalTarget: 2050,
  sleepMin: 370,
  moodLoggedToday: false, mindfulMinToday: 0,
}

describe('computePillars', () => {
  it('seed morning: short captions and partial rings', () => {
    const p = computePillars(BASE)
    expect(p.train).toEqual({ value: 0.25, caption: '1 of 4 sessions' })
    expect(p.eat.caption).toBe('0 of 150 g protein')
    expect(p.eat.value).toBeGreaterThanOrEqual(0)
    expect(p.eat.value).toBeLessThan(0.01)
    expect(p.rest.caption).toBe('6h 10m of 7h 30m')
    expect(p.rest.value).toBeCloseTo(370 / 450, 5)
    expect(p.mind).toEqual({ value: 0, caption: 'Not checked in' })
  })

  it('eat = 0.7 · protein ratio + 0.3 · kcal in range', () => {
    expect(computePillars({ ...BASE, proteinG: 150, kcal: 2050 }).eat).toEqual({ value: 1, caption: '150 of 150 g protein' })
    expect(computePillars({ ...BASE, proteinG: 75, kcal: 2000 }).eat.value).toBeCloseTo(0.35 + 0.3, 5)
    expect(computePillars({ ...BASE, proteinG: 150, kcal: 0 }).eat.value).toBeCloseTo(0.7, 5)
    expect(computePillars({ ...BASE, proteinG: 62.4, kcal: 900 }).eat.caption).toBe('62 of 150 g protein')
  })

  it('kcalInRange is 1 inside ±10%, ramps up below and falls off above', () => {
    expect(kcalInRange(2050, 2050)).toBe(1)
    expect(kcalInRange(1850, 2050)).toBe(1)
    expect(kcalInRange(2250, 2050)).toBe(1)
    expect(kcalInRange(922.5, 2050)).toBeCloseTo(0.5, 5)
    expect(kcalInRange(2665, 2050)).toBeCloseTo(0.5, 5)
    expect(kcalInRange(5000, 2050)).toBe(0)
    expect(kcalInRange(1000, 0)).toBe(0)
  })

  it('mind = 0.5 for a check-in + 0.5 · min(1, mindful / 5)', () => {
    expect(computePillars({ ...BASE, moodLoggedToday: true }).mind).toEqual({ value: 0.5, caption: 'Checked in' })
    expect(computePillars({ ...BASE, mindfulMinToday: 3 }).mind).toEqual({ value: 0.3, caption: '3 mindful min' })
    expect(computePillars({ ...BASE, moodLoggedToday: true, mindfulMinToday: 12 }).mind).toEqual({ value: 1, caption: 'Checked in · 12 min' })
  })

  it('rest uses the default 7h 30m goal, a custom goal, and handles a missing night', () => {
    expect(computePillars({ ...BASE, sleepMin: null }).rest).toEqual({ value: 0, caption: 'No sleep logged' })
    expect(computePillars({ ...BASE, sleepMin: 480, sleepGoalMin: 480 }).rest).toEqual({ value: 1, caption: '8h 00m of 8h 00m' })
    expect(computePillars({ ...BASE, sleepMin: 600 }).rest.value).toBe(1)
  })

  it('clamps everything to 0..1 and survives zero targets, negatives and NaN', () => {
    const wild = computePillars({
      sessionsDone: 9, sessionsTarget: 3, proteinG: 400, proteinTarget: 150, kcal: 9000, kcalTarget: 2050,
      sleepMin: 900, moodLoggedToday: true, mindfulMinToday: 60,
    })
    const broken = computePillars({
      sessionsDone: -2, sessionsTarget: 0, proteinG: NaN, proteinTarget: 0, kcal: -50, kcalTarget: 0,
      sleepMin: -10, sleepGoalMin: 0, moodLoggedToday: false, mindfulMinToday: NaN,
    })
    for (const p of [wild, broken]) {
      for (const key of ['train', 'eat', 'rest', 'mind'] as const) {
        expect(p[key].value).toBeGreaterThanOrEqual(0)
        expect(p[key].value).toBeLessThanOrEqual(1)
        expect(p[key].caption.length).toBeGreaterThan(0)
        expect(p[key].caption).not.toMatch(/NaN|undefined|-\d/)
      }
    }
    expect(wild.train).toEqual({ value: 1, caption: '9 of 3 sessions' })
    expect(broken.train).toEqual({ value: 0, caption: 'No sessions planned' })
    expect(computePillars({ ...BASE, sessionsDone: 1, sessionsTarget: 1 }).train.caption).toBe('1 of 1 session')
  })
})
