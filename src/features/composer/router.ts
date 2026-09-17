// Composer routing. Text goes to the deterministic parser first; only what it cannot
// place goes to the AI router (`aiJson` with a strict schema). Everything below the AI
// call is pure: a router result is mapped onto the app's existing actions, and nothing
// is written until the user taps Apply (or Log, on the meal review screen).
import { aiJson } from '../../ai'
import { parseRegion, type ParsedCommand } from '../../engine/voice'
import type { FoodItem, Region } from '../../domain/types'

// --- contract with the model -----------------------------------------------------------

export type RouterIntent =
  | 'log_meal' | 'log_body_metric' | 'log_set' | 'log_symptom' | 'log_mood'
  | 'start_workout' | 'plan_workout' | 'question'

export interface RouterMealItem { name: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number }

export interface RouterResult {
  intent: RouterIntent
  meal?: { items: RouterMealItem[] }
  metric?: { type: 'weight' | 'waist'; value: number; unit: string }
  /** `pain` is null unless the user stated a score: the router never invents one. */
  symptom?: { region: string; pain: number | null }
  mood?: { valence: number; note: string }
  plan?: { minutes: number; focus: string }
  answer?: string
}

const num = { type: 'number' } as const
const str = { type: 'string' } as const

export const ROUTER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['intent'],
  properties: {
    intent: { type: 'string', enum: ['log_meal', 'log_body_metric', 'log_set', 'log_symptom', 'log_mood', 'start_workout', 'plan_workout', 'question'] },
    meal: {
      type: 'object', additionalProperties: false, required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
            properties: { name: str, grams: num, kcal: num, protein_g: num, carbs_g: num, fat_g: num },
          },
        },
      },
    },
    metric: {
      type: 'object', additionalProperties: false, required: ['type', 'value', 'unit'],
      properties: { type: { type: 'string', enum: ['weight', 'waist'] }, value: num, unit: str },
    },
    symptom: { type: 'object', additionalProperties: false, required: ['region', 'pain'], properties: { region: str, pain: { type: ['number', 'null'], description: '0-10 exactly as the user stated it, otherwise null' } } },
    mood: { type: 'object', additionalProperties: false, required: ['valence', 'note'], properties: { valence: num, note: str } },
    plan: { type: 'object', additionalProperties: false, required: ['minutes', 'focus'], properties: { minutes: num, focus: str } },
    answer: str,
  },
}

export const ROUTER_SYSTEM = [
  'You are the input router for a personal wellness app (training, nutrition, sleep, mood). One short message comes in; you return ONE JSON object and nothing else.',
  'Pick the intent: log_meal (they ate or drank something), log_body_metric (body weight or waist), log_set (a lifting set), log_symptom (pain or discomfort in a body area), log_mood (how they feel), start_workout, plan_workout (they want a session built), question (anything else).',
  'Extract only what the user said. Never invent data the user did not give: no weights, reps, pain scores, moods or measurements they did not state. If a required value is missing, use intent "question". A symptom without a pain number is still log_symptom, with pain null.',
  'Food is the one exception: for log_meal, estimate grams, kcal, protein_g, carbs_g and fat_g per item from typical portions (Singapore hawker portions when the dish is local). These are estimates and the app labels them as estimates.',
  'metric: value and unit exactly as stated (kg, lb, cm or in). symptom: region in plain words (e.g. "left knee", "lower back", "neck"), pain 0-10 only if the user gave a number, otherwise null (the app asks for it). mood: valence is an integer from -3 (very unpleasant) to 3 (very pleasant), note is their own words. plan: minutes (20, 30, 45 or 60) and focus (upper, lower, full, conditioning or mobility).',
  'Never diagnose, never name a medical condition, never give medical advice. For a question, leave "answer" empty or one short neutral sentence; the coach screen answers it.',
  'Plain text in every string. No emoji.',
].join('\n')

export function routeWithAI(text: string): Promise<RouterResult> {
  return aiJson<RouterResult>(
    { system: ROUTER_SYSTEM, prompt: text.trim(), schema: ROUTER_SCHEMA },
    { dataType: 'composer_text', purpose: 'Composer: understand a typed or dictated message' },
  )
}

// --- pure mapping: what happens next -----------------------------------------------------

export type NewFoodItem = Omit<FoodItem, 'id' | 'mealId'>

export type ComposerAction =
  /** Structured preview sheet → applyCommand. */
  | { kind: 'command'; cmd: ParsedCommand }
  /** Editable meal draft on /eat/review. */
  | { kind: 'meal_draft'; items: NewFoodItem[] }
  /** Small mood preview → addMoodLog. */
  | { kind: 'mood'; valence: number; note: string }
  /** Nothing to save: just go there. */
  | { kind: 'navigate'; to: string }

export const AI_ESTIMATE_REASON = 'Estimated by AI from your description — edit the portion and macros'
export const PLAN_MINUTES = [20, 30, 45, 60] as const
export const PLAN_FOCUS = ['upper', 'lower', 'full', 'conditioning', 'mobility'] as const
export type PlanFocus = (typeof PLAN_FOCUS)[number]

const LB_TO_KG = 0.45359237
const round1 = (n: number) => Math.round(n * 10) / 10
const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const pos = (v: unknown): number => Math.max(0, fin(v) ?? 0)

export function coachRoute(text: string): string {
  return `/coach?q=${encodeURIComponent(text.trim())}`
}

export function snapMinutes(minutes: unknown): number {
  const m = fin(minutes)
  if (m == null || m <= 0) return 30
  return PLAN_MINUTES.reduce((best, c) => (Math.abs(c - m) < Math.abs(best - m) ? c : best), PLAN_MINUTES[0] as number)
}

export function normalizeFocus(focus: unknown): PlanFocus {
  const f = typeof focus === 'string' ? focus.toLowerCase() : ''
  if (/upper|push|pull|chest|back|shoulder|arm/.test(f)) return 'upper'
  if (/lower|leg|glute|squat|hinge/.test(f)) return 'lower'
  if (/condition|cardio|bike|run|hiit|swim/.test(f)) return 'conditioning'
  if (/mobil|stretch|recover|yoga/.test(f)) return 'mobility'
  return 'full'
}

export function planRoute(minutes: unknown, focus: unknown): string {
  return `/train?plan=1&minutes=${snapMinutes(minutes)}&focus=${normalizeFocus(focus)}`
}

/** "plan me a 30 minute upper workout" — understood without a model. Null when the text is not a plan request. */
export function localPlanRoute(text: string): string | null {
  const t = text.toLowerCase()
  if (!/\b(plan|build|create|design|make|generate|suggest|give me|put together)\b/.test(t)) return null
  if (!/\b(workout|session|routine|training|circuit)\b/.test(t)) return null
  const m = t.match(/\b(\d{2,3})\s*-?\s*(?:min|mins|minute|minutes)\b/)
  return planRoute(m ? Number(m[1]) : 30, t)
}

/** kg / cm as stored. Null when the value is missing or implausible (never guess a measurement). */
export function metricToStored(metric: RouterResult['metric']): { type: 'weight' | 'waist'; value: number; unit: 'kg' | 'cm' } | null {
  if (!metric || (metric.type !== 'weight' && metric.type !== 'waist')) return null
  const raw = fin(metric.value)
  if (raw == null || raw <= 0) return null
  const unit = String(metric.unit ?? '').toLowerCase()
  if (metric.type === 'weight') {
    const value = round1(/^(lb|lbs|pound|pounds)$/.test(unit) ? raw * LB_TO_KG : raw)
    return value >= 25 && value <= 300 ? { type: 'weight', value, unit: 'kg' } : null
  }
  const value = round1(/^(in|inch|inches|")$/.test(unit) ? raw * 2.54 : raw)
  return value >= 40 && value <= 200 ? { type: 'waist', value, unit: 'cm' } : null
}

export function mealItemsFromRouter(items: RouterMealItem[] | undefined): NewFoodItem[] {
  return (items ?? [])
    .filter((it) => it && typeof it.name === 'string' && it.name.trim().length > 0)
    .map((it) => ({
      foodName: it.name.trim().replace(/^\w/, (c) => c.toUpperCase()),
      quantityG: round1(pos(it.grams)),
      servingDescription: 'AI estimate',
      kcal: Math.round(pos(it.kcal)),
      proteinG: round1(pos(it.protein_g)),
      carbsG: round1(pos(it.carbs_g)),
      fatG: round1(pos(it.fat_g)),
      source: 'voice',
      confidence: 0.5,
      uncertaintyReason: AI_ESTIMATE_REASON,
    }))
}

export function clampValence(v: unknown): number | null {
  const n = fin(v)
  return n == null ? null : Math.max(-3, Math.min(3, Math.round(n)))
}

/**
 * Router result → app action. Anything incomplete or implausible falls back to the coach
 * (a question), so a bad model reply can never write data.
 */
export function actionFromRouter(result: RouterResult | null | undefined, text: string, now: string): ComposerAction {
  const ask: ComposerAction = { kind: 'navigate', to: coachRoute(text) }
  if (!result || typeof result !== 'object') return ask

  switch (result.intent) {
    case 'log_meal': {
      const items = mealItemsFromRouter(result.meal?.items)
      return items.length ? { kind: 'meal_draft', items } : ask
    }
    case 'log_body_metric': {
      const m = metricToStored(result.metric)
      if (!m) return ask
      const label = m.type === 'weight' ? 'weight' : 'waist'
      return {
        kind: 'command',
        cmd: {
          intent: 'log_body_metric',
          payload: { type: m.type, value: m.value, unit: m.unit, ts: now, source: 'voice' },
          confidence: 0.8,
          preview: `Log ${label} ${m.value} ${m.unit} — today`,
          needsConfirmation: true,
        },
      }
    }
    case 'log_symptom': {
      const reg = parseRegion(String(result.symptom?.region ?? '').toLowerCase()) ?? parseRegion(text.toLowerCase())
      const region: Region = reg?.region ?? 'other'
      const stated = fin(result.symptom?.pain)
      const painScore = stated == null ? undefined : Math.max(0, Math.min(10, Math.round(stated)))
      return {
        kind: 'command',
        cmd: {
          intent: 'log_symptom',
          payload: {
            region,
            regions: reg?.regions ?? [region],
            sideUnspecified: !!reg && reg.side == null && reg.group === 'knee',
            ...(painScore != null ? { painScore } : {}),
            redFlags: {},
            notes: text.trim(),
            context: 'voice',
          },
          confidence: 0.7,
          preview: `Log ${region.replace('_', ' ')} symptom${painScore != null ? ` — pain ${painScore}/10` : ' — pain score?'}`,
          needsConfirmation: true,
        },
      }
    }
    case 'log_mood': {
      const valence = clampValence(result.mood?.valence)
      if (valence == null) return { kind: 'navigate', to: '/mind?checkin=1' }
      return { kind: 'mood', valence, note: String(result.mood?.note ?? '').trim().slice(0, 280) }
    }
    case 'log_set':
      // The schema carries no set fields on purpose: sets are logged in the session, where the
      // previous numbers are on screen. The deterministic parser handles "bench 26 for 10".
      return { kind: 'command', cmd: { intent: 'start_workout', payload: { action: 'start' }, confidence: 0.7, preview: "Open today's session to log that set", needsConfirmation: true } }
    case 'start_workout':
      return { kind: 'command', cmd: { intent: 'start_workout', payload: { action: 'start' }, confidence: 0.85, preview: "Start today's workout", needsConfirmation: true } }
    case 'plan_workout':
      return { kind: 'navigate', to: planRoute(result.plan?.minutes, result.plan?.focus ?? text) }
    default:
      return ask
  }
}

// --- which path does a message take? ------------------------------------------------------

export type RouteDecision =
  | { via: 'plan'; to: string }
  | { via: 'coach'; to: string }
  | { via: 'preview'; cmd: ParsedCommand }
  | { via: 'ai' }

/** Below this the deterministic parse is a guess ("feeling flat today" reads as a meal). */
export const CONFIDENT_PARSE = 0.7

export function decideRoute(text: string, cmd: ParsedCommand, aiOn: boolean): RouteDecision {
  const plan = localPlanRoute(text)
  if (plan) return { via: 'plan', to: plan }
  if (cmd.intent === 'coach_query') return { via: 'coach', to: coachRoute(text) }
  if (cmd.intent !== 'unknown' && cmd.confidence >= CONFIDENT_PARSE) return { via: 'preview', cmd }
  if (aiOn) return { via: 'ai' }
  // No model: a low-confidence parse still gets a preview the user can cancel; the rest goes to the local coach.
  if (cmd.intent !== 'unknown') return { via: 'preview', cmd }
  return { via: 'coach', to: coachRoute(text) }
}
