import { describe, expect, it } from 'vitest'
import { computeDailyPriority, type CoachFacts } from '../../src/engine/coach'
import { evaluateSymptomGate } from '../../src/engine/symptomGate'
import { seedFacts, sym } from '../../src/engine/__tests__/fixtures'
import { REPORTS_CONTEXT_RULE, type CoachPromptExtras, type PromptContext, assembleCoachPrompt, baselineSection, factsSection, reportsSection } from '../prompt'

/** What the app's old buildCoachSystemPrompt did: the generalist prompt for these facts. */
const buildCoachSystemPrompt = (f: CoachFacts, profileSummary: string, extras?: CoachPromptExtras) =>
  assembleCoachPrompt({ facts: f, profileSummary, priority: computeDailyPriority(f), extras: extras ?? {} })

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
    expect(factsSection(ctx())!.some((l: string) => l.startsWith('- Mind today'))).toBe(false)
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
    // PRD §9 phase 4: every rule, the coaching section and the proposal contract sit in the first 6 000 characters.
    const guardrailsEnd = s.indexOf('PROPOSAL:') + 200
    expect(s.indexOf('Never discourage professional help')).toBeLessThan(6_000)
    expect(s.indexOf('Consistency beats intensity')).toBeLessThan(6_000)
    expect(guardrailsEnd).toBeLessThan(6_000)
  })
})

describe('safety note section', () => {
  it('appears right after the rules only when a recent message was screened', () => {
    const facts = seedFacts()
    const base = { facts, profileSummary: 'p', priority: computeDailyPriority(facts) }
    expect(assembleCoachPrompt({ ...base, extras: {} })).not.toMatch(/SAFETY NOTE/)
    const s = assembleCoachPrompt({ ...base, extras: { safetyKind: 'medical_emergency' } })
    expect(s).toMatch(/SAFETY NOTE: .*possible emergency symptoms.*Answer their current question normally/)
    expect(s.indexOf('SAFETY NOTE')).toBeGreaterThan(s.indexOf('RULES'))
    expect(s.indexOf('SAFETY NOTE')).toBeLessThan(s.indexOf('PROFILE'))
  })
})

// Moved from the app's engine and reports tests when the coach became its own Worker.
describe('prompt content', () => {
  it('is safety-bounded, evidence-linked and forbids calorie math', () => {
    const s = buildCoachSystemPrompt(seedFacts(), 'Alex Tan, 37, 179 cm, 84 kg, cutting to 74 kg')
    expect(s).toMatch(/Do NOT do calorie or macro arithmetic/)
    expect(s).toMatch(/Never diagnose/)
    expect(s).toMatch(/Do the upper-body session today\./)
    expect(s).toMatch(/Readiness: AMBER/)
    expect(s).toMatch(/PROPOSAL:/)
    expect(s).toMatch(/Alex Tan/)
  })

  it('keeps replies plain and routes new symptoms to the symptom gate', () => {
    const s = buildCoachSystemPrompt(seedFacts(), 'profile')
    expect(s).toMatch(/No emoji\./)
    expect(s).toMatch(/no markdown/)
    expect(s).toMatch(/never clinical terms/)
    expect(s).toMatch(/tell them to log it in the app/)
    expect(s).toMatch(/skip the movements that provoke it, not the whole session/)
  })

  it('carries mood and stress context and the no-diagnosis rule, never journal text', () => {
    const s = buildCoachSystemPrompt(seedFacts({ mind: { stressToday: 8, valenceToday: -2, mindfulMinToday: 3, support: true } }), 'Alex Tan')
    expect(s).toMatch(/never name a condition/)
    expect(s).toMatch(/breathing session in Mind or talking to someone/)
    expect(s).toMatch(/Never cancel or block training on mood alone/)
    expect(s).toMatch(/Mind today: stress 8\/10; mood Unpleasant \(-2 on a -3\.\.3 scale\); mindful minutes 3/)
    expect(s).toMatch(/talking to someone can help/)
    expect(buildCoachSystemPrompt(seedFacts(), 'Alex Tan')).not.toMatch(/Mind today:/)
  })

  it('is unchanged without extras', () => {
    const f = seedFacts()
    expect(buildCoachSystemPrompt(f, 'V')).toBe(buildCoachSystemPrompt(f, 'V', {}))
    expect(buildCoachSystemPrompt(f, 'V', { reports: [], baseline: '  ' })).toBe(buildCoachSystemPrompt(f, 'V'))
    expect(buildCoachSystemPrompt(f, 'V')).not.toMatch(/HEALTH REPORTS|STARTING POINT/)
  })

  it('appends the baseline and the report lines with the clinician rule', () => {
    const s = buildCoachSystemPrompt(seedFacts(), 'V', { baseline: 'Returning lifter, left knee history.', reports: ['Blood test "Lipid panel" (2026-08-02): LDL 3.9 mmol/L [High, printed range ≤ 3.4]'] })
    expect(s).toMatch(/STARTING POINT[^\n]*\nReturning lifter, left knee history\./)
    expect(s).toMatch(/HEALTH REPORTS[^\n]*\n- Blood test "Lipid panel"/)
    expect(s.endsWith(REPORTS_CONTEXT_RULE)).toBe(true)
    expect(REPORTS_CONTEXT_RULE).toMatch(/never diagnose, never contradict the user's clinician/)
  })
})
