// Demo scenario seed (PRD §21, docs/CONTRACTS.md "src/db/seed.ts").
// The persona ("Alex Tan") and every number below are fictional demo data — no real person's records belong here.
// Everything is relative to todayStr() so the scenario reads the same on any day:
// AMBER readiness (6h 10m sleep + mild left-knee soreness), an upper-body session
// planned today, only a black kopi logged so far, and a protein target that makes
// the coach ask for a high-protein lunch.
//
// The pure helpers (weightSeries, sleepSeries, restingHrSeries, planWeek, shouldSeedDemo, …) are
// exported for tests; only seedIfEmpty/reseed touch the database.
//
// Reference data (exercise library + default settings) is seeded on every boot. The demo persona is
// seeded automatically only in a dev build or when the URL carries ?demo=1 (see shouldSeedDemo); a
// hosted production build starts at onboarding with an empty profile. reseed() works in every build.
import type {
  BodyMetric, CoachDecision, CoachMessage, ConditionFlag, ExerciseSet, FoodItem, Goal, HealthMetric, JournalEntry,
  LedgerEntry, Meal, MindSession, MoodLog, PlannedExercise, SleepRecord, UserProfile, WorkoutSession,
} from '../domain/types'
import { addDays, dayName, daysBetween, fmtDate, fmtDuration, isoAt, startOfWeek, todayStr } from '../lib/util'
import { db } from './database'
import {
  addBodyMetric, addConditionFlag, addDecision, addHealthMetric, addJournalEntry, addLedgerEntry, addMeal, addMessage,
  addMindSession, addMoodLog, addSet, addSleepRecord, addSymptomCheck, createSession, exerciseCount, getProfile, getSetting, saveProfile, setNutritionTarget,
  setSetting, upsertExercises, upsertGoal, upsertCheckIn,
} from './repositories'
import { EXERCISES, FOOD_BY_ID, toFoodItem, type FoodRecord } from '../data'
import { JOURNAL_PROMPTS, buildWeek, estimateTargets, sessionFromTemplate } from '../engine'
import { emptyPermissions } from '../native'

// --- constants ------------------------------------------------------------------

export const SEED_PROFILE: UserProfile = {
  name: 'Alex Tan',
  dob: '1989-02-11',
  sex: 'male',
  heightCm: 179,
  units: 'metric',
  experience: 'intermediate',
  dietPattern: '1–2 meals/day, skips breakfast',
  equipment: ['dumbbells', 'machines', 'bench', 'cables', 'lat pulldown', 'stationary bike', 'treadmill', 'pool'],
  mobilityPriorities: ['hips', 'hamstrings', 'shoulders', 'back'],
  coachStyle: 'demanding',
  trainingDaysMin: 3,
  trainingDaysTarget: 4,
  trainingDaysStretch: 5,
  onboarded: true,
}

/** Seven mornings ending today: 84.0 kg today, 7-day average ≈ 84.2 kg. */
export const SEED_WEIGHTS_KG = [84.6, 84.4, 84.3, 84.1, 84.2, 83.9, 84.0]
export const SEED_WAIST_CM = 84

/** Seven nights ending last night: 6h 10m last night, average ≈ 7h 05m. */
export const SEED_SLEEP_MIN = [440, 425, 455, 415, 450, 420, 370]
/** Wake-up time (hour, minute) for each of the seven nights; last night is bed 00:50 → wake 07:00. */
export const SEED_WAKE_TIMES: [number, number][] = [[6, 50], [7, 5], [7, 10], [6, 55], [7, 15], [7, 0], [7, 0]]

/** Seven mornings of resting heart rate, today last. */
export const SEED_RESTING_HR = [56, 57, 56, 57, 58, 56, 58]

export const SEED_GOALS: Omit<Goal, 'id' | 'startDate' | 'targetDate'>[] = [
  { type: 'weight', targetValue: 74, unit: 'kg', priority: 1, status: 'active' },
  { type: 'waist', targetValue: 81, unit: 'cm', priority: 2, status: 'active' }, // 32 in
]

export const SEED_CONDITIONS: Omit<ConditionFlag, 'id'>[] = [
  { region: 'knee_left', label: 'Meniscus tear', baselineNotes: 'Bilateral meniscus tears; the left knee is the more symptomatic side. Avoid deep loaded knee flexion and impact.' },
  { region: 'knee_right', label: 'Meniscus tear', baselineNotes: 'Usually quiet; stiff after long sitting.' },
  { region: 'back_lower', label: 'Lower back issues', baselineNotes: 'Flares with loaded spinal flexion and long unsupported hinging.' },
  { region: 'back_mid', label: 'Mid back issues', baselineNotes: 'Stiffness after desk days; responds to rows and thoracic mobility.' },
  { region: 'back_upper', label: 'Upper back issues', baselineNotes: 'Tight traps; keep shrugs and heavy carries light.' },
  { region: 'neck', label: 'Neck issues', baselineNotes: 'Avoid end-range loading and heavy overhead work on bad days.' },
]

export const SAVED_MEAL_NAMES = {
  chickenRice: 'Chicken rice, no skin, extra cucumber',
  fishSoup: 'Fish soup with rice',
  yogurt: 'Greek yogurt, whey & berries',
} as const

/** reps / load / RIR per set for the completed sessions (load null = bodyweight). */
type SetSpec = [reps: number, loadKg: number | null, rir: number]

export const UPPER_A_SETS: Record<string, SetSpec[]> = {
  db_bench_press: [[10, 26, 2], [10, 26, 2], [9, 26, 1]],
  lat_pulldown: [[10, 55, 2], [10, 55, 2], [10, 55, 1]],
  db_shoulder_press: [[10, 16, 2], [9, 16, 1], [8, 16, 1]],
  seated_cable_row: [[12, 50, 2], [12, 50, 2], [12, 50, 2]],
  lateral_raise: [[15, 8, 1], [15, 8, 1]],
  triceps_pushdown: [[15, 25, 2], [13, 25, 1]],
}

export const LOWER_A_SETS: Record<string, SetSpec[]> = {
  leg_press: [[12, 100, 2], [11, 100, 2], [10, 100, 1]],
  hip_thrust: [[12, 40, 2], [12, 40, 2], [10, 40, 1]],
  lying_leg_curl: [[12, 35, 2], [12, 35, 1], [10, 35, 1]],
  leg_extension: [[15, 25, 2], [15, 25, 2]],
  standing_calf_raise: [[15, 60, 2], [15, 60, 2], [14, 60, 1]],
  dead_bug: [[10, null, 2], [10, null, 2]],
}

// --- pure helpers ------------------------------------------------------------------

export function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

/** ISO timestamp shifted by `minutes` (negative = earlier). */
export function shiftMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

/** Seven weigh-ins ending today at 07:10. */
export function weightSeries(today: string): Omit<BodyMetric, 'id'>[] {
  const n = SEED_WEIGHTS_KG.length
  return SEED_WEIGHTS_KG.map((value, i) => ({
    ts: isoAt(addDays(today, i - (n - 1)), 7, 10),
    type: 'weight',
    value,
    unit: 'kg',
    source: 'seed',
  }))
}

/** Seven nights ending this morning; last night is bed 00:50 → wake 07:00 (6h 10m). */
export function sleepSeries(today: string): Omit<SleepRecord, 'id'>[] {
  const n = SEED_SLEEP_MIN.length
  return SEED_SLEEP_MIN.map((durationMin, i) => {
    const [hh, mm] = SEED_WAKE_TIMES[i]
    const endTs = isoAt(addDays(today, i - (n - 1)), hh, mm)
    return { startTs: shiftMinutes(endTs, -durationMin), endTs, durationMin, source: 'seed', quality: null }
  })
}

/** Seven resting-HR readings taken during sleep, today last. */
export function restingHrSeries(today: string): Omit<HealthMetric, 'id'>[] {
  const n = SEED_RESTING_HR.length
  return SEED_RESTING_HR.map((value, i) => ({
    ts: isoAt(addDays(today, i - (n - 1)), 6, 30),
    type: 'resting_hr',
    value,
    unit: 'bpm',
    source: 'seed',
  }))
}

/** Copy planned exercises with the working loads from a set spec (progression starts from real numbers). */
export function withLoads(exercises: PlannedExercise[], spec: Record<string, SetSpec[]>): PlannedExercise[] {
  return exercises.map((e) => {
    const sets = spec[e.exerciseId]
    const load = sets?.find((s) => s[1] != null)?.[1] ?? null
    return { ...e, loadKg: load }
  })
}

/** Logged sets for a completed session, spaced ~2.5 min apart from the start time. */
export function setsFor(sessionId: number, startedAt: string, exercises: PlannedExercise[], spec: Record<string, SetSpec[]>): Omit<ExerciseSet, 'id'>[] {
  const out: Omit<ExerciseSet, 'id'>[] = []
  let minute = 6 // after the warm-up
  for (const e of exercises) {
    const sets = spec[e.exerciseId] ?? []
    sets.forEach(([reps, loadKg, rir], i) => {
      out.push({
        sessionId,
        exerciseId: e.exerciseId,
        setIndex: i + 1,
        reps,
        loadKg,
        rir,
        rpe: null,
        durationSec: null,
        painFlag: false,
        loggedAt: shiftMinutes(startedAt, minute),
      })
      minute += 2.5
    })
  }
  return out
}

export interface SeedWeekPlan {
  /** Completed / skipped rows before today (dates may fall in last week). */
  history: Omit<WorkoutSession, 'id'>[]
  /** Today's planned Upper Body Strength session. */
  todaySession: Omit<WorkoutSession, 'id'>
  /** Remaining planned rows of the current week, ascending by date. */
  future: Omit<WorkoutSession, 'id'>[]
  /** Set when the lower session had to move off its template day (the accepted reflow). */
  lowerMove: { from: string; to: string } | null
  /** Date of the skipped bike session (today − 2). */
  bikeSkippedDate: string
}

/** Among `freeDays`, the day furthest from any existing strength day (earliest on ties). */
export function pickSpreadDay(freeDays: string[], strengthDays: string[]): string {
  let best = freeDays[0]
  let bestGap = -1
  for (const d of freeDays) {
    const gap = strengthDays.length ? Math.min(...strengthDays.map((s) => Math.abs(daysBetween(s, d)))) : Number.MAX_SAFE_INTEGER
    if (gap > bestGap) { best = d; bestGap = gap }
  }
  return best
}

function session(key: string, date: string, patch: Partial<Omit<WorkoutSession, 'id'>>): Omit<WorkoutSession, 'id'> {
  return { ...sessionFromTemplate(key, date), ...patch }
}

/**
 * Lays out the training history and the rest of this week:
 *   today − 6  Lower Body Strength  completed
 *   today − 3  Upper Body Strength  completed (same six exercises as today, so progression can compute)
 *   today − 2  Bike Conditioning    skipped  (the day the accepted reflow decision refers to)
 *   today      Upper Body Strength  planned
 *   after      remaining rows of buildWeek(startOfWeek(today), 'target'); a lower/full session whose
 *              template day has already passed is re-placed on the free day furthest from other strength days.
 */
export function planWeek(today: string): SeedWeekPlan {
  const weekStart = startOfWeek(today)
  const weekEnd = addDays(weekStart, 6)
  const dLower = addDays(today, -6)
  const dUpper = addDays(today, -3)
  const dBike = addDays(today, -2)

  const lowerStart = isoAt(dLower, 18, 5)
  const upperStart = isoAt(dUpper, 18, 10)

  const history: Omit<WorkoutSession, 'id'>[] = [
    session('lower_a', dLower, {
      status: 'completed',
      startedAt: lowerStart,
      completedAt: shiftMinutes(lowerStart, 43),
      durationMin: 43,
      readiness: 'GREEN',
      sessionRpe: 7,
      notes: 'Leg press kept above parallel, knees quiet throughout.',
      exercises: withLoads(sessionFromTemplate('lower_a', dLower).exercises, LOWER_A_SETS),
    }),
    session('upper_a', dUpper, {
      status: 'completed',
      startedAt: upperStart,
      completedAt: shiftMinutes(upperStart, 45),
      durationMin: 45,
      readiness: 'GREEN',
      sessionRpe: 7.5,
      notes: 'Bench solid; shoulder press slowed on the last set.',
      exercises: withLoads(sessionFromTemplate('upper_a', dUpper).exercises, UPPER_A_SETS),
    }),
    session('conditioning_bike', dBike, {
      status: 'skipped',
      notes: 'Skipped — the day ran away. Reflow accepted: bike dropped this week, strength kept.',
    }),
  ]

  const todaySession = session('upper_a', today, {
    exercises: withLoads(sessionFromTemplate('upper_a', today).exercises, UPPER_A_SETS),
  })

  // Remaining week from the planner. Rows on/before today are replaced by the history above; the
  // skipped bike counts as this week's conditioning when it falls inside the week.
  const template = buildWeek(weekStart, 'target')
  const originalLower = template.find((s) => s.templateKey === 'lower_a')
  const bikeInWeek = dBike >= weekStart
  const future = template.filter((s) =>
    s.scheduledDate > today && s.templateKey !== 'upper_a' && !(bikeInWeek && s.templateKey === 'conditioning_bike'),
  )

  const occupied = new Set(future.map((s) => s.scheduledDate))
  const freeDays: string[] = []
  for (let d = addDays(today, 1); d <= weekEnd; d = addDays(d, 1)) if (!occupied.has(d)) freeDays.push(d)

  let lowerMove: SeedWeekPlan['lowerMove'] = null
  for (const key of ['lower_a', 'full_b']) {
    if (future.some((s) => s.templateKey === key) || !freeDays.length) continue
    const strengthDays = [today, ...future.filter((s) => s.type === 'strength').map((s) => s.scheduledDate)]
    const day = pickSpreadDay(freeDays, strengthDays)
    freeDays.splice(freeDays.indexOf(day), 1)
    future.push(sessionFromTemplate(key, day))
    if (key === 'lower_a' && originalLower) lowerMove = { from: originalLower.scheduledDate, to: day }
  }
  future.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

  return { history, todaySession, future, lowerMove, bikeSkippedDate: dBike }
}

// --- meals ------------------------------------------------------------------------

type NewItem = Omit<FoodItem, 'id' | 'mealId'>
type NewMeal = Omit<Meal, 'id' | 'items'>

function food(id: string): FoodRecord {
  const f = FOOD_BY_ID[id]
  if (!f) throw new Error(`Seed food missing from library: ${id}`)
  return f
}

function items(list: [foodId: string, grams: number][]): NewItem[] {
  return list.map(([id, grams]) => ({ ...toFoodItem(food(id), grams), source: 'seed' }))
}

export interface SeedMeal { meal: NewMeal; items: NewItem[] }

function meal(date: string, hh: number, mm: number, mealType: Meal['mealType'], list: [string, number][], savedName: string | null = null, notes = ''): SeedMeal {
  return {
    meal: { ts: isoAt(date, hh, mm), mealType, photoUri: null, notes, source: 'seed', savedName, isSaved: savedName != null },
    items: items(list),
  }
}

/**
 * Meals for the week: kopi every morning, no breakfast, a big lunch and dinner plus a protein-dense
 * extra, so eaten days land around 1,900–2,050 kcal and 130–155 g protein (on target for the cut —
 * the trend engine must not read the seed as under-eating). The three saved meals and one plainly
 * logged Snickers are in here; today is only the kopi.
 */
export function mealSeries(today: string): SeedMeal[] {
  const d = (n: number) => addDays(today, -n)
  const kopi = (date: string): SeedMeal => meal(date, 8, 30, 'drink', [['kopi_o_kosong', 200]])
  const chickenRice: [string, number][] = [['chicken_rice_no_skin', 380], ['cucumber', 100]]
  const chickenRiceExtra: [string, number][] = [...chickenRice, ['steamed_chicken_hawker', 100]]
  const fishSoup: [string, number][] = [['fish_soup_rice', 700]]
  const fishSoupExtra: [string, number][] = [...fishSoup, ['yong_tau_foo_pieces', 240]]
  const yogurt: [string, number][] = [['greek_yogurt_0', 170], ['whey_protein', 30], ['mixed_berries', 100]]
  const chickenPlate: [string, number][] = [['chicken_breast', 200], ['rice_white', 250], ['broccoli', 150]]
  const shake: [string, number][] = [['protein_shake_milk', 280]]
  return [
    // lower-body day
    kopi(d(6)),
    meal(d(6), 13, 0, 'lunch', chickenRiceExtra),
    meal(d(6), 16, 30, 'snack', [['banana', 118], ['almonds', 28]], null, 'Pre-workout'),
    meal(d(6), 20, 5, 'dinner', [['salmon_cooked', 150], ['rice_white', 250], ['broccoli', 100]]),
    meal(d(6), 21, 15, 'snack', yogurt, null, 'Post-workout'),

    kopi(d(5)),
    meal(d(5), 12, 30, 'lunch', fishSoupExtra),
    meal(d(5), 16, 0, 'snack', shake),
    meal(d(5), 19, 45, 'dinner', [['economy_rice_1meat_2veg', 450], ['steamed_chicken_hawker', 100]]),

    kopi(d(4)),
    meal(d(4), 13, 15, 'lunch', chickenRiceExtra),
    meal(d(4), 16, 30, 'snack', [['banana', 118], ['almonds', 28]]),
    meal(d(4), 20, 30, 'dinner', chickenPlate),
    meal(d(4), 21, 30, 'snack', [['greek_yogurt_0', 170], ['mixed_berries', 100]]),

    // upper-body day (the mock meal-photo ledger entry refers to this dinner)
    kopi(d(3)),
    meal(d(3), 12, 45, 'lunch', [['mixed_veg_rice_fish', 400], ['steamed_chicken_hawker', 100]]),
    meal(d(3), 16, 30, 'snack', [['banana', 118], ['almonds', 28]], null, 'Pre-workout'),
    meal(d(3), 20, 15, 'dinner', [['salmon_poke_bowl', 450]]),
    meal(d(3), 21, 0, 'snack', yogurt, SAVED_MEAL_NAMES.yogurt, 'Post-workout'),

    // missed-bike day
    kopi(d(2)),
    meal(d(2), 12, 45, 'lunch', [['chicken_briyani', 450]]),
    meal(d(2), 16, 0, 'snack', [['snickers', 50]]),
    meal(d(2), 20, 30, 'dinner', fishSoupExtra, SAVED_MEAL_NAMES.fishSoup),
    meal(d(2), 21, 45, 'snack', yogurt),

    // rest day
    kopi(d(1)),
    meal(d(1), 12, 45, 'lunch', chickenRiceExtra, SAVED_MEAL_NAMES.chickenRice),
    meal(d(1), 16, 0, 'snack', shake),
    meal(d(1), 20, 0, 'dinner', chickenPlate),
    meal(d(1), 21, 30, 'snack', [['banana', 118]]),

    kopi(today),
  ]
}

/** Grams of protein logged on `date` before `beforeIso`. */
function proteinBefore(meals: SeedMeal[], date: string, beforeIso: string): number {
  return meals
    .filter((m) => m.meal.ts >= isoAt(date, 0) && m.meal.ts < beforeIso)
    .reduce((sum, m) => sum + m.items.reduce((s, it) => s + it.proteinG, 0), 0)
}

// --- mind -------------------------------------------------------------------------

/** Setting written once the mind demo rows exist, so already-seeded demo databases are topped up exactly once. */
export const MIND_DEMO_SETTING = 'seed.mindDemo'

/** Eight days of valence ending today: mostly 0..2, and -1 this morning after the 6h 10m night. */
export const SEED_MOOD_VALENCE = [1, 0, 2, 1, 2, 0, 1, -1]

export interface SeedMind {
  moods: Omit<MoodLog, 'id'>[]
  sessions: Omit<MindSession, 'id'>[]
  journal: Omit<JournalEntry, 'id'>[]
}

function journalPrompt(id: string): { promptId: string; prompt: string } {
  const p = JOURNAL_PROMPTS.find((x) => x.id === id)
  if (!p) throw new Error(`Seed journal prompt missing: ${id}`)
  return { promptId: p.id, prompt: p.text }
}

/** Eight days of mood logs, three breathing sessions and two journal entries, lined up with the training and sleep story. */
export function mindSeries(today: string): SeedMind {
  const d = (n: number) => addDays(today, -n)
  const details: [labels: string[], contexts: string[], note: string][] = [
    [['Content'], ['Family'], ''],
    [['Tired'], ['Work'], ''],
    [['Proud', 'Energised'], ['Training'], 'Lower session done, knees quiet.'],
    [['Relaxed'], ['Downtime'], ''],
    [['Proud'], ['Training', 'Food'], 'Bench felt solid.'],
    [['Restless'], ['Work'], 'The day ran away; bike skipped.'],
    [['Calm'], ['Downtime'], ''],
    [['Tired'], ['Sleep'], 'Short night.'],
  ]
  const n = SEED_MOOD_VALENCE.length
  const moods: Omit<MoodLog, 'id'>[] = SEED_MOOD_VALENCE.map((valence, i) => {
    const date = d(n - 1 - i)
    const isToday = i === n - 1
    const [labels, contexts, note] = details[i]
    return { ts: isToday ? isoAt(date, 7, 25) : isoAt(date, 21, 40), kind: isToday ? 'momentary' : 'daily', valence, labels, contexts, note }
  })
  const sessions: Omit<MindSession, 'id'>[] = [
    { ts: isoAt(d(4), 22, 10), kind: 'breathing', technique: 'coherent', durationSec: 300, completed: true, valenceBefore: 0, valenceAfter: 1 },
    { ts: isoAt(d(2), 17, 45), kind: 'breathing', technique: 'box', durationSec: 180, completed: true, valenceBefore: -1, valenceAfter: 0 },
    { ts: isoAt(d(1), 22, 35), kind: 'breathing', technique: '478', durationSec: 76, completed: true, valenceBefore: null, valenceAfter: null },
  ]
  const journal: Omit<JournalEntry, 'id'>[] = [
    { ts: isoAt(d(3), 21, 50), ...journalPrompt('win_showed_up'), text: 'Long day at work and I still got the upper session in. 26s on the bench for 10, 10, 9.', tags: ['win'] },
    { ts: isoAt(d(1), 21, 45), ...journalPrompt('gratitude_small'), text: 'Easy walk after dinner, and the knee felt fine on the stairs.', tags: ['gratitude'] },
  ]
  return { moods, sessions, journal }
}

function seedMind(today: string): void {
  const mind = mindSeries(today)
  for (const m of mind.moods) addMoodLog(m)
  for (const s of mind.sessions) addMindSession(s)
  for (const j of mind.journal) addJournalEntry(j)
  setSetting(MIND_DEMO_SETTING, true)
}

/**
 * One-time top-up for demo databases seeded before the Mind pillar existed. A database without seed rows is a
 * real user's and is never touched (no rows, no marker). A demo database gets the mind rows unless it already
 * has mind data of its own; the marker is written either way so it runs once.
 * Anchored to today so the Mind screens have something to show. Returns true when anything was written.
 */
function topUpMindDemo(today: string): boolean {
  if (getSetting(MIND_DEMO_SETTING, false)) return false
  const isDemo = !!db.get(`SELECT 1 AS x FROM sleep_records WHERE source = 'seed' LIMIT 1`)
  if (!isDemo) return false
  const n = (table: string) => db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0
  const hasMindData = n('mood_logs') + n('mind_sessions') + n('journal_entries') > 0
  db.transaction(() => {
    if (!hasMindData) seedMind(today)
    else setSetting(MIND_DEMO_SETTING, true)
  })
  return true
}

// --- reference data + demo decision ---------------------------------------------------

/** Settings every database starts with (demo or not). Only missing keys are written, never a user's choice. */
export function defaultSettings(): Record<string, unknown> {
  return {
    'ai.provider': 'mock',
    'privacy.keepMealPhotos': true,
    'privacy.voiceRetentionDays': 30,
    'health.permissions': emptyPermissions('undetermined'),
  }
}

/** Exercise library + default settings. Idempotent; returns true when anything was written. */
function seedReference(): boolean {
  let wrote = false
  if (exerciseCount() === 0) { upsertExercises(EXERCISES); wrote = true }
  for (const [key, value] of Object.entries(defaultSettings())) {
    if (getSetting<unknown>(key, undefined) !== undefined) continue
    setSetting(key, value)
    wrote = true
  }
  return wrote
}

/** True when the query string carries `demo=1`. */
export function hasDemoParam(search: string): boolean {
  return new URLSearchParams(search).get('demo') === '1'
}

export interface SeedDecisionInput {
  /** `import.meta.env.DEV`: true under `npm run dev` and vitest, false in a production build. */
  dev: boolean
  /** `location.search` (or the remembered `?demo=1` for this tab's session). */
  search: string
  /** The `seed.skipDemo` marker left by deleteAllData(). */
  skipDemo: boolean
  hasProfile: boolean
}

/**
 * Whether boot should write the demo persona. Never over an existing profile, never after "Delete all data";
 * otherwise only in a dev build or when the visitor asked for it with `?demo=1`. Pure.
 */
export function shouldSeedDemo({ dev, search, skipDemo, hasProfile }: SeedDecisionInput): boolean {
  if (hasProfile || skipDemo) return false
  return dev || hasDemoParam(search)
}

const DEMO_SESSION_KEY = 'seed.demo'

/**
 * The query string boot should judge. `?demo=1` is remembered in sessionStorage so the choice survives the
 * router dropping the query and a reload in the same tab. Storage or location may be missing (node, private mode).
 */
function sessionSearch(): string {
  try {
    const search = typeof location === 'undefined' ? '' : location.search
    if (hasDemoParam(search)) {
      try { sessionStorage.setItem(DEMO_SESSION_KEY, '1') } catch { /* no storage: the URL still decides */ }
      return search
    }
    return sessionStorage.getItem(DEMO_SESSION_KEY) === '1' ? '?demo=1' : search
  } catch {
    return ''
  }
}

// --- database writes ----------------------------------------------------------------

const when = (d: string) => `${dayName(d)} ${fmtDate(d)}`

function seedAll(today: string): void {
  // Profile, goals, conditions
  saveProfile(SEED_PROFILE)
  for (const g of SEED_GOALS) upsertGoal({ ...g, startDate: addDays(today, -13), targetDate: addDays(today, 150) })
  for (const c of SEED_CONDITIONS) addConditionFlag(c)

  // Reference data: exercise library + default settings (the sessions below reference the library)
  seedReference()

  // Body, sleep, resting HR
  for (const w of weightSeries(today)) addBodyMetric(w)
  addBodyMetric({ ts: isoAt(today, 7, 12), type: 'waist', value: SEED_WAIST_CM, unit: 'cm', source: 'seed' })
  for (const s of sleepSeries(today)) addSleepRecord(s)
  for (const h of restingHrSeries(today)) addHealthMetric(h)

  // Mind: mood check-ins, breathing sessions, journal
  seedMind(today)

  // Morning check-in + symptom check
  upsertCheckIn({ date: today, energy: 6, soreness: 2, stress: 4, notes: '' })
  addSymptomCheck({
    ts: isoAt(today, 7, 20),
    region: 'knee_left',
    painScore: 2,
    redFlags: {},
    notes: 'Mild ache on the stairs this morning; settles once warm.',
    context: 'morning',
    sessionId: null,
  })

  // Training: history, today, rest of the week
  const plan = planWeek(today)
  const ids = new Map<Omit<WorkoutSession, 'id'>, number>()
  for (const s of [...plan.history, plan.todaySession, ...plan.future]) ids.set(s, createSession(s))
  for (const s of plan.history) {
    if (s.status !== 'completed' || !s.startedAt) continue
    const spec = s.templateKey === 'upper_a' ? UPPER_A_SETS : LOWER_A_SETS
    for (const set of setsFor(ids.get(s)!, s.startedAt, s.exercises, spec)) addSet(set)
  }

  // Nutrition target (formula rationale; carbs held at 190 g to leave room for coffee and snacks)
  const estimate = estimateTargets({ sex: SEED_PROFILE.sex, dob: SEED_PROFILE.dob, heightCm: SEED_PROFILE.heightCm, weightKg: 84, activity: 'moderate', goal: 'cut' }, today)
  setNutritionTarget({
    startDate: addDays(today, -13),
    endDate: null,
    kcal: estimate.kcal,
    proteinG: estimate.proteinG,
    carbsG: 190,
    fatG: estimate.fatG,
    rationale: `${estimate.rationale} Carbs set to 190 g to leave ~100 kcal for coffee and the odd snack.`,
  })

  // Meals
  const meals = mealSeries(today)
  for (const m of meals) addMeal(m.meal, m.items)

  // Coach decision: reflow accepted two days ago
  const bike = plan.history.find((s) => s.templateKey === 'conditioning_bike')!
  const lower = plan.future.find((s) => s.templateKey === 'lower_a') ?? null
  const full = plan.future.find((s) => s.templateKey === 'full_b') ?? null
  const dBike = plan.bikeSkippedDate
  const weekStart = startOfWeek(today)
  const doneByThen = plan.history.filter((s) => s.status === 'completed' && s.scheduledDate >= weekStart && s.scheduledDate <= dBike).length
  const planText = [
    `Upper ${dayName(today)}`,
    full ? `Full ${dayName(full.scheduledDate)}` : null,
    lower ? `Lower ${dayName(lower.scheduledDate)}` : null,
  ].filter(Boolean).join(' · ')
  const moveText = plan.lowerMove && lower
    ? `moving Lower Body Strength from ${dayName(plan.lowerMove.from)} to ${dayName(plan.lowerMove.to)}`
    : lower ? `keeping Lower Body Strength on ${dayName(lower.scheduledDate)}` : 'keeping the remaining strength days'
  const decidedAt = isoAt(dBike, 20, 4)
  const decision: Omit<CoachDecision, 'id'> = {
    ts: isoAt(dBike, 20, 3),
    kind: 'reflow_week',
    title: 'Reflow the week: drop the bike, keep three strength sessions',
    rationale:
      `${bike.name} on ${dayName(dBike)} did not happen. In a short week conditioning is the first thing to give, strength is not: ` +
      `skipping the bike and ${moveText} keeps the three-session minimum — ${planText}. ` +
      `The lower session lands with at least a day between leg days, which the knees prefer.`,
    evidence: [
      { label: 'Missed', value: `${bike.name} — ${when(dBike)}` },
      { label: 'Strength this week', value: `${doneByThen} of 3 minimum completed by ${dayName(dBike)}` },
      { label: 'Days left in week', value: `${Math.max(0, daysBetween(dBike, addDays(weekStart, 6)))}` },
      { label: 'Plan after reflow', value: planText },
    ],
    action: {
      kind: 'reflow_week',
      payload: {
        today: dBike,
        moves: plan.lowerMove && lower ? [{ id: ids.get(lower)!, scheduledDate: plan.lowerMove.to, note: `Moved ${lower.name} from ${dayName(plan.lowerMove.from)} to ${dayName(plan.lowerMove.to)}` }] : [],
        dropped: [{ id: ids.get(bike)!, scheduledDate: dBike, note: `${bike.name} skipped` }],
      },
      summary: `Skip this week's bike${plan.lowerMove && lower ? `; move Lower Body Strength to ${dayName(plan.lowerMove.to)}` : ''}`,
    },
    status: 'accepted',
    resultNotes: `Applied ${dayName(dBike)} evening: ${bike.name} marked skipped${plan.lowerMove && lower ? `; Lower Body Strength rescheduled to ${when(plan.lowerMove.to)}` : ''}.`,
    decidedAt,
  }
  addDecision(decision)

  // Coach chat history (three turns)
  const askTs = isoAt(dBike, 20, 2)
  const replyTs = isoAt(dBike, 20, 3)
  const proteinSoFar = Math.round(proteinBefore(meals, dBike, replyTs))
  const messages: Omit<CoachMessage, 'id'>[] = [
    { ts: askTs, role: 'user', content: 'Missed the bike today. Do I need to make it up tomorrow?', evidence: [] },
    {
      ts: replyTs,
      role: 'coach',
      content:
        `No. Conditioning is the first thing to give this week — strength is not. I've queued a reflow: the bike is dropped` +
        `${plan.lowerMove && lower ? ` and Lower Body moves to ${dayName(plan.lowerMove.to)}` : ''}, so ${planText} keeps the three-session minimum. ` +
        `Accept it under Decisions. Then get protein into dinner — you're at ${proteinSoFar} g of 150; fish soup with rice gets you 33 g, the yogurt-and-whey bowl another 42 g.`,
      evidence: [
        { label: 'Missed', value: `${bike.name} — ${when(dBike)}` },
        { label: 'Protein today', value: `${proteinSoFar} / 150 g at 20:00` },
        { label: 'Strength this week', value: `${doneByThen} of 3 minimum` },
      ],
    },
    {
      ts: isoAt(addDays(today, -1), 7, 35),
      role: 'coach',
      content:
        `Reflow applied. ${dayName(addDays(today, -1))} is a rest day: 20–30 min easy walk, the hips & hamstrings block, and 150 g protein. ` +
        `Six weigh-ins in a row — keep them daily; the first 14-day trend call comes next week. Upper Body is on for ${dayName(today)}.`,
      evidence: [
        { label: 'Sleep', value: `${fmtDuration(SEED_SLEEP_MIN[SEED_SLEEP_MIN.length - 2])} last night` },
        { label: 'Weight', value: `${SEED_WEIGHTS_KG[SEED_WEIGHTS_KG.length - 2].toFixed(1)} kg, 6 mornings logged` },
      ],
    },
  ]
  for (const m of messages) addMessage(m)

  // Privacy ledger: two local-only entries from the mock provider
  const ledger: Omit<LedgerEntry, 'id'>[] = [
    { ts: isoAt(addDays(today, -3), 21, 5), provider: 'mock', dataType: 'meal_photo', purpose: 'Meal photo recognition (dinner)', bytes: 184_320, status: 'local_only' },
    { ts: replyTs, provider: 'mock', dataType: 'coach_context', purpose: "Coach chat (profile summary, today's facts, conversation)", bytes: 4_812, status: 'local_only' },
  ]
  for (const e of ledger) addLedgerEntry(e)
}

/** Tables to clear on reseed (everything except the migration bookkeeping in `meta`). */
function userTables(): string[] {
  return db
    .all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'meta'`)
    .map((t) => t.name)
}

/**
 * Boot seeding. Always tops up the reference data (exercise library, default settings). The demo scenario is
 * written only when shouldSeedDemo() says so: no profile, no `seed.skipDemo` marker (left by deleteAllData()),
 * and a dev build or `?demo=1`. A production build therefore starts at onboarding with an empty profile.
 * Idempotent: a second call writes nothing. A demo database seeded before the Mind pillar existed gets its
 * mind rows once (topUpMindDemo never touches a database without seed rows).
 * `env` is injectable for tests; the app calls seedIfEmpty() with no arguments.
 */
export async function seedIfEmpty(env: Pick<SeedDecisionInput, 'dev' | 'search'> = { dev: import.meta.env.DEV, search: sessionSearch() }): Promise<void> {
  const hasProfile = getProfile() != null
  const skipDemo = getSetting('seed.skipDemo', false)
  if (shouldSeedDemo({ ...env, skipDemo, hasProfile })) {
    db.transaction(() => seedAll(todayStr()))
    await db.persist()
    return
  }
  let wrote = db.transaction(() => seedReference())
  if (hasProfile && !skipDemo && topUpMindDemo(todayStr())) wrote = true
  if (wrote) await db.persist()
}

/** Clears every user table and seeds the scenario again relative to today. */
export async function reseed(): Promise<void> {
  db.transaction(() => {
    for (const t of userTables()) db.run(`DELETE FROM "${t}"`)
    try { db.run('DELETE FROM sqlite_sequence') } catch { /* no AUTOINCREMENT rows yet */ }
    seedAll(todayStr())
  })
  await db.persist()
}
