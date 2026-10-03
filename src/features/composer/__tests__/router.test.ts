import { describe, expect, it } from 'vitest'
import { PROGRAM_IDS } from '../../../domain/programs'
import { screenMessage } from '../../../engine/chatSafety'
import { parseVoiceCommand, type ParsedCommand } from '../../../engine/voice'
import {
  AI_ESTIMATE_REASON, ROUTER_SCHEMA, actionFromRouter, clampValence, coachRoute, decideRoute, localPlanRoute, matchProgram, mealItemsFromRouter,
  metricToStored, normalizeFocus, planRoute, snapMinutes, type RouterResult,
} from '../router'

const NOW = '2026-09-17T12:30:00.000+08:00'
const cmd = (intent: ParsedCommand['intent'], confidence: number): ParsedCommand => ({ intent, payload: {}, confidence, preview: '', needsConfirmation: true })

describe('schema', () => {
  it('lists exactly the nine intents and forbids extra keys', () => {
    // start_program added deliberately (docs/PRD_TRAINING_PROGRAMS.md §7).
    const props = ROUTER_SCHEMA.properties as Record<string, { enum?: string[] }>
    expect(props.intent.enum).toEqual(['log_meal', 'log_body_metric', 'log_set', 'log_symptom', 'log_mood', 'start_workout', 'plan_workout', 'start_program', 'question'])
    expect(ROUTER_SCHEMA.additionalProperties).toBe(false)
    expect(ROUTER_SCHEMA.required).toEqual(['intent'])
  })

  it('start_program carries a closed program id', () => {
    const program = (ROUTER_SCHEMA.properties as Record<string, { additionalProperties?: boolean; required?: string[]; properties?: Record<string, { enum?: string[] }> }>).program
    expect(program.additionalProperties).toBe(false)
    expect(program.required).toEqual(['id'])
    expect([...(program.properties?.id.enum ?? [])].sort()).toEqual([...PROGRAM_IDS].sort())
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

  it('log_symptom without a stated score carries no pain score: the preview asks for it', () => {
    const a = actionFromRouter({ intent: 'log_symptom', symptom: { region: 'lower back', pain: null } }, 'lower back is a bit sore', NOW)
    expect(a.kind).toBe('command')
    if (a.kind !== 'command') return
    expect(a.cmd.payload).not.toHaveProperty('painScore')
    expect(a.cmd.payload.region).toBe('back_lower')
    expect(a.cmd.preview).toMatch(/pain score\?/)
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

  it('start_program → the programme intro; an unknown or missing id falls back to the coach', () => {
    expect(actionFromRouter({ intent: 'start_program', program: { id: 'hiit' } }, 'x', NOW)).toEqual({ kind: 'navigate', to: '/train/program/hiit' })
    for (const id of PROGRAM_IDS) expect(actionFromRouter({ intent: 'start_program', program: { id } }, 'x', NOW)).toEqual({ kind: 'navigate', to: `/train/program/${id}` })
    expect(actionFromRouter({ intent: 'start_program', program: { id: 'marathon' } }, 'run a marathon', NOW)).toEqual({ kind: 'navigate', to: coachRoute('run a marathon') })
    expect(actionFromRouter({ intent: 'start_program' }, 'run a marathon', NOW)).toEqual({ kind: 'navigate', to: coachRoute('run a marathon') })
    expect(actionFromRouter({ intent: 'start_program', program: { id: 7 } } as unknown as RouterResult, 'x', NOW).kind).toBe('navigate')
    expect(actionFromRouter({ intent: 'start_program', program: { id: 'toString' } }, 'x', NOW)).toEqual({ kind: 'navigate', to: coachRoute('x') })
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

describe('matchProgram (PRD_TRAINING_PROGRAMS §1.6, §7)', () => {
  it('routes the probe phrases to their series', () => {
    const cases: [string, string][] = [
      ['I just had a baby and want to get back to exercise', 'postpartum'],
      ['begin postpartum training', 'postpartum'],
      ['postnatal exercise plan', 'postpartum'],
      ['easing back into workouts after my c-section', 'postpartum'],
      ['start a running program', 'start-running'],
      ['I want to get into running', 'start-running'],
      ['couch to 5k', 'start-running'],
      ['I want to run a 5k', 'start-running'],
      ['get back into jogging', 'start-running'],
      ["I'm not a runner but want to get into running", 'start-running'],
      ["I've never run before and want to start running", 'start-running'],
      ['I want to stop being lazy and start running', 'start-running'],
      ["I can't wait to start running", 'start-running'],
      ['getting fit after my baby', 'postpartum'],
      ['make me a HIIT programme', 'hiit'],
      ['I want to start tabata', 'hiit'],
      ['a 6 week intervals plan', 'hiit'],
      ['home dumbbell workouts', 'home-dumbbells'],
      ['home workouts', 'home-dumbbells'],
      ['I want to train at home with weights', 'home-dumbbells'],
      ['a bodyweight programme for travel', 'bodyweight'],
      ['no equipment workouts', 'bodyweight'],
      ['hotel workouts while travelling', 'bodyweight'],
      ['gym strength programme', 'gym-strength'],
      ['I want a strength programme', 'gym-strength'],
      ['start gym strength training', 'gym-strength'],
    ]
    for (const [text, id] of cases) expect([text, matchProgram(text)]).toEqual([text, id])
  })

  it('handles curly apostrophes from iOS keyboards', () => {
    expect(matchProgram('I’d like to get into running')).toBe('start-running')
    expect(matchProgram('I don’t want to run anymore')).toBeNull()
  })

  it('stays out of the way of meals, one-off sessions, questions and everyday words', () => {
    for (const text of [
      'I ate a big lunch after running',
      'chicken rice for dinner',
      'Start today\'s workout',
      "let's train",
      'make me a HIIT workout',
      'plan a 20 min HIIT session',
      'plan a 20 min mobility session',
      'start my HIIT workout',
      'went running this morning',
      'my knee hurts when running',
      "I'm running late but want to train",
      'I don\'t want to run anymore',
      "I don't want to go running",
      'stop running',
      'I want to book a hotel',
      'help me plan my travel',
      'I had a baby',
      "I'm having a baby in March and want to keep training",
      'it hurts to move after my c-section',
      'sore after my c-section, want to start training',
      'my knee hurts, I want to start running',
      'postpartum depression',
      'should I start running with a bad knee?',
      'is it safe to exercise after a c-section?',
      'bench 20 kg dumbbells at home',
      'bodyweight squats 3 sets of 10',
      "I'm at the gym",
      'weight 83.4 kg',
      'zzz',
      '',
    ]) expect([text, matchProgram(text)]).toEqual([text, null])
  })

  it('the postpartum probe is not caught by the L1 safety screen, so the Composer reaches the matcher', () => {
    expect(screenMessage('I just had a baby and want to get back to exercise')).toBeNull()
    expect(screenMessage('begin postpartum training')).toBeNull()
  })
})

describe('decideRoute with programmes', () => {
  const ctx = { exercises: [], savedMeals: [], now: NOW }

  it('the series matcher runs first, ahead of the planner and the parser', () => {
    // The real parser reads this as a meal (log_meal 0.75); the matcher wins.
    expect(decideRoute('I just had a baby and want to get back to exercise', cmd('log_meal', 0.75), true)).toEqual({ via: 'program', to: '/train/program/postpartum' })
    expect(decideRoute('begin postpartum training', cmd('start_workout', 0.95), false)).toEqual({ via: 'program', to: '/train/program/postpartum' })
    expect(decideRoute('start a running program', cmd('log_meal', 0.5), true)).toEqual({ via: 'program', to: '/train/program/start-running' })
    expect(decideRoute('make me a HIIT programme', cmd('unknown', 0), true)).toEqual({ via: 'program', to: '/train/program/hiit' })
    expect(decideRoute('home dumbbell workouts', cmd('unknown', 0), false)).toEqual({ via: 'program', to: '/train/program/home-dumbbells' })
    expect(decideRoute('a bodyweight programme for travel', cmd('unknown', 0), false)).toEqual({ via: 'program', to: '/train/program/bodyweight' })
    expect(decideRoute('gym strength programme', cmd('unknown', 0), false)).toEqual({ via: 'program', to: '/train/program/gym-strength' })
  })

  it('a one-off session still reaches the planner', () => {
    expect(decideRoute('make me a HIIT workout', cmd('unknown', 0), true)).toEqual({ via: 'plan', to: '/train?plan=1&minutes=30&focus=conditioning' })
    expect(decideRoute('plan a 20 min mobility session', cmd('coach_query', 0.85), true)).toEqual({ via: 'plan', to: '/train?plan=1&minutes=20&focus=mobility' })
  })

  it('with the real parser: the probes never become a meal or today\'s session', () => {
    for (const text of ['I just had a baby and want to get back to exercise', 'begin postpartum training', 'start a running program', 'I want to get into running']) {
      expect([text, decideRoute(text, parseVoiceCommand(text, ctx), true).via]).toEqual([text, 'program'])
    }
  })
})
