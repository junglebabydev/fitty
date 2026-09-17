import { describe, expect, it } from 'vitest'
import type { BodyMetric } from '../../domain/types'
import { addDays } from '../../lib/util'
import { estimateTargets, evaluateNutritionTrend, type IntakeDay } from '../nutrition'
import { TARGET, TODAY } from './fixtures'

const SEED = { sex: 'male' as const, dob: '1989-02-11', heightCm: 179, weightKg: 84, activity: 'moderate' as const, goal: 'cut' as const }

function weights(days: number, fn: (i: number) => number): BodyMetric[] {
  const out: BodyMetric[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(TODAY, -i)
    out.push({ id: days - i, ts: `${date}T07:00:00`, type: 'weight', value: fn(days - 1 - i), unit: 'kg', source: 'seed' })
  }
  return out
}

function intake(days: number, kcal: number, proteinG: number, loggedEvery = 1): IntakeDay[] {
  const out: IntakeDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const logged = (days - 1 - i) % loggedEvery === 0
    out.push({ date: addDays(TODAY, -i), kcal: logged ? kcal : 0, proteinG: logged ? proteinG : 0, logged })
  }
  return out
}

describe('estimateTargets (Mifflin-St Jeor)', () => {
  it('seed profile ≈ 2,050 kcal / 150 g protein', () => {
    const t = estimateTargets(SEED, TODAY)
    expect(Math.abs(t.kcal - 2050)).toBeLessThanOrEqual(60)
    expect(Math.abs(t.proteinG - 150)).toBeLessThanOrEqual(5)
    expect(t.fatG).toBe(65)
    expect(t.proteinG * 4 + t.fatG * 9 + t.carbsG * 4).toBeGreaterThan(t.kcal - 40)
    expect(t.rationale).toMatch(/Mifflin/)
    expect(t.rationale).toMatch(/500 kcal/)
  })

  it('applies the 1,600 kcal floor on a cut', () => {
    const t = estimateTargets({ ...SEED, sex: 'female', heightCm: 155, weightKg: 48, activity: 'low' }, TODAY)
    expect(t.kcal).toBe(1600)
    expect(t.rationale).toMatch(/floor/)
  })

  it('maintain and gain do not subtract', () => {
    const cut = estimateTargets(SEED, TODAY)
    expect(estimateTargets({ ...SEED, goal: 'maintain' }, TODAY).kcal).toBeGreaterThan(cut.kcal + 400)
    expect(estimateTargets({ ...SEED, goal: 'gain' }, TODAY).kcal).toBeGreaterThan(cut.kcal + 700)
  })
})

describe('evaluateNutritionTrend', () => {
  it('flat weight over ≥ 14 days with ≥ 80% adherence → −150 kcal proposal', () => {
    const r = evaluateNutritionTrend({ weights: weights(21, (i) => 84 + (i % 2 ? 0.05 : -0.05)), waists: [], intake: intake(14, 2000, 145), target: TARGET, today: TODAY })
    expect(r.loggedDays).toBe(14)
    expect(r.adherencePct).toBe(100)
    expect(Math.abs(r.weeklyRateKg!)).toBeLessThan(0.15)
    expect(r.flags.map((f) => f.kind)).toContain('flat')
    expect(r.proposal?.kind).toBe('nutrition_target')
    expect(r.proposal?.payload.deltaKcal).toBe(-150)
    expect(r.proposal?.payload.kcal).toBe(1900)
    expect(r.proposal?.payload.proteinG).toBe(150)
    expect(r.evidence.some((e) => /adherence/i.test(e.label))).toBe(true)
  })

  it('flat weight without adherence → flag but no proposal', () => {
    const r = evaluateNutritionTrend({ weights: weights(21, () => 84), waists: [], intake: intake(14, 2000, 145, 2), target: TARGET, today: TODAY })
    expect(r.adherencePct).toBeLessThan(80)
    expect(r.flags.some((f) => f.kind === 'flat' && /log/i.test(f.message))).toBe(true)
    expect(r.proposal).toBeNull()
  })

  it('rapid loss (< −1.2 kg/wk) → +150 kcal proposal', () => {
    const r = evaluateNutritionTrend({ weights: weights(21, (i) => 88 - i * 0.25), waists: [], intake: intake(14, 1700, 150), target: TARGET, today: TODAY })
    expect(r.weeklyRateKg!).toBeLessThan(-1.2)
    expect(r.flags.map((f) => f.kind)).toContain('rapid_loss')
    expect(r.proposal?.payload.deltaKcal).toBe(150)
    expect(r.proposal?.payload.kcal).toBe(2200)
  })

  it('under-eating (< 1,500 kcal over ≥ 5 logged days) → flag and +150 proposal', () => {
    const r = evaluateNutritionTrend({ weights: weights(21, () => 84), waists: [], intake: intake(14, 1300, 120), target: TARGET, today: TODAY })
    expect(r.flags.map((f) => f.kind)).toContain('under_eating')
    expect(r.proposal?.payload.deltaKcal).toBe(150) // never proposes a cut while under-eating
  })

  it('low protein (< 70% of target) is flagged', () => {
    const r = evaluateNutritionTrend({ weights: weights(21, (i) => 84 - i * 0.07), waists: [], intake: intake(14, 2000, 90), target: TARGET, today: TODAY })
    expect(r.avgProteinG).toBe(90)
    expect(r.flags.map((f) => f.kind)).toContain('low_protein')
    expect(r.flags.map((f) => f.kind)).toContain('on_track')
  })

  it('insufficient weight data → no proposal', () => {
    const r = evaluateNutritionTrend({ weights: weights(5, () => 84), waists: [], intake: intake(5, 2000, 150), target: TARGET, today: TODAY })
    expect(r.flags[0].kind).toBe('insufficient_data')
    expect(r.proposal).toBeNull()
    expect(r.weeklyRateKg).toBeNull()
  })

  it('reports 7-day and previous 7-day averages', () => {
    const r = evaluateNutritionTrend({ weights: weights(14, (i) => (i < 7 ? 85 : 84)), waists: [], intake: [], target: TARGET, today: TODAY })
    expect(r.avg7Kg).toBeCloseTo(84, 5)
    expect(r.prevAvg7Kg).toBeCloseTo(85, 5)
    expect(r.weeklyRateKg).toBeCloseTo(-1, 5)
    expect(r.loggedDays).toBe(0)
    expect(r.avgKcal).toBeNull()
  })
})
