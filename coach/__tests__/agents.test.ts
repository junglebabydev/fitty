import { describe, expect, it } from 'vitest'
import { computeDailyPriority } from '../../src/engine/coach'
import { seedFacts } from '../../src/engine/__tests__/fixtures'
import { AGENT_IDS, AGENT_QUESTION, agentFromDecision, buildAgentPrompt, routeDeterministic, type AgentId } from '../agents'
import { assembleCoachPrompt } from '../prompt'

describe('routeDeterministic', () => {
  const CASES: [string, AgentId | null][] = [
    // pain wins over every other domain
    ['my knee hurts, what should I eat before legs?', 'symptoms'],
    ['sharp pain in my shoulder on the bench', 'symptoms'],
    ['lower back feels tight after deadlifts', 'symptoms'],
    ['I tweaked something yesterday', 'symptoms'],
    // a region without a pain word is not a symptom
    ['how heavy should my shoulder press be?', 'training'],
    ['back squat or leg press today?', 'training'],
    // one clear domain
    ['What should I eat next?', 'nutrition'],
    ['Should I train today?', 'training'],
    ['how did I sleep?', 'recovery'],
    ['legs are sore from yesterday', 'recovery'],
    ['I feel stressed', 'mind'],
    ['feeling low this week', 'mind'],
    // none, or several: the classifier (or coach) decides
    ['How is my week going?', null],
    ['should I eat before I train?', null],
  ]
  for (const [text, agent] of CASES) {
    it(`"${text}" → ${agent ?? 'undecided'}`, () => {
      expect(routeDeterministic(text, null).agent).toBe(agent)
    })
  }

  it('a short follow-up with no domain stays with the previous agent', () => {
    expect(routeDeterministic('and tomorrow?', 'training')).toEqual({ agent: 'training', via: 'follow_up' })
    expect(routeDeterministic('why?', 'nutrition')).toEqual({ agent: 'nutrition', via: 'follow_up' })
    expect(routeDeterministic('and tomorrow?', null).agent).toBeNull()
    // a follow-up that names a domain goes to that domain
    expect(routeDeterministic('what about protein?', 'training').agent).toBe('nutrition')
  })
})

describe('agent prompts', () => {
  const facts = seedFacts()
  const ctx = { facts, profileSummary: 'profile', priority: computeDailyPriority(facts), extras: { reports: ['LDL 3.9 mmol/L'] } }

  it('coach is exactly the generalist prompt', () => {
    expect(buildAgentPrompt('coach', ctx)).toBe(assembleCoachPrompt(ctx))
  })

  for (const agent of AGENT_IDS) {
    it(`${agent}: guardrails, always-on facts and the priority are always there`, () => {
      const s = buildAgentPrompt(agent, ctx)
      expect(s.indexOf('RULES')).toBeLessThan(s.indexOf('FACTS'))
      expect(s).toMatch(/Never diagnose/)
      expect(s).toMatch(/- Readiness: /)
      expect(s).toMatch(/- Symptom gate: /)
      expect(s).toMatch(/- Today's session: /)
      expect(s).toMatch(/TODAY'S COMPUTED PRIORITY/)
      expect(s).toMatch(/PROPOSAL:/)
    })
  }

  it('specialists get only their facts, and reports stay with the generalist', () => {
    const nutrition = buildAgentPrompt('nutrition', ctx)
    expect(nutrition).toMatch(/- Intake today: /)
    expect(nutrition).not.toMatch(/- Stalls: /)
    expect(nutrition).not.toMatch(/HEALTH REPORTS/)
    const training = buildAgentPrompt('training', ctx)
    expect(training).toMatch(/- Stalls: /)
    expect(training).not.toMatch(/- Intake today: /)
    expect(training).toMatch(/FOCUS: This message is about training/)
  })
})

describe('agentFromDecision', () => {
  it('trusts a confident answer, and uses coach for low confidence, "other" or anything unknown', () => {
    expect(agentFromDecision({ choice: 'nutrition', confidence: 0.9 })).toBe('nutrition')
    expect(agentFromDecision({ choice: 'nutrition', confidence: 0.59 })).toBe('coach')
    expect(agentFromDecision({ choice: 'other', confidence: 0.99 })).toBe('coach')
    expect(agentFromDecision({ choice: 'reports', confidence: 0.99 })).toBe('coach')
  })

  it('offers every agent plus other, with snake_case names the Worker accepts', () => {
    expect(Object.keys(AGENT_QUESTION.options).sort()).toEqual([...AGENT_IDS, 'other'].sort())
    for (const [k, v] of Object.entries(AGENT_QUESTION.options) as [string, string][]) {
      expect(k).toMatch(/^[a-z_]{1,40}$/)
      expect(v.length).toBeLessThanOrEqual(300)
    }
  })
})
