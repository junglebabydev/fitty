import { describe, expect, it } from 'vitest'
import type { BodyMetric, SleepRecord } from '../../../domain/types'
import { addDays, isoAt } from '../../../lib/util'
import { computeAdherence } from '../adherence'
import { dailyMood, moodHeadline, nightlySleep, sleepHeadline } from '../minis'
import { adherenceLine } from '../trajectory'
import { computeWeightStats } from '../weight'
import { buildWeightChart, weightCalibration, weightHeadline, weightHeadlineShort } from '../weightChart'

const TODAY = '2026-09-10'
let id = 1
const weight = (date: string, value: number): BodyMetric => ({ id: id++, ts: isoAt(date, 7), type: 'weight', value, unit: 'kg', source: 'seed' })
const sleep = (endDate: string, durationMin: number): SleepRecord => ({ id: id++, startTs: isoAt(addDays(endDate, -1), 23), endTs: isoAt(endDate, 6), durationMin, source: 'seed', quality: null })

const seed = [84.6, 84.4, 84.3, 84.1, 84.2, 83.9, 84.0].map((v, i) => weight(addDays(TODAY, i - 6), v))
const prev = [85.4, 85.2, 85.1, 84.9, 84.8, 84.7, 84.7].map((v, i) => weight(addDays(TODAY, i - 13), v))

function headline(weights: BodyMetric[], days = 30, goal: number | null = 74): string {
  return weightHeadline({
    chart: buildWeightChart(weights, days, TODAY),
    stats: computeWeightStats(weights, goal, TODAY),
    calibration: weightCalibration(weights, TODAY),
    today: TODAY,
  })
}

describe('buildWeightChart', () => {
  it('returns one entry per day with raw dots and a 7-day average that needs two readings', () => {
    const c = buildWeightChart(seed, 14, TODAY)
    expect(c.dates).toHaveLength(14)
    expect(c.dates[13]).toBe(TODAY)
    expect(c.daysWithData).toBe(7)
    expect(c.raw.slice(0, 7).every((v) => v == null)).toBe(true)
    expect(c.raw[13]).toBe(84)
    expect(c.average[7]).toBeNull() // first weigh-in: one reading only
    expect(c.average[8]).toBe(84.5)
    expect(c.average[13]).toBe(84.21)
    expect(c.avgChange).toEqual({ delta: -0.3, spanDays: 5 })
  })

  it('uses readings from before the range for the first average', () => {
    const c = buildWeightChart([...prev, ...seed], 7, TODAY)
    expect(c.raw[0]).toBe(84.6)
    expect(c.average[0]).not.toBeNull()
  })

  it('handles no data', () => {
    expect(buildWeightChart([], 30, TODAY)).toMatchObject({ daysWithData: 0, avgChange: null })
  })
})

describe('weightHeadline', () => {
  it('asks for a first weigh-in, then counts calibration days', () => {
    expect(headline([])).toMatch(/^No weigh-ins yet/)
    expect(weightCalibration(seed, TODAY)).toEqual({ day: 7, of: 14, done: false })
    expect(headline(seed)).toMatch(/^Day 7 of 14 — calibrating/)
  })

  it('states the change and the pace once calibrated', () => {
    expect(weightCalibration([...prev, ...seed], TODAY).done).toBe(true)
    expect(headline([...prev, ...seed])).toMatch(/^Down 1\.1 kg in 12 days — on pace for 74 kg around /)
    expect(headline([...prev, ...seed], 30, null)).toBe('Down 1.1 kg in 12 days on the 7-day average.')
  })

  it('describes level and rising trends without judgement', () => {
    const flat = Array.from({ length: 14 }, (_, i) => weight(addDays(TODAY, i - 13), 84))
    expect(headline(flat)).toMatch(/^Level over 12 days — holding steady/)
    const up = Array.from({ length: 14 }, (_, i) => weight(addDays(TODAY, i - 13), 84 + i * 0.1))
    expect(headline(up)).toMatch(/^Up \d\.\d kg in 12 days — the 7-day average is rising/)
    const gap = [weight(addDays(TODAY, -40), 86), weight(TODAY, 84)]
    expect(headline(gap)).toMatch(/needs more recent weigh-ins/)
  })
})

describe('mood and sleep minis', () => {
  it('averages mood per day and leaves gaps null', () => {
    const s = dailyMood([{ ts: isoAt(TODAY, 8), valence: 2 }, { ts: isoAt(TODAY, 20), valence: 0 }, { ts: isoAt(addDays(TODAY, -2), 9), valence: -1 }], 3, TODAY)
    expect(s).toEqual([{ date: addDays(TODAY, -2), value: -1 }, { date: addDays(TODAY, -1), value: null }, { date: TODAY, value: 1 }])
    expect(moodHeadline({ avg7: 1.2, prevAvg7: 0.4, trend: 'up', daysCheckedIn7: 6 }, (v) => ({ 1: 'Slightly pleasant' } as Record<number, string>)[v]))
      .toBe('Mostly slightly pleasant this week, a little higher than the week before — checked in on 6 of 7 days.')
    expect(moodHeadline({ avg7: null, prevAvg7: null, trend: null, daysCheckedIn7: 0 }, () => undefined)).toMatch(/No check-ins/)
  })

  it('keys sleep by wake-up date in hours and summarises it', () => {
    const s = nightlySleep([sleep(TODAY, 370), sleep(addDays(TODAY, -1), 450), sleep(addDays(TODAY, -1), 30)], 3, TODAY)
    expect(s.map((d) => d.value)).toEqual([null, 7.5, 6.17])
    expect(sleepHeadline(s)).toBe('Averaging 6h 50m over 2 nights — 1 at 7 h or more.')
    expect(sleepHeadline(nightlySleep([], 3, TODAY))).toBe('No sleep recorded yet.')
  })
})

describe('mind adherence', () => {
  it('counts distinct check-in days per week and adds them to the adherence sentence', () => {
    const weeks = computeAdherence({ today: TODAY, weeks: 2, sessions: [], intake: [{ date: TODAY, logged: true }], sleep: [], moodDates: [TODAY, TODAY, addDays(TODAY, -1), addDays(TODAY, -8)] })
    expect(weeks[0].mind).toEqual({ checkedIn: 2, days: 7 })
    expect(weeks[1].mind).toEqual({ checkedIn: 1, days: 7 })
    expect(adherenceLine(weeks)).toMatch(/mind check-ins on 3 days\.$/)
    expect(computeAdherence({ today: TODAY, weeks: 1, sessions: [], intake: [], sleep: [] })[0].mind).toEqual({ checkedIn: 0, days: 7 })
  })
})

describe('weightHeadlineShort', () => {
  const short = (weights: BodyMetric[], days = 30): string =>
    weightHeadlineShort({
      chart: buildWeightChart(weights, days, TODAY),
      stats: computeWeightStats(weights, 74, TODAY),
      calibration: weightCalibration(weights, TODAY),
    })

  it('stays within the 12-word budget in every state', () => {
    for (const s of [short([]), short(seed), short([...prev, ...seed]), short([...prev, ...seed], 90)]) {
      expect(s.split(/\s+/).length).toBeLessThanOrEqual(12)
    }
  })

  it('states the change once calibrated', () => {
    expect(short([])).toBe('No weigh-ins yet.')
    expect(short(seed)).toBe('Day 7 of 14, calibrating the trend.')
    expect(short([...prev, ...seed])).toMatch(/^Down \d\.\d kg in \d+ days on the 7-day average\.$/)
  })
})
