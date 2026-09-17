import { describe, expect, it } from 'vitest'
import { addDays } from '../../lib/util'
import { dailySeries, projectDate, rollingAverage, weeklyRate } from '../trends'
import { TODAY } from './fixtures'

const pts = (n: number, fn: (i: number) => number) =>
  Array.from({ length: n }, (_, k) => ({ ts: `${addDays(TODAY, -(n - 1 - k))}T07:00:00`, value: fn(k) }))

describe('trends', () => {
  it('rollingAverage uses only the window ending at endDate', () => {
    const p = pts(14, (i) => (i < 7 ? 85 : 84))
    expect(rollingAverage(p, 7, TODAY)).toBe(84)
    expect(rollingAverage(p, 7, addDays(TODAY, -7))).toBe(85)
    expect(rollingAverage(p, 14, TODAY)).toBe(84.5)
    expect(rollingAverage([], 7, TODAY)).toBeNull()
    expect(rollingAverage(p, 7, '2020-01-01')).toBeNull()
  })

  it('weeklyRate is last-7 minus prior-7 and null without both windows', () => {
    expect(weeklyRate(pts(14, (i) => (i < 7 ? 85 : 84)), TODAY)).toBe(-1)
    expect(weeklyRate(pts(5, () => 84), TODAY)).toBeNull()
  })

  it('projectDate returns a date when the rate points toward the target', () => {
    expect(projectDate(84, 74, -0.5, TODAY)).toBe(addDays(TODAY, 140))
    expect(projectDate(84, 74, 0.5, TODAY)).toBeNull()
    expect(projectDate(84, 74, 0, TODAY)).toBeNull()
    expect(projectDate(84, 84, -0.5, TODAY)).toBe(TODAY)
    expect(projectDate(84, 74, -0.001, TODAY)).toBeNull()
  })

  it('dailySeries fills gaps with null and averages duplicates', () => {
    const p = [
      { ts: `${addDays(TODAY, -2)}T07:00:00`, value: 84 },
      { ts: `${TODAY}T07:00:00`, value: 83 },
      { ts: `${TODAY}T20:00:00`, value: 85 },
    ]
    const s = dailySeries(p, 3, TODAY)
    expect(s.map((x) => x.date)).toEqual([addDays(TODAY, -2), addDays(TODAY, -1), TODAY])
    expect(s.map((x) => x.value)).toEqual([84, null, 84])
  })
})
