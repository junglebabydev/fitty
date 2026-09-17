// Contracts every model-facing prompt has to keep. Each rule below exists because a live run broke it
// (scripts/ai-live is the manual smoke test that exercises the same prompts against a real model).
import { describe, expect, it } from 'vitest'
import { MEAL_SYSTEM_PROMPT } from '../../../ai/anthropic'
import { LIBRARY } from '../../../engine/__tests__/fixtures'
import type { GateResult } from '../../../engine'
import { ROUTER_SCHEMA, ROUTER_SYSTEM } from '../../composer/router'
import { ESTIMATE_SYSTEM, REFINE_SCHEMA, refinePrompt, refineSystem } from '../../meal/refine'
import { REPORT_EXTRACTION_SYSTEM } from '../../reports/extract'
import { BASELINE_SYSTEM, baselinePrompt, type BaselineAnswers } from '../intake'
import { PLAN_SCHEMA, buildPlannerSystem, plannerPrompt } from '../planner'

const NECK_AMBER: GateResult = { regions: [], avoidTags: ['overhead'], overall: 'AMBER', advice: ['Keep the neck neutral.'] }
const plannerSystem = buildPlannerSystem({ allowed: LIBRARY, gate: NECK_AMBER, readiness: { state: 'AMBER', reasons: ['Short sleep'] } })

const ANSWERS: BaselineAnswers = {
  age: 38, sex: 'Male', heightCm: 179, weightKg: 84, waistCm: null, goal: 'Lose fat', targetWeightKg: 76, horizonMonths: 6, experience: 'Intermediate',
  recentSessions: '1-2', enjoys: [], daysPerWeek: 4, minutesPerSession: 45, equipment: [], conditions: [], mealsPerDay: '1-2', skipsBreakfast: true, foods: [],
  alcohol: null, caffeine: null, supplements: '', sleepHours: 6, bedtime: null, stress: null, energy: null, wants: [], worked: [], notWorked: [], historyNote: '',
  kcal: 2050, proteinG: 150, coachStyle: 'Demanding',
}

describe('every user-facing prompt', () => {
  it('forbids emoji in so many words', () => {
    const prompts = { ROUTER_SYSTEM, BASELINE_SYSTEM, REPORT_EXTRACTION_SYSTEM, MEAL_SYSTEM_PROMPT, ESTIMATE_SYSTEM, refine: refineSystem(false), refineWithPhoto: refineSystem(true), plannerSystem }
    for (const [name, text] of Object.entries(prompts)) expect(text, name).toMatch(/No emoji/)
  })
})

describe('planner prompt', () => {
  it('lists every allowed id, today\'s gate and the rules a live plan broke', () => {
    for (const e of LIBRARY) expect(plannerSystem).toContain(`${e.id} | ${e.name}`)
    expect(plannerSystem).toMatch(/avoid every exercise tagged: overhead/)
    expect(plannerSystem).toMatch(/readiness AMBER \(Short sleep\)/)
    expect(plannerSystem).toMatch(/do not list a warm-up or cool-down/)
    expect(plannerSystem).toMatch(/No completed sessions in the last 14 days/)
  })

  it('keeps the user note short and on one line, and the schema closed', () => {
    const p = plannerPrompt({ minutes: 30, focus: 'lower', note: `knees\nfeel fine ${'x'.repeat(400)}` })
    expect(p).toMatch(/^Plan a 30-minute lower session for today\. The user adds: "knees feel fine x+"\.$/)
    expect(p.length).toBeLessThan(230)
    expect(plannerPrompt({ minutes: 45, focus: 'upper' })).toBe('Plan a 45-minute upper session for today.')
    expect(PLAN_SCHEMA.additionalProperties).toBe(false)
  })

  it('a user with no condition flags is sent "none reported", never a default medical profile or gym', () => {
    const s = buildPlannerSystem({ allowed: LIBRARY, gate: NECK_AMBER, conditions: [] })
    expect(s).toContain('Conditions: none reported.')
    expect(s).not.toMatch(/meniscus|back issues|neck issues|condo/i)
    expect(plannerSystem).not.toMatch(/meniscus|back issues|neck issues|condo/i)
    expect(buildPlannerSystem({ allowed: LIBRARY, gate: NECK_AMBER, conditions: ['Stiffness (after long sitting)'] })).toContain('Conditions: Stiffness (after long sitting).')
  })
})

describe('router prompt', () => {
  it('never asks the model for a pain score the user did not give, and wants no answer text', () => {
    expect(ROUTER_SYSTEM).toMatch(/otherwise null/)
    expect(ROUTER_SYSTEM).not.toMatch(/otherwise 3/)
    expect(ROUTER_SYSTEM).toMatch(/Leave "answer" empty/)
    const symptom = (ROUTER_SCHEMA.properties as { symptom: { properties: { pain: { type: string[] } } } }).symptom
    expect(symptom.properties.pain.type).toEqual(['number', 'null'])
  })
})

describe('intake prompt', () => {
  it('hands the model the app\'s own week-one session count and forbids inferred problems and health claims', () => {
    expect(baselinePrompt(ANSWERS)).toContain('- Sessions planned for week one: 3')
    expect(baselinePrompt({ ...ANSWERS, recentSessions: '0' })).toContain('- Sessions planned for week one: 2')
    expect(BASELINE_SYSTEM).toMatch(/use exactly the number given/)
    expect(BASELINE_SYSTEM).toMatch(/Do not infer habits or problems/)
    expect(BASELINE_SYSTEM).toMatch(/no physiology or health claims/)
  })
})

describe('report and meal prompts', () => {
  it('reports: no personal identifiers, no copied flags', () => {
    expect(REPORT_EXTRACTION_SYSTEM).toMatch(/no patient name/)
    expect(REPORT_EXTRACTION_SYSTEM).toMatch(/Do not copy flags/)
  })

  it('meal photo: a drawing or an unreadable photo is not a meal', () => {
    expect(MEAL_SYSTEM_PROMPT).toMatch(/A drawing, a screenshot/)
    expect(MEAL_SYSTEM_PROMPT).toMatch(/empty items array/)
  })

  it('refine: rows carry their index, the photo is mentioned only when sent, nothing is added unasked', () => {
    const p = refinePrompt([{ foodName: 'Rice', quantityG: 200, servingDescription: '1 bowl', kcal: 260, proteinG: 5, carbsG: 57, fatG: 0.6 }], 'extra rice')
    expect(p).toContain('"index":0,"food_name":"Rice","quantity_g":200')
    expect(p).toContain('The user says: "extra rice"')
    expect(refineSystem(true)).toMatch(/plus the meal photo/)
    expect(refineSystem(false)).not.toMatch(/photo/)
    expect(refineSystem(false)).toMatch(/never add foods they did not mention/)
    expect(REFINE_SCHEMA.required).toEqual(['items'])
  })
})
