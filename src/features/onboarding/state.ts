// Intake answers that have no table of their own live in settings under `intake.*`.
// Everything the old wizard wrote still goes through `commitOnboarding` (features/settings/onboarding).
import { db } from '../../db/database'
import { addBodyMetric, getCheckIn, getSetting, latestBodyMetric, listReports, metricForDate, setSetting, upsertCheckIn } from '../../db/repositories'
import { clamp, nowIso, todayStr } from '../../lib/util'
import type { Baseline, BaselineAnswers } from '../ai/intake'
import { MIND_GOAL_OPTIONS, type DietPattern } from '../settings/keys'
import { ageFromDob, commitOnboarding, effectiveTargets, estimateFor, type WizardState } from '../settings/onboarding'
import { COACH_STYLE_OPTIONS, EQUIPMENT_OPTIONS, EXPERIENCE_OPTIONS, REGION_LABEL, SEX_OPTIONS, labelFor } from '../settings/options'
import { round1 } from '../settings/units'
import { buildReportContextLines } from '../reports/markers'
import {
  ALCOHOL_OPTIONS,
  BEDTIME_OPTIONS,
  CAFFEINE_OPTIONS,
  ENJOY_OPTIONS,
  FOOD_OPTIONS,
  GOAL_OPTIONS,
  optLabel,
  type Alcohol,
  type Bedtime,
  type Caffeine,
  type PrimaryGoal,
  type RecentSessions,
} from './options'

export const INTAKE_KEYS = {
  goal: 'intake.goal',
  training: 'intake.training',
  nutrition: 'intake.nutrition',
  recovery: 'intake.recovery',
  history: 'intake.history',
  completedAt: 'intake.completedAt',
  shareReports: 'ai.shareReports',
  baseline: 'profile.baseline',
} as const

export interface IntakeAnswers {
  goal: PrimaryGoal | null
  /** Current waist → body_metrics('waist'), not a setting. */
  waistCm: number | null
  recentSessions: RecentSessions | null
  minutesPerSession: number | null
  foods: string[]
  alcohol: Alcohol | null
  caffeine: Caffeine | null
  supplements: string
  sleepHours: number | null
  bedtime: Bedtime | null
  stress: number | null
  energy: number | null
  worked: string[]
  notWorked: string[]
  historyNote: string
  shareReports: boolean
}

export const EMPTY_INTAKE: IntakeAnswers = {
  goal: null,
  waistCm: null,
  recentSessions: null,
  minutesPerSession: null,
  foods: [],
  alcohol: null,
  caffeine: null,
  supplements: '',
  sleepHours: null,
  bedtime: null,
  stress: null,
  energy: null,
  worked: [],
  notWorked: [],
  historyNote: '',
  shareReports: false,
}

function oneOf<T extends string | number>(v: unknown, options: { value: T }[]): T | null {
  return options.some((o) => o.value === v) ? (v as T) : null
}
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : null
}
function obj(key: string): Record<string, unknown> {
  const v = getSetting<unknown>(key, null)
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

const RECENT: { value: RecentSessions }[] = [{ value: '0' }, { value: '1-2' }, { value: '3-4' }, { value: '5+' }]

/** Stored answers (re-run pre-fill). `diet` seeds caffeine / supplements for profiles that pre-date the intake. */
export function readIntake(diet?: DietPattern): IntakeAnswers {
  const training = obj(INTAKE_KEYS.training)
  const nutrition = obj(INTAKE_KEYS.nutrition)
  const recovery = obj(INTAKE_KEYS.recovery)
  const history = obj(INTAKE_KEYS.history)
  const hasNutrition = Object.keys(nutrition).length > 0
  return {
    goal: oneOf(getSetting<unknown>(INTAKE_KEYS.goal, null), GOAL_OPTIONS),
    waistCm: latestBodyMetric('waist')?.value ?? null,
    recentSessions: oneOf(training.recentSessions, RECENT),
    minutesPerSession: num(training.minutesPerSession, 10, 180),
    foods: strings(nutrition.foods),
    alcohol: oneOf(nutrition.alcohol, ALCOHOL_OPTIONS),
    caffeine: oneOf(nutrition.caffeine, CAFFEINE_OPTIONS) ?? (!hasNutrition && diet?.coffee ? '1-2' : null),
    supplements: typeof nutrition.supplements === 'string' ? nutrition.supplements : !hasNutrition && diet?.supplements ? 'Yes' : '',
    sleepHours: num(recovery.sleepHours, 3, 12),
    bedtime: oneOf(recovery.bedtime, BEDTIME_OPTIONS),
    stress: num(recovery.stress, 0, 10),
    energy: num(recovery.energy, 0, 10),
    worked: strings(history.worked),
    notWorked: strings(history.notWorked),
    historyNote: typeof history.note === 'string' ? history.note : '',
    shareReports: getSetting<boolean>(INTAKE_KEYS.shareReports, false) === true,
  }
}

// --- small pure helpers ---------------------------------------------------------------

/** One "days I can train" answer → the three tiers the planner stores. */
export function daysFromTarget(target: number): { daysMin: number; daysTarget: number; daysStretch: number } {
  const t = clamp(Math.round(target), 2, 7)
  return { daysMin: clamp(t - 1, 2, 7), daysTarget: t, daysStretch: clamp(t + 1, 2, 7) }
}

const AGG_PREFIX = 'Aggravated by: '

/** "What aggravates it" chips live on the first line of condition_flags.baseline_notes. */
export function parseAggravators(notes: string): { aggravators: string[]; rest: string } {
  const [first = '', ...others] = notes.split('\n')
  if (!first.startsWith(AGG_PREFIX)) return { aggravators: [], rest: notes.trim() }
  const aggravators = first.slice(AGG_PREFIX.length).split(',').map((x) => x.trim().replace(/\.$/, '')).filter(Boolean)
  return { aggravators, rest: others.join('\n').trim() }
}

export function composeAggravators(aggravators: string[], rest: string): string {
  const head = aggravators.length ? `${AGG_PREFIX}${aggravators.join(', ')}` : ''
  return [head, rest.trim()].filter(Boolean).join('\n')
}

const GENERATED_NOTE = /^(eats|alcohol):/i

/** Folds the eating answers into the structured diet pattern (→ profile.dietPattern string). Idempotent. */
export function applyIntakeToDiet(diet: DietPattern, a: Pick<IntakeAnswers, 'foods' | 'alcohol' | 'caffeine' | 'supplements'>): DietPattern {
  const kept = diet.notes.split(';').map((p) => p.trim()).filter((p) => p && !GENERATED_NOTE.test(p))
  const foods = a.foods.map((f) => optLabel(FOOD_OPTIONS, f)).filter((x): x is string => !!x)
  if (foods.length) kept.push(`eats: ${foods.join(' / ')}`)
  if (a.alcohol) kept.push(`alcohol: ${optLabel(ALCOHOL_OPTIONS, a.alcohol)!.toLowerCase()}`)
  return {
    ...diet,
    coffee: a.caffeine ? a.caffeine !== 'none' : diet.coffee,
    supplements: a.supplements.trim() !== '',
    notes: kept.join('; '),
  }
}

// --- per-step validation -----------------------------------------------------------------

export function validateDob(dob: string, today: string = todayStr()): string | null {
  if (!dob) return 'Enter your date of birth.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob >= today) return 'Date of birth must be in the past.'
  const age = ageFromDob(dob, today) ?? 0
  if (age < 13) return 'This app is for adults and teens 13+.'
  if (age > 110) return 'Check the year of birth.'
  return null
}
export function validateHeight(cm: number | null): string | null {
  return cm == null || cm < 100 || cm > 250 ? 'Height should be between 100 and 250 cm.' : null
}
export function validateWeight(kg: number | null): string | null {
  return kg == null || kg < 30 || kg > 300 ? 'Weight should be between 30 and 300 kg.' : null
}

// --- baseline input ------------------------------------------------------------------------

const MEALS_LABEL: Record<1 | 2 | 3, string> = { 1: '1', 2: '1–2', 3: '3+' }

export function toBaselineAnswers(s: WizardState, a: IntakeAnswers, today: string = todayStr()): BaselineAnswers {
  const t = effectiveTargets(s, estimateFor(s, today))
  return {
    age: ageFromDob(s.dob, today),
    sex: labelFor(s.sex, SEX_OPTIONS),
    heightCm: s.heightCm,
    weightKg: s.weightKg,
    waistCm: a.waistCm,
    goal: optLabel(GOAL_OPTIONS, a.goal),
    targetWeightKg: s.targetWeightKg,
    horizonMonths: s.horizonMonths,
    experience: labelFor(s.experience, EXPERIENCE_OPTIONS),
    recentSessions: a.recentSessions,
    enjoys: s.preferences.map((p) => labelFor(p, ENJOY_OPTIONS)),
    daysPerWeek: s.daysTarget,
    minutesPerSession: a.minutesPerSession,
    equipment: s.equipment.map((e) => labelFor(e, EQUIPMENT_OPTIONS)),
    conditions: s.conditions.map((c) => ({ region: REGION_LABEL[c.region] ?? c.region, label: c.label.trim(), aggravators: parseAggravators(c.baselineNotes).aggravators })),
    mealsPerDay: MEALS_LABEL[s.diet.mealsPerDay],
    skipsBreakfast: s.diet.skipsBreakfast,
    foods: a.foods.map((f) => labelFor(f, FOOD_OPTIONS)),
    alcohol: optLabel(ALCOHOL_OPTIONS, a.alcohol),
    caffeine: optLabel(CAFFEINE_OPTIONS, a.caffeine),
    supplements: a.supplements.trim(),
    sleepHours: a.sleepHours,
    bedtime: optLabel(BEDTIME_OPTIONS, a.bedtime),
    stress: a.stress,
    energy: a.energy,
    wants: s.mindGoals.map((g) => labelFor(g, MIND_GOAL_OPTIONS)),
    worked: a.worked,
    notWorked: a.notWorked,
    historyNote: a.historyNote.trim(),
    kcal: t.kcal,
    proteinG: t.proteinG,
    coachStyle: labelFor(s.coachStyle, COACH_STYLE_OPTIONS),
  }
}

/** Report lines for the baseline prompt; empty unless the share toggle is on (markers.ts keeps them to printed-range flags). */
export function reportContextLines(share: boolean): string[] {
  return buildReportContextLines(listReports(), share)
}

// --- persistence ------------------------------------------------------------------------------

export function readBaseline(): Baseline | null {
  const b = getSetting<Baseline | null>(INTAKE_KEYS.baseline, null)
  return b && typeof b === 'object' && typeof b.summary === 'string' ? b : null
}

export function saveBaseline(b: Baseline): void {
  setSetting(INTAKE_KEYS.baseline, b)
}

/** The wizard state with the eating answers folded into the diet pattern, ready for `commitOnboarding`. */
export function mergeForCommit(s: WizardState, a: IntakeAnswers): WizardState {
  // A marked area always carries a label: the area's own name when the user cleared the field.
  const conditions = s.conditions.map((c) => (c.label.trim() ? c : { ...c, label: REGION_LABEL[c.region] ?? 'Other' }))
  return { ...s, conditions, diet: applyIntakeToDiet(s.diet, a) }
}

/**
 * Saves everything: the existing onboarding writes (profile, goals, weigh-in, nutrition target, condition
 * flags, settings, health permissions, week plan), then the intake answers, waist, baseline and, when the
 * stress / energy answers were given in this run and today has no check-in yet, today's check-in.
 */
export function commitIntake(s: WizardState, a: IntakeAnswers, baseline: Baseline | null, opts: { logCheckIn: boolean }, today: string = todayStr()): void {
  commitOnboarding(mergeForCommit(s, a), today)

  db.transaction(() => {
    setSetting(INTAKE_KEYS.goal, a.goal)
    setSetting(INTAKE_KEYS.training, { recentSessions: a.recentSessions, minutesPerSession: a.minutesPerSession })
    setSetting(INTAKE_KEYS.nutrition, { foods: a.foods, alcohol: a.alcohol, caffeine: a.caffeine, supplements: a.supplements.trim() })
    setSetting(INTAKE_KEYS.recovery, { sleepHours: a.sleepHours, bedtime: a.bedtime, stress: a.stress, energy: a.energy })
    setSetting(INTAKE_KEYS.history, { worked: a.worked, notWorked: a.notWorked, note: a.historyNote.trim() })
    setSetting(INTAKE_KEYS.shareReports, a.shareReports)
    setSetting(INTAKE_KEYS.completedAt, nowIso())
    if (baseline) saveBaseline(baseline)

    if (a.waistCm != null) {
      const waist = round1(a.waistCm)
      const todays = metricForDate('waist', today)
      const latest = latestBodyMetric('waist')
      if (!todays && (!latest || Math.abs(latest.value - waist) >= 0.05)) addBodyMetric({ ts: nowIso(), type: 'waist', value: waist, unit: 'cm', source: 'manual' })
    }

    if (opts.logCheckIn && (a.stress != null || a.energy != null) && !getCheckIn(today)) {
      upsertCheckIn({ date: today, energy: a.energy, soreness: null, stress: a.stress, notes: '' })
    }
  })
}
