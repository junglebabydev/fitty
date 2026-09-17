// Pure builders behind the voice sheet. The database module is mocked so sql.js never loads;
// nothing here touches the repositories.
import { describe, expect, it, vi } from 'vitest'
import type { ExerciseSet, Meal, WorkoutSession } from '../../../domain/types'

vi.mock('../../../db/database', () => ({ db: {} }))

import {
  ASSUMED_PORTION_REASON, DEFAULT_PAIN_SCORE, UNKNOWN_FOOD_REASON, UNKNOWN_PORTION_G,
  buildBodyMetric, buildSets, buildSymptomChecks, coachQueryRoute, estimateUnknownFood, findCloneSource, gramsFor, matchFood,
  numOrNull, pickSession, planMealItems, sumMacros,
} from '../applyCommand'

const NOW = '2026-09-10T04:15:00.000Z'

function meal(id: number, ts: string, mealType: Meal['mealType'], savedName: string | null = null): Meal {
  return {
    id, ts, mealType, photoUri: null, notes: '', source: 'seed', savedName, isSaved: !!savedName,
    items: [{ id, mealId: id, foodName: 'x', quantityG: 100, servingDescription: '', kcal: 100, proteinG: 10, carbsG: 5, fatG: 2, source: 'seed', confidence: null, uncertaintyReason: null }],
  }
}

function session(id: number, status: WorkoutSession['status']): WorkoutSession {
  return {
    id, templateKey: 'upper_a', name: 'Upper', type: 'strength', tier: 'minimum', scheduledDate: '2026-09-10', status,
    startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [],
  }
}

describe('numOrNull', () => {
  it('coerces numbers and numeric strings, rejects the rest', () => {
    expect(numOrNull(8)).toBe(8)
    expect(numOrNull('8.5')).toBe(8.5)
    expect(numOrNull(null)).toBeNull()
    expect(numOrNull(undefined)).toBeNull()
    expect(numOrNull('')).toBeNull()
    expect(numOrNull('eight')).toBeNull()
  })
})

describe('meal planning', () => {
  it('matches spoken names to food records (alias, plural, phrase, fallback word)', () => {
    expect(matchFood('eggs')?.id).toBe('egg_whole')
    expect(matchFood('toast')?.id).toBe('bread_white')
    expect(matchFood('a latte')?.tags).toContain('latte')
    expect(matchFood('chicken rice')?.id).toBe('chicken_rice')
    expect(matchFood('kaya toast set')?.id).toBe('kaya_toast_set')
    expect(matchFood('zzqx unicorn')).toBeNull()
  })

  it('treats plain water as zero calories instead of a placeholder', () => {
    const [water] = planMealItems([{ name: 'water', qty: 2 }])
    expect(water.item.kcal).toBe(0)
    expect(water.item.confidence).toBe(1)
  })

  it('uses explicit grams, else qty × serving, else the placeholder portion', () => {
    const egg = matchFood('egg')!
    expect(gramsFor({ name: 'egg', qty: 3 }, egg)).toBe(3 * egg.servingG)
    expect(gramsFor({ name: 'rice', qty: 1, unit: 'grams', quantityG: 200 }, matchFood('rice'))).toBe(200)
    expect(gramsFor({ name: 'mystery', qty: 2 }, null)).toBe(2 * UNKNOWN_PORTION_G)
  })

  it('flags unknown foods as low-confidence placeholders with 4/4/9-consistent macros', () => {
    const it150 = estimateUnknownFood('mystery stew', 150, 1)
    expect(it150.confidence).toBe(0.2)
    expect(it150.uncertaintyReason).toBe(UNKNOWN_FOOD_REASON)
    expect(it150.foodName).toBe('Mystery stew')
    expect(it150.kcal).toBe(225)
    const macroKcal = it150.proteinG * 4 + it150.carbsG * 4 + it150.fatG * 9
    expect(Math.abs(macroKcal - it150.kcal)).toBeLessThan(10)
  })

  it('plans the PRD example "three eggs, two toast and a latte"', () => {
    const planned = planMealItems([{ name: 'eggs', qty: 3 }, { name: 'toast', qty: 2 }, { name: 'latte', qty: 1 }])
    expect(planned).toHaveLength(3)
    expect(planned.every((p) => p.food !== null)).toBe(true)
    expect(planned[0].item.source).toBe('voice')
    expect(planned[0].item.confidence).toBeLessThanOrEqual(0.7)
    expect(planned[0].item.uncertaintyReason).toBe(ASSUMED_PORTION_REASON)
    const totals = sumMacros(planned.map((p) => p.item))
    expect(totals.kcal).toBeGreaterThan(300)
    expect(totals.proteinG).toBeGreaterThan(20)
  })

  it('keeps the confidence of an explicit-gram item and marks unmatched items', () => {
    const planned = planMealItems([{ name: 'rice', qty: 1, unit: 'grams', quantityG: 200 }, { name: 'zzqx unicorn', qty: 1 }])
    expect(planned[0].grams).toBe(200)
    expect(planned[0].item.uncertaintyReason).toBeNull()
    expect(planned[1].food).toBeNull()
    expect(planned[1].item.uncertaintyReason).toBe(UNKNOWN_FOOD_REASON)
  })
})

describe('findCloneSource', () => {
  const saved = [meal(1, '2026-09-05T04:00:00.000Z', 'lunch', 'Fish soup with rice'), meal(2, '2026-09-06T04:00:00.000Z', 'lunch', 'Greek yogurt, whey & berries')]
  const recent = [meal(3, '2026-09-08T04:30:00.000Z', 'lunch'), meal(4, '2026-09-08T11:00:00.000Z', 'dinner'), meal(5, '2026-09-09T04:30:00.000Z', 'lunch')]

  it('prefers a saved meal by name, case-insensitively', () => {
    expect(findCloneSource({ savedMealName: 'fish soup WITH rice' }, saved, recent)?.id).toBe(1)
  })

  it('falls back to the meal of that type on the referenced date, then any meal that day', () => {
    expect(findCloneSource({ date: '2026-09-08', mealType: 'dinner' }, saved, recent)?.id).toBe(4)
    expect(findCloneSource({ date: '2026-09-08', mealType: 'breakfast' }, saved, recent)?.id).toBe(3)
    expect(findCloneSource({ date: '2026-09-01', mealType: 'lunch' }, saved, recent)).toBeNull()
  })

  it('returns null with nothing to go on', () => {
    expect(findCloneSource({ savedMealName: 'nope', date: null }, saved, recent)).toBeNull()
  })
})

describe('buildSets', () => {
  const existing: ExerciseSet[] = [
    { id: 1, sessionId: 9, exerciseId: 'db_bench_press', setIndex: 1, reps: 10, loadKg: 26, rir: 2, rpe: null, durationSec: null, painFlag: false, loggedAt: NOW },
    { id: 2, sessionId: 9, exerciseId: 'lat_pulldown', setIndex: 1, reps: 10, loadKg: 55, rir: 2, rpe: null, durationSec: null, painFlag: false, loggedAt: NOW },
  ]

  it('continues the set index for that exercise and coerces numbers', () => {
    const rows = buildSets({ exerciseId: 'db_bench_press', loadKg: '70', reps: 8, rir: 2, rpe: null }, 9, existing, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sessionId: 9, exerciseId: 'db_bench_press', setIndex: 2, reps: 8, loadKg: 70, rir: 2, rpe: null, painFlag: false, loggedAt: NOW })
  })

  it('logs several identical sets when asked, capped at 10', () => {
    const rows = buildSets({ exerciseId: 'plank', durationSec: 45, sets: 3 }, 9, existing, NOW)
    expect(rows.map((r) => r.setIndex)).toEqual([1, 2, 3])
    expect(rows[0].durationSec).toBe(45)
    expect(buildSets({ exerciseId: 'plank', durationSec: 45, sets: 99 }, 9, [], NOW)).toHaveLength(10)
  })

  it('returns nothing without an exercise', () => {
    expect(buildSets({ reps: 8 }, 9, [], NOW)).toEqual([])
  })
})

describe('buildSymptomChecks', () => {
  it('defaults an unscored symptom to the conservative AMBER score', () => {
    const rows = buildSymptomChecks({ region: 'knee_left', notes: 'my knee hurts' }, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ region: 'knee_left', painScore: DEFAULT_PAIN_SCORE, context: 'voice', notes: 'my knee hurts', sessionId: null, ts: NOW })
  })

  it('logs one check per region, clamps the score and carries red flags', () => {
    const rows = buildSymptomChecks({ regions: ['knee_left', 'knee_right'], painScore: 14, redFlags: { locking: true } }, NOW)
    expect(rows.map((r) => r.region)).toEqual(['knee_left', 'knee_right'])
    expect(rows.every((r) => r.painScore === 10 && r.redFlags.locking === true)).toBe(true)
  })

  it('returns nothing without a region', () => {
    expect(buildSymptomChecks({ painScore: 4 }, NOW)).toEqual([])
  })
})

describe('buildBodyMetric', () => {
  it('builds weight / waist / body fat with the right unit and rounds to 0.1', () => {
    expect(buildBodyMetric({ type: 'weight', value: 83.44, ts: '2026-09-10T00:30:00.000Z' }, NOW)).toEqual({ ts: '2026-09-10T00:30:00.000Z', type: 'weight', value: 83.4, unit: 'kg', source: 'voice' })
    expect(buildBodyMetric({ type: 'waist', value: 83.8 }, NOW)).toMatchObject({ unit: 'cm', ts: NOW })
    expect(buildBodyMetric({ type: 'bodyfat', value: 18 }, NOW)).toMatchObject({ unit: '%' })
  })

  it('rejects missing, non-positive or unknown types', () => {
    expect(buildBodyMetric({ type: 'weight' }, NOW)).toBeNull()
    expect(buildBodyMetric({ type: 'weight', value: 0 }, NOW)).toBeNull()
    expect(buildBodyMetric({ type: 'height', value: 179 }, NOW)).toBeNull()
  })
})

describe('session + route helpers', () => {
  it('prefers the active session, then a planned one today', () => {
    const active = session(1, 'in_progress')
    expect(pickSession(active, [session(2, 'planned')])?.id).toBe(1)
    expect(pickSession(null, [session(3, 'completed'), session(2, 'planned')])?.id).toBe(2)
    expect(pickSession(null, [session(3, 'completed')])).toBeNull()
  })

  it('encodes the coach question into the route', () => {
    expect(coachQueryRoute('How am I doing this week?')).toBe('/coach?q=How%20am%20I%20doing%20this%20week%3F')
  })
})
