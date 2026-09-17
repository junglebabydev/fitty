import { describe, expect, it } from 'vitest'
import type { ParsedCommand } from '../../../engine/voice'
import {
  AI_ESTIMATE_REASON, ROUTER_SCHEMA, actionFromRouter, clampValence, coachRoute, decideRoute, localPlanRoute, mealItemsFromRouter,
  metricToStored, normalizeFocus, planRoute, snapMinutes, type RouterResult,
} from '../router'

const NOW = '2026-09-17T12:30:00.000+08:00'
const cmd = (intent: ParsedCommand['intent'], confidence: number): ParsedCommand => ({ intent, payload: {}, confidence, preview: '', needsConfirmation: true })

describe('schema', () => {
  it('lists exactly the eight intents and forbids extra keys', () => {
    const props = ROUTER_SCHEMA.properties as Record<string, { enum?: string[] }>
    expect(props.intent.enum).toEqual(['log_meal', 'log_body_metric', 'log_set', 'log_symptom', 'log_mood', 'start_workout', 'plan_workout', 'question'])
    expect(ROUTER_SCHEMA.additionalProperties).toBe(false)
    expect(ROUTER_SCHEMA.required).toEqual(['intent'])
  })
})

describe('actionFromRouter', () => {
  it('log_meal → an editable meal draft flagged as an estimate', () => {
    const r: RouterResult = { intent: 'log_meal', meal: { items: [{ name: 'chicken rice', grams: 350, kcal: 607.4, protein_g: 25.04, carbs_g: 75, fat_g: 23 }] } }
    const a = actionFromRouter(r, 'had chicken rice', NOW)
    expect(a.kind).toBe('meal_draft')
    if (a.kind !== 'meal_draft') return
    expect(a.items).toHaveLength(1)
    expect(a.items[0]).toMatchObject({ foodName: 'Chicken rice', quantityG: 350, kcal: 607, proteinG: 25, source: 'voice', confidence: 0.5, uncertaintyReason: AI_ESTIMATE_REASON })
  })

  it('log_meal with no usable items falls back to the coach', () => {
    expect(actionFromRouter({ intent: 'log_meal', meal: { items: [] } }, 'lunch', NOW)).toEqual({ kind: 'navigate', to: coachRoute('lunch') })
    expect(actionFromRouter({ intent: 'log_meal' }, 'lunch', NOW)).toEqual({ kind: 'navigate', to: coachRoute('lunch') })
  })

  it('log_body_metric → the existing body-metric preview, converted to kg', () => {
    const a = actionFromRouter({ intent: 'log_body_metric', metric: { type: 'weight', value: 184, unit: 'lb' } }, 'scale said 184 lb', NOW)
    expect(a.kind).toBe('command')
    if (a.kind !== 'command') return
    expect(a.cmd.intent).toBe('log_body_metric')
    expect(a.cmd.payload).toMatchObject({ type: 'weight', value: 83.5, unit: 'kg', ts: NOW })
    expect(a.cmd.needsConfirmation).toBe(true)
  })

  it('never writes an implausible or missing measurement', () => {
    expect(actionFromRouter({ intent: 'log_body_metric', metric: { type: 'weight', value: 8, unit: 'kg' } }, 'x', NOW).kind).toBe('navigate')
    expect(actionFromRouter({ intent: 'log_body_metric' }, 'x', NOW).kind).toBe('navigate')
    expect(actionFromRouter({ intent: 'log_body_metric', metric: { type: 'weight', value: Number.NaN, unit: 'kg' } }, 'x', NOW).kind).toBe('navigate')
  })

  it('log_symptom → the symptom preview with a typed region and a clamped pain score', () => {
    const a = actionFromRouter({ intent: 'log_symptom', symptom: { region: 'left knee', pain: 14 } }, 'left knee is cranky after stairs', NOW)
    expect(a.kind).toBe('command')
    if (a.kind !== 'command') return
    expect(a.cmd.intent).toBe('log_symptom')
    expect(a.cmd.payload).toMatchObject({ region: 'knee_left', regions: ['knee_left'], painScore: 10, sideUnspecified: false })
  })

  it('log_symptom with an unknown area uses "other" rather than guessing', () => {
    const a = actionFromRouter({ intent: 'log_symptom', symptom: { region: 'elbow', pain: 2 } }, 'elbow twinge', NOW)
    expect(a.kind === 'command' && a.cmd.payload.region).toBe('other')
  })

  it('log_mood → a mood preview with an integer valence in -3..3', () => {
    expect(actionFromRouter({ intent: 'log_mood', mood: { valence: -7.2, note: ' flat today ' } }, 'flat today', NOW)).toEqual({ kind: 'mood', valence: -3, note: 'flat today' })
    expect(actionFromRouter({ intent: 'log_mood' }, 'meh', NOW)).toEqual({ kind: 'navigate', to: '/mind?checkin=1' })
  })

  it('start_workout and log_set open the session through a confirmable command', () => {
    for (const intent of ['start_workout', 'log_set'] as const) {
      const a = actionFromRouter({ intent }, 'x', NOW)
      expect(a.kind === 'command' && a.cmd.intent).toBe('start_workout')
      expect(a.kind === 'command' && a.cmd.payload.action).toBe('start')
    }
  })

  it('plan_workout → the Train planner with snapped minutes and a known focus', () => {
    expect(actionFromRouter({ intent: 'plan_workout', plan: { minutes: 40, focus: 'Legs' } }, 'x', NOW)).toEqual({ kind: 'navigate', to: '/train?plan=1&minutes=45&focus=lower' })
    expect(actionFromRouter({ intent: 'plan_workout' }, 'something for my shoulders', NOW)).toEqual({ kind: 'navigate', to: '/train?plan=1&minutes=30&focus=upper' })
  })

  it('question, junk and null all go to the coach with the original text', () => {
    const to = '/coach?q=why%20am%20I%20tired%3F'
    expect(actionFromRouter({ intent: 'question', answer: 'ignored' }, 'why am I tired?', NOW)).toEqual({ kind: 'navigate', to })
    expect(actionFromRouter({ intent: 'nonsense' } as unknown as RouterResult, 'why am I tired?', NOW)).toEqual({ kind: 'navigate', to })
    expect(actionFromRouter(null, 'why am I tired?', NOW)).toEqual({ kind: 'navigate', to })
  })
})

describe('helpers', () => {
  it('snaps minutes and normalises focus', () => {
    expect([10, 24, 26, 38, 52, 53, 90, 0, Number.NaN].map(snapMinutes)).toEqual([20, 20, 30, 45, 45, 60, 60, 30, 30])
    expect(['Upper body', 'legs', 'HIIT', 'stretching', 'whatever', undefined].map(normalizeFocus)).toEqual(['upper', 'lower', 'conditioning', 'mobility', 'full', 'full'])
    expect(planRoute(45, 'full')).toBe('/train?plan=1&minutes=45&focus=full')
  })

  it('converts stored units', () => {
    expect(metricToStored({ type: 'waist', value: 34, unit: 'in' })).toEqual({ type: 'waist', value: 86.4, unit: 'cm' })
    expect(metricToStored({ type: 'weight', value: 83.4, unit: 'kg' })).toEqual({ type: 'weight', value: 83.4, unit: 'kg' })
    expect(metricToStored(undefined)).toBeNull()
  })

  it('drops nameless meal items and floors negatives at zero', () => {
    const items = mealItemsFromRouter([
      { name: ' ', grams: 100, kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 },
      { name: 'kopi c', grams: 250, kcal: -5, protein_g: 2, carbs_g: 12, fat_g: 3 },
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ foodName: 'Kopi c', kcal: 0 })
  })

  it('clamps valence', () => {
    expect([clampValence(2.6), clampValence(-9), clampValence('x')]).toEqual([3, -3, null])
  })

  it('recognises a plan request without a model', () => {
    expect(localPlanRoute('Plan me a 45 minute upper body workout')).toBe('/train?plan=1&minutes=45&focus=upper')
    expect(localPlanRoute('build a quick leg session')).toBe('/train?plan=1&minutes=30&focus=lower')
    expect(localPlanRoute('start my workout')).toBeNull()
    expect(localPlanRoute('three eggs and toast')).toBeNull()
  })
})

describe('decideRoute', () => {
  it('plan requests skip everything else', () => {
    expect(decideRoute('plan a 20 min mobility session', cmd('coach_query', 0.85), true)).toEqual({ via: 'plan', to: '/train?plan=1&minutes=20&focus=mobility' })
  })
  it('questions go straight to the coach, connected or not', () => {
    expect(decideRoute('how am I doing?', cmd('coach_query', 0.85), true).via).toBe('coach')
    expect(decideRoute('how am I doing?', cmd('coach_query', 0.85), false).via).toBe('coach')
  })
  it('a confident parse is previewed without touching the model', () => {
    expect(decideRoute('weight 83.4 kg', cmd('log_body_metric', 0.92), true).via).toBe('preview')
  })
  it('a shaky parse goes to the model when connected, to a cancellable preview when not', () => {
    expect(decideRoute('feeling flat today', cmd('log_meal', 0.5), true)).toEqual({ via: 'ai' })
    expect(decideRoute('feeling flat today', cmd('log_meal', 0.5), false).via).toBe('preview')
  })
  it('unknown text goes to the model when connected, else to the local coach', () => {
    expect(decideRoute('zzz', cmd('unknown', 0), true)).toEqual({ via: 'ai' })
    expect(decideRoute('zzz', cmd('unknown', 0), false)).toEqual({ via: 'coach', to: '/coach?q=zzz' })
  })
})
