// Applies a parsed voice command to the local database. The builders at the top are pure
// (no db access) so they can be unit-tested; `applyCommand` at the bottom does the writes.
import type { BodyMetric, ExerciseSet, FoodItem, Meal, Readiness, RedFlags, Region, SymptomCheck, WorkoutSession } from '../../domain/types'
import { clamp, dateOf, nowIso } from '../../lib/util'
import { EXERCISES, FOOD_BY_ID, searchFoods, toFoodItem, type FoodRecord } from '../../data'
import { evaluateSymptomGate, type MealType, type ParsedCommand, type ParsedMealItem, type VoiceContext } from '../../engine'
import {
  activeSession, addBodyMetric, addMeal, addSet, addSymptomCheck, addVoiceCommand, cloneMeal, deleteBodyMetric, deleteMeal,
  deleteSet, deleteSymptomCheck, getExercises, getMeals, getSavedMeals, getSessionsForDate, getSetsForSession, symptomsForDate,
  updateSession,
} from '../../db/repositories'
import { todayReadiness } from '../coach/facts'

export type NewFoodItem = Omit<FoodItem, 'id' | 'mealId'>
export type Payload = Record<string, unknown>

export interface ApplyResult {
  ok: boolean
  /** One line for the toast / done panel. */
  message: string
  /** Route to open after applying (start workout, substitution, coach query, hints). */
  navigateTo?: string
  /** Secondary "review" route shown on the done panel (e.g. /eat after a meal). */
  reviewTo?: string
  /** After a symptom log: the gate's advice and the resulting readiness state. */
  gateAdvice?: string[]
  readiness?: Readiness
  /** Reverses the write(s) this command made. */
  undo?: () => void
}

/** Pain score assumed when the transcript names a symptom but no number ("my knee hurts"). Conservative: AMBER. */
export const DEFAULT_PAIN_SCORE = 3
/** Grams assumed for one portion of a food that is not in the database. */
export const UNKNOWN_PORTION_G = 150
export const UNKNOWN_FOOD_REASON = 'Not in the food list — rough placeholder, edit the portion and macros'
export const ASSUMED_PORTION_REASON = 'Portion assumed from a typical serving'

// --- pure helpers ----------------------------------------------------------------

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const round1 = (n: number) => Math.round(n * 10) / 10

function singularize(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** Spoken shorthand → food id, for words where ranked search picks a composite dish ("toast" → kaya toast set). */
export const VOICE_FOOD_ALIASES: Record<string, string> = {
  egg: 'egg_whole',
  'boiled egg': 'egg_whole',
  'fried egg': 'egg_whole',
  'scrambled egg': 'egg_whole',
  toast: 'bread_white',
  bread: 'bread_white',
  'wholemeal toast': 'bread_wholemeal',
  'brown toast': 'bread_wholemeal',
  coffee: 'black_coffee',
  'black coffee': 'black_coffee',
  americano: 'black_coffee',
  'long black': 'black_coffee',
  kopi: 'kopi',
  'black kopi': 'kopi_o_kosong',
  'kopi o': 'kopi_o',
  'kopi c': 'kopi_c',
  latte: 'latte',
  'flat white': 'flat_white',
  milk: 'milk_low_fat',
  rice: 'rice_white',
  'white rice': 'rice_white',
  'brown rice': 'rice_brown',
  whey: 'whey_protein',
  'scoop of whey': 'whey_protein',
  'protein shake': 'protein_shake_water',
  shake: 'protein_shake_water',
  'protein bar': 'protein_bar',
  yogurt: 'greek_yogurt_0',
  yoghurt: 'greek_yogurt_0',
  'greek yogurt': 'greek_yogurt_0',
  chicken: 'chicken_breast',
  'chicken breast': 'chicken_breast',
  salmon: 'salmon_cooked',
  tuna: 'tuna_water',
  tofu: 'tofu_firm',
  oat: 'oatmeal_cooked',
  oatmeal: 'oatmeal_cooked',
  porridge: 'oatmeal_cooked',
  beer: 'beer_lager',
  wine: 'wine_red',
}

/** Plain water is zero calories; keep it out of the placeholder estimate. */
const WATER_RE = /^(?:plain |sparkling |still |ice |iced |warm |hot |cold )?water$/

/** Best food record for a spoken name: alias table, singularised search, raw search, then the longest word. */
export function matchFood(name: string): FoodRecord | null {
  const q = name.trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!q) return null
  const singular = q.split(' ').map(singularize).join(' ')
  const alias = VOICE_FOOD_ALIASES[singular] ?? VOICE_FOOD_ALIASES[q]
  if (alias && FOOD_BY_ID[alias]) return FOOD_BY_ID[alias]
  const bySingular = searchFoods(singular, 1)[0]
  if (bySingular) return bySingular
  if (singular !== q) {
    const direct = searchFoods(q, 1)[0]
    if (direct) return direct
  }
  const words = singular.split(' ').filter((w) => w.length >= 3).sort((a, b) => b.length - a.length)
  for (const w of words) {
    const hit = searchFoods(w, 1)[0]
    if (hit) return hit
  }
  return null
}

/** Grams for a parsed item: explicit grams, else qty × the record's serving, else a placeholder portion. */
export function gramsFor(item: ParsedMealItem, food: FoodRecord | null): number {
  if (item.quantityG != null && item.quantityG > 0) return round1(item.quantityG)
  const qty = item.qty > 0 ? item.qty : 1
  return round1(qty * (food ? food.servingG : UNKNOWN_PORTION_G))
}

/** Generic mixed-dish placeholder (1.5 kcal/g) flagged low confidence so the review screen calls it out. */
export function estimateUnknownFood(name: string, grams: number, qty = 1, unit?: string): NewFoodItem {
  const g = Math.max(0, grams)
  const label = unit ? `${qty} ${unit}` : `${qty} portion${qty === 1 ? '' : 's'}`
  return {
    foodName: name.trim().replace(/^\w/, (c) => c.toUpperCase()),
    quantityG: round1(g),
    servingDescription: `${label} (estimate)`,
    kcal: Math.round(g * 1.5),
    proteinG: round1(g * 0.06),
    carbsG: round1(g * 0.15),
    fatG: round1(g * 0.07),
    source: 'voice',
    confidence: 0.2,
    uncertaintyReason: UNKNOWN_FOOD_REASON,
  }
}

export interface PlannedMealItem {
  spoken: ParsedMealItem
  food: FoodRecord | null
  grams: number
  item: NewFoodItem
}

/** Resolve spoken items to food records (or placeholders). Pure: uses only the bundled food data. */
export function planMealItems(items: ParsedMealItem[]): PlannedMealItem[] {
  return items.map((spoken) => {
    const lowered = spoken.name.trim().toLowerCase()
    if (WATER_RE.test(lowered)) {
      const grams = gramsFor(spoken, null)
      return {
        spoken,
        food: null,
        grams,
        item: { foodName: 'Water', quantityG: grams, servingDescription: `${spoken.qty} glass${spoken.qty === 1 ? '' : 'es'}`, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, source: 'voice', confidence: 1, uncertaintyReason: null },
      }
    }
    const food = matchFood(spoken.name)
    const grams = gramsFor(spoken, food)
    if (!food) return { spoken, food: null, grams, item: estimateUnknownFood(spoken.name, grams, spoken.qty, spoken.unit) }
    const base = toFoodItem(food, grams)
    const assumed = spoken.quantityG == null
    return {
      spoken,
      food,
      grams,
      item: {
        ...base,
        source: 'voice',
        confidence: Math.min(base.confidence ?? 0.9, assumed ? 0.7 : 0.9),
        uncertaintyReason: base.uncertaintyReason ?? (assumed ? ASSUMED_PORTION_REASON : null),
      },
    }
  })
}

export function sumMacros(items: NewFoodItem[]): { kcal: number; proteinG: number } {
  return items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, proteinG: a.proteinG + it.proteinG }), { kcal: 0, proteinG: 0 })
}

/** The meal to clone: a saved meal by name, else the meal of that type on the referenced date. */
export function findCloneSource(payload: Payload, saved: Meal[], recent: Meal[]): Meal | null {
  const name = typeof payload.savedMealName === 'string' ? payload.savedMealName.trim().toLowerCase() : ''
  if (name) {
    const hit = saved.find((m) => (m.savedName ?? '').trim().toLowerCase() === name)
    if (hit) return hit
  }
  const date = typeof payload.date === 'string' ? payload.date : null
  if (date) {
    const onDate = recent.filter((m) => dateOf(m.ts) === date)
    const type = typeof payload.mealType === 'string' ? payload.mealType : null
    return onDate.find((m) => m.mealType === type) ?? onDate[0] ?? null
  }
  return null
}

/** Set rows for the active session; `sets` in the payload logs several identical sets. */
export function buildSets(payload: Payload, sessionId: number, existing: ExerciseSet[], now: string): Omit<ExerciseSet, 'id'>[] {
  const exerciseId = String(payload.exerciseId ?? '')
  if (!exerciseId) return []
  const count = Math.max(1, Math.min(10, Math.round(numOrNull(payload.sets) ?? 1)))
  const start = existing.filter((s) => s.exerciseId === exerciseId).length + 1
  return Array.from({ length: count }, (_, i) => ({
    sessionId,
    exerciseId,
    setIndex: start + i,
    reps: numOrNull(payload.reps),
    loadKg: numOrNull(payload.loadKg),
    rir: numOrNull(payload.rir),
    rpe: numOrNull(payload.rpe),
    durationSec: numOrNull(payload.durationSec),
    painFlag: payload.painFlag === true,
    loggedAt: now,
  }))
}

/** One check per region in the payload (both knees when the side was not said and the user picked "both"). */
export function buildSymptomChecks(payload: Payload, now: string): Omit<SymptomCheck, 'id'>[] {
  const listed = Array.isArray(payload.regions) ? (payload.regions as Region[]) : []
  const regions = listed.length ? listed : payload.region ? [payload.region as Region] : []
  const painScore = clamp(Math.round(numOrNull(payload.painScore) ?? DEFAULT_PAIN_SCORE), 0, 10)
  const redFlags = (payload.redFlags && typeof payload.redFlags === 'object' ? payload.redFlags : {}) as RedFlags
  return regions.map((region) => ({
    ts: now,
    region,
    painScore,
    redFlags,
    notes: typeof payload.notes === 'string' ? payload.notes : '',
    context: 'voice',
    sessionId: numOrNull(payload.sessionId),
  }))
}

export function buildBodyMetric(payload: Payload, now: string): Omit<BodyMetric, 'id'> | null {
  const value = numOrNull(payload.value)
  const type = payload.type
  if (value == null || value <= 0 || (type !== 'weight' && type !== 'waist' && type !== 'bodyfat')) return null
  const unit = type === 'weight' ? 'kg' : type === 'waist' ? 'cm' : '%'
  return { ts: typeof payload.ts === 'string' ? payload.ts : now, type, value: round1(value), unit, source: 'voice' }
}

/** Session a set / substitution should target: the one in progress, else today's planned one. */
export function pickSession(active: WorkoutSession | null, today: WorkoutSession[]): WorkoutSession | null {
  if (active) return active
  return today.find((s) => s.status === 'planned') ?? today.find((s) => s.status === 'in_progress') ?? null
}

export function coachQueryRoute(question: string): string {
  return `/coach?q=${encodeURIComponent(question.trim())}`
}

// --- db-backed ---------------------------------------------------------------------

/** Exercises the parser can match: the seeded library, falling back to the bundled list on an empty table. */
export function buildVoiceContext(now: string = nowIso()): VoiceContext {
  const fromDb = getExercises()
  return {
    exercises: fromDb.length ? fromDb : EXERCISES,
    savedMeals: getSavedMeals().map((m) => m.savedName).filter((n): n is string => !!n),
    now,
  }
}

export function recordVoiceCommand(transcript: string, cmd: ParsedCommand, status: 'previewed' | 'applied' | 'discarded' | 'unrecognized'): number {
  return addVoiceCommand({ ts: nowIso(), transcript, intent: cmd.intent, payload: cmd.payload, status })
}

const fmtKcal = (n: number) => Math.round(n).toLocaleString('en-SG')

export function applyCommand(cmd: ParsedCommand, now: string = nowIso()): ApplyResult {
  const p = cmd.payload
  const today = dateOf(now)

  switch (cmd.intent) {
    case 'log_body_metric': {
      const m = buildBodyMetric(p, now)
      if (!m) return { ok: false, message: 'Could not read a value — say it with a unit, e.g. "weight 83.4 kilos".' }
      const id = addBodyMetric(m)
      const label = m.type === 'weight' ? 'Weight' : m.type === 'waist' ? 'Waist' : 'Body fat'
      return { ok: true, message: `${label} ${m.value} ${m.unit} logged`, reviewTo: '/progress', undo: () => deleteBodyMetric(id) }
    }

    case 'log_meal': {
      const spoken = Array.isArray(p.items) ? (p.items as ParsedMealItem[]) : []
      const planned = planMealItems(spoken)
      if (!planned.length) return { ok: false, message: 'No food items recognised — say what you ate, e.g. "three eggs and a latte".' }
      const items = planned.map((x) => x.item)
      const mealType = (typeof p.mealType === 'string' ? p.mealType : 'snack') as MealType
      const id = addMeal(
        { ts: typeof p.ts === 'string' ? p.ts : now, mealType, photoUri: null, notes: typeof p.notes === 'string' ? p.notes : '', source: 'voice', savedName: null, isSaved: false },
        items,
      )
      const totals = sumMacros(items)
      const unmatched = planned.filter((x) => !x.food).length
      const suffix = unmatched ? ` · ${unmatched} estimated — edit in Eat` : ''
      return {
        ok: true,
        message: `Logged ${mealType}: ${items.length} item${items.length === 1 ? '' : 's'}, ${fmtKcal(totals.kcal)} kcal, ${Math.round(totals.proteinG)} g protein${suffix}`,
        reviewTo: '/eat',
        undo: () => deleteMeal(id),
      }
    }

    case 'clone_meal': {
      const source = findCloneSource(p, getSavedMeals(), getMeals(14))
      if (!source) {
        const what = typeof p.savedMealName === 'string' && p.savedMealName ? `“${p.savedMealName}”` : `a ${String(p.mealType ?? 'meal')} on ${String(p.date ?? 'that day')}`
        return { ok: false, message: `Could not find ${what} to copy.`, reviewTo: '/eat' }
      }
      const mealType = typeof p.mealType === 'string' ? (p.mealType as Meal['mealType']) : undefined
      const id = cloneMeal(source.id, now, mealType)
      const totals = sumMacros(source.items)
      const name = source.savedName ?? `${source.mealType} from ${dateOf(source.ts)}`
      return {
        ok: true,
        message: `Copied ${name} — ${fmtKcal(totals.kcal)} kcal, ${Math.round(totals.proteinG)} g protein`,
        reviewTo: '/eat',
        undo: () => deleteMeal(id),
      }
    }

    case 'log_set': {
      const session = activeSession()
      if (!session) {
        const planned = pickSession(null, getSessionsForDate(today))
        return {
          ok: false,
          message: planned ? `No workout in progress — start ${planned.name} first, then log sets by voice.` : 'No workout in progress and nothing planned today.',
          navigateTo: planned ? `/train/session/${planned.id}` : '/train',
        }
      }
      if (numOrNull(p.reps) == null && numOrNull(p.durationSec) == null) {
        return { ok: false, message: `How many reps for ${String(p.exerciseName ?? 'that')}? Say e.g. "for eight".` }
      }
      const rows = buildSets(p, session.id, getSetsForSession(session.id), now)
      if (!rows.length) return { ok: false, message: 'Which exercise? Say e.g. "bench 26 kilos for ten".' }
      const ids = rows.map(addSet)
      const first = rows[0]
      const bits = [first.loadKg != null ? `${first.loadKg} kg` : null, first.reps != null ? `× ${first.reps}` : null, first.durationSec != null ? `${first.durationSec} s` : null, first.rir != null ? `RIR ${first.rir}` : null].filter(Boolean)
      const many = rows.length > 1 ? ` (${rows.length} sets)` : ''
      return {
        ok: true,
        message: `Set ${first.setIndex} logged: ${String(p.exerciseName ?? first.exerciseId)} ${bits.join(' ')}${many}`,
        reviewTo: `/train/session/${session.id}`,
        undo: () => ids.forEach(deleteSet),
      }
    }

    case 'start_workout': {
      const active = activeSession()
      if (p.action === 'finish') {
        if (!active) return { ok: false, message: 'No workout in progress to finish.', navigateTo: '/train' }
        const started = active.startedAt ? new Date(active.startedAt).getTime() : NaN
        const durationMin = Number.isFinite(started) ? Math.max(1, Math.round((new Date(now).getTime() - started) / 60_000)) : active.durationMin
        updateSession(active.id, { status: 'completed', completedAt: now, durationMin })
        return { ok: true, message: `${active.name} finished${durationMin ? ` — ${durationMin} min` : ''}`, navigateTo: '/train', undo: () => updateSession(active.id, { status: 'in_progress', completedAt: null, durationMin: active.durationMin }) }
      }
      const session = pickSession(active, getSessionsForDate(today))
      if (!session) return { ok: false, message: 'Nothing planned today — pick a session on Train.', navigateTo: '/train' }
      return { ok: true, message: session.status === 'in_progress' ? `Continuing ${session.name}` : `Opening ${session.name}`, navigateTo: `/train/session/${session.id}` }
    }

    case 'log_symptom': {
      const rows = buildSymptomChecks(p, now)
      if (!rows.length) return { ok: false, message: 'Which area? Say e.g. "left knee", "lower back" or "neck".' }
      const ids = rows.map(addSymptomCheck)
      const gate = evaluateSymptomGate(symptomsForDate(today))
      const readiness = todayReadiness(today)
      const label = rows.map((r) => r.region.replace('_', ' ')).join(', ')
      return {
        ok: true,
        message: `${label} — pain ${rows[0].painScore}/10 logged. Readiness ${readiness.state}.`,
        gateAdvice: gate.advice,
        readiness: readiness.state,
        reviewTo: '/checkin',
        undo: () => ids.forEach(deleteSymptomCheck),
      }
    }

    case 'request_substitution': {
      const exerciseId = typeof p.exerciseId === 'string' ? p.exerciseId : null
      if (!exerciseId) return { ok: false, message: 'Which exercise? Say e.g. "swap squats for something easier on my knee".' }
      const session = pickSession(activeSession(), getSessionsForDate(today))
      if (!session) return { ok: false, message: 'No session today to substitute in — open Train.', navigateTo: '/train' }
      return { ok: true, message: `Finding a substitute for ${String(p.exerciseName ?? exerciseId)}`, navigateTo: `/train/session/${session.id}?substitute=${encodeURIComponent(exerciseId)}` }
    }

    case 'coach_query': {
      const q = typeof p.question === 'string' ? p.question : ''
      if (!q.trim()) return { ok: false, message: 'Ask the coach a question, e.g. "How am I doing this week?"' }
      return { ok: true, message: 'Asking the coach', navigateTo: coachQueryRoute(q) }
    }

    default:
      return { ok: false, message: cmd.preview || 'Did not catch that.' }
  }
}
