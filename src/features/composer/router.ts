// Composer routing. Text goes to the deterministic parser first; only what it cannot
// place goes to the AI router (`aiJson` with a strict schema). Everything below the AI
// call is pure: a router result is mapped onto the app's existing actions, and nothing
// is written until the user taps Apply (or Log, on the meal review screen).
import { aiJson } from '../../ai'
import { parseRegion, type ParsedCommand } from '../../engine/voice'
import type { FoodItem, Region } from '../../domain/types'
import { PROGRAM_IDS, type ProgramId } from '../../domain/programs'

// --- contract with the model -----------------------------------------------------------

export type RouterIntent =
  | 'log_meal' | 'log_body_metric' | 'log_set' | 'log_symptom' | 'log_mood'
  | 'start_workout' | 'plan_workout' | 'start_program' | 'question'

export interface RouterMealItem { name: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number }

export interface RouterResult {
  intent: RouterIntent
  meal?: { items: RouterMealItem[] }
  metric?: { type: 'weight' | 'waist'; value: number; unit: string }
  /** `pain` is null unless the user stated a score: the router never invents one. */
  symptom?: { region: string; pain: number | null }
  mood?: { valence: number; note: string }
  plan?: { minutes: number; focus: string }
  /** Untrusted model output: checked against PROGRAM_IDS before use. */
  program?: { id: string }
  answer?: string
}

const num = { type: 'number' } as const
const str = { type: 'string' } as const

export const ROUTER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['intent'],
  properties: {
    intent: { type: 'string', enum: ['log_meal', 'log_body_metric', 'log_set', 'log_symptom', 'log_mood', 'start_workout', 'plan_workout', 'start_program', 'question'] },
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
    program: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', enum: [...PROGRAM_IDS] } } },
    answer: str,
  },
}

export const ROUTER_SYSTEM = [
  'You are the input router for a personal wellness app (training, nutrition, sleep, mood). One short message comes in; you return ONE JSON object and nothing else.',
  'Pick the intent: log_meal (they ate or drank something), log_body_metric (body weight or waist), log_set (a lifting set), log_symptom (pain or discomfort in a body area), log_mood (how they feel), start_workout, plan_workout (they want one session built), start_program (they want to start a multi-week series, or get into or back into a kind of training), question (anything else).',
  'Extract only what the user said. Never invent data the user did not give: no weights, reps, pain scores, moods or measurements they did not state. If a required value is missing, use intent "question". A symptom without a pain number is still log_symptom, with pain null.',
  'Food is the one exception: for log_meal, estimate grams, kcal, protein_g, carbs_g and fat_g per item from typical portions (Singapore hawker portions when the dish is local). These are estimates and the app labels them as estimates.',
  'metric: value and unit exactly as stated (kg, lb, cm or in). symptom: region in plain words (e.g. "left knee", "lower back", "neck"), pain 0-10 only if the user gave a number, otherwise null (the app asks for it). mood: valence is an integer from -3 (very unpleasant) to 3 (very pleasant), note is their own words. plan: minutes (20, 30, 45 or 60) and focus (upper, lower, full, conditioning or mobility). program: id is one of gym-strength (gym or machine strength programme), home-dumbbells (home workouts with dumbbells or weights), bodyweight (no equipment, hotel or travel), hiit (intervals), start-running (getting into running, couch to 5k), postpartum (returning to exercise after having a baby). One session is plan_workout; a series or getting started is start_program.',
  'Never diagnose, never name a medical condition, never give medical advice. Leave "answer" empty for every intent: the coach screen answers questions, and nothing written there is shown.',
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

export function programRoute(id: ProgramId): string {
  return `/train/program/${id}`
}

// --- "start a running programme": the series matcher (PRD_TRAINING_PROGRAMS §7) ------------
// Deterministic and conservative: a series word alone is not enough, the text must also be about
// starting or following a programme. Anything doubtful returns null and takes the usual path.

const FOOD = /\b(ate|eaten|eat|eating|drank|drink|drinking|breakfast|lunch|dinner|supper|brunch|snack|snacks|meal|meals|kcal|calories|recipe)\b/
/** Questions go to the coach ("should I start running with a bad knee?"); requests ("can you…") do not count. */
const QUESTION = /^(how|what|whats|why|when|where|which|who|is|are|was|were|does|do|did|should|shall|will|would i|am i)\b/
const START_CUE = /\b(start|starting|begin|beginning|get into|get back into|getting into|getting back into|back into|back to|take up|taking up|want to|wanna|would like to|id like to|help me|learn to|try|ready to)\b/
/** "plan" counts as a series word only where the PRD says so; see ONE_OFF. */
const SERIES = /\b(programmes?|programs?|plans?|series|course|\d+[ -]?weeks?|weekly)\b/
const STRONG_SERIES = /\b(programmes?|programs?|series|course|\d+[ -]?weeks?)\b/
/** One session, not a series: "make me a HIIT workout", "20 min intervals", "start my HIIT workout". */
const ONE_OFF = /\b\d{1,3}\s*-?\s*(?:min|mins|minute|minutes)\b|\b(?:today|tonight)\b|\b(?:a|an|one|1|quick|single|my|this|the)\s+(?:[\w-]+\s+){0,3}(?:workout|session|class|run)\b/
const TRAINING_NOUN = /\b(workouts?|work out|working out|training|routines?|exercises?|exercising|programmes?|programs?)\b/
/** "I don't want to run" is the opposite request (avoid impact, §6.6). Adjacent words only: "never run before, want to start running" still matches. */
const NO_RUNNING = /\b(?:dont|do not|no longer|stop|stopped|quit|hate|cant|cannot|avoid)\s+(?:want to\s+)?(?:go\s+)?(?:run|running|jog|jogging)\b/
/** A pain report goes to the parser and the coach, never to an intro ("it hurts to move after my c-section"). */
const PAIN = /\b(hurts?|hurting|pain|painful|sore|ache|aches|aching|bleeding|leaking|injured|injury)\b/

const POSTPARTUM = /\b(post[ -]?partum|post[ -]?natal|after (?:the|my|a) baby|had (?:a|my|the) baby|after (?:giving )?birth|c[ -]?section|caesarean|cesarean)\b/
const POSTPARTUM_CUE = /\b(exercise|exercising|train|training|workouts?|work out|working out|fitness|get fit|getting fit|programmes?|programs?|plan|routine|get back|getting back|back in shape|start|begin|ease back|easing back|return to|returning to)\b/
const HIIT = /\b(hiit|tabata|intervals?|interval training)\b/
const RUNNING_IDIOM = /\b(running|run) (?:late|out|low|behind|errands|a business)\b/
const BODYWEIGHT = /\b(bodyweight|body weight|no equipment|without (?:any )?equipment|no gear)\b/
const TRAVEL = /\b(hotel|travel|travelling|traveling|on the road|on holiday|on vacation)\b/
const HOME = /\b(home|at home)\b/
const WEIGHTS = /\b(dumbbells?|weights|kettlebells?)\b/
const GYM = /\b(gym|machines?)\b/

const tidy = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'").replace(/'/g, '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim()

/** "start a running program" → 'start-running'. Null unless the text clearly asks to start or follow a series. */
export function matchProgram(text: string): ProgramId | null {
  const t = tidy(text)
  if (!t || FOOD.test(t) || QUESTION.test(t) || PAIN.test(t)) return null
  const series = SERIES.test(t)
  const cue = START_CUE.test(t) || series
  // One session goes to the planner, unless a series word says otherwise. Postpartum always goes to its intro,
  // because that is where its safety check lives.
  const oneOff = ONE_OFF.test(t) && !STRONG_SERIES.test(t)

  if (POSTPARTUM.test(t) && POSTPARTUM_CUE.test(t)) return 'postpartum'
  if (oneOff) return null

  if (HIIT.test(t) && cue) return 'hiit'

  const runWord = /\b(running|jogging|couch to 5k|c25k)\b/.test(t) || (/\b(run|jog|5k)\b/.test(t) && START_CUE.test(t))
  if (runWord && !RUNNING_IDIOM.test(t) && !NO_RUNNING.test(t)) {
    if (/\b(couch to 5k|c25k)\b/.test(t) || cue) return 'start-running'
  }

  const trained = cue || TRAINING_NOUN.test(t)
  if (BODYWEIGHT.test(t) && trained) return 'bodyweight'
  if (TRAVEL.test(t) && TRAINING_NOUN.test(t)) return 'bodyweight'

  if (/\bhome workouts?\b/.test(t)) return 'home-dumbbells'
  if (HOME.test(t) && WEIGHTS.test(t) && trained) return 'home-dumbbells'

  if (GYM.test(t) && (series || (/\bstrength\b/.test(t) && (START_CUE.test(t) || /\btraining\b/.test(t))))) return 'gym-strength'
  if (/\bstrength (?:training )?(?:programmes?|programs?|plans?)\b/.test(t)) return 'gym-strength'
  return null
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
    case 'start_program': {
      const id = result.program?.id
      return typeof id === 'string' && (PROGRAM_IDS as readonly string[]).includes(id) ? { kind: 'navigate', to: programRoute(id as ProgramId) } : ask
    }
    default:
      return ask
  }
}

// --- which path does a message take? ------------------------------------------------------

export type RouteDecision =
  | { via: 'program'; to: string }
  | { via: 'plan'; to: string }
  | { via: 'coach'; to: string }
  | { via: 'preview'; cmd: ParsedCommand }
  | { via: 'ai' }

/** Below this the deterministic parse is a guess ("feeling flat today" reads as a meal). */
export const CONFIDENT_PARSE = 0.7

export function decideRoute(text: string, cmd: ParsedCommand, aiOn: boolean): RouteDecision {
  const program = matchProgram(text)
  if (program) return { via: 'program', to: programRoute(program) }
  const plan = localPlanRoute(text)
  if (plan) return { via: 'plan', to: plan }
  if (cmd.intent === 'coach_query') return { via: 'coach', to: coachRoute(text) }
  if (cmd.intent !== 'unknown' && cmd.confidence >= CONFIDENT_PARSE) return { via: 'preview', cmd }
  if (aiOn) return { via: 'ai' }
  // No model: a low-confidence parse still gets a preview the user can cancel; the rest goes to the local coach.
  if (cmd.intent !== 'unknown') return { via: 'preview', cmd }
  return { via: 'coach', to: coachRoute(text) }
}
