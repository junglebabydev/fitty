import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Baseline } from '../../ai/intake'
import type { WizardState } from '../../settings/onboarding'

const mem = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  metrics: [] as { type: string; value: number }[],
  checkIns: [] as { date: string; energy: number | null; stress: number | null }[],
  existingCheckIn: false,
  committed: [] as unknown[],
}))

vi.mock('../../../db/database', () => ({ db: { transaction: <T,>(fn: () => T): T => fn() } }))
vi.mock('../../../db/repositories', () => ({
  getSetting: <T,>(k: string, d: T): T => (mem.settings.has(k) ? (mem.settings.get(k) as T) : d),
  setSetting: (k: string, v: unknown) => { mem.settings.set(k, v) },
  deleteSetting: (k: string) => { mem.settings.delete(k) },
  getProfile: () => null,
  latestBodyMetric: () => null,
  metricForDate: () => null,
  addBodyMetric: (m: { type: string; value: number }) => { mem.metrics.push(m); return 1 },
  getCheckIn: () => (mem.existingCheckIn ? { id: 1 } : null),
  upsertCheckIn: (c: { date: string; energy: number | null; stress: number | null }) => { mem.checkIns.push(c); return 1 },
  listReports: () => [],
}))
vi.mock('../../settings/onboarding', async (orig) => ({
  ...(await orig<typeof import('../../settings/onboarding')>()),
  commitOnboarding: (s: unknown) => { mem.committed.push(s) },
}))

import { EMPTY_INTAKE, INTAKE_KEYS, applyIntakeToDiet, commitIntake, composeAggravators, daysFromTarget, parseAggravators, readIntake, validateDob, validateHeight, validateWeight } from '../state'

const DIET = { mealsPerDay: 2 as const, skipsBreakfast: true, coffee: false, supplements: false, notes: 'wine on weekends' }
const BASELINE: Baseline = { summary: 's', strengths: [], watchouts: [], firstWeek: ['x'], generatedBy: 'local', ts: '2026-09-17T00:00:00.000Z' }
const WIZARD = { diet: DIET, conditions: [{ key: 'k', region: 'knee_left', label: '  ', baselineNotes: '' }] } as unknown as WizardState

beforeEach(() => {
  mem.settings.clear()
  mem.settings.set('onboarding.skippedAt', '2026-09-16T00:00:00.000Z')
  mem.metrics = []
  mem.checkIns = []
  mem.existingCheckIn = false
  mem.committed = []
})

describe('intake helpers', () => {
  it('derives the three tiers from one "days I can train" answer', () => {
    expect(daysFromTarget(4)).toEqual({ daysMin: 3, daysTarget: 4, daysStretch: 5 })
    expect(daysFromTarget(2)).toEqual({ daysMin: 2, daysTarget: 2, daysStretch: 3 })
    expect(daysFromTarget(7)).toEqual({ daysMin: 6, daysTarget: 7, daysStretch: 7 })
  })

  it('round-trips aggravators through condition notes and keeps free text', () => {
    const notes = composeAggravators(['Stairs', 'Running'], 'Physio says no deep flexion')
    expect(notes).toBe('Aggravated by: Stairs, Running\nPhysio says no deep flexion')
    expect(parseAggravators(notes)).toEqual({ aggravators: ['Stairs', 'Running'], rest: 'Physio says no deep flexion' })
    expect(parseAggravators('Old free text')).toEqual({ aggravators: [], rest: 'Old free text' })
    expect(composeAggravators([], '')).toBe('')
  })

  it('folds eating answers into the diet pattern without duplicating on re-run', () => {
    const once = applyIntakeToDiet(DIET, { foods: ['sg_hawker', 'home_cooked'], alcohol: 'weekly', caffeine: '1-2', supplements: 'Whey' })
    expect(once).toEqual({ ...DIET, coffee: true, supplements: true, notes: 'wine on weekends; eats: SG hawker / Home-cooked; alcohol: weekly' })
    const twice = applyIntakeToDiet(once, { foods: ['cafe'], alcohol: null, caffeine: 'none', supplements: '' })
    expect(twice.notes).toBe('wine on weekends; eats: Cafe')
    expect(twice.coffee).toBe(false)
    expect(twice.supplements).toBe(false)
  })

  it('validates the essentials', () => {
    expect(validateDob('', '2026-09-17')).toMatch(/date of birth/)
    expect(validateDob('2020-01-01', '2026-09-17')).toMatch(/13\+/)
    expect(validateDob('1988-03-02', '2026-09-17')).toBeNull()
    expect(validateHeight(90)).not.toBeNull()
    expect(validateHeight(178)).toBeNull()
    expect(validateWeight(null)).not.toBeNull()
    expect(validateWeight(84)).toBeNull()
  })
})

describe('commitIntake / readIntake', () => {
  it('stores every new answer, the baseline and the waist, and pre-fills them on re-run', () => {
    const a = { ...EMPTY_INTAKE, goal: 'lose_fat' as const, waistCm: 94.04, recentSessions: '1-2' as const, minutesPerSession: 45, foods: ['sg_hawker'], alcohol: 'weekly' as const, caffeine: '3+' as const, supplements: ' Creatine ', sleepHours: 6.5, bedtime: 'varies' as const, stress: 7, energy: 4, worked: ['Meal prep'], notWorked: ['Strict diets'], historyNote: ' short ', shareReports: true }
    commitIntake(WIZARD, a, BASELINE, { logCheckIn: true }, '2026-09-17')

    expect(mem.settings.get(INTAKE_KEYS.goal)).toBe('lose_fat')
    expect(mem.settings.get(INTAKE_KEYS.training)).toEqual({ recentSessions: '1-2', minutesPerSession: 45 })
    expect(mem.settings.get(INTAKE_KEYS.nutrition)).toEqual({ foods: ['sg_hawker'], alcohol: 'weekly', caffeine: '3+', supplements: 'Creatine' })
    expect(mem.settings.get(INTAKE_KEYS.recovery)).toEqual({ sleepHours: 6.5, bedtime: 'varies', stress: 7, energy: 4 })
    expect(mem.settings.get(INTAKE_KEYS.history)).toEqual({ worked: ['Meal prep'], notWorked: ['Strict diets'], note: 'short' })
    expect(mem.settings.get('ai.shareReports')).toBe(true)
    expect(mem.settings.get('profile.baseline')).toEqual(BASELINE)
    expect(mem.metrics).toEqual([expect.objectContaining({ type: 'waist', value: 94 })])
    expect(mem.checkIns).toEqual([{ date: '2026-09-17', energy: 4, soreness: null, stress: 7, notes: '' }])

    // The original onboarding commit still runs, with the diet folded in and no empty condition label.
    const merged = mem.committed[0] as WizardState
    expect(merged.diet.notes).toContain('eats: SG hawker')
    expect(merged.conditions[0].label).toBe('Left knee')

    expect(readIntake()).toEqual({ ...a, waistCm: null, supplements: 'Creatine', historyNote: 'short' })
    // A skipped intake is no longer skipped once it is committed (the setup gate opens).
    expect(mem.settings.has('onboarding.skippedAt')).toBe(false)
  })

  it('does not overwrite a check-in that already exists, or log one from pre-filled answers', () => {
    mem.existingCheckIn = true
    commitIntake(WIZARD, { ...EMPTY_INTAKE, stress: 5, energy: 5 }, null, { logCheckIn: true }, '2026-09-17')
    mem.existingCheckIn = false
    commitIntake(WIZARD, { ...EMPTY_INTAKE, stress: 5, energy: 5 }, null, { logCheckIn: false }, '2026-09-17')
    expect(mem.checkIns).toEqual([])
    expect(mem.settings.has('profile.baseline')).toBe(false)
  })

  it('seeds caffeine and supplements from the old diet pattern when no intake exists yet', () => {
    const seeded = readIntake({ ...DIET, coffee: true, supplements: true })
    expect(seeded.caffeine).toBe('1-2')
    expect(seeded.supplements).toBe('Yes')
    expect(seeded.shareReports).toBe(false)
  })
})
