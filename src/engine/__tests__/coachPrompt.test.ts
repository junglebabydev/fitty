import { describe, expect, it } from 'vitest'
import { buildCoachSystemPrompt, computeDailyPriority } from '../coach'
import { type PromptContext, assembleCoachPrompt, baselineSection, factsSection, reportsSection } from '../coachPrompt'
import { evaluateSymptomGate } from '../symptomGate'
import { seedFacts, sym } from './fixtures'

// Golden files: the full system prompt for fixed scenarios. Phase 1 of docs/PRD_COACH_CHAT.md is a pure refactor,
// so these must not change. A deliberate prompt change updates them with `npx vitest run -u` and a reviewed diff.
describe('buildCoachSystemPrompt golden text', () => {
  it('seed scenario, no extras', async () => {
    const s = buildCoachSystemPrompt(seedFacts(), 'Alex Tan, 37, 179 cm, 84 kg, cutting to 74 kg')
    await expect(s).toMatchFileSnapshot('./__golden__/coach-prompt-seed.txt')
  })

  it('every optional block: mind, red flags, stalls, trend proposal, baseline, reports', async () => {
    const f = seedFacts({
      gate: evaluateSymptomGate([sym('knee_left', 6, { locking: true }), sym('back_lower', 3)]),
      stalls: [{ exerciseName: 'Lat Pulldown' }],
      missedThisWeek: 1,
      nutritionTrend: {
        weeklyRateKg: -0.05, avg7Kg: 84.2, prevAvg7Kg: 84.25, loggedDays: 12, adherencePct: 80, avgKcal: 2100, avgProteinG: 120,
        flags: [{ kind: 'stalled', message: 'Weight flat for 14 days.' } as never],
        proposal: { kind: 'nutrition_target', payload: { deltaKcal: -150 }, summary: 'Lower calories by 150 kcal' },
        evidence: [],
      },
      mind: { stressToday: 8, valenceToday: -2, mindfulMinToday: 0, support: true },
    })
    const s = buildCoachSystemPrompt(f, 'profile', {
      baseline: 'Starting at 84 kg, untrained for 2 years. Watch-outs: left knee.',
      reports: ['Lipid panel 2026-08-01: LDL 3.9 mmol/L (range < 3.4)', '  '],
    })
    await expect(s).toMatchFileSnapshot('./__golden__/coach-prompt-full.txt')
  })
})

describe('coach prompt sections', () => {
  const ctx = (over: Partial<PromptContext> = {}): PromptContext => {
    const facts = seedFacts()
    return { facts, profileSummary: 'profile', priority: computeDailyPriority(facts), extras: {}, ...over }
  }

  it('optional sections leave themselves out', () => {
    expect(baselineSection(ctx())).toBeNull()
    expect(baselineSection(ctx({ extras: { baseline: '   ' } }))).toBeNull()
    expect(reportsSection(ctx())).toBeNull()
    expect(reportsSection(ctx({ extras: { reports: ['', '  '] } }))).toBeNull()
    expect(factsSection(ctx())!.some((l) => l.startsWith('- Mind today'))).toBe(false)
  })

  it('the assembler drops null sections and joins the rest with one blank line', () => {
    const s = assembleCoachPrompt(ctx(), [() => ['A', 'B'], () => null, () => ['C']])
    expect(s).toBe('A\nB\n\nC')
  })

  it('guardrails come first and reports last, so the Worker cut never drops a rule', () => {
    const s = assembleCoachPrompt(ctx({ extras: { reports: ['x'.repeat(50_000)] } }))
    expect(s.indexOf('RULES')).toBeLessThan(s.indexOf('FACTS'))
    expect(s.indexOf('Never diagnose')).toBeLessThan(2_000)
    expect(s.lastIndexOf('HEALTH REPORTS')).toBeGreaterThan(s.indexOf('PROPOSAL:'))
  })
})
