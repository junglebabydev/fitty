import { describe, expect, it } from 'vitest'
import { BASELINE_LIMITS, areaNames, baselinePrompt, buildBaseline, capWords, firstWeekSessions, localBaseline, sanitizeBaseline, type BaselineAnswers } from '../../ai/intake'

const BASE: BaselineAnswers = {
  age: 38, sex: 'Male', heightCm: 178, weightKg: 84, waistCm: 94,
  goal: 'Lose fat', targetWeightKg: 76, horizonMonths: 6,
  experience: 'Intermediate', recentSessions: '1-2', enjoys: ['Weights', 'Swimming'], daysPerWeek: 4, minutesPerSession: 45,
  equipment: ['Dumbbells', 'Machines'], conditions: [],
  mealsPerDay: '1–2', skipsBreakfast: true, foods: ['SG hawker', 'Home-cooked'], alcohol: 'Weekly', caffeine: '1–2 cups', supplements: 'Whey',
  sleepHours: 6, bedtime: 'Varies', stress: 7, energy: 5, wants: ['Better sleep'],
  worked: ['A fixed routine'], notWorked: ['Strict diets'], historyNote: '',
  kcal: 2100, proteinG: 150, coachStyle: 'Demanding',
}

const words = (s: string) => s.trim().split(/\s+/).length

describe('localBaseline', () => {
  it('is deterministic and respects the shape limits', () => {
    const a = localBaseline(BASE)
    expect(localBaseline(BASE)).toEqual(a)
    expect(words(a.summary)).toBeLessThanOrEqual(BASELINE_LIMITS.summaryWords)
    expect(a.strengths.length).toBeGreaterThan(0)
    expect(a.strengths.length).toBeLessThanOrEqual(3)
    expect(a.watchouts.length).toBeLessThanOrEqual(3)
    expect(a.firstWeek.length).toBeLessThanOrEqual(4)
    expect(a.firstWeek.length).toBeGreaterThan(0)
  })

  it('ramps week one from what the user has actually been doing', () => {
    expect(firstWeekSessions({ recentSessions: '0', daysPerWeek: 5 })).toBe(2)
    expect(firstWeekSessions({ recentSessions: '1-2', daysPerWeek: 5 })).toBe(3)
    expect(firstWeekSessions({ recentSessions: '3-4', daysPerWeek: 4 })).toBe(4)
    expect(localBaseline(BASE).firstWeek[0]).toBe('3 sessions of about 45 min')
  })

  it('puts flagged knees / back / neck first: machines, dumbbells, low impact', () => {
    const b = localBaseline({ ...BASE, conditions: [{ region: 'Left knee', label: 'Meniscus tear', aggravators: ['Stairs'] }, { region: 'Lower back', label: 'Lower back', aggravators: [] }] })
    expect(b.watchouts[0]).toMatch(/^Left knee and lower back:/)
    expect(b.watchouts[0]).toMatch(/machines and dumbbells, low impact/)
    expect(b.firstWeek.join(' ')).toMatch(/low impact: bike, incline walk or pool/)
    expect(b.firstWeek[0]).toMatch(/machines and dumbbells/)
  })

  it('groups paired and neighbouring areas', () => {
    expect(areaNames(['Left knee', 'Right knee', 'Lower back', 'Mid back', 'Neck', 'Hip'])).toEqual(['knees', 'back', 'neck'])
    expect(areaNames(['Right knee'])).toEqual(['right knee'])
    const b = localBaseline({ ...BASE, conditions: ['Left knee', 'Right knee', 'Shoulder'].map((region) => ({ region, label: region, aggravators: [] })) })
    expect(b.watchouts[0]).toMatch(/^Knees: machines/)
    expect(b.watchouts[1]).toMatch(/^Shoulder: pain-free range/)
    expect(b.summary).toMatch(/around your knees and shoulder\./)
  })

  it('never diagnoses or shames', () => {
    const text = JSON.stringify(localBaseline({ ...BASE, conditions: [{ region: 'Neck', label: 'Neck', aggravators: [] }], alcohol: 'Most days', recentSessions: '0' }))
    expect(text).not.toMatch(/diagnos|injur|disease|syndrome|cheat|lazy|fail|\bbad\b|earned/i)
  })

  it('surfaces sleep, stress and a fast target pace as watch-outs', () => {
    expect(localBaseline(BASE).watchouts.join(' | ')).toMatch(/Sleep near 6 h/)
    expect(localBaseline({ ...BASE, sleepHours: 8, stress: 8 }).watchouts.join(' | ')).toMatch(/Stress is high/)
    expect(localBaseline({ ...BASE, sleepHours: 8, stress: 2, targetWeightKg: 70, horizonMonths: 2 }).watchouts.join(' | ')).toMatch(/pace is fast/)
  })

  it('still produces a complete baseline from almost nothing', () => {
    const b = localBaseline({ ...BASE, weightKg: null, targetWeightKg: null, goal: null, recentSessions: null, sleepHours: null, stress: null, worked: [], foods: [], kcal: null, proteinG: null, experience: 'Beginner', bedtime: null, daysPerWeek: 3, alcohol: null })
    expect(b.summary.length).toBeGreaterThan(0)
    expect(b.strengths).toEqual(['A clear goal and an honest starting point'])
    expect(b.watchouts.length).toBe(1)
  })
})

describe('AI baseline plumbing', () => {
  it('caps words and list sizes on whatever the model returns', () => {
    expect(capWords('one two three four', 3)).toBe('one two three…')
    const long = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ')
    const clean = sanitizeBaseline({ summary: long, strengths: ['a', 'b', 'c', 'd', 5], watchouts: '- nope', firstWeek: ['- Train twice', '', 'x', 'y', 'z', 'q'] })!
    expect(words(clean.summary)).toBe(45)
    expect(clean.strengths).toEqual(['a', 'b', 'c'])
    expect(clean.watchouts).toEqual([])
    expect(clean.firstWeek).toEqual(['Train twice', 'x', 'y', 'z'])
    expect(sanitizeBaseline({ summary: '', firstWeek: ['x'] })).toBeNull()
    expect(sanitizeBaseline('nope')).toBeNull()
  })

  it('sends structured answers only: report lines when given, never a name or date of birth', () => {
    const p = baselinePrompt({ ...BASE, conditions: [{ region: 'Neck', label: 'Stiffness', aggravators: ['Desk work'] }] }, ['Blood test "Panel" (2026-08-01): LDL 4.1 mmol/L (high)'])
    expect(p).toContain('Area to look after: Neck (Stiffness), aggravated by Desk work')
    expect(p).toContain('Report context')
    expect(p).toContain('LDL 4.1')
    expect(p).toContain('Age: 38')
    expect(p).not.toMatch(/name|birth/i)
    expect(baselinePrompt(BASE)).not.toContain('Report context')
  })

  it('falls back to the local baseline when no AI is connected', async () => {
    const b = await buildBaseline(BASE, { now: '2026-09-17T00:00:00.000Z' })
    expect(b.generatedBy).toBe('local')
    expect(b.ts).toBe('2026-09-17T00:00:00.000Z')
    expect(b.summary).toBe(localBaseline(BASE).summary)
  })
})
