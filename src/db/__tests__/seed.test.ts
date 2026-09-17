// Pure seed helpers only — no sql.js. Checks the demo decision (shouldSeedDemo), the scenario numbers
// PRD §21 / CONTRACTS.md pin down and that the week layout stays self-consistent on every weekday.
// The database side of boot seeding is in seedBoot.test.ts.
import { describe, expect, it } from 'vitest'
import { addDays, dateOf, startOfWeek } from '../../lib/util'
import { SESSION_TEMPLATES, ageAt, estimateTargets } from '../../engine'
import {
  LOWER_A_SETS, SAVED_MEAL_NAMES, SEED_PROFILE, SEED_SLEEP_MIN, SEED_WEIGHTS_KG, UPPER_A_SETS, average, defaultSettings,
  hasDemoParam, mealSeries, pickSpreadDay, planWeek, restingHrSeries, setsFor, shiftMinutes, shouldSeedDemo, sleepSeries,
  weightSeries, withLoads,
} from '../seed'

const TODAY = '2026-09-10' // Thursday — the reference demo day
const WEEK = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'] // Mon..Sun

describe('shouldSeedDemo', () => {
  const fresh = { dev: false, search: '', skipDemo: false, hasProfile: false }

  it('a production build with no flag starts clean (onboarding, empty profile)', () => {
    expect(shouldSeedDemo(fresh)).toBe(false)
    expect(shouldSeedDemo({ ...fresh, search: '?utm_source=x' })).toBe(false)
  })

  it('a dev build seeds the demo into a database without a profile', () => {
    expect(shouldSeedDemo({ ...fresh, dev: true })).toBe(true)
  })

  it('?demo=1 opts a production visitor in; other values do not', () => {
    expect(shouldSeedDemo({ ...fresh, search: '?demo=1' })).toBe(true)
    expect(shouldSeedDemo({ ...fresh, search: '?foo=bar&demo=1' })).toBe(true)
    expect(shouldSeedDemo({ ...fresh, search: 'demo=1' })).toBe(true)
    for (const search of ['?demo=0', '?demo', '?demo=true', '?demo=11', '?nodemo=1', '#demo=1']) {
      expect(shouldSeedDemo({ ...fresh, search }), search).toBe(false)
    }
  })

  it('never seeds over an existing profile, whatever the build or URL', () => {
    expect(shouldSeedDemo({ dev: true, search: '?demo=1', skipDemo: false, hasProfile: true })).toBe(false)
    expect(shouldSeedDemo({ dev: false, search: '?demo=1', skipDemo: false, hasProfile: true })).toBe(false)
  })

  it('never seeds after "Delete all data" left the seed.skipDemo marker', () => {
    expect(shouldSeedDemo({ dev: true, search: '', skipDemo: true, hasProfile: false })).toBe(false)
    expect(shouldSeedDemo({ dev: false, search: '?demo=1', skipDemo: true, hasProfile: false })).toBe(false)
  })

  it('hasDemoParam reads only demo=1', () => {
    expect(hasDemoParam('?demo=1')).toBe(true)
    expect(hasDemoParam('')).toBe(false)
    expect(hasDemoParam('?demo=2')).toBe(false)
  })
})

describe('demo persona', () => {
  it('is the fictional "Alex Tan", onboarded, with the PRD constraints', () => {
    expect(SEED_PROFILE.name).toBe('Alex Tan')
    expect(SEED_PROFILE.onboarded).toBe(true)
    expect(SEED_PROFILE.dietPattern).toMatch(/1–2 meals/)
    expect(SEED_PROFILE.equipment).toContain('dumbbells')
  })

  it('date of birth keeps the persona 37 on the reference day and the ≈ 2,050 kcal / 150 g target through 2026–2027', () => {
    expect(ageAt(SEED_PROFILE.dob, TODAY)).toBe(37)
    for (const day of [TODAY, '2026-12-31', '2027-01-01', '2027-06-30', '2027-12-31']) {
      const t = estimateTargets({ sex: SEED_PROFILE.sex, dob: SEED_PROFILE.dob, heightCm: SEED_PROFILE.heightCm, weightKg: 84, activity: 'moderate', goal: 'cut' }, day)
      expect([day, t.kcal, t.proteinG, t.fatG]).toEqual([day, 2050, 150, 65])
    }
  })
})

describe('defaultSettings', () => {
  it('holds only non-personal defaults and keeps AI on the on-device provider', () => {
    const d = defaultSettings()
    expect(Object.keys(d).sort()).toEqual(['ai.provider', 'health.permissions', 'privacy.keepMealPhotos', 'privacy.voiceRetentionDays'])
    expect(d['ai.provider']).toBe('mock')
    expect(new Set(Object.values(d['health.permissions'] as Record<string, string>))).toEqual(new Set(['undetermined']))
  })
})

describe('weightSeries', () => {
  it('ends at 84.0 today with a 7-day average of ≈ 84.2 kg', () => {
    const w = weightSeries(TODAY)
    expect(w).toHaveLength(7)
    expect(w[w.length - 1].value).toBe(84.0)
    expect(dateOf(w[w.length - 1].ts)).toBe(TODAY)
    expect(dateOf(w[0].ts)).toBe(addDays(TODAY, -6))
    expect(average(SEED_WEIGHTS_KG)).toBeCloseTo(84.2, 1)
    expect(w.every((m) => m.type === 'weight' && m.unit === 'kg' && m.source === 'seed')).toBe(true)
  })
})

describe('sleepSeries', () => {
  it('last night is 6h 10m (bed 00:50 → wake 07:00) and the week averages ≈ 7h 05m', () => {
    const s = sleepSeries(TODAY)
    expect(s).toHaveLength(7)
    const last = s[s.length - 1]
    expect(last.durationMin).toBe(370)
    expect(dateOf(last.endTs)).toBe(TODAY)
    const end = new Date(last.endTs)
    const start = new Date(last.startTs)
    expect([end.getHours(), end.getMinutes()]).toEqual([7, 0])
    expect([start.getHours(), start.getMinutes()]).toEqual([0, 50])
    expect(dateOf(last.startTs)).toBe(TODAY)
    expect(average(SEED_SLEEP_MIN)).toBe(425) // 7h 05m
    for (const n of s.slice(0, -1)) expect(n.durationMin).toBeGreaterThanOrEqual(410)
    for (const n of s.slice(0, -1)) expect(n.durationMin).toBeLessThanOrEqual(460)
    // one record per morning, ascending
    expect(s.map((n) => dateOf(n.endTs))).toEqual([6, 5, 4, 3, 2, 1, 0].map((k) => addDays(TODAY, -k)))
  })
})

describe('restingHrSeries', () => {
  it('has seven readings between 56 and 58 bpm, today last', () => {
    const h = restingHrSeries(TODAY)
    expect(h).toHaveLength(7)
    expect(h.every((m) => m.value >= 56 && m.value <= 58 && m.type === 'resting_hr' && m.unit === 'bpm')).toBe(true)
    expect(dateOf(h[h.length - 1].ts)).toBe(TODAY)
  })
})

describe('shiftMinutes', () => {
  it('moves a timestamp forward and back', () => {
    expect(shiftMinutes('2026-09-10T07:00:00.000Z', -370)).toBe('2026-09-10T00:50:00.000Z')
    expect(shiftMinutes('2026-09-10T07:00:00.000Z', 45)).toBe('2026-09-10T07:45:00.000Z')
  })
})

describe('withLoads / setsFor', () => {
  it('carries the working loads into the planned exercises', () => {
    const ex = withLoads(SESSION_TEMPLATES.upper_a.exercises, UPPER_A_SETS)
    expect(ex.map((e) => e.loadKg)).toEqual([26, 55, 16, 50, 8, 25])
    const lower = withLoads(SESSION_TEMPLATES.lower_a.exercises, LOWER_A_SETS)
    expect(lower.find((e) => e.exerciseId === 'dead_bug')?.loadKg).toBeNull()
  })

  it('logs one row per spec set, in order, after the start time', () => {
    const start = '2026-09-07T10:10:00.000Z'
    const sets = setsFor(7, start, SESSION_TEMPLATES.upper_a.exercises, UPPER_A_SETS)
    expect(sets).toHaveLength(16)
    expect(sets.every((s) => s.sessionId === 7 && !s.painFlag && s.loggedAt > start)).toBe(true)
    const bench = sets.filter((s) => s.exerciseId === 'db_bench_press')
    expect(bench.map((s) => [s.setIndex, s.reps, s.loadKg, s.rir])).toEqual([[1, 10, 26, 2], [2, 10, 26, 2], [3, 9, 26, 1]])
    // seated row hit 12/12/12 with RIR 2 → double progression should say "increase"
    const row = sets.filter((s) => s.exerciseId === 'seated_cable_row')
    expect(row.every((s) => s.reps === 12 && (s.rir ?? 0) >= 1)).toBe(true)
    for (let i = 1; i < sets.length; i++) expect(sets[i].loggedAt > sets[i - 1].loggedAt).toBe(true)
  })

  it('covers every exercise of both templates', () => {
    for (const e of SESSION_TEMPLATES.upper_a.exercises) expect(UPPER_A_SETS[e.exerciseId]?.length).toBeGreaterThan(0)
    for (const e of SESSION_TEMPLATES.lower_a.exercises) expect(LOWER_A_SETS[e.exerciseId]?.length).toBeGreaterThan(0)
  })
})

describe('pickSpreadDay', () => {
  it('prefers the free day furthest from existing strength days, earliest on ties', () => {
    expect(pickSpreadDay(['2026-09-12', '2026-09-13'], ['2026-09-10', '2026-09-11'])).toBe('2026-09-13')
    expect(pickSpreadDay(['2026-09-11', '2026-09-12'], ['2026-09-10'])).toBe('2026-09-12')
    expect(pickSpreadDay(['2026-09-11', '2026-09-13'], [])).toBe('2026-09-11')
  })
})

describe('planWeek', () => {
  it('reference Thursday: history, today, and a reflowed lower session on Sunday', () => {
    const p = planWeek(TODAY)
    expect(p.history.map((s) => [s.templateKey, s.scheduledDate, s.status])).toEqual([
      ['lower_a', '2026-09-04', 'completed'],
      ['upper_a', '2026-09-07', 'completed'],
      ['conditioning_bike', '2026-09-08', 'skipped'],
    ])
    expect(p.bikeSkippedDate).toBe('2026-09-08')
    expect(p.todaySession).toMatchObject({ templateKey: 'upper_a', name: 'Upper Body Strength', tier: 'minimum', scheduledDate: TODAY, status: 'planned' })
    expect(p.todaySession.exercises).toHaveLength(6)
    expect(SESSION_TEMPLATES.upper_a.estMin).toBe(42)
    expect(p.future.map((s) => [s.templateKey, s.scheduledDate])).toEqual([
      ['full_b', '2026-09-11'],
      ['lower_a', '2026-09-13'],
    ])
    expect(p.lowerMove).toEqual({ from: '2026-09-09', to: '2026-09-13' })
  })

  it('completed sessions carry timestamps, duration and loads; the skipped bike carries none', () => {
    const p = planWeek(TODAY)
    for (const s of p.history.filter((x) => x.status === 'completed')) {
      expect(s.startedAt).toBeTruthy()
      expect(s.completedAt).toBeTruthy()
      expect(s.durationMin).toBeGreaterThan(30)
      expect(s.exercises.some((e) => e.loadKg != null)).toBe(true)
    }
    const bike = p.history.find((s) => s.templateKey === 'conditioning_bike')!
    expect(bike.startedAt).toBeNull()
    expect(bike.completedAt).toBeNull()
  })

  it('today uses the same six exercises as the completed upper session so progression can compute', () => {
    const p = planWeek(TODAY)
    const done = p.history.find((s) => s.templateKey === 'upper_a')!
    expect(p.todaySession.exercises.map((e) => e.exerciseId)).toEqual(done.exercises.map((e) => e.exerciseId))
  })

  it.each(WEEK)('is self-consistent when today is %s', (today) => {
    const p = planWeek(today)
    const all = [...p.history, p.todaySession, ...p.future]
    const weekStart = startOfWeek(today)
    const weekEnd = addDays(weekStart, 6)

    // exactly one row per date
    const dates = all.map((s) => s.scheduledDate)
    expect(new Set(dates).size).toBe(dates.length)
    // nothing planned in the past (no "missed" sessions the coach would reflow again)
    expect(all.filter((s) => s.status === 'planned' && s.scheduledDate < today)).toHaveLength(0)
    // today is the planned upper session
    expect(p.todaySession.scheduledDate).toBe(today)
    expect(p.todaySession.templateKey).toBe('upper_a')
    // future rows sit inside the current week, ascending, all planned, never a second upper
    for (const s of p.future) {
      expect(s.scheduledDate > today && s.scheduledDate <= weekEnd).toBe(true)
      expect(s.status).toBe('planned')
      expect(s.templateKey).not.toBe('upper_a')
    }
    expect(p.future.map((s) => s.scheduledDate)).toEqual([...p.future.map((s) => s.scheduledDate)].sort())
    // at most one bike this week
    const bikes = all.filter((s) => s.templateKey === 'conditioning_bike' && s.scheduledDate >= weekStart && s.scheduledDate <= weekEnd)
    expect(bikes.length).toBeLessThanOrEqual(1)
    // the reflow story is consistent with the rows
    if (p.lowerMove) {
      expect(p.future.find((s) => s.templateKey === 'lower_a')?.scheduledDate).toBe(p.lowerMove.to)
      expect(p.lowerMove.from).toBe(addDays(weekStart, 2))
    }
  })
})

describe('mealSeries', () => {
  it('logs only a 5 kcal kopi today and the three saved meals on earlier days', () => {
    const meals = mealSeries(TODAY)
    const todays = meals.filter((m) => dateOf(m.meal.ts) === TODAY)
    expect(todays).toHaveLength(1)
    expect(todays[0].meal.mealType).toBe('drink')
    expect(todays[0].items).toHaveLength(1)
    expect(todays[0].items[0].kcal).toBe(5)
    expect(new Date(todays[0].meal.ts).getHours()).toBe(8)
    expect(new Date(todays[0].meal.ts).getMinutes()).toBe(30)

    const saved = meals.filter((m) => m.meal.isSaved).map((m) => m.meal.savedName)
    expect(saved.sort()).toEqual(Object.values(SAVED_MEAL_NAMES).sort())
    expect(meals.filter((m) => m.meal.isSaved).every((m) => dateOf(m.meal.ts) < TODAY)).toBe(true)

    // a plainly logged Snickers, no moralising metadata
    const snickers = meals.find((m) => m.items.some((i) => /snickers/i.test(i.foodName)))!
    expect(snickers.meal.mealType).toBe('snack')
    expect(snickers.meal.notes).toBe('')
  })

  it('covers every one of the last seven days and uses seed as the item source', () => {
    const meals = mealSeries(TODAY)
    const days = new Set(meals.map((m) => dateOf(m.meal.ts)))
    for (let k = 0; k < 7; k++) expect(days.has(addDays(TODAY, -k))).toBe(true)
    expect(meals.every((m) => m.meal.source === 'seed' && m.items.every((i) => i.source === 'seed'))).toBe(true)
    // saved meals are worth cloning: each is a real protein hit
    for (const m of meals.filter((x) => x.meal.isSaved)) {
      expect(m.items.reduce((s, i) => s + i.proteinG, 0)).toBeGreaterThan(25)
    }
  })
})
